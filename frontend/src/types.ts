export type ModeTab = "cli" | "code" | "repo" | "image";

export type ProviderMode = "local" | "openrouter";

export interface ProviderConfig {
  mode: ProviderMode;
  local_base_url: string;
  local_api_key: string;
  local_text_model: string;
  local_vision_model: string;
  openrouter_api_key: string;
  openrouter_text_model: string;
  openrouter_vision_model: string;
  max_tokens: number;
  disable_thinking: boolean;
}

export interface TestConnectionResponse {
  ok: boolean;
  endpoint: string;
  models: string[];
  latency_ms?: number | null;
  message: string;
}

// 1. CLI Dissector
export interface CliToken {
  token: string;
  role:
    | "binary"
    | "subcommand"
    | "flag"
    | "argument"
    | "pipe"
    | "redirect"
    | "operator"
    | "variable"
    | "pattern"
    | "other";
  plain_english: string;
  detail: string;
  risk_level: "safe" | "caution" | "destructive";
}

export interface CliWarning {
  severity: "info" | "warning" | "danger";
  title: string;
  explanation: string;
}

export interface CliAnalyzeResponse {
  summary: string;
  shell_dialect: string;
  mermaid_diagram: string;
  tokens: CliToken[];
  warnings: CliWarning[];
  dry_run_tip: string;
}

// 2. Code Snippet Explainer
export interface CodeBlockExplanation {
  id: number;
  line_start: number;
  line_end: number;
  code_excerpt: string;
  title: string;
  what_it_does: string;
  why_written_that_way: string;
  key_concepts: string[];
}

export interface CodeAnalyzeResponse {
  detected_language: string;
  summary: string;
  mermaid_diagram: string;
  blocks: CodeBlockExplanation[];
  complexity_or_gotchas: string[];
}

// 3. GitHub Repo / Local Folder X-Ray
export interface FileTreeNode {
  name: string;
  path: string;
  type: "file" | "directory";
  size?: number | null;
  language?: string | null;
  children: FileTreeNode[];
}

export interface RepoComponent {
  name: string;
  path: string;
  role: string;
}

export interface RepoScanResponse {
  session_id: string;
  repo_name: string;
  source_type: "github" | "local";
  file_count: number;
  tree: FileTreeNode[];
  summary: string;
  tech_stack: string[];
  entry_points: string[];
  mermaid_diagram: string;
  key_components: RepoComponent[];
}

export interface RepoFileExplainResponse {
  file_path: string;
  language: string;
  content: string;
  summary: string;
  role_in_project: string;
  mermaid_diagram: string;
  key_elements: CodeBlockExplanation[];
  connections: string[];
}

// 4. Screenshot & Picture Callout Analyzer
export interface ImageCallout {
  id: number;
  label: string;
  category: "error" | "ui" | "code" | "network" | "command" | "data" | "other";
  box_2d: [number, number, number, number]; // [ymin, xmin, ymax, xmax] 0-1000
  explanation: string;
  action_tip: string;
}

export interface ImageAnalyzeResponse {
  scene_type: string;
  summary: string;
  callouts: ImageCallout[];
  overall_takeaway: string;
}

// 5. Follow-up Chat
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}
