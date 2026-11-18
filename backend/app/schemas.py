"""Pydantic schemas for CodeLens Tutor API requests and structured LLM outputs."""

from typing import Literal, Optional
from pydantic import BaseModel, Field, field_validator


# --- Provider Configuration ---

class ProviderConfig(BaseModel):
    """Per-request AI provider settings supplied from frontend localStorage (with .env fallback)."""

    mode: Literal["local", "openrouter"] = "local"
    local_base_url: Optional[str] = None
    local_api_key: Optional[str] = None
    local_text_model: Optional[str] = None
    local_vision_model: Optional[str] = None
    openrouter_api_key: Optional[str] = None
    openrouter_text_model: Optional[str] = None
    openrouter_vision_model: Optional[str] = None
    max_tokens: Optional[int] = Field(default=None, ge=1024, le=131072)
    disable_thinking: bool = False


class TestConnectionRequest(BaseModel):
    provider: ProviderConfig


class TestConnectionResponse(BaseModel):
    ok: bool
    endpoint: str
    models: list[str] = Field(default_factory=list)
    latency_ms: Optional[int] = None
    message: str


# --- 1. CLI Command Dissector ---

class CliAnalyzeRequest(BaseModel):
    command: str = Field(..., min_length=1, max_length=12000)
    provider: ProviderConfig = Field(default_factory=ProviderConfig)


class CliToken(BaseModel):
    token: str
    role: Literal[
        "binary",
        "subcommand",
        "flag",
        "argument",
        "pipe",
        "redirect",
        "operator",
        "variable",
        "pattern",
        "other",
    ] = "other"
    plain_english: str
    detail: str = ""
    risk_level: Literal["safe", "caution", "destructive"] = "safe"


class CliWarning(BaseModel):
    severity: Literal["info", "warning", "danger"] = "warning"
    title: str
    explanation: str


class CliAnalyzeResponse(BaseModel):
    summary: str
    shell_dialect: str = "bash"
    mermaid_diagram: str
    tokens: list[CliToken] = Field(default_factory=list)
    warnings: list[CliWarning] = Field(default_factory=list)
    dry_run_tip: str = ""


# --- 2. Code Snippet Explainer ---

class CodeAnalyzeRequest(BaseModel):
    code: str = Field(..., min_length=1, max_length=150000)
    language_hint: Optional[str] = None
    provider: ProviderConfig = Field(default_factory=ProviderConfig)


class CodeBlockExplanation(BaseModel):
    id: int
    line_start: int = 1
    line_end: int = 1
    code_excerpt: str
    title: str
    what_it_does: str
    why_written_that_way: str
    key_concepts: list[str] = Field(default_factory=list)


class CodeAnalyzeResponse(BaseModel):
    detected_language: str
    summary: str
    mermaid_diagram: str
    blocks: list[CodeBlockExplanation] = Field(default_factory=list)
    complexity_or_gotchas: list[str] = Field(default_factory=list)


# --- 3. GitHub Repo / Local Folder X-Ray ---

class RepoScanRequest(BaseModel):
    source_type: Literal["github", "local"]
    location: str = Field(..., min_length=1, max_length=1000)
    provider: ProviderConfig = Field(default_factory=ProviderConfig)


class FileTreeNode(BaseModel):
    name: str
    path: str
    type: Literal["file", "directory"]
    size: Optional[int] = None
    language: Optional[str] = None
    children: list["FileTreeNode"] = Field(default_factory=list)


class RepoComponent(BaseModel):
    name: str
    path: str
    role: str


class RepoScanResponse(BaseModel):
    session_id: str
    repo_name: str
    source_type: Literal["github", "local"]
    file_count: int
    tree: list[FileTreeNode]
    summary: str
    tech_stack: list[str] = Field(default_factory=list)
    entry_points: list[str] = Field(default_factory=list)
    mermaid_diagram: str
    key_components: list[RepoComponent] = Field(default_factory=list)


class RepoFileExplainRequest(BaseModel):
    session_id: str
    file_path: str
    provider: ProviderConfig = Field(default_factory=ProviderConfig)


class RepoFileExplainResponse(BaseModel):
    file_path: str
    language: str
    content: str
    summary: str
    role_in_project: str
    mermaid_diagram: str
    key_elements: list[CodeBlockExplanation] = Field(default_factory=list)
    connections: list[str] = Field(default_factory=list)


# --- 4. Screenshot & Picture Callout Analyzer ---

class ImageAnalyzeRequest(BaseModel):
    image_data_url: str = Field(..., min_length=10)
    context_hint: Optional[str] = ""
    provider: ProviderConfig = Field(default_factory=ProviderConfig)


class ImageCallout(BaseModel):
    id: int
    label: str
    category: Literal["error", "ui", "code", "network", "command", "data", "other"] = "other"
    box_2d: list[int] = Field(
        ...,
        min_length=4,
        max_length=4,
        description="Normalized [ymin, xmin, ymax, xmax] on 0-1000 scale",
    )
    explanation: str
    action_tip: str = ""

    @field_validator("box_2d")
    @classmethod
    def clamp_box(cls, v: list[int]) -> list[int]:
        clamped = [max(0, min(1000, int(round(coord)))) for coord in v]
        ymin, xmin, ymax, xmax = clamped
        if ymax < ymin:
            ymin, ymax = ymax, ymin
        if xmax < xmin:
            xmin, xmax = xmax, xmin
        # Ensure non-zero box visibility
        if ymax == ymin:
            ymax = min(1000, ymin + 20)
        if xmax == xmin:
            xmax = min(1000, xmin + 20)
        return [ymin, xmin, ymax, xmax]


class ImageAnalyzeResponse(BaseModel):
    scene_type: str
    summary: str
    callouts: list[ImageCallout] = Field(default_factory=list)
    overall_takeaway: str = ""


# --- 5. Follow-Up Tutor Chat ---

class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class FollowUpRequest(BaseModel):
    mode: Literal["cli", "code", "repo", "image"]
    question: str = Field(..., min_length=1, max_length=6000)
    context_summary: str = Field(..., min_length=1, max_length=120000)
    history: list[ChatMessage] = Field(default_factory=list)
    image_data_url: Optional[str] = None
    provider: ProviderConfig = Field(default_factory=ProviderConfig)


class FollowUpResponse(BaseModel):
    answer: str
