import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Code2,
  Download,
  FolderGit2,
  Image as ImageIcon,
  Loader2,
  Play,
  Settings,
  Terminal,
  Upload,
} from "lucide-react";
import {
  analyzeCli,
  analyzeCode,
  analyzeImage,
  cleanupRepoSession,
  explainRepoFile,
  fetchHealthDefaults,
  loadProviderConfig,
  saveProviderConfig,
  scanRepo,
  sendFollowUp,
} from "./lib/api";
import { buildLessonMarkdown } from "./lib/markdownExport";
import type {
  ChatMessage,
  CliAnalyzeResponse,
  CodeAnalyzeResponse,
  ImageAnalyzeResponse,
  ModeTab,
  ProviderConfig,
  RepoFileExplainResponse,
  RepoScanResponse,
} from "./types";
import { CliDissectorView } from "./components/CliDissectorView";
import { CodeExplainerView } from "./components/CodeExplainerView";
import { FollowUpChat } from "./components/FollowUpChat";
import { ImageCalloutView } from "./components/ImageCalloutView";
import { FileTreeBrowser, RepoXrayView } from "./components/RepoXrayView";
import { SettingsModal } from "./components/SettingsModal";

const CLI_EXAMPLES = [
  {
    label: "Docker + Logs",
    cmd: "docker run -d --rm -p 8080:80 --name web nginx:alpine && docker logs -f web 2>&1 | grep -i error",
  },
  {
    label: "Nmap Scan",
    cmd: "nmap -sV -sC -O -T4 -p 22,80,443,8000-8100 --open 192.168.1.0/24 -oA scan_results",
  },
  {
    label: "FFmpeg Transcode",
    cmd: "ffmpeg -ss 00:01:15 -i input.mov -t 30 -vf \"scale=1280:-2\" -c:v libx264 -crf 23 -c:a aac output.mp4",
  },
  {
    label: "Find + Xargs Delete",
    cmd: "find /var/log -type f -name \"*.log\" -mtime +30 -print0 | xargs -0 rm -f",
  },
];

const CODE_EXAMPLES = [
  {
    label: "Python Retry Decorator",
    lang: "Python",
    code: `import time
from functools import wraps

def retry(max_attempts=3, backoff=0.5):
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            for attempt in range(1, max_attempts + 1):
                try:
                    return fn(*args, **kwargs)
                except Exception as exc:
                    if attempt == max_attempts:
                        raise
                    time.sleep(backoff * (2 ** (attempt - 1)))
        return wrapper
    return decorator`,
  },
  {
    label: "TypeScript Debounce",
    lang: "TypeScript",
    code: `export function debounce<T extends (...args: any[]) => void>(
  fn: T,
  waitMs: number
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), waitMs);
  };
}`,
  },
];

const TABS: {
  id: ModeTab;
  num: string;
  label: string;
  short: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: "cli", num: "01", label: "CLI Dissector", short: "CLI", icon: Terminal },
  { id: "code", num: "02", label: "Code Explainer", short: "Code", icon: Code2 },
  { id: "repo", num: "03", label: "Repo X-Ray", short: "Repo", icon: FolderGit2 },
  { id: "image", num: "04", label: "Screenshot Callouts", short: "Image", icon: ImageIcon },
];

function BrandMark() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="shrink-0"
      aria-hidden="true"
    >
      <rect x="2.5" y="2.5" width="19" height="19" rx="4" stroke="#333c4d" strokeWidth="1.5" fill="#101318" />
      <circle cx="12" cy="12" r="4.5" stroke="#f59e0b" strokeWidth="1.6" />
      <path d="M12 5V7.5M12 16.5V19M5 12H7.5M16.5 12H19" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState<ModeTab>("cli");
  const [provider, setProvider] = useState<ProviderConfig>(() => loadProviderConfig());
  const [hasEnvOpenRouterKey, setHasEnvOpenRouterKey] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // CLI state
  const [cliInput, setCliInput] = useState(CLI_EXAMPLES[0].cmd);
  const [cliResult, setCliResult] = useState<CliAnalyzeResponse | null>(null);

  // Code state
  const [codeInput, setCodeInput] = useState(CODE_EXAMPLES[0].code);
  const [codeLangHint, setCodeLangHint] = useState("");
  const [codeResult, setCodeResult] = useState<CodeAnalyzeResponse | null>(null);

  // Repo state
  const [repoSourceType, setRepoSourceType] = useState<"github" | "local">("github");
  const [repoLocation, setRepoLocation] = useState("https://github.com/tiangolo/fastapi");
  const [repoResult, setRepoResult] = useState<RepoScanResponse | null>(null);
  const [repoFileResult, setRepoFileResult] = useState<RepoFileExplainResponse | null>(null);
  const [loadingFilePath, setLoadingFilePath] = useState<string | null>(null);

  // Image state
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [imageHint, setImageHint] = useState("");
  const [imageResult, setImageResult] = useState<ImageAnalyzeResponse | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Shared loading / error / chat state per tab
  const [loadingTab, setLoadingTab] = useState<ModeTab | null>(null);
  const [errorByTab, setErrorByTab] = useState<Partial<Record<ModeTab, string>>>({});
  const [chats, setChats] = useState<Record<ModeTab, ChatMessage[]>>({
    cli: [],
    code: [],
    repo: [],
    image: [],
  });
  const [chatLoading, setChatLoading] = useState(false);

  useEffect(() => {
    fetchHealthDefaults()
      .then((res) => {
        setHasEnvOpenRouterKey(res.defaults.has_openrouter_env_key);
        const hasSaved = Boolean(localStorage.getItem("codelens_tutor_provider_settings_v1"));
        if (!hasSaved) {
          const merged: ProviderConfig = {
            mode: res.defaults.mode || "local",
            local_base_url: res.defaults.local_base_url,
            local_api_key: res.defaults.local_api_key,
            local_text_model: res.defaults.local_text_model,
            local_vision_model: res.defaults.local_vision_model,
            openrouter_api_key: "",
            openrouter_text_model: res.defaults.openrouter_text_model,
            openrouter_vision_model: res.defaults.openrouter_vision_model,
            max_tokens: res.defaults.max_tokens || 32768,
            disable_thinking: false,
          };
          setProvider(merged);
        }
      })
      .catch(() => {});
  }, []);

  // Alt+1..4 tab switcher shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        if (e.key === "1") { e.preventDefault(); setActiveTab("cli"); }
        if (e.key === "2") { e.preventDefault(); setActiveTab("code"); }
        if (e.key === "3") { e.preventDefault(); setActiveTab("repo"); }
        if (e.key === "4") { e.preventDefault(); setActiveTab("image"); }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const readImageFile = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) {
      setErrorByTab((e) => ({ ...e, image: "Unsupported file type. Drop or paste PNG, JPG, or WEBP." }));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setImageDataUrl(reader.result);
        setImageResult(null);
        setErrorByTab((e) => ({ ...e, image: undefined }));
      }
    };
    reader.readAsDataURL(file);
  }, []);

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            setActiveTab("image");
            readImageFile(file);
            break;
          }
        }
      }
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [readImageFile]);

  const handleSaveSettings = (next: ProviderConfig) => {
    setProvider(next);
    saveProviderConfig(next);
  };

  // --- Mode Handlers ---

  const handleAnalyzeCli = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!cliInput.trim()) return;
    setLoadingTab("cli");
    setErrorByTab((prev) => ({ ...prev, cli: undefined }));
    try {
      const res = await analyzeCli(cliInput, provider);
      setCliResult(res);
      setChats((c) => ({ ...c, cli: [] }));
    } catch (err) {
      setErrorByTab((prev) => ({
        ...prev,
        cli: err instanceof Error ? err.message : "Failed to analyze command.",
      }));
    } finally {
      setLoadingTab(null);
    }
  };

  const handleAnalyzeCode = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!codeInput.trim()) return;
    setLoadingTab("code");
    setErrorByTab((prev) => ({ ...prev, code: undefined }));
    try {
      const res = await analyzeCode(codeInput, codeLangHint, provider);
      setCodeResult(res);
      setChats((c) => ({ ...c, code: [] }));
    } catch (err) {
      setErrorByTab((prev) => ({
        ...prev,
        code: err instanceof Error ? err.message : "Failed to explain code.",
      }));
    } finally {
      setLoadingTab(null);
    }
  };

  const handleScanRepo = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!repoLocation.trim()) return;
    setLoadingTab("repo");
    setErrorByTab((prev) => ({ ...prev, repo: undefined }));
    if (repoResult?.session_id) {
      cleanupRepoSession(repoResult.session_id).catch(() => {});
    }
    try {
      const res = await scanRepo(repoSourceType, repoLocation, provider);
      setRepoResult(res);
      setRepoFileResult(null);
      setChats((c) => ({ ...c, repo: [] }));
    } catch (err) {
      setErrorByTab((prev) => ({
        ...prev,
        repo: err instanceof Error ? err.message : "Failed to scan repository.",
      }));
    } finally {
      setLoadingTab(null);
    }
  };

  const handleSelectRepoFile = async (filePath: string) => {
    if (!repoResult) return;
    setLoadingFilePath(filePath);
    setErrorByTab((prev) => ({ ...prev, repo: undefined }));
    try {
      const res = await explainRepoFile(repoResult.session_id, filePath, provider);
      setRepoFileResult(res);
    } catch (err) {
      setErrorByTab((prev) => ({
        ...prev,
        repo: err instanceof Error ? err.message : `Failed to explain ${filePath}.`,
      }));
    } finally {
      setLoadingFilePath(null);
    }
  };

  const handleAnalyzeImage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!imageDataUrl) return;
    setLoadingTab("image");
    setErrorByTab((prev) => ({ ...prev, image: undefined }));
    try {
      const res = await analyzeImage(imageDataUrl, imageHint, provider);
      setImageResult(res);
      setChats((c) => ({ ...c, image: [] }));
    } catch (err) {
      setErrorByTab((prev) => ({
        ...prev,
        image: err instanceof Error ? err.message : "Failed to analyze screenshot.",
      }));
    } finally {
      setLoadingTab(null);
    }
  };

  const activeContextSummary = useMemo(() => {
    if (activeTab === "cli" && cliResult) {
      return JSON.stringify({
        command: cliInput,
        summary: cliResult.summary,
        tokens: cliResult.tokens,
        warnings: cliResult.warnings,
      });
    }
    if (activeTab === "code" && codeResult) {
      return JSON.stringify({
        language: codeResult.detected_language,
        code: codeInput,
        summary: codeResult.summary,
        blocks: codeResult.blocks,
      });
    }
    if (activeTab === "repo" && repoResult) {
      if (repoFileResult) {
        return JSON.stringify({
          repo: repoResult.repo_name,
          repo_summary: repoResult.summary,
          selected_file: repoFileResult.file_path,
          file_summary: repoFileResult.summary,
          role_in_project: repoFileResult.role_in_project,
          content: repoFileResult.content.slice(0, 6000),
        });
      }
      return JSON.stringify({
        repo: repoResult.repo_name,
        summary: repoResult.summary,
        tech_stack: repoResult.tech_stack,
        entry_points: repoResult.entry_points,
        key_components: repoResult.key_components,
      });
    }
    if (activeTab === "image" && imageResult) {
      return JSON.stringify({
        scene_type: imageResult.scene_type,
        summary: imageResult.summary,
        callouts: imageResult.callouts,
        overall_takeaway: imageResult.overall_takeaway,
      });
    }
    return "";
  }, [activeTab, cliInput, cliResult, codeInput, codeResult, repoResult, repoFileResult, imageResult]);

  const handleAskFollowUp = async (question: string) => {
    if (!activeContextSummary) return;
    const currentHistory = chats[activeTab];
    const nextHistory: ChatMessage[] = [...currentHistory, { role: "user", content: question }];
    setChats((prev) => ({ ...prev, [activeTab]: nextHistory }));
    setChatLoading(true);
    try {
      const res = await sendFollowUp({
        mode: activeTab,
        question,
        contextSummary: activeContextSummary,
        history: currentHistory,
        imageDataUrl: activeTab === "image" ? imageDataUrl : null,
        provider,
      });
      setChats((prev) => ({
        ...prev,
        [activeTab]: [...nextHistory, { role: "assistant", content: res.answer }],
      }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Follow-up request failed.";
      setChats((prev) => ({
        ...prev,
        [activeTab]: [
          ...nextHistory,
          { role: "assistant", content: `**Error:** ${msg}` },
        ],
      }));
    } finally {
      setChatLoading(false);
    }
  };

  const exportLesson = buildLessonMarkdown({
    mode: activeTab,
    cliInput,
    cliResult,
    codeInput,
    codeResult,
    repoResult,
    repoFileResult,
    imageResult,
    chatHistory: chats[activeTab],
  });

  const handleDownloadMarkdown = () => {
    if (!exportLesson) return;
    const blob = new Blob([exportLesson.markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = exportLesson.filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const activeModelLabel =
    provider.mode === "openrouter"
      ? activeTab === "image"
        ? provider.openrouter_vision_model
        : provider.openrouter_text_model
      : activeTab === "image"
      ? provider.local_vision_model
      : provider.local_text_model;

  const activeTabMeta = TABS.find((t) => t.id === activeTab)!;
  const activeError = errorByTab[activeTab];
  const isAnalyzing = loadingTab === activeTab;
  const codeLineCount = codeInput ? codeInput.split("\n").length : 0;

  return (
    <div className="h-screen flex flex-col bg-[#090a0c] text-[#eceff4] overflow-hidden">
      {/* Compact Top Workbench Bar */}
      <header className="h-12 shrink-0 border-b border-[#1f242d] bg-[#0d0f12] px-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <BrandMark />
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-semibold tracking-tight text-zinc-100">
              CodeLens
            </span>
            <span className="px-1.5 py-0.5 rounded border border-[#232934] bg-[#090a0c] font-mono text-[10px] text-zinc-500">
              v1.0
            </span>
            <span className="text-zinc-700 hidden sm:inline">/</span>
            <span className="text-xs font-mono text-zinc-400 hidden sm:inline truncate">
              {activeTabMeta.label}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="hidden md:inline-flex items-center gap-2 px-2.5 py-1 rounded border border-[#1f242d] bg-[#090a0c] hover:border-[#333c4d] text-xs transition"
            title="Configure AI provider"
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                provider.mode === "openrouter" ? "bg-sky-400" : "bg-emerald-400"
              }`}
            />
            <span className="text-zinc-300 font-medium">
              {provider.mode === "openrouter" ? "OpenRouter" : "Local"}
            </span>
            <span className="text-zinc-700">·</span>
            <span className="font-mono text-[11px] text-zinc-400 max-w-[190px] truncate">
              {activeModelLabel}
            </span>
          </button>

          <button
            type="button"
            onClick={handleDownloadMarkdown}
            disabled={!exportLesson}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-[#262d3b] bg-[#12151b] hover:bg-[#181c24] text-xs font-medium text-zinc-200 transition disabled:opacity-35 disabled:cursor-not-allowed"
            title="Export current breakdown as Markdown"
          >
            <Download className="w-3.5 h-3.5 text-zinc-400" />
            <span className="hidden sm:inline font-mono text-[11px]">Export .md</span>
          </button>

          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-[#262d3b] bg-[#12151b] hover:bg-[#181c24] text-xs font-medium text-zinc-200 transition"
          >
            <Settings className="w-3.5 h-3.5 text-zinc-400" />
            <span>Settings</span>
          </button>
        </div>
      </header>

      {/* Main Split Workbench */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
        {/* Left Flush Inspector Panel */}
        <aside className="w-full lg:w-[390px] xl:w-[420px] shrink-0 border-b lg:border-b-0 lg:border-r border-[#1f242d] bg-[#0d0f12] flex flex-col max-h-[48vh] lg:max-h-none overflow-hidden">
          {/* 01-04 Mode Bar */}
          <div className="grid grid-cols-4 border-b border-[#1f242d] bg-[#0a0b0e] shrink-0">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center justify-center gap-1.5 py-2.5 px-2 text-xs font-medium border-b-2 transition ${
                    active
                      ? "border-amber-400 bg-[#12151b] text-zinc-100"
                      : "border-transparent text-zinc-500 hover:text-zinc-300 hover:bg-[#101318]"
                  }`}
                >
                  <span className="font-mono text-[10px] text-zinc-600 hidden xl:inline">
                    {tab.num}
                  </span>
                  <Icon className={`w-3.5 h-3.5 shrink-0 ${active ? "text-amber-400" : ""}`} />
                  <span className="truncate">{tab.short}</span>
                </button>
              );
            })}
          </div>

          {/* Active Input Form */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {activeTab === "cli" && (
              <form onSubmit={handleAnalyzeCli} className="space-y-3.5">
                <div className="rounded-md border border-[#1f242d] bg-[#090a0c] overflow-hidden focus-within:border-[#333c4d] transition">
                  <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#1f242d] bg-[#101318] text-[11px] font-mono">
                    <span className="text-zinc-400">$ shell-input</span>
                    <div className="flex items-center gap-2">
                      <span className="text-zinc-600 tabular-nums">{cliInput.length} chars</span>
                      {cliInput && (
                        <button
                          type="button"
                          onClick={() => setCliInput("")}
                          className="text-zinc-500 hover:text-zinc-200 transition"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>
                  <textarea
                    rows={5}
                    value={cliInput}
                    onChange={(e) => setCliInput(e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                        e.preventDefault();
                        handleAnalyzeCli();
                      }
                    }}
                    placeholder="Paste any bash, docker, nmap, ffmpeg, git, or curl command..."
                    className="w-full bg-transparent p-3 text-xs font-mono text-emerald-300 placeholder:text-zinc-600 focus:outline-none leading-relaxed resize-y"
                  />
                  <div className="px-3 py-1 border-t border-[#171b22] bg-[#0b0d10] flex items-center justify-between text-[10px] font-mono text-zinc-600">
                    <span>bash / zsh / sh</span>
                    <span>Ctrl+Enter to run</span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-500">
                    Presets
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {CLI_EXAMPLES.map((ex) => (
                      <button
                        key={ex.label}
                        type="button"
                        onClick={() => setCliInput(ex.cmd)}
                        className="px-2 py-1 rounded border border-[#1f242d] bg-[#12151b] hover:border-[#333c4d] text-[11px] font-mono text-zinc-300 transition"
                      >
                        {ex.label}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isAnalyzing || !cliInput.trim()}
                  className="w-full inline-flex items-center justify-center gap-2 py-2 px-4 rounded-md bg-[#eceff4] hover:bg-white text-xs font-semibold text-[#090a0c] transition disabled:opacity-40"
                >
                  {isAnalyzing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                  <span>{isAnalyzing ? "Dissecting Command..." : "Dissect CLI Command"}</span>
                </button>
              </form>
            )}

            {activeTab === "code" && (
              <form onSubmit={handleAnalyzeCode} className="space-y-3.5">
                <div className="rounded-md border border-[#1f242d] bg-[#090a0c] overflow-hidden focus-within:border-[#333c4d] transition">
                  <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b border-[#1f242d] bg-[#101318]">
                    <span className="text-[11px] font-mono text-zinc-400">snippet-buffer</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={codeLangHint}
                        onChange={(e) => setCodeLangHint(e.target.value)}
                        placeholder="auto-detect"
                        className="w-24 rounded border border-[#232934] bg-[#090a0c] px-1.5 py-0.5 text-[11px] font-mono text-zinc-200 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none"
                      />
                      {codeInput && (
                        <button
                          type="button"
                          onClick={() => setCodeInput("")}
                          className="text-[11px] font-mono text-zinc-500 hover:text-zinc-200 transition"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>
                  <textarea
                    rows={12}
                    value={codeInput}
                    onChange={(e) => setCodeInput(e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                        e.preventDefault();
                        handleAnalyzeCode();
                      }
                    }}
                    placeholder="Paste code in Python, JS/TS, Go, Rust, SQL, Bash..."
                    className="w-full bg-transparent p-3 text-xs font-mono text-zinc-100 placeholder:text-zinc-600 focus:outline-none leading-relaxed resize-y"
                  />
                  <div className="px-3 py-1 border-t border-[#171b22] bg-[#0b0d10] flex items-center justify-between text-[10px] font-mono text-zinc-600">
                    <span className="tabular-nums">{codeLineCount} lines</span>
                    <span>Ctrl+Enter to run</span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-500">
                    Samples
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {CODE_EXAMPLES.map((ex) => (
                      <button
                        key={ex.label}
                        type="button"
                        onClick={() => {
                          setCodeInput(ex.code);
                          setCodeLangHint(ex.lang);
                        }}
                        className="px-2 py-1 rounded border border-[#1f242d] bg-[#12151b] hover:border-[#333c4d] text-[11px] font-mono text-zinc-300 transition"
                      >
                        {ex.label}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isAnalyzing || !codeInput.trim()}
                  className="w-full inline-flex items-center justify-center gap-2 py-2 px-4 rounded-md bg-[#eceff4] hover:bg-white text-xs font-semibold text-[#090a0c] transition disabled:opacity-40"
                >
                  {isAnalyzing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                  <span>{isAnalyzing ? "Analyzing Control Flow..." : "Explain Code Snippet"}</span>
                </button>
              </form>
            )}

            {activeTab === "repo" && (
              <div className="space-y-4">
                <form onSubmit={handleScanRepo} className="space-y-3">
                  <div className="grid grid-cols-2 p-0.5 rounded border border-[#1f242d] bg-[#090a0c] gap-0.5">
                    <button
                      type="button"
                      onClick={() => setRepoSourceType("github")}
                      className={`py-1.5 rounded-sm text-xs font-medium transition ${
                        repoSourceType === "github"
                          ? "bg-[#161b23] text-zinc-100"
                          : "text-zinc-500 hover:text-zinc-300"
                      }`}
                    >
                      GitHub URL
                    </button>
                    <button
                      type="button"
                      onClick={() => setRepoSourceType("local")}
                      className={`py-1.5 rounded-sm text-xs font-medium transition ${
                        repoSourceType === "local"
                          ? "bg-[#161b23] text-zinc-100"
                          : "text-zinc-500 hover:text-zinc-300"
                      }`}
                    >
                      Local Directory
                    </button>
                  </div>

                  <div>
                    <label className="block text-[11px] font-mono uppercase tracking-wider text-zinc-400 mb-1.5">
                      {repoSourceType === "github" ? "Repository URL" : "Directory Path"}
                    </label>
                    <input
                      type="text"
                      value={repoLocation}
                      onChange={(e) => setRepoLocation(e.target.value)}
                      placeholder={
                        repoSourceType === "github"
                          ? "https://github.com/owner/repo"
                          : "C:\\projects\\my-app"
                      }
                      className="w-full rounded border border-[#1f242d] bg-[#090a0c] px-3 py-2 text-xs font-mono text-zinc-100 placeholder:text-zinc-600 focus:border-[#333c4d] focus:outline-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isAnalyzing || !repoLocation.trim()}
                    className="w-full inline-flex items-center justify-center gap-2 py-2 px-4 rounded-md bg-[#eceff4] hover:bg-white text-xs font-semibold text-[#090a0c] transition disabled:opacity-40"
                  >
                    {isAnalyzing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FolderGit2 className="w-3.5 h-3.5" />}
                    <span>{isAnalyzing ? "Scanning Repository..." : "Scan & Map Architecture"}</span>
                  </button>
                </form>

                {repoResult && (
                  <div className="space-y-2 pt-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono text-[11px] uppercase tracking-wider text-zinc-400">
                        Explorer ({repoResult.file_count})
                      </span>
                      {repoFileResult && (
                        <button
                          type="button"
                          onClick={() => setRepoFileResult(null)}
                          className="text-[11px] font-mono text-amber-400 hover:text-amber-300"
                        >
                          Architecture View
                        </button>
                      )}
                    </div>
                    <FileTreeBrowser
                      nodes={repoResult.tree}
                      selectedPath={repoFileResult?.file_path ?? null}
                      loadingPath={loadingFilePath}
                      onSelectFile={handleSelectRepoFile}
                    />
                  </div>
                )}
              </div>
            )}

            {activeTab === "image" && (
              <form onSubmit={handleAnalyzeImage} className="space-y-3.5">
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    const file = e.dataTransfer.files?.[0];
                    if (file) readImageFile(file);
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  className={`rounded-md border border-dashed p-4 text-center cursor-pointer transition ${
                    dragOver
                      ? "border-amber-400 bg-amber-400/[0.06]"
                      : "border-[#262d3b] bg-[#090a0c] hover:border-[#3b4454]"
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) readImageFile(file);
                    }}
                  />
                  {imageDataUrl ? (
                    <div className="space-y-2">
                      <img
                        src={imageDataUrl}
                        alt="Upload preview"
                        className="max-h-44 mx-auto rounded border border-[#1f242d] object-contain"
                      />
                      <p className="text-[11px] font-mono text-zinc-500">
                        Click, drop, or <kbd className="px-1 py-0.5 rounded bg-[#141820] border border-[#262d3b] text-zinc-300">Ctrl+V</kbd> to replace
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2 py-5">
                      <Upload className="w-6 h-6 text-zinc-400 mx-auto" />
                      <p className="text-xs font-medium text-zinc-200">
                        Drop image or click to select
                      </p>
                      <p className="text-[11px] font-mono text-zinc-500">
                        or press <kbd className="px-1 py-0.5 rounded bg-[#141820] border border-[#262d3b] text-zinc-300">Ctrl+V</kbd> to paste screenshot
                      </p>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-[11px] font-mono uppercase tracking-wider text-zinc-400 mb-1.5">
                    Focus Prompt <span className="text-zinc-600">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={imageHint}
                    onChange={(e) => setImageHint(e.target.value)}
                    placeholder="e.g. Diagnose the error line or explain controls"
                    className="w-full rounded border border-[#1f242d] bg-[#090a0c] px-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-[#333c4d] focus:outline-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isAnalyzing || !imageDataUrl}
                  className="w-full inline-flex items-center justify-center gap-2 py-2 px-4 rounded-md bg-[#eceff4] hover:bg-white text-xs font-semibold text-[#090a0c] transition disabled:opacity-40"
                >
                  {isAnalyzing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImageIcon className="w-3.5 h-3.5" />}
                  <span>{isAnalyzing ? "Detecting Callouts..." : "Annotate Screenshot"}</span>
                </button>
              </form>
            )}
          </div>
        </aside>

        {/* Right Visual Stage + Bottom Tutor Command Bar */}
        <main className="flex-1 flex flex-col min-w-0 min-h-0 bg-[#090a0c]">
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {activeError && (
              <div className="rounded-md border border-rose-500/40 bg-rose-500/[0.06] px-4 py-3 text-xs text-rose-200 flex items-start justify-between gap-3">
                <div>
                  <div className="font-mono text-[11px] uppercase tracking-wider text-rose-300 font-semibold">
                    Execution Error
                  </div>
                  <p className="mt-1 leading-relaxed text-zinc-200">{activeError}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSettingsOpen(true)}
                  className="shrink-0 px-2.5 py-1 rounded border border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20 text-rose-200 font-mono text-[11px]"
                >
                  Open Settings
                </button>
              </div>
            )}

            {isAnalyzing && (
              <div className="rounded-md border border-[#1f242d] bg-[#0d0f12] p-12 flex flex-col items-center justify-center text-center gap-3">
                <Loader2 className="w-6 h-6 text-amber-400 animate-spin" />
                <div className="text-xs font-mono uppercase tracking-wider text-zinc-200">
                  Building Visual Breakdown
                </div>
                <p className="text-xs font-mono text-zinc-500 max-w-md">
                  {activeModelLabel} · {provider.mode === "openrouter" ? "OpenRouter" : provider.local_base_url}
                </p>
              </div>
            )}

            {!isAnalyzing && activeTab === "cli" && (
              cliResult ? (
                <CliDissectorView command={cliInput} data={cliResult} />
              ) : (
                <WorkbenchReadyState
                  activeMode="cli"
                  onSelectMode={setActiveTab}
                  onQuickAction={() => handleAnalyzeCli()}
                  quickLabel="Run Loaded CLI Sample"
                />
              )
            )}

            {!isAnalyzing && activeTab === "code" && (
              codeResult ? (
                <CodeExplainerView code={codeInput} data={codeResult} />
              ) : (
                <WorkbenchReadyState
                  activeMode="code"
                  onSelectMode={setActiveTab}
                  onQuickAction={() => handleAnalyzeCode()}
                  quickLabel="Run Loaded Snippet Sample"
                />
              )
            )}

            {!isAnalyzing && activeTab === "repo" && (
              repoResult ? (
                <RepoXrayView
                  repo={repoResult}
                  selectedFile={repoFileResult}
                  loadingFilePath={loadingFilePath}
                  onSelectFile={handleSelectRepoFile}
                  onBackToOverview={() => setRepoFileResult(null)}
                />
              ) : (
                <WorkbenchReadyState
                  activeMode="repo"
                  onSelectMode={setActiveTab}
                  onQuickAction={() => handleScanRepo()}
                  quickLabel="Scan Sample GitHub Repo"
                />
              )
            )}

            {!isAnalyzing && activeTab === "image" && (
              imageResult && imageDataUrl ? (
                <ImageCalloutView imageDataUrl={imageDataUrl} data={imageResult} />
              ) : (
                <WorkbenchReadyState
                  activeMode="image"
                  onSelectMode={setActiveTab}
                  onQuickAction={imageDataUrl ? () => handleAnalyzeImage() : () => fileInputRef.current?.click()}
                  quickLabel={imageDataUrl ? "Analyze Pasted Image" : "Select Screenshot File"}
                />
              )
            )}
          </div>

          <FollowUpChat
            disabled={!activeContextSummary || isAnalyzing}
            loading={chatLoading}
            history={chats[activeTab]}
            onAsk={handleAskFollowUp}
          />
        </main>
      </div>

      <SettingsModal
        open={settingsOpen}
        config={provider}
        hasEnvOpenRouterKey={hasEnvOpenRouterKey}
        onClose={() => setSettingsOpen(false)}
        onSave={handleSaveSettings}
      />
    </div>
  );
}

const MODE_CARDS: {
  id: ModeTab;
  num: string;
  title: string;
  desc: string;
}[] = [
  {
    id: "cli",
    num: "01",
    title: "CLI Dissector",
    desc: "Decompose pipes, flags, redirects, and destructive hazards into an interactive pipeline.",
  },
  {
    id: "code",
    num: "02",
    title: "Code Explainer",
    desc: "Map control-flow graphs and inspect side-by-side mechanism & design rationale.",
  },
  {
    id: "repo",
    num: "03",
    title: "Repo X-Ray",
    desc: "Shallow-clone public GitHub repos or scan local folders into an explorable architecture.",
  },
  {
    id: "image",
    num: "04",
    title: "Screenshot Callouts",
    desc: "Pinpoint terminal errors, UI elements, or diagrams with normalized bounding boxes.",
  },
];

function WorkbenchReadyState({
  activeMode,
  onSelectMode,
  onQuickAction,
  quickLabel,
}: {
  activeMode: ModeTab;
  onSelectMode: (m: ModeTab) => void;
  onQuickAction: () => void;
  quickLabel: string;
}) {
  return (
    <div className="rounded-md border border-[#1f242d] bg-[#0d0f12] overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b border-[#1f242d] bg-[#101318]">
        <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400">
          WORKBENCH READY
        </span>
        <div className="flex items-center gap-3 text-[11px] font-mono text-zinc-500">
          <span>Alt+1..4 switch mode</span>
          <span>·</span>
          <span>Ctrl+Enter analyze</span>
          <span>·</span>
          <span>Ctrl+V paste image</span>
        </div>
      </div>

      <div className="p-5 space-y-5 bg-[#090a0c] bg-dot-grid">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-sm font-semibold text-zinc-100">
              Select a workspace tool or run the preloaded input
            </h2>
            <p className="text-xs text-zinc-400">
              Outputs include interactive Mermaid diagrams, structured explanations, and Markdown export.
            </p>
          </div>
          <button
            type="button"
            onClick={onQuickAction}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded bg-[#eceff4] hover:bg-white text-xs font-semibold text-[#090a0c] transition"
          >
            <span>{quickLabel}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {MODE_CARDS.map((card) => {
            const isCurrent = card.id === activeMode;
            return (
              <button
                key={card.id}
                type="button"
                onClick={() => onSelectMode(card.id)}
                className={`text-left rounded border p-3.5 transition ${
                  isCurrent
                    ? "border-amber-400/60 bg-[#12151b]"
                    : "border-[#1f242d] bg-[#0d0f12] hover:border-[#2d3544]"
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-zinc-100">{card.title}</span>
                  <span
                    className={`font-mono text-[10px] px-1.5 py-0.5 rounded border ${
                      isCurrent
                        ? "border-amber-400/40 bg-amber-400/10 text-amber-300"
                        : "border-[#1f242d] bg-[#090a0c] text-zinc-500"
                    }`}
                  >
                    {card.num}
                  </span>
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed">{card.desc}</p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
