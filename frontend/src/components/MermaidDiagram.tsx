import React, { useEffect, useId, useState } from "react";
import mermaid from "mermaid";
import { AlertTriangle, Check, Code, Copy, Eye, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";

mermaid.initialize({
  startOnLoad: false,
  theme: "dark",
  securityLevel: "strict",
  fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
  flowchart: {
    curve: "basis",
    padding: 16,
    htmlLabels: false,
  },
  themeVariables: {
    darkMode: true,
    background: "#090a0c",
    primaryColor: "#141820",
    primaryTextColor: "#eceff4",
    primaryBorderColor: "#333c4d",
    lineColor: "#64748b",
    secondaryColor: "#10131a",
    tertiaryColor: "#161b24",
    clusterBkg: "#0d0f12",
    clusterBorder: "#262d3b",
  },
});

function basicSanitizeMermaid(raw: string): string {
  return (raw || "")
    .trim()
    .replace(/^```(?:mermaid)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\r\n/g, "\n")
    .replace(/^\s*click\s+[^\n]*$/gim, "")
    .replace(/<\s*\/?\s*script[^>]*>/gi, "")
    .trim();
}

function sanitizeSvg(svg: string): string {
  if (!svg) return "";
  return svg
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, "")
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript\s*:/gi, "blocked:");
}

/**
 * Deeper heuristic pass if an LLM emitted unquoted labels with special chars
 * like `N1[run (detached)]` -> `N1["run (detached)"]`.
 */
function repairMermaidLabels(code: string): string {
  const lines = code.split("\n");
  return lines
    .map((line) => {
      let fixed = line.replace(
        /(\b[A-Za-z0-9_]+)\[([^"\[\]\n]+)\]/g,
        (_m, id, label) => {
          const clean = String(label).replace(/"/g, "'").trim();
          return `${id}["${clean}"]`;
        }
      );
      fixed = fixed.replace(
        /(\b[A-Za-z0-9_]+)\{\{([^"{}\n]+)\}\}/g,
        (_m, id, label) => {
          const clean = String(label).replace(/"/g, "'").trim();
          return `${id}{{"${clean}"}}`;
        }
      );
      return fixed;
    })
    .join("\n");
}

interface MermaidDiagramProps {
  code: string;
  title?: string;
}

export const MermaidDiagram: React.FC<MermaidDiagramProps> = ({ code, title }) => {
  const uid = useId().replace(/[:]/g, "_");
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [showSource, setShowSource] = useState(false);
  const [copied, setCopied] = useState(false);
  const [zoom, setZoom] = useState(1);

  const sanitized = basicSanitizeMermaid(code);

  useEffect(() => {
    let cancelled = false;

    async function renderDiagram() {
      if (!sanitized) {
        setSvg("");
        setError("No diagram was generated.");
        return;
      }

      const candidates = [sanitized, repairMermaidLabels(sanitized)];
      let lastErr: unknown = null;

      for (let i = 0; i < candidates.length; i++) {
        try {
          const renderId = `mermaid_${uid}_${i}_${Date.now()}`;
          const { svg: renderedSvg } = await mermaid.render(renderId, candidates[i]);
          if (!cancelled) {
            setSvg(sanitizeSvg(renderedSvg));
            setError(null);
          }
          return;
        } catch (err) {
          lastErr = err;
          const stray = document.getElementById(`dmermaid_${uid}_${i}`);
          stray?.remove();
        }
      }

      if (!cancelled) {
        setSvg("");
        setError(lastErr instanceof Error ? lastErr.message : "Unable to parse Mermaid diagram syntax.");
      }
    }

    renderDiagram();
    return () => {
      cancelled = true;
    };
  }, [sanitized, uid]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(sanitized);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="rounded-md border border-[#1f242d] bg-[#0d0f12] overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 border-b border-[#1f242d] bg-[#101318]">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400/90" />
          <span className="text-[11px] font-mono font-medium uppercase tracking-wider text-zinc-400">
            GRAPH VIEWPORT
          </span>
          {title && (
            <>
              <span className="text-zinc-700">/</span>
              <span className="text-xs font-medium text-zinc-200">{title}</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-1">
          {!showSource && !error && (
            <>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.15).toFixed(2)))}
                className="p-1 rounded text-zinc-400 hover:text-zinc-100 hover:bg-[#1a1f28] transition"
                title="Zoom out"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="text-[11px] font-mono tabular-nums text-zinc-400 w-10 text-center">
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(2.2, +(z + 0.15).toFixed(2)))}
                className="p-1 rounded text-zinc-400 hover:text-zinc-100 hover:bg-[#1a1f28] transition"
                title="Zoom in"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setZoom(1)}
                className="p-1 rounded text-zinc-400 hover:text-zinc-100 hover:bg-[#1a1f28] transition"
                title="Reset zoom"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
              <div className="w-px h-3.5 bg-[#232934] mx-1" />
            </>
          )}
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1 px-2 py-1 rounded text-[11px] text-zinc-400 hover:text-zinc-100 hover:bg-[#1a1f28] transition"
            title="Copy Mermaid source"
          >
            {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            <span>{copied ? "Copied" : "Copy"}</span>
          </button>
          <button
            type="button"
            onClick={() => setShowSource((v) => !v)}
            className="flex items-center gap-1 px-2 py-1 rounded text-[11px] text-zinc-400 hover:text-zinc-100 hover:bg-[#1a1f28] transition"
          >
            {showSource ? <Eye className="w-3 h-3" /> : <Code className="w-3 h-3" />}
            <span>{showSource ? "Render" : "Raw Mermaid"}</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="px-3.5 py-2 bg-amber-500/5 border-b border-amber-500/20 flex items-start gap-2.5 text-xs text-amber-200">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-medium text-amber-300">Diagram render fallback: </span>
            <span className="text-zinc-400">{error}</span>
          </div>
        </div>
      )}

      {showSource || error ? (
        <pre className="p-4 text-xs font-mono text-zinc-300 bg-[#090a0c] overflow-x-auto leading-relaxed">
          {sanitized || "(empty)"}
        </pre>
      ) : (
        <div className="p-5 overflow-auto bg-[#090a0c] bg-dot-grid min-h-[200px] flex items-center justify-center">
          <div
            className="mermaid-container transition-transform origin-top-left"
            style={{ transform: `scale(${zoom})`, transformOrigin: "center top" }}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        </div>
      )}
    </div>
  );
};
