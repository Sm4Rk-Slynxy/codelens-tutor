# CodeLens Tutor

Self-hosted visual technical workbench for breaking down **CLI commands**, **code snippets**, **GitHub repositories / local folders**, and **screenshots** into interactive diagrams, structured plain-English explanations, and annotated visual callouts.
<img width="1094" height="894" alt="Screenshot 2026-11-17 074320" src="https://github.com/user-attachments/assets/33a8259b-36ef-4cae-961c-d4a4dbcd454e" />
<img width="792" height="885" alt="Screenshot 2026-11-17 082038" src="https://github.com/user-attachments/assets/7d50b8e6-4f60-4203-9e80-66e053c5de17" />
<img width="779" height="883" alt="Screenshot 2026-11-17 082056" src="https://github.com/user-attachments/assets/c78e3e37-bab9-4773-b70c-d8eca93687b4" />

## Features

- **01 · CLI Dissector** (`Alt+1`)
  - Generates a Mermaid execution & pipe topology diagram.
  - Parses flags, subcommands, pipes, redirects, and variables into an interactive ribbon with risk/destructive-flag warnings and dry-run tips.
- **02 · Code Explainer** (`Alt+2`)
  - Auto-detects language and maps control flow, conditionals, and loops into a Mermaid flowchart.
  - Renders a side-by-side IDE split view highlighting line ranges paired with *Mechanism* and *Rationale* explanations.
- **03 · Repo X-Ray** (`Alt+3`)
  - Shallow-clones public GitHub repositories into an isolated temporary directory (cleaned up on session expiration/exit) or scans a local directory.
  - Filters noise (`node_modules`, `.git`, lockfiles, binaries) and secrets (`.env`, `.ssh`, private keys) and builds a searchable file tree.
  - Maps overall system architecture and generates per-file component diagrams when clicking any file.
- **04 · Screenshot Callouts** (`Alt+4`)
  - Drag-and-drop or `Ctrl+V` paste screenshots of terminal errors, UI screens, or diagrams.
  - Requests normalized `[ymin, xmin, ymax, xmax]` (`0–1000`) bounding boxes from a Vision model and renders synchronized numbered callout overlays.
- **Follow-Up Tutor & Markdown Export**
  - Pinned context-aware follow-up prompt bar (`TUTOR >`) retaining the active analysis context.
  - One-click **Export .md** saving explanations, Mermaid diagrams, and follow-up Q&A.

## Architecture

- **Backend (`backend/`)**: Python 3.11+, FastAPI, Uvicorn, Pydantic v2, `httpx`, `gitpython`.
- **Frontend (`frontend/`)**: React 18, TypeScript, Vite, Tailwind CSS, Mermaid.js (`securityLevel: "strict"`).

## Quick Start

### 1. Launch with one command

**Linux / macOS / Git Bash:**
```bash
chmod +x start.sh
./start.sh
```

**Windows PowerShell:**
```powershell
.\start.ps1
```

Both launchers bind to `127.0.0.1` by default for safety. To expose on your LAN intentionally, set `HOST=0.0.0.0` before launching.

Open **http://localhost:5173** in your browser (API docs at **http://localhost:8000/docs**).

### 2. Configure an AI Provider

Open **Settings** in the top-right bar (saved to `localStorage` and passed per request, overriding `.env` defaults):

- **Local Network AI (OpenAI-Compatible):**
  - Supports Ollama (`http://localhost:11434/v1`), vLLM / SGLang (`http://localhost:8000/v1`), LM Studio (`http://localhost:1234/v1`), or llama.cpp.
  - Click **Test Endpoint & List Models** to probe `/v1/models` and populate Text/Code and Vision dropdowns.
  - Includes configurable **Max Output Tokens** (`8K`–`128K`) and **Fast Mode (`/no_think`)** for reasoning models like Qwen3.
- **OpenRouter API:**
  - Enter your OpenRouter API key (`https://openrouter.ai/api/v1`) and select your Text/Code and Vision models.

Optional backend defaults: copy [`.env.example`](.env.example) to `.env` and customize values there.

## Keyboard Shortcuts

- `Alt+1` .. `Alt+4`: Switch between CLI, Code, Repo, and Screenshot modes
- `Ctrl+Enter` / `Cmd+Enter`: Run analysis in CLI or Code editors
- `Ctrl+V`: Paste a clipboard screenshot from anywhere in the app

## Security Notes

- **Localhost binding by default**: `127.0.0.1` binding prevents unauthenticated LAN access to local folder scanning (`POST /api/analyze/repo/scan`) unless `HOST` is explicitly overridden.
- **CORS allowlist**: Configured via `CODELENS_ALLOWED_ORIGINS` (defaults to localhost/127.0.0.1 Vite and backend origins).
- **Repo sandbox & secret filtering**: Git clones use `core.symlinks=false`, `protocol.file.allow=never`, and `--no-recurse-submodules`; file reads block path traversal, symlinks, `.env` files, `.ssh`/`.aws` folders, and private key extensions (`.pem`, `.key`, `.pfx`, `.p12`).
- **Diagram sanitization**: Mermaid renders with `securityLevel: "strict"`, `htmlLabels: false`, and SVG post-sanitization stripping script/event attributes.

## Running Tests

```bash
cd backend
.venv/bin/python -m pytest -v   # Windows: .\.venv\Scripts\python.exe -m pytest -v
```

```bash
cd frontend
npm run build
```

## License

[MIT](LICENSE)
