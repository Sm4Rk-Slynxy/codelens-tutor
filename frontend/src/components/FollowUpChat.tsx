import React, { useRef, useState } from "react";
import { CornerDownLeft, Loader2 } from "lucide-react";
import type { ChatMessage } from "../types";

interface FollowUpChatProps {
  disabled: boolean;
  loading: boolean;
  history: ChatMessage[];
  onAsk: (question: string) => Promise<void>;
}

/** Lightweight inline formatter for backticks & bold text in tutor replies */
function renderFormattedText(text: string): React.ReactNode {
  const parts = text.split(/(```[\s\S]*?```)/g);
  return parts.map((segment, idx) => {
    if (segment.startsWith("```") && segment.endsWith("```")) {
      const inner = segment.replace(/^```[^\n]*\n?/, "").replace(/\n?```$/, "");
      return (
        <pre
          key={idx}
          className="my-2 rounded border border-[#1f242d] bg-[#090a0c] p-2.5 text-[11px] font-mono text-zinc-200 overflow-x-auto"
        >
          {inner}
        </pre>
      );
    }
    const inlineParts = segment.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
    return (
      <span key={idx} className="whitespace-pre-wrap">
        {inlineParts.map((tok, i) => {
          if (tok.startsWith("`") && tok.endsWith("`")) {
            return (
              <code
                key={i}
                className="px-1 py-0.5 rounded bg-[#181c24] border border-[#252b37] text-amber-200 font-mono text-[11px]"
              >
                {tok.slice(1, -1)}
              </code>
            );
          }
          if (tok.startsWith("**") && tok.endsWith("**")) {
            return (
              <strong key={i} className="font-semibold text-white">
                {tok.slice(2, -2)}
              </strong>
            );
          }
          return tok;
        })}
      </span>
    );
  });
}

export const FollowUpChat: React.FC<FollowUpChatProps> = ({
  disabled,
  loading,
  history,
  onAsk,
}) => {
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = input.trim();
    if (!q || disabled || loading) return;
    setInput("");
    await onAsk(q);
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  };

  return (
    <div className="border-t border-[#1f242d] bg-[#0d0f12]">
      {history.length > 0 && (
        <div className="max-h-52 overflow-y-auto px-5 py-3 space-y-2.5 border-b border-[#1f242d] bg-[#0a0b0e]">
          {history.map((msg, idx) => (
            <div key={idx} className="flex items-start gap-3 text-xs">
              <span
                className={`font-mono text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border shrink-0 mt-0.5 ${
                  msg.role === "user"
                    ? "bg-[#141820] border-[#262d3b] text-zinc-300"
                    : "bg-amber-500/10 border-amber-500/30 text-amber-300"
                }`}
              >
                {msg.role === "user" ? "YOU" : "TUTOR"}
              </span>
              <div className="flex-1 text-zinc-200 leading-relaxed pt-0.5">
                {renderFormattedText(msg.content)}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex items-center gap-2 text-xs text-zinc-400 pl-14">
              <Loader2 className="w-3 h-3 animate-spin text-amber-400" />
              <span className="font-mono text-[11px]">Generating response...</span>
            </div>
          )}
          <div ref={endRef} />
        </div>
      )}

      <form onSubmit={handleSubmit} className="px-4 py-2.5 flex items-center gap-2">
        <div className="relative flex-1 flex items-center rounded border border-[#1f242d] bg-[#090a0c] focus-within:border-[#3b4454] transition">
          <span className="pl-3 pr-2 font-mono text-[11px] font-medium text-amber-400/90 select-none shrink-0">
            TUTOR &gt;
          </span>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={disabled || loading}
            placeholder={
              disabled
                ? "Run an analysis to enable context-aware follow-up questions..."
                : "Ask a follow-up (e.g. 'What happens if I omit -f?' or 'Show an alternative')"
            }
            className="w-full bg-transparent pr-3 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none disabled:opacity-50"
          />
        </div>
        <button
          type="submit"
          disabled={disabled || loading || !input.trim()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#eceff4] hover:bg-white text-xs font-medium text-[#090a0c] transition disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CornerDownLeft className="w-3.5 h-3.5" />}
          <span>Send</span>
        </button>
      </form>
    </div>
  );
};
