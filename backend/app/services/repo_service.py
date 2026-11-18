"""Safe repository cloning, local folder scanning, and noise-filtered file tree builder."""

from __future__ import annotations

import os
import re
import shutil
import stat
import subprocess
import tempfile
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from app.config import settings
from app.schemas import FileTreeNode

IGNORED_DIRS = {
    ".git",
    ".ssh",
    ".aws",
    ".gnupg",
    ".kube",
    ".azure",
    ".gcloud",
    "node_modules",
    "__pycache__",
    ".venv",
    "venv",
    "env",
    ".mypy_cache",
    ".pytest_cache",
    ".ruff_cache",
    ".tox",
    "dist",
    "build",
    ".next",
    ".nuxt",
    ".svelte-kit",
    ".output",
    "coverage",
    ".cache",
    ".turbo",
    "target",
    ".gradle",
    ".idea",
    ".vscode",
}

IGNORED_FILES = {
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
    "poetry.lock",
    "Cargo.lock",
    "composer.lock",
    "Gemfile.lock",
    "Pipfile.lock",
    "bun.lockb",
    ".DS_Store",
    "Thumbs.db",
}

BINARY_EXTENSIONS = {
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".bmp", ".tiff", ".psd",
    ".woff", ".woff2", ".ttf", ".eot", ".otf",
    ".pdf", ".zip", ".tar", ".gz", ".bz2", ".xz", ".7z", ".rar",
    ".exe", ".dll", ".so", ".dylib", ".bin", ".dat", ".o", ".a", ".lib",
    ".pyc", ".pyo", ".class", ".jar", ".war",
    ".mp3", ".mp4", ".wav", ".flac", ".ogg", ".avi", ".mov", ".webm",
    ".db", ".sqlite", ".sqlite3", ".wasm", ".map", ".min.js", ".min.css",
}

EXT_TO_LANGUAGE = {
    ".py": "Python",
    ".js": "JavaScript",
    ".jsx": "JavaScript (JSX)",
    ".ts": "TypeScript",
    ".tsx": "TypeScript (TSX)",
    ".go": "Go",
    ".rs": "Rust",
    ".java": "Java",
    ".kt": "Kotlin",
    ".rb": "Ruby",
    ".php": "PHP",
    ".c": "C",
    ".h": "C/C++ Header",
    ".cpp": "C++",
    ".hpp": "C++ Header",
    ".cs": "C#",
    ".sh": "Bash/Shell",
    ".bash": "Bash",
    ".zsh": "Zsh",
    ".ps1": "PowerShell",
    ".sql": "SQL",
    ".html": "HTML",
    ".css": "CSS",
    ".scss": "SCSS",
    ".json": "JSON",
    ".yaml": "YAML",
    ".yml": "YAML",
    ".toml": "TOML",
    ".md": "Markdown",
    ".dockerfile": "Dockerfile",
    ".xml": "XML",
    ".vue": "Vue",
    ".svelte": "Svelte",
}

PRIORITY_FILES = {
    "readme.md",
    "package.json",
    "pyproject.toml",
    "requirements.txt",
    "cargo.toml",
    "go.mod",
    "dockerfile",
    "docker-compose.yml",
    "docker-compose.yaml",
    "makefile",
    "main.py",
    "app.py",
    "server.py",
    "index.ts",
    "index.js",
    "app.ts",
    "app.tsx",
    "main.ts",
    "main.tsx",
    "main.go",
    "main.rs",
    "lib.rs",
}

MAX_FILES_INDEXED = 1500
MAX_FILE_READ_BYTES = 250_000
SANDBOX_ROOT = Path(tempfile.gettempdir()) / "codelens_tutor_repos"


class RepoServiceError(Exception):
    """Raised when cloning or reading a repository fails."""

    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


@dataclass
class RepoSession:
    session_id: str
    repo_name: str
    source_type: str
    root_path: Path
    is_temp_clone: bool
    created_at: float
    summary: str = ""
    file_paths: list[str] = None  # type: ignore[assignment]


_SESSIONS: dict[str, RepoSession] = {}


def _handle_remove_readonly(func, path, exc_info):
    """Windows-safe rmtree handler for read-only .git files."""
    try:
        os.chmod(path, stat.S_IWRITE)
        func(path)
    except Exception:
        pass


def safe_rmtree(path: Path) -> None:
    if path.exists():
        shutil.rmtree(path, onerror=_handle_remove_readonly)


def cleanup_expired_sessions() -> None:
    now = time.time()
    expired = [
        sid
        for sid, sess in _SESSIONS.items()
        if now - sess.created_at > settings.repo_session_ttl_seconds
    ]
    for sid in expired:
        cleanup_session(sid)


def cleanup_session(session_id: str) -> bool:
    sess = _SESSIONS.pop(session_id, None)
    if not sess:
        return False
    if sess.is_temp_clone:
        safe_rmtree(sess.root_path)
    return True


def detect_language(path: Path) -> str:
    name_lower = path.name.lower()
    if name_lower == "dockerfile":
        return "Dockerfile"
    if name_lower == "makefile":
        return "Makefile"
    return EXT_TO_LANGUAGE.get(path.suffix.lower(), "Plain Text")


def normalize_github_url(raw_url: str) -> tuple[str, str]:
    """Validate and normalize a GitHub repository URL into (clone_url, repo_name)."""
    url = raw_url.strip()
    if url.startswith("-"):
        raise RepoServiceError("Invalid repository URL.")

    # Support owner/repo shorthand as well as full GitHub URLs
    shorthand = re.fullmatch(r"([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+)", url)
    if shorthand:
        owner, repo = shorthand.group(1), shorthand.group(2).removesuffix(".git")
        return f"https://github.com/{owner}/{repo}.git", f"{owner}/{repo}"

    match = re.match(
        r"^https?://(?:www\.)?github\.com/([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+?)(?:\.git)?(?:/.*)?$",
        url,
    )
    if not match:
        raise RepoServiceError(
            "Please enter a valid public GitHub repository URL (e.g. https://github.com/owner/repo)."
        )

    owner, repo = match.group(1), match.group(2)
    return f"https://github.com/{owner}/{repo}.git", f"{owner}/{repo}"


SENSITIVE_FILES = {
    ".env",
    ".npmrc",
    ".pypirc",
    ".netrc",
    "id_rsa",
    "id_ed25519",
    "id_ecdsa",
    "id_dsa",
}

SENSITIVE_EXTENSIONS = {
    ".pem",
    ".key",
    ".pfx",
    ".p12",
}


def _is_ignored_file(path: Path) -> bool:
    name = path.name
    name_lower = name.lower()
    if name in IGNORED_FILES or name_lower in SENSITIVE_FILES:
        return True
    if name_lower.startswith(".env.") and name_lower != ".env.example":
        return True
    if name_lower.endswith(".min.js") or name_lower.endswith(".min.css"):
        return True
    ext_lower = path.suffix.lower()
    if ext_lower in BINARY_EXTENSIONS or ext_lower in SENSITIVE_EXTENSIONS:
        return True
    return False


def build_file_tree(root: Path) -> tuple[list[FileTreeNode], list[str]]:
    """Walk root directory, filter noise, and return (nested_tree, flat_relative_paths)."""
    flat_paths: list[str] = []

    def walk_dir(current: Path) -> list[FileTreeNode]:
        if len(flat_paths) >= MAX_FILES_INDEXED:
            return []

        try:
            entries = list(current.iterdir())
        except OSError:
            return []

        dirs = sorted(
            [e for e in entries if e.is_dir() and e.name not in IGNORED_DIRS and not e.is_symlink()],
            key=lambda p: p.name.lower(),
        )
        files = sorted(
            [e for e in entries if e.is_file() and not _is_ignored_file(e) and not e.is_symlink()],
            key=lambda p: p.name.lower(),
        )

        nodes: list[FileTreeNode] = []
        for d in dirs:
            children = walk_dir(d)
            if children:
                rel = d.relative_to(root).as_posix()
                nodes.append(
                    FileTreeNode(
                        name=d.name,
                        path=rel,
                        type="directory",
                        children=children,
                    )
                )

        for f in files:
            if len(flat_paths) >= MAX_FILES_INDEXED:
                break
            rel = f.relative_to(root).as_posix()
            try:
                size = f.stat().st_size
            except OSError:
                size = 0
            flat_paths.append(rel)
            nodes.append(
                FileTreeNode(
                    name=f.name,
                    path=rel,
                    type="file",
                    size=size,
                    language=detect_language(f),
                )
            )
        return nodes

    tree = walk_dir(root)
    return tree, flat_paths


def build_repo_llm_context(root: Path, flat_paths: list[str]) -> str:
    """Assemble a concise repo snapshot (tree + key entry/manifest files) for architecture analysis."""
    tree_preview = "\n".join(flat_paths[:180])
    if len(flat_paths) > 180:
        tree_preview += f"\n... ({len(flat_paths) - 180} more files omitted)"

    # Pick priority files first, then shallow source files
    def priority_score(rel_path: str) -> tuple[int, int, str]:
        p = Path(rel_path)
        depth = len(p.parts)
        is_prio = 0 if p.name.lower() in PRIORITY_FILES else 1
        return (is_prio, depth, rel_path)

    candidates = sorted(flat_paths, key=priority_score)
    excerpts: list[str] = []
    budget = 45000

    for rel in candidates:
        if budget <= 0 or len(excerpts) >= 24:
            break
        full = root / rel
        try:
            if full.stat().st_size > 120_000:
                continue
            text = full.read_text(encoding="utf-8", errors="replace").strip()
        except OSError:
            continue
        if not text:
            continue
        snippet = text[:3500]
        if len(text) > 3500:
            snippet += "\n... [truncated]"
        block = f"=== FILE: {rel} ===\n{snippet}"
        excerpts.append(block)
        budget -= len(block)

    return f"FILES ({len(flat_paths)} total):\n{tree_preview}\n\nKEY FILE EXCERPTS:\n\n" + "\n\n".join(excerpts)


def open_repo_session(source_type: str, location: str) -> tuple[RepoSession, list[FileTreeNode], str]:
    """Clone a GitHub repo into an isolated temp sandbox OR open a local directory."""
    cleanup_expired_sessions()
    session_id = uuid.uuid4().hex[:12]

    if source_type == "github":
        clone_url, repo_name = normalize_github_url(location)
        SANDBOX_ROOT.mkdir(parents=True, exist_ok=True)
        target_dir = SANDBOX_ROOT / session_id

        try:
            proc = subprocess.run(
                [
                    "git",
                    "-c",
                    "core.symlinks=false",
                    "-c",
                    "protocol.file.allow=never",
                    "clone",
                    "--depth",
                    "1",
                    "--single-branch",
                    "--no-recurse-submodules",
                    "--",
                    clone_url,
                    str(target_dir),
                ],
                capture_output=True,
                text=True,
                timeout=90,
                shell=False,
                env={**os.environ, "GIT_TERMINAL_PROMPT": "0"},
            )
        except subprocess.TimeoutExpired as exc:
            safe_rmtree(target_dir)
            raise RepoServiceError("Git clone timed out after 90 seconds.") from exc
        except FileNotFoundError as exc:
            raise RepoServiceError("`git` executable was not found on PATH.") from exc

        if proc.returncode != 0:
            safe_rmtree(target_dir)
            stderr = (proc.stderr or proc.stdout or "Unknown git error").strip()
            raise RepoServiceError(f"Failed to clone repository: {stderr[:400]}")

        root_path = target_dir.resolve()
        is_temp = True
    else:
        raw_path = location.strip().strip('"').strip("'")
        candidate = Path(raw_path).expanduser()
        if not candidate.exists() or not candidate.is_dir():
            raise RepoServiceError(f"Local directory not found: {location}")
        root_path = candidate.resolve()
        repo_name = root_path.name or str(root_path)
        is_temp = False

    tree, flat_paths = build_file_tree(root_path)
    if not flat_paths:
        if is_temp:
            safe_rmtree(root_path)
        raise RepoServiceError("No readable source files found after filtering noise/binaries.")

    session = RepoSession(
        session_id=session_id,
        repo_name=repo_name,
        source_type=source_type,
        root_path=root_path,
        is_temp_clone=is_temp,
        created_at=time.time(),
        file_paths=flat_paths,
    )
    _SESSIONS[session_id] = session
    llm_context = build_repo_llm_context(root_path, flat_paths)
    return session, tree, llm_context


def get_session(session_id: str) -> RepoSession:
    cleanup_expired_sessions()
    sess = _SESSIONS.get(session_id)
    if not sess:
        raise RepoServiceError(
            "Repository session expired or not found. Please scan the repository again.",
            status_code=404,
        )
    return sess


def read_session_file(session_id: str, relative_path: str) -> tuple[RepoSession, str, str]:
    """Safely read a file inside an active repo session, blocking path traversal and secrets."""
    sess = get_session(session_id)
    cleaned_rel = relative_path.strip().lstrip("/\\")
    raw_target = sess.root_path / cleaned_rel
    if raw_target.is_symlink():
        raise RepoServiceError("Symlinks are not permitted.", status_code=403)

    target = raw_target.resolve()
    if target.is_symlink():
        raise RepoServiceError("Symlinks are not permitted.", status_code=403)
    if not target.is_relative_to(sess.root_path):
        raise RepoServiceError("Invalid file path (path traversal blocked).", status_code=403)
    if any(part in IGNORED_DIRS for part in target.relative_to(sess.root_path).parts[:-1]):
        raise RepoServiceError("Access to ignored or sensitive directory is blocked.", status_code=403)
    if _is_ignored_file(target):
        raise RepoServiceError("Access to sensitive or ignored file is blocked.", status_code=403)
    if not target.exists() or not target.is_file():
        raise RepoServiceError(f"File not found in repository: {relative_path}", status_code=404)

    size = target.stat().st_size
    if size > MAX_FILE_READ_BYTES:
        raise RepoServiceError(
            f"File '{relative_path}' is too large ({size // 1024} KB). Max supported size is {MAX_FILE_READ_BYTES // 1024} KB.",
            status_code=413,
        )

    content = target.read_text(encoding="utf-8", errors="replace")
    language = detect_language(target)
    return sess, content, language
