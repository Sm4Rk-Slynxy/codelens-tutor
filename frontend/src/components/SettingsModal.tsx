import React, { useState } from "react";
import {
  Activity,
  CheckCircle2,
  Eye,
  EyeOff,
  Globe,
  Loader2,
  Server,
  SlidersHorizontal,
  X,
  XCircle,
} from "lucide-react";
import { DEFAULT_PROVIDER_CONFIG, testConnection } from "../lib/api";
import type { ProviderConfig, TestConnectionResponse } from "../types";

interface SettingsModalProps {
  open: boolean;
  config: ProviderConfig;
  hasEnvOpenRouterKey: boolean;
  onClose: () => void;
  onSave: (next: ProviderConfig) => void;
}

const LOCAL_URL_PRESETS = [
  { label: "Ollama", url: "http://localhost:11434/v1" },
  { label: "vLLM / SGLang", url: "http://localhost:8000/v1" },
  { label: "LM Studio", url: "http://localhost:1234/v1" },
];

const OPENROUTER_TEXT_PRESETS = [
  "qwen/qwen-2.5-coder-32b-instruct",
  "anthropic/claude-3.5-sonnet",
  "google/gemini-2.5-flash",
  "deepseek/deepseek-chat",
];

const OPENROUTER_VISION_PRESETS = [
  "qwen/qwen2.5-vl-72b-instruct",
  "anthropic/claude-3.5-sonnet",
  "google/gemini-2.5-flash",
  "openai/gpt-4o-mini",
];

const TOKEN_PRESETS = [
  { label: "8K", value: 8192 },
  { label: "16K", value: 16384 },
  { label: "32K", value: 32768 },
  { label: "64K", value: 65536 },
  { label: "128K", value: 131072 },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  open,
  config,
  hasEnvOpenRouterKey,
  onClose,
  onSave,
}) => {
  const [draft, setDraft] = useState<ProviderConfig>(config);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestConnectionResponse | null>(null);
  const [showKey, setShowKey] = useState(false);

  React.useEffect(() => {
    if (open) {
      setDraft(config);
      setTestResult(null);
    }
  }, [open, config]);

  if (!open) return null;

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await testConnection(draft);
      setTestResult(res);
    } catch (err) {
      setTestResult({
        ok: false,
        endpoint: draft.mode === "openrouter" ? "https://openrouter.ai/api/v1/models" : draft.local_base_url,
        models: [],
        message: err instanceof Error ? err.message : "Connection test failed.",
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(draft);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-[2px] p-4">
      <div className="w-full max-w-2xl rounded-lg border border-[#262d3b] bg-[#0d0f12] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#1f242d] bg-[#101318]">
          <div className="flex items-center gap-2.5">
            <SlidersHorizontal className="w-4 h-4 text-zinc-400" />
            <div>
              <h2 className="text-sm font-semibold text-zinc-100">Model &amp; Endpoint Configuration</h2>
              <p className="text-[11px] text-zinc-500">
                Persisted in <code className="text-zinc-300 font-mono">localStorage</code> per browser, overriding{" "}
                <code className="text-zinc-300 font-mono">.env</code> fallbacks.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-zinc-400 hover:text-zinc-100 hover:bg-[#1a1f28] transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-5 overflow-y-auto space-y-5">
          {/* Segmented Provider Switcher */}
          <div className="grid grid-cols-2 p-1 rounded-md border border-[#1f242d] bg-[#090a0c] gap-1">
            <button
              type="button"
              onClick={() => {
                setDraft((d) => ({ ...d, mode: "local" }));
                setTestResult(null);
              }}
              className={`flex items-center gap-2.5 px-3 py-2 rounded text-left transition ${
                draft.mode === "local"
                  ? "bg-[#161b23] text-zinc-100 border border-[#28303e]"
                  : "text-zinc-500 hover:text-zinc-300 border border-transparent"
              }`}
            >
              <Server className={`w-4 h-4 ${draft.mode === "local" ? "text-emerald-400" : "text-zinc-500"}`} />
              <div>
                <div className="text-xs font-semibold">Local Network AI</div>
                <div className="text-[11px] text-zinc-500">vLLM · Ollama · LM Studio</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                setDraft((d) => ({ ...d, mode: "openrouter" }));
                setTestResult(null);
              }}
              className={`flex items-center gap-2.5 px-3 py-2 rounded text-left transition ${
                draft.mode === "openrouter"
                  ? "bg-[#161b23] text-zinc-100 border border-[#28303e]"
                  : "text-zinc-500 hover:text-zinc-300 border border-transparent"
              }`}
            >
              <Globe className={`w-4 h-4 ${draft.mode === "openrouter" ? "text-sky-400" : "text-zinc-500"}`} />
              <div>
                <div className="text-xs font-semibold">OpenRouter API</div>
                <div className="text-[11px] text-zinc-500">Hosted frontier &amp; open weights</div>
              </div>
            </button>
          </div>

          {draft.mode === "local" ? (
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-zinc-300">OpenAI-Compatible Base URL</label>
                  <div className="flex items-center gap-1">
                    {LOCAL_URL_PRESETS.map((preset) => (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => setDraft((d) => ({ ...d, local_base_url: preset.url }))}
                        className="px-2 py-0.5 rounded border border-[#1f242d] bg-[#12151b] hover:border-[#333c4d] text-[10px] font-mono text-zinc-300 transition"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
                <input
                  type="text"
                  value={draft.local_base_url}
                  onChange={(e) => setDraft((d) => ({ ...d, local_base_url: e.target.value }))}
                  placeholder="http://localhost:11434/v1"
                  className="w-full rounded border border-[#262d3b] bg-[#090a0c] px-3 py-2 text-xs text-zinc-100 font-mono focus:border-zinc-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                  API Key <span className="text-zinc-500">(optional, default: EMPTY)</span>
                </label>
                <input
                  type="text"
                  value={draft.local_api_key}
                  onChange={(e) => setDraft((d) => ({ ...d, local_api_key: e.target.value }))}
                  placeholder="EMPTY"
                  className="w-full rounded border border-[#262d3b] bg-[#090a0c] px-3 py-2 text-xs text-zinc-100 font-mono focus:border-zinc-500 focus:outline-none"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-0.5">
                <button
                  type="button"
                  onClick={handleTest}
                  disabled={testing}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded border border-[#2a3140] bg-[#141820] hover:bg-[#1a1f29] text-xs font-medium text-zinc-200 transition disabled:opacity-50"
                >
                  {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Activity className="w-3.5 h-3.5 text-emerald-400" />}
                  <span>Test Endpoint &amp; List Models</span>
                </button>
                {testResult && (
                  <span
                    className={`inline-flex items-center gap-1.5 text-xs font-mono ${
                      testResult.ok ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {testResult.ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                    <span>
                      {testResult.message}
                      {testResult.latency_ms != null ? ` · ${testResult.latency_ms}ms` : ""}
                    </span>
                  </span>
                )}
              </div>

              {testResult?.ok && testResult.models.length > 0 && (
                <div className="rounded border border-emerald-500/25 bg-emerald-500/[0.04] p-3 space-y-2">
                  <div className="text-[11px] font-mono text-emerald-300">
                    Discovered {testResult.models.length} model(s) from /models
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] text-zinc-400 mb-1">Text / Code Model</label>
                      <select
                        value={testResult.models.includes(draft.local_text_model) ? draft.local_text_model : ""}
                        onChange={(e) => {
                          if (e.target.value) setDraft((d) => ({ ...d, local_text_model: e.target.value }));
                        }}
                        className="w-full rounded border border-[#262d3b] bg-[#090a0c] px-2.5 py-1.5 text-xs font-mono text-zinc-100 focus:border-zinc-500 focus:outline-none"
                      >
                        <option value="">-- Select model --</option>
                        {testResult.models.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] text-zinc-400 mb-1">Vision Model</label>
                      <select
                        value={testResult.models.includes(draft.local_vision_model) ? draft.local_vision_model : ""}
                        onChange={(e) => {
                          if (e.target.value) setDraft((d) => ({ ...d, local_vision_model: e.target.value }));
                        }}
                        className="w-full rounded border border-[#262d3b] bg-[#090a0c] px-2.5 py-1.5 text-xs font-mono text-zinc-100 focus:border-zinc-500 focus:outline-none"
                      >
                        <option value="">-- Select model --</option>
                        {testResult.models.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5">Text / Code Model ID</label>
                  <input
                    type="text"
                    value={draft.local_text_model}
                    onChange={(e) => setDraft((d) => ({ ...d, local_text_model: e.target.value }))}
                    placeholder="qwen2.5-coder:32b"
                    className="w-full rounded border border-[#262d3b] bg-[#090a0c] px-3 py-2 text-xs text-zinc-100 font-mono focus:border-zinc-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5">Vision Model ID</label>
                  <input
                    type="text"
                    value={draft.local_vision_model}
                    onChange={(e) => setDraft((d) => ({ ...d, local_vision_model: e.target.value }))}
                    placeholder="qwen2.5vl:32b"
                    className="w-full rounded border border-[#262d3b] bg-[#090a0c] px-3 py-2 text-xs text-zinc-100 font-mono focus:border-zinc-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-zinc-300">OpenRouter API Key</label>
                  {hasEnvOpenRouterKey && !draft.openrouter_api_key && (
                    <span className="text-[11px] font-mono text-emerald-400">Using backend .env fallback</span>
                  )}
                </div>
                <div className="relative">
                  <input
                    type={showKey ? "text" : "password"}
                    value={draft.openrouter_api_key}
                    onChange={(e) => setDraft((d) => ({ ...d, openrouter_api_key: e.target.value }))}
                    placeholder="sk-or-v1-..."
                    className="w-full rounded border border-[#262d3b] bg-[#090a0c] pl-3 pr-9 py-2 text-xs text-zinc-100 font-mono focus:border-zinc-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey((v) => !v)}
                    className="absolute right-2.5 top-2 text-zinc-500 hover:text-zinc-200"
                  >
                    {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5">Text / Code Model</label>
                  <input
                    type="text"
                    value={draft.openrouter_text_model}
                    onChange={(e) => setDraft((d) => ({ ...d, openrouter_text_model: e.target.value }))}
                    className="w-full rounded border border-[#262d3b] bg-[#090a0c] px-3 py-2 text-xs text-zinc-100 font-mono focus:border-zinc-500 focus:outline-none"
                  />
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {OPENROUTER_TEXT_PRESETS.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setDraft((d) => ({ ...d, openrouter_text_model: m }))}
                        className="px-2 py-0.5 rounded border border-[#1f242d] bg-[#12151b] hover:border-[#333c4d] text-[10px] font-mono text-zinc-300 transition"
                      >
                        {m.split("/")[1]}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5">Vision Model</label>
                  <input
                    type="text"
                    value={draft.openrouter_vision_model}
                    onChange={(e) => setDraft((d) => ({ ...d, openrouter_vision_model: e.target.value }))}
                    className="w-full rounded border border-[#262d3b] bg-[#090a0c] px-3 py-2 text-xs text-zinc-100 font-mono focus:border-zinc-500 focus:outline-none"
                  />
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {OPENROUTER_VISION_PRESETS.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setDraft((d) => ({ ...d, openrouter_vision_model: m }))}
                        className="px-2 py-0.5 rounded border border-[#1f242d] bg-[#12151b] hover:border-[#333c4d] text-[10px] font-mono text-zinc-300 transition"
                      >
                        {m.split("/")[1]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 pt-0.5">
                <button
                  type="button"
                  onClick={handleTest}
                  disabled={testing}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded border border-[#2a3140] bg-[#141820] hover:bg-[#1a1f29] text-xs font-medium text-zinc-200 transition disabled:opacity-50"
                >
                  {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Activity className="w-3.5 h-3.5 text-sky-400" />}
                  <span>Verify OpenRouter Key</span>
                </button>
                {testResult && (
                  <span
                    className={`inline-flex items-center gap-1.5 text-xs font-mono ${
                      testResult.ok ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {testResult.ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                    <span>{testResult.message}</span>
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Generation Budget & Thinking Controls */}
          <div className="rounded border border-[#1f242d] bg-[#090a0c] p-3.5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs font-medium text-zinc-300">
                Max Output Tokens <span className="text-zinc-500 font-mono">(max_tokens)</span>
              </label>
              <div className="flex items-center gap-1">
                {TOKEN_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => setDraft((d) => ({ ...d, max_tokens: preset.value }))}
                    className={`px-2 py-0.5 rounded border text-[10px] font-mono tabular-nums transition ${
                      draft.max_tokens === preset.value
                        ? "border-amber-400/60 bg-amber-400/10 text-amber-300"
                        : "border-[#1f242d] bg-[#12151b] hover:border-[#333c4d] text-zinc-300"
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
            <input
              type="number"
              min={1024}
              max={131072}
              step={1024}
              value={draft.max_tokens ?? 32768}
              onChange={(e) => {
                const parsed = parseInt(e.target.value, 10);
                setDraft((d) => ({
                  ...d,
                  max_tokens: Number.isFinite(parsed) ? parsed : 32768,
                }));
              }}
              className="w-full rounded border border-[#262d3b] bg-[#0d0f12] px-3 py-1.5 text-xs font-mono tabular-nums text-zinc-100 focus:border-zinc-500 focus:outline-none"
            />

            <label className="flex items-start gap-2.5 pt-1 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={Boolean(draft.disable_thinking)}
                onChange={(e) => setDraft((d) => ({ ...d, disable_thinking: e.target.checked }))}
                className="mt-0.5 rounded border-[#262d3b] bg-[#0d0f12] text-amber-400 focus:ring-0"
              />
              <div className="text-xs">
                <div className="font-medium text-zinc-200">
                  Fast Mode <span className="font-mono text-[11px] text-zinc-500">(Disable Thinking / /no_think)</span>
                </div>
                <p className="text-[11px] text-zinc-500 mt-0.5">
                  Skips chain-of-thought reasoning on Qwen3/Qwen3.8 models for instant structured JSON output. Leave off to use full reasoning within your token budget.
                </p>
              </div>
            </label>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-[#1f242d]">
            <button
              type="button"
              onClick={() => setDraft({ ...DEFAULT_PROVIDER_CONFIG })}
              className="text-xs text-zinc-500 hover:text-zinc-300 transition"
            >
              Reset Defaults
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-1.5 rounded border border-[#262d3b] text-xs font-medium text-zinc-300 hover:bg-[#141820] transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded bg-[#eceff4] hover:bg-white text-xs font-semibold text-[#090a0c] transition"
              >
                Save Configuration
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
