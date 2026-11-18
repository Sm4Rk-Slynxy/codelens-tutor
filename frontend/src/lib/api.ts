import type {
  CliAnalyzeResponse,
  CodeAnalyzeResponse,
  ChatMessage,
  ImageAnalyzeResponse,
  ModeTab,
  ProviderConfig,
  RepoFileExplainResponse,
  RepoScanResponse,
  TestConnectionResponse,
} from "../types";

const STORAGE_KEY = "codelens_tutor_provider_settings_v1";

export const DEFAULT_PROVIDER_CONFIG: ProviderConfig = {
  mode: "local",
  local_base_url: "http://localhost:11434/v1",
  local_api_key: "EMPTY",
  local_text_model: "qwen2.5-coder:32b",
  local_vision_model: "qwen2.5vl:32b",
  openrouter_api_key: "",
  openrouter_text_model: "qwen/qwen-2.5-coder-32b-instruct",
  openrouter_vision_model: "qwen/qwen2.5-vl-72b-instruct",
  max_tokens: 32768,
  disable_thinking: false,
};

export function loadProviderConfig(): ProviderConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PROVIDER_CONFIG };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_PROVIDER_CONFIG, ...parsed };
  } catch {
    return { ...DEFAULT_PROVIDER_CONFIG };
  }
}

export function saveProviderConfig(config: ProviderConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const errBody = await res.json();
      if (errBody?.detail) {
        detail = typeof errBody.detail === "string" ? errBody.detail : JSON.stringify(errBody.detail);
      }
    } catch {
      const text = await res.text();
      if (text) detail = text;
    }
    throw new Error(detail);
  }

  return res.json() as Promise<T>;
}

export async function fetchHealthDefaults() {
  return apiRequest<{
    status: string;
    defaults: {
      mode: "local" | "openrouter";
      local_base_url: string;
      local_api_key: string;
      local_text_model: string;
      local_vision_model: string;
      openrouter_text_model: string;
      openrouter_vision_model: string;
      max_tokens?: number;
      has_openrouter_env_key: boolean;
    };
  }>("/api/health");
}

export function testConnection(provider: ProviderConfig) {
  return apiRequest<TestConnectionResponse>("/api/settings/test-connection", {
    method: "POST",
    body: JSON.stringify({ provider }),
  });
}

export function analyzeCli(command: string, provider: ProviderConfig) {
  return apiRequest<CliAnalyzeResponse>("/api/analyze/cli", {
    method: "POST",
    body: JSON.stringify({ command, provider }),
  });
}

export function analyzeCode(code: string, languageHint: string, provider: ProviderConfig) {
  return apiRequest<CodeAnalyzeResponse>("/api/analyze/code", {
    method: "POST",
    body: JSON.stringify({ code, language_hint: languageHint || null, provider }),
  });
}

export function scanRepo(sourceType: "github" | "local", location: string, provider: ProviderConfig) {
  return apiRequest<RepoScanResponse>("/api/analyze/repo/scan", {
    method: "POST",
    body: JSON.stringify({ source_type: sourceType, location, provider }),
  });
}

export function explainRepoFile(sessionId: string, filePath: string, provider: ProviderConfig) {
  return apiRequest<RepoFileExplainResponse>("/api/analyze/repo/file", {
    method: "POST",
    body: JSON.stringify({ session_id: sessionId, file_path: filePath, provider }),
  });
}

export function cleanupRepoSession(sessionId: string) {
  return apiRequest<{ cleaned_up: boolean }>(`/api/analyze/repo/${encodeURIComponent(sessionId)}`, {
    method: "DELETE",
  });
}

export function analyzeImage(imageDataUrl: string, contextHint: string, provider: ProviderConfig) {
  return apiRequest<ImageAnalyzeResponse>("/api/analyze/image", {
    method: "POST",
    body: JSON.stringify({ image_data_url: imageDataUrl, context_hint: contextHint, provider }),
  });
}

export function sendFollowUp(params: {
  mode: ModeTab;
  question: string;
  contextSummary: string;
  history: ChatMessage[];
  imageDataUrl?: string | null;
  provider: ProviderConfig;
}) {
  return apiRequest<{ answer: string }>("/api/tutor/followup", {
    method: "POST",
    body: JSON.stringify({
      mode: params.mode,
      question: params.question,
      context_summary: params.contextSummary,
      history: params.history,
      image_data_url: params.imageDataUrl || null,
      provider: params.provider,
    }),
  });
}
