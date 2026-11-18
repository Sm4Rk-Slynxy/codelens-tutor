import type {
  ChatMessage,
  CliAnalyzeResponse,
  CodeAnalyzeResponse,
  ImageAnalyzeResponse,
  ModeTab,
  RepoFileExplainResponse,
  RepoScanResponse,
} from "../types";

interface ExportParams {
  mode: ModeTab;
  cliInput: string;
  cliResult: CliAnalyzeResponse | null;
  codeInput: string;
  codeResult: CodeAnalyzeResponse | null;
  repoResult: RepoScanResponse | null;
  repoFileResult: RepoFileExplainResponse | null;
  imageResult: ImageAnalyzeResponse | null;
  chatHistory: ChatMessage[];
}

export function buildLessonMarkdown(params: ExportParams): { filename: string; markdown: string } | null {
  const sections: string[] = [];
  const timestamp = new Date().toISOString().slice(0, 10);
  let slug = "lesson";

  if (params.mode === "cli" && params.cliResult) {
    const r = params.cliResult;
    slug = "cli-dissection";
    sections.push(`# CodeLens Tutor — CLI Command Dissection`);
    sections.push(`**Shell:** \`${r.shell_dialect}\`\n\n\`\`\`sh\n${params.cliInput.trim()}\n\`\`\``);
    sections.push(`## Plain-English Summary\n\n${r.summary}`);
    if (r.mermaid_diagram) {
      sections.push(`## Execution Pipeline Diagram\n\n\`\`\`mermaid\n${r.mermaid_diagram}\n\`\`\``);
    }
    if (r.warnings.length > 0) {
      sections.push(
        `## Warnings & Gotchas\n\n` +
          r.warnings.map((w) => `- **[${w.severity.toUpperCase()}] ${w.title}:** ${w.explanation}`).join("\n")
      );
    }
    if (r.tokens.length > 0) {
      sections.push(
        `## Token-by-Token Breakdown\n\n` +
          r.tokens
            .map(
              (t, i) =>
                `${i + 1}. \`${t.token}\` *(${t.role} · ${t.risk_level})* — ${t.plain_english}${
                  t.detail ? `\n   - ${t.detail}` : ""
                }`
            )
            .join("\n")
      );
    }
    if (r.dry_run_tip) {
      sections.push(`## Safe Dry-Run Tip\n\n${r.dry_run_tip}`);
    }
  } else if (params.mode === "code" && params.codeResult) {
    const r = params.codeResult;
    slug = "code-walkthrough";
    sections.push(`# CodeLens Tutor — Code Snippet Walkthrough (${r.detected_language})`);
    sections.push(`## Summary\n\n${r.summary}`);
    sections.push(`## Source Code\n\n\`\`\`${r.detected_language.toLowerCase()}\n${params.codeInput.trim()}\n\`\`\``);
    if (r.mermaid_diagram) {
      sections.push(`## Logic & Control Flowchart\n\n\`\`\`mermaid\n${r.mermaid_diagram}\n\`\`\``);
    }
    if (r.blocks.length > 0) {
      sections.push(
        `## Block-by-Block Walkthrough\n\n` +
          r.blocks
            .map(
              (b) =>
                `### ${b.id}. ${b.title} (Lines ${b.line_start}–${b.line_end})\n\n\`\`\`\n${b.code_excerpt}\n\`\`\`\n- **What it does:** ${b.what_it_does}\n- **Why it's written that way:** ${b.why_written_that_way}`
            )
            .join("\n\n")
      );
    }
    if (r.complexity_or_gotchas.length > 0) {
      sections.push(
        `## Complexity & Gotchas\n\n` + r.complexity_or_gotchas.map((g) => `- ${g}`).join("\n")
      );
    }
  } else if (params.mode === "repo" && params.repoResult) {
    const r = params.repoResult;
    slug = `repo-${r.repo_name.replace(/[^a-zA-Z0-9_-]+/g, "-")}`;
    sections.push(`# CodeLens Tutor — Repository X-Ray: ${r.repo_name}`);
    sections.push(`**Source:** \`${r.source_type}\` · **Files Indexed:** ${r.file_count}`);
    sections.push(`## Architecture Summary\n\n${r.summary}`);
    if (r.tech_stack.length > 0) {
      sections.push(`**Tech Stack:** ${r.tech_stack.join(", ")}`);
    }
    if (r.mermaid_diagram) {
      sections.push(`## System Architecture Diagram\n\n\`\`\`mermaid\n${r.mermaid_diagram}\n\`\`\``);
    }
    if (r.key_components.length > 0) {
      sections.push(
        `## Key Components\n\n` +
          r.key_components.map((c) => `- **${c.name}** (\`${c.path}\`): ${c.role}`).join("\n")
      );
    }
    if (params.repoFileResult) {
      const f = params.repoFileResult;
      sections.push(`---\n\n## Selected File: \`${f.file_path}\` (${f.language})`);
      sections.push(`- **Summary:** ${f.summary}\n- **Role in Project:** ${f.role_in_project}`);
      if (f.mermaid_diagram) {
        sections.push(`### File Component Diagram\n\n\`\`\`mermaid\n${f.mermaid_diagram}\n\`\`\``);
      }
      if (f.key_elements.length > 0) {
        sections.push(
          `### Key Elements\n\n` +
            f.key_elements
              .map((el) => `- **${el.title}** (L${el.line_start}–${el.line_end}): ${el.what_it_does}`)
              .join("\n")
        );
      }
    }
  } else if (params.mode === "image" && params.imageResult) {
    const r = params.imageResult;
    slug = "screenshot-callouts";
    sections.push(`# CodeLens Tutor — Visual Screenshot Analysis (${r.scene_type})`);
    sections.push(`## Summary\n\n${r.summary}`);
    if (r.callouts.length > 0) {
      sections.push(
        `## Numbered Visual Callouts\n\n` +
          r.callouts
            .map(
              (c) =>
                `### #${c.id} — ${c.label} *(${c.category})*\n- **Coordinates:** \`[${c.box_2d.join(", ")}]\`\n- **Explanation:** ${c.explanation}${
                  c.action_tip ? `\n- **Tip:** ${c.action_tip}` : ""
                }`
            )
            .join("\n\n")
      );
    }
    if (r.overall_takeaway) {
      sections.push(`## Overall Takeaway\n\n${r.overall_takeaway}`);
    }
  } else {
    return null;
  }

  if (params.chatHistory.length > 0) {
    sections.push(
      `---\n\n## Follow-Up Q&A\n\n` +
        params.chatHistory
          .map((m) => `**${m.role === "user" ? "You" : "CodeLens Tutor"}:**\n\n${m.content}`)
          .join("\n\n")
    );
  }

  return {
    filename: `codelens-${slug}-${timestamp}.md`,
    markdown: sections.join("\n\n"),
  };
}
