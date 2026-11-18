"""Unified OpenAI-compatible & OpenRouter LLM client with resilient JSON extraction."""

from __future__ import annotations

import json
import re
import time
from dataclasses import dataclass
from typing import Any, Optional, Type, TypeVar
from urllib.parse import urlparse

import httpx
from pydantic import BaseModel

from app.config import settings
from app.schemas import ProviderConfig, TestConnectionResponse

T = TypeVar("T", bound=BaseModel)

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"


class LLMClientError(Exception):
    """Raised when an upstream LLM provider fails or returns invalid output."""

    def __init__(self, message: str, status_code: int = 502):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


@dataclass(frozen=True)
class ResolvedProvider:
    mode: str
    base_url: str
    api_key: str
    model: str
    is_openrouter: bool
    max_tokens: int
    disable_thinking: bool


BLOCKED_METADATA_HOSTS = {"169.254.169.254", "metadata.google.internal"}


def normalize_base_url(url: str) -> str:
    """Validate and normalize an OpenAI-compatible base URL cleanly."""
    cleaned = (url or "").strip().rstrip("/")
    if not cleaned:
        return settings.codelens_local_base_url.rstrip("/")
    parsed = urlparse(cleaned)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise LLMClientError(
            "Provider base URL must be a valid http:// or https:// URL.",
            status_code=400,
        )
    hostname = (parsed.hostname or "").lower()
    if hostname in BLOCKED_METADATA_HOSTS:
        raise LLMClientError(
            f"Access to metadata host '{hostname}' is not permitted.",
            status_code=400,
        )
    if not parsed.path or parsed.path == "/":
        return f"{cleaned}/v1"
    return cleaned


def resolve_provider(config: Optional[ProviderConfig], vision: bool = False) -> ResolvedProvider:
    """Merge per-request ProviderConfig with backend .env fallbacks."""
    cfg = config or ProviderConfig()
    mode = (cfg.mode or settings.codelens_provider_mode or "local").lower()
    max_tokens = cfg.max_tokens or settings.llm_max_tokens
    disable_thinking = bool(cfg.disable_thinking)

    if mode == "openrouter":
        api_key = (cfg.openrouter_api_key or "").strip() or settings.codelens_openrouter_api_key.strip()
        if not api_key:
            raise LLMClientError(
                "OpenRouter API key is missing. Add it in Settings or set CODELENS_OPENROUTER_API_KEY in .env.",
                status_code=400,
            )
        if vision:
            model = (cfg.openrouter_vision_model or "").strip() or settings.codelens_openrouter_vision_model
        else:
            model = (cfg.openrouter_text_model or "").strip() or settings.codelens_openrouter_text_model

        return ResolvedProvider(
            mode="openrouter",
            base_url=OPENROUTER_BASE_URL,
            api_key=api_key,
            model=model,
            is_openrouter=True,
            max_tokens=max_tokens,
            disable_thinking=disable_thinking,
        )

    base_url = normalize_base_url(cfg.local_base_url or settings.codelens_local_base_url)
    api_key = (cfg.local_api_key or "").strip() or settings.codelens_local_api_key or "EMPTY"
    if vision:
        model = (
            (cfg.local_vision_model or "").strip()
            or settings.codelens_local_vision_model
            or (cfg.local_text_model or "").strip()
            or settings.codelens_local_text_model
        )
    else:
        model = (cfg.local_text_model or "").strip() or settings.codelens_local_text_model

    return ResolvedProvider(
        mode="local",
        base_url=base_url,
        api_key=api_key,
        model=model,
        is_openrouter=False,
        max_tokens=max_tokens,
        disable_thinking=disable_thinking,
    )


def _build_headers(resolved: ResolvedProvider) -> dict[str, str]:
    headers = {"Content-Type": "application/json"}
    if resolved.api_key:
        headers["Authorization"] = f"Bearer {resolved.api_key}"
    if resolved.is_openrouter:
        headers["HTTP-Referer"] = "http://localhost:5173"
        headers["X-Title"] = "CodeLens Tutor"
    return headers


def extract_json_payload(raw_text: str) -> dict[str, Any]:
    """Extract a JSON object from LLM output, handling <think> tags and code fences."""
    if not raw_text or not raw_text.strip():
        raise LLMClientError("Model returned an empty response.")

    cleaned = raw_text.strip()
    # Strip <think>...</think> blocks emitted by reasoning models (e.g., Qwen3 / DeepSeek)
    cleaned = re.sub(r"<think>[\s\S]*?</think>", "", cleaned, flags=re.IGNORECASE).strip()

    # Direct parse attempt first so embedded code fences inside JSON values don't interfere
    try:
        parsed = json.loads(cleaned)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass

    # Try any markdown code-fenced JSON blocks without clobbering `cleaned`
    for fence_match in re.finditer(r"```(?:json)?\s*([\s\S]*?)```", cleaned, flags=re.IGNORECASE):
        candidate = fence_match.group(1).strip()
        try:
            parsed = json.loads(candidate)
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError:
            continue

    # Fallback: find the outermost balanced {...} JSON object
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start != -1 and end != -1 and end > start:
        snippet = cleaned[start : end + 1]
        try:
            parsed = json.loads(snippet)
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError as exc:
            raise LLMClientError(
                f"Model response could not be parsed as valid JSON: {exc.msg}"
            ) from exc

    raise LLMClientError("Model response did not contain a valid JSON object.")


def sanitize_mermaid_text(diagram: str) -> str:
    """Remove accidental markdown fences around Mermaid diagrams."""
    if not diagram:
        return ""
    text = diagram.strip()
    text = re.sub(r"^```(?:mermaid)?\s*", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\s*```$", "", text)
    return text.strip()


async def test_provider_connection(config: ProviderConfig) -> TestConnectionResponse:
    """Probe /models on the configured provider and return available model IDs."""
    resolved = resolve_provider(config, vision=False)
    url = f"{resolved.base_url}/models"
    headers = _build_headers(resolved)
    start = time.perf_counter()

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(url, headers=headers)
        latency_ms = int((time.perf_counter() - start) * 1000)

        if resp.status_code >= 400:
            detail = resp.text[:300]
            return TestConnectionResponse(
                ok=False,
                endpoint=url,
                latency_ms=latency_ms,
                message=f"HTTP {resp.status_code} from {url}: {detail}",
            )

        data = resp.json()
        raw_models = data.get("data", []) if isinstance(data, dict) else []
        model_ids = sorted(
            {str(item["id"]) for item in raw_models if isinstance(item, dict) and item.get("id")}
        )
        return TestConnectionResponse(
            ok=True,
            endpoint=url,
            models=model_ids,
            latency_ms=latency_ms,
            message=(
                f"Connected! Found {len(model_ids)} model(s)."
                if model_ids
                else "Connected! Endpoint responded (no models listed)."
            ),
        )
    except httpx.RequestError as exc:
        return TestConnectionResponse(
            ok=False,
            endpoint=url,
            message=f"Could not reach {url}: {exc}",
        )
    except Exception as exc:
        return TestConnectionResponse(
            ok=False,
            endpoint=url,
            message=f"Unexpected error testing {url}: {exc}",
        )


def _flatten_text_field(value: Any) -> str:
    """Normalize string or multimodal text-part lists returned in message fields."""
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        return "".join(part.get("text", "") for part in value if isinstance(part, dict))
    return ""


def _extract_message_parts(body: dict[str, Any]) -> tuple[str, str, Optional[str]]:
    """Extract (content, reasoning_content, finish_reason) from a chat completion payload."""
    choices = body.get("choices") or []
    if not choices:
        raise LLMClientError("Model returned no completion choices.")

    choice = choices[0] if isinstance(choices[0], dict) else {}
    message = choice.get("message") or {}
    content = _flatten_text_field(message.get("content"))
    reasoning = _flatten_text_field(
        message.get("reasoning_content") or message.get("reasoning")
    )
    finish_reason = choice.get("finish_reason")
    return content, reasoning, str(finish_reason) if finish_reason is not None else None


def _build_no_think_messages(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Append /no_think directive for Qwen3-family models to bypass reasoning exhaustion."""
    copied = [dict(m) for m in messages]
    if copied and copied[0].get("role") == "system" and isinstance(copied[0].get("content"), str):
        if "/no_think" not in copied[0]["content"]:
            copied[0]["content"] = f"{copied[0]['content']}\n/no_think"
        return copied
    return [{"role": "system", "content": "/no_think"}, *copied]


def _pick_usable_text(
    content: str, reasoning: str, *, expect_json: bool
) -> Optional[str]:
    """Return usable text from content or reasoning_content when applicable."""
    if content.strip():
        return content
    if expect_json and "{" in reasoning and "}" in reasoning:
        return reasoning
    if not expect_json and reasoning.strip():
        return reasoning
    return None


async def _post_completion(
    client: httpx.AsyncClient,
    url: str,
    headers: dict[str, str],
    payload: dict[str, Any],
    resolved: ResolvedProvider,
    *,
    fallback_pop_key: Optional[str] = None,
) -> dict[str, Any]:
    """Post a completion payload, optionally retrying without an unsupported key on 400/422."""
    resp = await client.post(url, headers=headers, json=payload)
    if resp.status_code in (400, 422) and fallback_pop_key and fallback_pop_key in payload:
        retry_payload = dict(payload)
        retry_payload.pop(fallback_pop_key, None)
        resp = await client.post(url, headers=headers, json=retry_payload)

    if resp.status_code >= 400:
        error_preview = resp.text[:500]
        raise LLMClientError(
            f"Upstream model '{resolved.model}' at {resolved.base_url} returned HTTP {resp.status_code}: {error_preview}",
            status_code=502 if resp.status_code >= 500 else resp.status_code,
        )
    return resp.json()


async def chat_completion(
    config: Optional[ProviderConfig],
    messages: list[dict[str, Any]],
    *,
    vision: bool = False,
    temperature: float = 0.2,
    max_tokens: Optional[int] = None,
    expect_json: bool = True,
) -> str:
    """Send a chat completion request to Local AI or OpenRouter with thinking-model recovery."""
    resolved = resolve_provider(config, vision=vision)
    url = f"{resolved.base_url}/chat/completions"
    headers = _build_headers(resolved)
    effective_max_tokens = max_tokens or resolved.max_tokens

    timeout = httpx.Timeout(settings.llm_timeout_seconds, connect=15.0)

    def build_no_think_payload() -> dict[str, Any]:
        return {
            "model": resolved.model,
            "messages": _build_no_think_messages(messages),
            "temperature": temperature,
            "max_tokens": effective_max_tokens,
            "chat_template_kwargs": {"enable_thinking": False},
        }

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            if resolved.disable_thinking:
                body = await _post_completion(
                    client,
                    url,
                    headers,
                    build_no_think_payload(),
                    resolved,
                    fallback_pop_key="chat_template_kwargs",
                )
                content, reasoning, finish_reason = _extract_message_parts(body)
                usable = _pick_usable_text(content, reasoning, expect_json=expect_json)
                if usable is not None:
                    return usable
            else:
                payload: dict[str, Any] = {
                    "model": resolved.model,
                    "messages": messages,
                    "temperature": temperature,
                    "max_tokens": effective_max_tokens,
                }
                if expect_json:
                    payload["response_format"] = {"type": "json_object"}

                body = await _post_completion(
                    client,
                    url,
                    headers,
                    payload,
                    resolved,
                    fallback_pop_key="response_format" if expect_json else None,
                )
                content, reasoning, finish_reason = _extract_message_parts(body)
                usable = _pick_usable_text(content, reasoning, expect_json=expect_json)
                if usable is not None:
                    return usable

                # Thinking models (e.g. Qwen3/Qwen3.8) can exhaust max_tokens inside reasoning_content
                # leaving message.content empty. Retry once with thinking disabled and no response_format.
                retry_body = await _post_completion(
                    client,
                    url,
                    headers,
                    build_no_think_payload(),
                    resolved,
                    fallback_pop_key="chat_template_kwargs",
                )
                content, reasoning, finish_reason = _extract_message_parts(retry_body)
                usable = _pick_usable_text(content, reasoning, expect_json=expect_json)
                if usable is not None:
                    return usable

            detail_hint = (
                f" (finish_reason={finish_reason}; reasoning tokens may have filled max_tokens={effective_max_tokens})"
                if reasoning.strip() or finish_reason == "length"
                else f" (finish_reason={finish_reason})" if finish_reason else ""
            )
            raise LLMClientError(f"Model returned empty message content{detail_hint}.")

    except LLMClientError:
        raise
    except httpx.TimeoutException as exc:
        raise LLMClientError(
            f"Request to {resolved.base_url} timed out after {settings.llm_timeout_seconds:.0f}s."
        ) from exc
    except httpx.RequestError as exc:
        raise LLMClientError(
            f"Network error connecting to {resolved.base_url}: {exc}"
        ) from exc


async def structured_completion(
    config: Optional[ProviderConfig],
    system_prompt: str,
    user_content: str | list[dict[str, Any]],
    response_model: Type[T],
    *,
    vision: bool = False,
    temperature: float = 0.2,
    max_tokens: Optional[int] = None,
) -> T:
    """Execute a structured JSON chat completion and validate against a Pydantic model."""
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_content},
    ]
    raw = await chat_completion(
        config,
        messages,
        vision=vision,
        temperature=temperature,
        max_tokens=max_tokens,
        expect_json=True,
    )
    data = extract_json_payload(raw)

    # Clean up mermaid_diagram if present
    if isinstance(data.get("mermaid_diagram"), str):
        data["mermaid_diagram"] = sanitize_mermaid_text(data["mermaid_diagram"])

    try:
        return response_model.model_validate(data)
    except Exception as exc:
        raise LLMClientError(
            f"LLM output did not match expected schema ({response_model.__name__}): {exc}"
        ) from exc
