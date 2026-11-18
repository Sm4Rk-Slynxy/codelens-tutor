"""FastAPI entrypoint for CodeLens Tutor."""

from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.config import settings
from app.schemas import (
    CliAnalyzeRequest,
    CliAnalyzeResponse,
    CodeAnalyzeRequest,
    CodeAnalyzeResponse,
    CodeBlockExplanation,
    FollowUpRequest,
    FollowUpResponse,
    ImageAnalyzeRequest,
    ImageAnalyzeResponse,
    RepoComponent,
    RepoFileExplainRequest,
    RepoFileExplainResponse,
    RepoScanRequest,
    RepoScanResponse,
    TestConnectionRequest,
    TestConnectionResponse,
)
from app.services.llm_client import (
    LLMClientError,
    chat_completion,
    structured_completion,
    test_provider_connection,
)
from app.services.prompts import (
    CLI_SYSTEM_PROMPT,
    CODE_SYSTEM_PROMPT,
    FOLLOWUP_SYSTEM_PROMPT,
    IMAGE_SYSTEM_PROMPT,
    REPO_ARCH_SYSTEM_PROMPT,
    REPO_FILE_SYSTEM_PROMPT,
)
from app.services.repo_service import (
    _SESSIONS,
    RepoServiceError,
    cleanup_session,
    open_repo_session,
    read_session_file,
)


class _RepoArchLLMOutput(BaseModel):
    summary: str
    tech_stack: list[str] = []
    entry_points: list[str] = []
    mermaid_diagram: str
    key_components: list[RepoComponent] = []


class _RepoFileLLMOutput(BaseModel):
    summary: str
    role_in_project: str
    mermaid_diagram: str
    key_elements: list[CodeBlockExplanation] = []
    connections: list[str] = []


@asynccontextmanager
async def lifespan(_app: FastAPI):
    yield
    for sid in list(_SESSIONS.keys()):
        cleanup_session(sid)


app = FastAPI(
    title="CodeLens Tutor API",
    version="1.0.0",
    description="Self-hosted visual tutor for CLI commands, code snippets, repositories, and screenshots.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.codelens_allowed_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(LLMClientError)
async def llm_error_handler(_request, exc: LLMClientError):
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.message})


@app.exception_handler(RepoServiceError)
async def repo_error_handler(_request, exc: RepoServiceError):
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.message})


@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "defaults": {
            "mode": settings.codelens_provider_mode,
            "local_base_url": settings.codelens_local_base_url,
            "local_api_key": settings.codelens_local_api_key,
            "local_text_model": settings.codelens_local_text_model,
            "local_vision_model": settings.codelens_local_vision_model,
            "openrouter_text_model": settings.codelens_openrouter_text_model,
            "openrouter_vision_model": settings.codelens_openrouter_vision_model,
            "max_tokens": settings.llm_max_tokens,
            "has_openrouter_env_key": bool(settings.codelens_openrouter_api_key.strip()),
        },
    }


@app.post("/api/settings/test-connection", response_model=TestConnectionResponse)
async def test_connection(req: TestConnectionRequest):
    return await test_provider_connection(req.provider)


@app.post("/api/analyze/cli", response_model=CliAnalyzeResponse)
async def analyze_cli(req: CliAnalyzeRequest):
    user_prompt = f"Dissect this CLI command in full detail:\n\n```sh\n{req.command.strip()}\n```"
    return await structured_completion(
        req.provider,
        CLI_SYSTEM_PROMPT,
        user_prompt,
        CliAnalyzeResponse,
        vision=False,
    )


@app.post("/api/analyze/code", response_model=CodeAnalyzeResponse)
async def analyze_code(req: CodeAnalyzeRequest):
    hint = f" (User language hint: {req.language_hint})" if req.language_hint else ""
    numbered_lines = "\n".join(
        f"{idx + 1}: {line}" for idx, line in enumerate(req.code.splitlines())
    )
    user_prompt = (
        f"Explain this code snippet{hint}. Line numbers are shown on the left for accurate block mapping:\n\n"
        f"{numbered_lines}"
    )
    return await structured_completion(
        req.provider,
        CODE_SYSTEM_PROMPT,
        user_prompt,
        CodeAnalyzeResponse,
        vision=False,
    )


@app.post("/api/analyze/repo/scan", response_model=RepoScanResponse)
async def scan_repo(req: RepoScanRequest):
    session, tree, llm_context = open_repo_session(req.source_type, req.location)
    try:
        user_prompt = (
            f"Repository: {session.repo_name} (source: {session.source_type})\n\n"
            f"{llm_context}"
        )
        arch = await structured_completion(
            req.provider,
            REPO_ARCH_SYSTEM_PROMPT,
            user_prompt,
            _RepoArchLLMOutput,
            vision=False,
        )
        session.summary = arch.summary
        return RepoScanResponse(
            session_id=session.session_id,
            repo_name=session.repo_name,
            source_type=req.source_type,
            file_count=len(session.file_paths),
            tree=tree,
            summary=arch.summary,
            tech_stack=arch.tech_stack,
            entry_points=arch.entry_points,
            mermaid_diagram=arch.mermaid_diagram,
            key_components=arch.key_components,
        )
    except Exception:
        # Clean up temp clone if initial architecture analysis failed
        if session.is_temp_clone:
            cleanup_session(session.session_id)
        raise


@app.post("/api/analyze/repo/file", response_model=RepoFileExplainResponse)
async def explain_repo_file(req: RepoFileExplainRequest):
    sess, content, language = read_session_file(req.session_id, req.file_path)
    lines = content.splitlines()
    preview_lines = lines[:1200]
    numbered = "\n".join(f"{i + 1}: {line}" for i, line in enumerate(preview_lines))
    if len(lines) > 1200:
        numbered += f"\n... ({len(lines) - 1200} more lines truncated for LLM context)"

    user_prompt = (
        f"Repository: {sess.repo_name}\n"
        f"Project Summary: {sess.summary or 'N/A'}\n"
        f"Selected File: {req.file_path} (Language: {language})\n"
        f"Other repository files (sample): {', '.join(sess.file_paths[:60])}\n\n"
        f"File Contents:\n{numbered}"
    )

    parsed = await structured_completion(
        req.provider,
        REPO_FILE_SYSTEM_PROMPT,
        user_prompt,
        _RepoFileLLMOutput,
        vision=False,
    )

    # Validate key_elements through RepoFileExplainResponse
    return RepoFileExplainResponse(
        file_path=req.file_path,
        language=language,
        content=content,
        summary=parsed.summary,
        role_in_project=parsed.role_in_project,
        mermaid_diagram=parsed.mermaid_diagram,
        key_elements=parsed.key_elements,
        connections=parsed.connections,
    )


@app.delete("/api/analyze/repo/{session_id}")
async def delete_repo_session(session_id: str):
    removed = cleanup_session(session_id)
    return {"cleaned_up": removed, "session_id": session_id}


@app.post("/api/analyze/image", response_model=ImageAnalyzeResponse)
async def analyze_image(req: ImageAnalyzeRequest):
    if not req.image_data_url.startswith("data:image/"):
        raise HTTPException(
            status_code=400,
            detail="image_data_url must be a valid base64 image data URL (data:image/...).",
        )

    hint_text = f"\nUser question/focus: {req.context_hint.strip()}" if req.context_hint else ""
    user_content = [
        {
            "type": "text",
            "text": (
                "Analyze this technical image/screenshot and identify 3 to 10 key visual elements "
                "with accurate normalized [ymin, xmin, ymax, xmax] bounding boxes (0-1000 scale)."
                f"{hint_text}"
            ),
        },
        {
            "type": "image_url",
            "image_url": {"url": req.image_data_url},
        },
    ]

    return await structured_completion(
        req.provider,
        IMAGE_SYSTEM_PROMPT,
        user_content,
        ImageAnalyzeResponse,
        vision=True,
    )


@app.post("/api/tutor/followup", response_model=FollowUpResponse)
async def tutor_followup(req: FollowUpRequest):
    messages: list[dict[str, Any]] = [
        {
            "role": "system",
            "content": f"{FOLLOWUP_SYSTEM_PROMPT}\n\nCURRENT ANALYSIS CONTEXT ({req.mode.upper()}):\n{req.context_summary}",
        }
    ]
    for msg in req.history[-10:]:
        messages.append({"role": msg.role, "content": msg.content})

    use_vision = req.mode == "image" and bool(req.image_data_url)
    if use_vision and req.image_data_url:
        messages.append(
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": req.question},
                    {"type": "image_url", "image_url": {"url": req.image_data_url}},
                ],
            }
        )
    else:
        messages.append({"role": "user", "content": req.question})

    answer = await chat_completion(
        req.provider,
        messages,
        vision=use_vision,
        temperature=0.3,
        expect_json=False,
    )
    return FollowUpResponse(answer=answer.strip())
