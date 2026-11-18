import React, { useState } from "react";
import { CheckCircle2, Lightbulb } from "lucide-react";
import type { ImageAnalyzeResponse, ImageCallout } from "../types";

interface ImageCalloutViewProps {
  imageDataUrl: string;
  data: ImageAnalyzeResponse;
}

const PALETTE = [
  { border: "#f43f5e", bg: "rgba(244, 63, 94, 0.14)", badge: "bg-rose-500 text-white", activeBorder: "border-l-rose-500" },
  { border: "#f59e0b", bg: "rgba(245, 158, 11, 0.14)", badge: "bg-amber-400 text-zinc-950", activeBorder: "border-l-amber-400" },
  { border: "#38bdf8", bg: "rgba(56, 189, 248, 0.14)", badge: "bg-sky-400 text-zinc-950", activeBorder: "border-l-sky-400" },
  { border: "#10b981", bg: "rgba(16, 185, 129, 0.14)", badge: "bg-emerald-400 text-zinc-950", activeBorder: "border-l-emerald-400" },
  { border: "#a78bfa", bg: "rgba(167, 139, 250, 0.14)", badge: "bg-violet-400 text-zinc-950", activeBorder: "border-l-violet-400" },
  { border: "#fb7185", bg: "rgba(251, 113, 133, 0.14)", badge: "bg-pink-400 text-zinc-950", activeBorder: "border-l-pink-400" },
  { border: "#22d3ee", bg: "rgba(34, 211, 238, 0.14)", badge: "bg-cyan-400 text-zinc-950", activeBorder: "border-l-cyan-400" },
  { border: "#a3e635", bg: "rgba(163, 230, 53, 0.14)", badge: "bg-lime-400 text-zinc-950", activeBorder: "border-l-lime-400" },
];

function getPalette(callout: ImageCallout, index: number) {
  if (callout.category === "error") return PALETTE[0];
  return PALETTE[index % PALETTE.length];
}

export const ImageCalloutView: React.FC<ImageCalloutViewProps> = ({
  imageDataUrl,
  data,
}) => {
  const [activeId, setActiveId] = useState<number | null>(data.callouts[0]?.id ?? null);
  const [showBoxes, setShowBoxes] = useState(true);
  const activeCallout = data.callouts.find((c) => c.id === activeId) || null;

  return (
    <div className="space-y-5">
      {/* 01 / SUMMARY */}
      <section className="rounded-md border border-[#1f242d] bg-[#0d0f12] overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 border-b border-[#1f242d] bg-[#101318]">
          <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400">
            01 / Visual Inspection
          </span>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded border border-[#262d3b] bg-[#090a0c] text-[10px] font-mono text-amber-300">
              {data.scene_type}
            </span>
            <button
              type="button"
              onClick={() => setShowBoxes((v) => !v)}
              className="px-2 py-0.5 rounded border border-[#262d3b] hover:bg-[#161b23] text-[11px] font-mono text-zinc-300 transition"
            >
              {showBoxes ? "Hide Overlays" : "Show Overlays"}
            </button>
          </div>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-sm text-zinc-100 leading-relaxed">{data.summary}</p>
          {data.overall_takeaway && (
            <div className="flex items-start gap-2 rounded border border-emerald-500/25 bg-emerald-500/[0.04] px-3 py-2 text-xs text-emerald-200">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-mono text-[11px] font-semibold uppercase tracking-wide text-emerald-300">
                  Takeaway:{" "}
                </span>
                <span className="text-zinc-200">{data.overall_takeaway}</span>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* 02 / ANNOTATED VIEWPORT + CALLOUT CARDS */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        {/* Image Canvas */}
        <div className="xl:col-span-7 rounded-md border border-[#1f242d] bg-[#0d0f12] overflow-hidden">
          <div className="flex items-center justify-between px-3.5 py-2 border-b border-[#1f242d] bg-[#101318] text-[11px] font-mono">
            <span className="text-zinc-400 uppercase tracking-wider">OVERLAY VIEWPORT</span>
            <span className="text-zinc-500 tabular-nums">
              {activeCallout
                ? `#${activeCallout.id} [${activeCallout.box_2d.join(", ")}]`
                : `${data.callouts.length} regions`}
            </span>
          </div>

          <div className="p-4 bg-[#090a0c] bg-dot-grid flex flex-col items-center justify-center">
            <div className="relative inline-block max-w-full overflow-hidden rounded border border-[#1f242d]">
              <img
                src={imageDataUrl}
                alt="Analyzed screenshot"
                className="block max-h-[540px] w-auto max-w-full select-none"
              />

              {showBoxes && (
                <svg
                  viewBox="0 0 1000 1000"
                  preserveAspectRatio="none"
                  className="absolute inset-0 w-full h-full pointer-events-none"
                >
                  {data.callouts.map((callout, idx) => {
                    const [ymin, xmin, ymax, xmax] = callout.box_2d;
                    const pal = getPalette(callout, idx);
                    const isActive = activeId === callout.id;
                    const isDimmed = activeId !== null && !isActive;

                    return (
                      <rect
                        key={callout.id}
                        x={xmin}
                        y={ymin}
                        width={Math.max(8, xmax - xmin)}
                        height={Math.max(8, ymax - ymin)}
                        rx={4}
                        fill={isActive ? pal.bg : "transparent"}
                        stroke={pal.border}
                        strokeWidth={isActive ? 5 : 3}
                        strokeOpacity={isDimmed ? 0.3 : 0.95}
                        fillOpacity={isDimmed ? 0.25 : 1}
                      />
                    );
                  })}
                </svg>
              )}

              {showBoxes &&
                data.callouts.map((callout, idx) => {
                  const [ymin, xmin, ymax, xmax] = callout.box_2d;
                  const pal = getPalette(callout, idx);
                  const isActive = activeId === callout.id;
                  const isDimmed = activeId !== null && !isActive;

                  return (
                    <button
                      key={`hit-${callout.id}`}
                      type="button"
                      onMouseEnter={() => setActiveId(callout.id)}
                      onClick={() => setActiveId(callout.id)}
                      title={`${callout.id}. ${callout.label}`}
                      style={{
                        top: `${ymin / 10}%`,
                        left: `${xmin / 10}%`,
                        width: `${Math.max(1.5, (xmax - xmin) / 10)}%`,
                        height: `${Math.max(1.5, (ymax - ymin) / 10)}%`,
                      }}
                      className={`absolute cursor-pointer focus:outline-none transition-opacity ${
                        isDimmed ? "opacity-40" : "opacity-100"
                      }`}
                    >
                      <span
                        className={`absolute -top-2.5 -left-2.5 inline-flex items-center justify-center w-5 h-5 rounded text-[11px] font-mono font-bold shadow ring-1 ring-[#090a0c] transition-transform ${
                          pal.badge
                        } ${isActive ? "scale-125" : "hover:scale-110"}`}
                      >
                        {callout.id}
                      </span>
                    </button>
                  );
                })}
            </div>
          </div>
        </div>

        {/* Synchronized Callout List */}
        <div className="xl:col-span-5 space-y-2 max-h-[600px] overflow-y-auto pr-0.5">
          {data.callouts.map((callout, idx) => {
            const pal = getPalette(callout, idx);
            const isActive = activeId === callout.id;
            return (
              <div
                key={callout.id}
                onMouseEnter={() => setActiveId(callout.id)}
                onClick={() => setActiveId(callout.id)}
                className={`rounded border border-l-2 p-3.5 transition cursor-pointer space-y-2 ${
                  isActive
                    ? `border-[#2d3544] ${pal.activeBorder} bg-[#141820]`
                    : "border-[#1f242d] border-l-transparent bg-[#0d0f12] hover:border-[#2a3140]"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center justify-center w-5 h-5 rounded text-[11px] font-mono font-bold shrink-0 ${pal.badge}`}
                    >
                      {callout.id}
                    </span>
                    <h4 className="text-xs font-semibold text-zinc-100">{callout.label}</h4>
                  </div>
                  <span className="px-1.5 py-0.5 rounded bg-[#090a0c] border border-[#1f242d] font-mono text-[10px] uppercase text-zinc-400">
                    {callout.category}
                  </span>
                </div>

                <p className="text-xs text-zinc-300 leading-relaxed">{callout.explanation}</p>

                {callout.action_tip && (
                  <div className="flex items-start gap-2 rounded border border-[#1f242d] bg-[#090a0c] px-2.5 py-1.5 text-[11px] text-zinc-300">
                    <Lightbulb className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                    <span>{callout.action_tip}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
