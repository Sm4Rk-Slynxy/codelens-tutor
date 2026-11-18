import React, { useState } from "react";
import { AlertOctagon, AlertTriangle, Info, ShieldCheck } from "lucide-react";
import type { CliAnalyzeResponse, CliToken } from "../types";
import { MermaidDiagram } from "./MermaidDiagram";

interface CliDissectorViewProps {
  command: string;
  data: CliAnalyzeResponse;
}

const ROLE_STYLES: Record<CliToken["role"], string> = {
  binary: "border-amber-500/40 bg-amber-500/10 text-amber-200",
  subcommand: "border-sky-500/40 bg-sky-500/10 text-sky-200",
  flag: "border-cyan-500/35 bg-cyan-500/10 text-cyan-200",
  argument: "border-emerald-500/35 bg-emerald-500/10 text-emerald-200",
  pipe: "border-orange-500/45 bg-orange-500/10 text-orange-200",
  redirect: "border-rose-500/40 bg-rose-500/10 text-rose-200",
  operator: "border-zinc-500/50 bg-zinc-500/15 text-zinc-200",
  variable: "border-teal-500/35 bg-teal-500/10 text-teal-200",
  pattern: "border-lime-500/35 bg-lime-500/10 text-lime-200",
  other: "border-[#2a3140] bg-[#141820] text-zinc-300",
};

export const CliDissectorView: React.FC<CliDissectorViewProps> = ({ data }) => {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  return (
    <div className="space-y-5">
      {/* 01 / SUMMARY */}
      <section className="rounded-md border border-[#1f242d] bg-[#0d0f12] overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 border-b border-[#1f242d] bg-[#101318]">
          <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400">
            01 / Command Specification
          </span>
          <span className="px-2 py-0.5 rounded border border-[#262d3b] bg-[#090a0c] text-[10px] font-mono text-zinc-300">
            {data.shell_dialect}
          </span>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-sm text-zinc-100 leading-relaxed">{data.summary}</p>
          {data.dry_run_tip && (
            <div className="flex items-start gap-2.5 rounded border border-emerald-500/25 bg-emerald-500/[0.04] px-3 py-2 text-xs text-emerald-200">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-mono text-[11px] font-semibold uppercase tracking-wide text-emerald-300">
                  Dry-Run Tip:{" "}
                </span>
                <span className="text-zinc-200">{data.dry_run_tip}</span>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Warnings */}
      {data.warnings.length > 0 && (
        <div className="space-y-2">
          {data.warnings.map((w, idx) => {
            const isDanger = w.severity === "danger";
            const isWarning = w.severity === "warning";
            return (
              <div
                key={idx}
                className={`rounded-md border px-3.5 py-2.5 flex items-start gap-3 text-xs ${
                  isDanger
                    ? "border-rose-500/40 bg-rose-500/[0.07] text-rose-100"
                    : isWarning
                    ? "border-amber-500/35 bg-amber-500/[0.06] text-amber-100"
                    : "border-sky-500/30 bg-sky-500/[0.05] text-sky-100"
                }`}
              >
                {isDanger ? (
                  <AlertOctagon className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                ) : isWarning ? (
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                ) : (
                  <Info className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                )}
                <div>
                  <div className="font-semibold">{w.title}</div>
                  <p className="text-zinc-300 mt-0.5 leading-relaxed">{w.explanation}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 02 / PIPELINE TOPOLOGY */}
      <MermaidDiagram code={data.mermaid_diagram} title="Pipeline Topology" />

      {/* 03 / TOKEN DISSECTION */}
      <section className="rounded-md border border-[#1f242d] bg-[#0d0f12] overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 border-b border-[#1f242d] bg-[#101318]">
          <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400">
            03 / Token Dissection
          </span>
          <span className="text-[11px] font-mono tabular-nums text-zinc-500">
            {data.tokens.length} token{data.tokens.length === 1 ? "" : "s"} · hover to inspect
          </span>
        </div>

        <div className="p-4 space-y-4">
          {/* Terminal Prompt Ribbon */}
          <div className="flex flex-wrap items-center gap-1.5 rounded border border-[#1f242d] bg-[#090a0c] px-3.5 py-3 font-mono text-xs">
            <span className="text-zinc-500 select-none mr-1">$</span>
            {data.tokens.map((tok, idx) => {
              const selected = activeIdx === idx;
              const destructiveRing =
                tok.risk_level === "destructive"
                  ? "ring-1 ring-rose-500/70"
                  : tok.risk_level === "caution"
                  ? "ring-1 ring-amber-500/50"
                  : "";
              return (
                <button
                  key={`${tok.token}-${idx}`}
                  type="button"
                  onMouseEnter={() => setActiveIdx(idx)}
                  onClick={() => setActiveIdx(selected ? null : idx)}
                  className={`px-2 py-0.5 rounded border transition ${ROLE_STYLES[tok.role]} ${destructiveRing} ${
                    selected ? "ring-1 ring-white border-white/80" : "hover:border-zinc-400"
                  }`}
                >
                  {tok.token}
                </button>
              );
            })}
          </div>

          {/* 2-Column Specification Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {data.tokens.map((tok, idx) => {
              const selected = activeIdx === idx;
              return (
                <div
                  key={`card-${idx}`}
                  onMouseEnter={() => setActiveIdx(idx)}
                  onMouseLeave={() => setActiveIdx(null)}
                  className={`rounded border p-3 transition cursor-default ${
                    selected
                      ? "border-amber-400/70 bg-[#141820]"
                      : "border-[#1f242d] bg-[#090a0c] hover:border-[#2d3544]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono tabular-nums text-[10px] text-zinc-600">
                        #{String(idx + 1).padStart(2, "0")}
                      </span>
                      <code className="text-xs font-mono font-semibold text-zinc-100 bg-[#141820] border border-[#232934] px-1.5 py-0.5 rounded truncate">
                        {tok.token}
                      </code>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {tok.risk_level !== "safe" && (
                        <span
                          className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-semibold uppercase ${
                            tok.risk_level === "destructive"
                              ? "bg-rose-500/15 text-rose-300 border border-rose-500/40"
                              : "bg-amber-500/15 text-amber-300 border border-amber-500/40"
                          }`}
                        >
                          {tok.risk_level}
                        </span>
                      )}
                      <span
                        className={`px-1.5 py-0.5 rounded border text-[9px] font-mono uppercase ${ROLE_STYLES[tok.role]}`}
                      >
                        {tok.role}
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-zinc-200 leading-relaxed">{tok.plain_english}</p>
                  {tok.detail && (
                    <p className="text-[11px] text-zinc-400 mt-1.5 leading-relaxed border-t border-[#171b22] pt-1.5">
                      {tok.detail}
                    </p>
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
