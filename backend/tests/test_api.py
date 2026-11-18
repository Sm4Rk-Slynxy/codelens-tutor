"""Unit and API integration tests for CodeLens Tutor backend."""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import AsyncMock, patch

from app.main import analyze_cli, analyze_image, health
from app.schemas import CliAnalyzeRequest, ImageAnalyzeRequest, ImageCallout, ProviderConfig
from app.services.llm_client import extract_json_payload, normalize_base_url, sanitize_mermaid_text
from app.services.repo_service import (
    RepoServiceError,
    cleanup_session,
    normalize_github_url,
    open_repo_session,
    read_session_file,
)


def _run_coro(coro):
    try:
        while True:
            coro.send(None)
    except StopIteration as exc:
        return exc.value


def test_health_endpoint():
    data = _run_coro(health())
    assert data["status"] == "ok"
    assert "local_base_url" in data["defaults"]
    assert "openrouter_text_model" in data["defaults"]


def test_extract_json_handles_think_tags_and_fences():
    raw = """<think>Analyzing command tokens...</think>
Here is the JSON:
```json
{
  "summary": "Lists files",
  "mermaid_diagram": "flowchart LR\\n  A --> B"
}
```
Hope that helps!"""
    parsed = extract_json_payload(raw)
    assert parsed["summary"] == "Lists files"


def test_sanitize_mermaid_strips_fences():
    diagram = "```mermaid\nflowchart TD\n  A --> B\n```"
    assert sanitize_mermaid_text(diagram) == "flowchart TD\n  A --> B"


def test_normalize_urls():
    assert normalize_base_url("http://localhost:11434") == "http://localhost:11434/v1"
    assert normalize_base_url("http://localhost:11434/v1/") == "http://localhost:11434/v1"
    clone_url, name = normalize_github_url("https://github.com/fastapi/fastapi")
    assert clone_url == "https://github.com/fastapi/fastapi.git"
    assert name == "fastapi/fastapi"


def test_normalize_base_url_blocks_bad_schemes_and_metadata_hosts():
    from app.services.llm_client import LLMClientError

    for bad_url in [
        "file:///etc/passwd",
        "ftp://localhost:21",
        "http://169.254.169.254/latest/meta-data/",
        "http://metadata.google.internal/computeMetadata/v1/",
    ]:
        try:
            normalize_base_url(bad_url)
            assert False, f"Expected LLMClientError for {bad_url}"
        except LLMClientError as exc:
            assert exc.status_code == 400


def test_callout_box_clamping():
    c = ImageCallout(
        id=1,
        label="Error line",
        category="error",
        box_2d=[500, 900, 120, -20],
        explanation="Swapped and clamped coords",
    )
    assert c.box_2d == [120, 0, 500, 900]


def test_local_repo_scan_filters_noise_and_blocks_traversal(tmp_path: Path):
    (tmp_path / "src").mkdir()
    (tmp_path / "src" / "main.py").write_text("print('hello')", encoding="utf-8")
    (tmp_path / "node_modules").mkdir()
    (tmp_path / "node_modules" / "pkg.js").write_text("module.exports = {}", encoding="utf-8")
    (tmp_path / "package-lock.json").write_text("{}", encoding="utf-8")
    (tmp_path / "logo.png").write_bytes(b"\x89PNG\r\n")

    sess, tree, context = open_repo_session("local", str(tmp_path))
    try:
        assert sess.file_paths == ["src/main.py"]
        assert "node_modules" not in context
        assert "package-lock.json" not in context
        assert len(tree) == 1

        # Read valid file
        _, content, lang = read_session_file(sess.session_id, "src/main.py")
        assert content == "print('hello')"
        assert lang == "Python"

        # Block path traversal
        try:
            read_session_file(sess.session_id, "../../etc/passwd")
            assert False, "Expected RepoServiceError for path traversal"
        except RepoServiceError as exc:
            assert exc.status_code == 403
    finally:
        cleanup_session(sess.session_id)


def test_cli_analyze_endpoint_with_mock():
    mock_json = json.dumps(
        {
            "summary": "Runs nginx in detached mode.",
            "shell_dialect": "bash",
            "mermaid_diagram": "```mermaid\nflowchart LR\n  N1[\"docker run\"] --> N2[\"nginx container\"]\n```",
            "tokens": [
                {
                    "token": "docker",
                    "role": "binary",
                    "plain_english": "Docker CLI client",
                    "detail": "",
                    "risk_level": "safe",
                }
            ],
            "warnings": [],
            "dry_run_tip": "Use docker create to inspect without starting.",
        }
    )
    with patch("app.services.llm_client.chat_completion", new=AsyncMock(return_value=mock_json)):
        body = _run_coro(
            analyze_cli(
                CliAnalyzeRequest(command="docker run -d nginx", provider=ProviderConfig(mode="local"))
            )
        )
    assert body.summary == "Runs nginx in detached mode."
    assert not body.mermaid_diagram.startswith("```")


def test_image_analyze_endpoint_with_mock():
    mock_json = json.dumps(
        {
            "scene_type": "Terminal Error",
            "summary": "Python traceback showing ModuleNotFoundError.",
            "callouts": [
                {
                    "id": 1,
                    "label": "Missing package error",
                    "category": "error",
                    "box_2d": [200, 50, 260, 820],
                    "explanation": "FastAPI is not installed in the active environment.",
                    "action_tip": "Run pip install fastapi",
                }
            ],
            "overall_takeaway": "Install dependencies inside your virtualenv.",
        }
    )
    with patch("app.services.llm_client.chat_completion", new=AsyncMock(return_value=mock_json)):
        data = _run_coro(
            analyze_image(
                ImageAnalyzeRequest(
                    image_data_url="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
                    provider=ProviderConfig(mode="local"),
                )
            )
        )
    assert len(data.callouts) == 1
    assert data.callouts[0].box_2d == [200, 50, 260, 820]


class _FakeResponse:
    def __init__(self, status_code: int, payload: dict):
        self.status_code = status_code
        self._payload = payload
        self.text = json.dumps(payload)

    def json(self):
        return self._payload


def test_chat_completion_recovers_json_from_reasoning_content():
    from app.services.llm_client import chat_completion

    captured_payloads = []

    class _FakeClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        async def post(self, url, headers=None, json=None):
            captured_payloads.append(json)
            return _FakeResponse(
                200,
                {
                    "choices": [
                        {
                            "finish_reason": "stop",
                            "message": {
                                "content": None,
                                "reasoning_content": '{"summary": "Recovered from reasoning"}',
                            },
                        }
                    ]
                },
            )

    with patch("app.services.llm_client.httpx.AsyncClient", new=_FakeClient):
        result = _run_coro(
            chat_completion(
                ProviderConfig(mode="local"),
                [{"role": "system", "content": "Return JSON"}, {"role": "user", "content": "hi"}],
            )
        )

    assert '"Recovered from reasoning"' in result
    assert len(captured_payloads) == 1
    assert captured_payloads[0]["max_tokens"] == 32768


def test_chat_completion_retries_with_no_think_when_reasoning_exhausts_content():
    from app.services.llm_client import chat_completion

    captured_payloads = []

    class _FakeClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        async def post(self, url, headers=None, json=None):
            captured_payloads.append(json)
            if len(captured_payloads) == 1:
                return _FakeResponse(
                    200,
                    {
                        "choices": [
                            {
                                "finish_reason": "length",
                                "message": {
                                    "content": "",
                                    "reasoning_content": "Thinking deeply about every flag...",
                                },
                            }
                        ]
                    },
                )
            # Simulate server rejecting chat_template_kwargs on retry 2
            if "chat_template_kwargs" in json:
                return _FakeResponse(400, {"error": "unknown field chat_template_kwargs"})
            return _FakeResponse(
                200,
                {
                    "choices": [
                        {
                            "finish_reason": "stop",
                            "message": {"content": '{"summary": "Direct answer"}'},
                        }
                    ]
                },
            )

    with patch("app.services.llm_client.httpx.AsyncClient", new=_FakeClient):
        result = _run_coro(
            chat_completion(
                ProviderConfig(mode="local"),
                [{"role": "system", "content": "Return JSON"}, {"role": "user", "content": "hi"}],
            )
        )

    assert result == '{"summary": "Direct answer"}'
    assert len(captured_payloads) == 3
    assert captured_payloads[1]["chat_template_kwargs"] == {"enable_thinking": False}
    assert "/no_think" in captured_payloads[2]["messages"][0]["content"]
    assert "chat_template_kwargs" not in captured_payloads[2]


def test_chat_completion_respects_custom_max_tokens_and_disable_thinking():
    from app.services.llm_client import chat_completion

    captured_payloads = []

    class _FakeClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        async def post(self, url, headers=None, json=None):
            captured_payloads.append(json)
            return _FakeResponse(
                200,
                {
                    "choices": [
                        {
                            "finish_reason": "stop",
                            "message": {"content": '{"summary": "Fast mode"}'},
                        }
                    ]
                },
            )

    with patch("app.services.llm_client.httpx.AsyncClient", new=_FakeClient):
        result = _run_coro(
            chat_completion(
                ProviderConfig(mode="local", max_tokens=65536, disable_thinking=True),
                [{"role": "system", "content": "Return JSON"}, {"role": "user", "content": "hi"}],
            )
        )

    assert result == '{"summary": "Fast mode"}'
    assert len(captured_payloads) == 1
    assert captured_payloads[0]["max_tokens"] == 65536
    assert captured_payloads[0]["chat_template_kwargs"] == {"enable_thinking": False}
    assert "/no_think" in captured_payloads[0]["messages"][0]["content"]


def test_repo_service_blocks_secret_files_and_sensitive_dirs(tmp_path: Path):
    (tmp_path / "app.py").write_text("x = 1", encoding="utf-8")
    (tmp_path / ".env").write_text("SECRET_KEY=supersecret", encoding="utf-8")
    (tmp_path / ".env.local").write_text("API_TOKEN=secret", encoding="utf-8")
    (tmp_path / "cert.pem").write_text("PRIVATE KEY", encoding="utf-8")
    (tmp_path / ".ssh").mkdir()
    (tmp_path / ".ssh" / "id_ed25519").write_text("PRIVATE", encoding="utf-8")

    sess, _tree, context = open_repo_session("local", str(tmp_path))
    try:
        assert sess.file_paths == ["app.py"]
        assert "SECRET_KEY" not in context

        for blocked in [".env", ".env.local", "cert.pem", ".ssh/id_ed25519"]:
            try:
                read_session_file(sess.session_id, blocked)
                assert False, f"Expected RepoServiceError for {blocked}"
            except RepoServiceError as exc:
                assert exc.status_code == 403
    finally:
        cleanup_session(sess.session_id)
