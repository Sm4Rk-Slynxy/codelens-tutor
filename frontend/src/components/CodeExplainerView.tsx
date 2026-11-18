import React, { useState } from "react";
import { AlertCircle, Lightbulb } from "lucide-react";
import type { CodeAnalyzeResponse } from "../types";
import { MermaidDiagram } from "./MermaidDiagram";

interface CodeExplainerViewProps {
  code: string;
  data: CodeAnalyzeResponse;
}

function guessExt(lang: string): string {
  const l = lang.toLowerCase();
  if (l.includes("python")) return "py";
  if (l.includes("typescript")) return "ts";
  if (l.includes("javascript")) return "js";
  if (l.includes("bash") || l.includes("shell")) return "sh";
  if (l.includes("rust")) return "rs";
  if (l.includes("go")) return "go";
  if (l.includes("sql")) return "sql";
  return "txt";
}

export const CodeExplainerView: React.FC<CodeExplainerViewProps> = ({ code, data }) => {
  const [activeBlockId, setActiveBlockId] = useState<number | null>(
    data.blocks[0]?.id ?? null
  );
  const lines = code.split("\n");
  const activeBlock = data.blocks.find((b) => b.id === activeBlockId) || null;
  const ext = guessExt(data.detected_language);

  return (
    <div className="space-y-5">
      {/* 01 / SUMMARY */}
      <section className="rounded-md border border-[#1f242d] bg-[#0d0f12] overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 border-b border-[#1f242d] bg-[#101318]">
          <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400">
            01 / Snippet Overview
          </span>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono tabular-nums text-zinc-500">
              {lines.length} lines
            </span>
            <span className="px-2 py-0.5 rounded border border-[#262d3b] bg-[#090a0c] text-[10px] font-mono text-amber-300">
              {data.detected_language}
            </span>
          </div>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-sm text-zinc-100 leading-relaxed">{data.summary}</p>
          {data.complexity_or_gotchas.length > 0 && (
            <div className="rounded border border-amber-500/25 bg-amber-500/[0.04] p-3 space-y-1.5">
              <div className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wide text-amber-300">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>Complexity &amp; Edge Cases</span>
              </div>
              <ul className="space-y-1 text-xs text-zinc-300">
                {data.complexity_or_gotchas.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="text-amber-400 font-mono">·</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>

      {/* 02 / CONTROL FLOW */}
      <MermaidDiagram code={data.mermaid_diagram} title="Execution Flowchart" />

      {/* 03 / IDE SPLIT WALKTHROUGH */}
      <section className="rounded-md border border-[#1f242d] bg-[#0d0f12] overflow-hidden">
        <div className="px-4 py-2 border-b border-[#1f242d] bg-[#101318] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400">
              03 / Annotated Source
            </span>
            <span className="text-zinc-700">/</span>
            <span className="font-mono text-xs text-zinc-200">source.{ext}</span>
          </div>
          <span className="text-[11px] font-mono text-zinc-500">
            Select block or line to sync highlight
          </span>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-12">
          {/* Left: Code Gutter */}
          <div className="xl:col-span-6 border-b xl:border-b-0 xl:border-r border-[#1f242d] bg-[#090a0c] overflow-x-auto max-h-[560px] overflow-y-auto">
            <div className="py-2.5 font-mono text-xs leading-6">
              {lines.map((line, index) => {
                const lineNum = index + 1;
                const isHighlighted =
                  activeBlock !== null &&
                  lineNum >= activeBlock.line_start &&
                  lineNum <= activeBlock.line_end;
                const matchingBlock = data.blocks.find(
                  (b) => lineNum >= b.line_start && lineNum <= b.line_end
                );
                return (
                  <div
                    key={lineNum}
                    onClick={() => {
                      if (matchingBlock) setActiveBlockId(matchingBlock.id);
                    }}
                    className={`flex px-3 cursor-pointer transition-colors border-l-2 ${
                      isHighlighted
                        ? "bg-amber-400/[0.07] border-amber-400"
                        : "hover:bg-[#12151b] border-transparent"
                    }`}
                  >
                    <span
                      className={`w-9 shrink-0 select-none text-right pr-3.5 tabular-nums ${
                        isHighlighted ? "text-amber-300" : "text-zinc-600"
                      }`}
                    >
                      {lineNum}
                    </span>
                    <pre className="whitespace-pre text-zinc-200">{line || " "}</pre>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right: Structured Annotations */}
          <div className="xl:col-span-6 p-3.5 space-y-2.5 max-h-[560px] overflow-y-auto bg-[#0d0f12]">
            {data.blocks.map((block) => {
              const active = activeBlockId === block.id;
              return (
                <div
                  key={block.id}
                  onMouseEnter={() => setActiveBlockId(block.id)}
                  onClick={() => setActiveBlockId(block.id)}
                  className={`rounded border p-3.5 transition cursor-pointer space-y-2 ${
                    active
                      ? "border-amber-400/70 bg-[#141820]"
                      : "border-[#1f242d] bg-[#090a0c] hover:border-[#2d3544]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`font-mono tabular-nums text-[10px] px-1.5 py-0.5 rounded border ${
                          active
                            ? "border-amber-400/50 bg-amber-400/10 text-amber-300"
                            : "border-[#262d3b] bg-[#101318] text-zinc-400"
                        }`}
                      >
                        {String(block.id).padStart(2, "0")}
                      </span>
                      <h4 className="text-xs font-semibold text-zinc-100 truncate">{block.title}</h4>
                    </div>
                    <span className="text-[11px] font-mono tabular-nums text-zinc-500 shrink-0">
                      L{block.line_start}
                      {block.line_end > block.line_start ? `–${block.line_end}` : ""}
                    </span>
                  </div>

                  <div className="text-xs text-zinc-200 leading-relaxed">
                    <span className="font-mono text-[10px] uppercase tracking-wide text-zinc-400 mr-1.5">
                      Mechanism:
                    </span>
                    {block.what_it_does}
                  </div>

                  <div className="flex items-start gap-2 rounded border border-[#1f242d] bg-[#0d0f12] px-2.5 py-2 text-xs text-zinc-300 leading-relaxed">
                    <Lightbulb className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-mono text-[10px] uppercase tracking-wide text-amber-300/90 mr-1.5">
                        Rationale:
                      </span>
                      {block.why_written_that_way}
                    </div>
                  </div>

                  {block.key_concepts.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-0.5">
                      {block.key_concepts.map((c, idx) => (
                        <span
                          key={idx}
                          className="px-1.5 py-0.5 rounded bg-[#141820] border border-[#232934] font-mono text-[10px] text-zinc-400"
                        >
                          {c}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
};
