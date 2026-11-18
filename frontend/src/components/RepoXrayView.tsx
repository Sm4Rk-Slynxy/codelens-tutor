import React, { useMemo, useState } from "react";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  FileCode2,
  Folder,
  FolderOpen,
  GitBranch,
  Link2,
  Loader2,
  Search,
} from "lucide-react";
import type {
  FileTreeNode,
  RepoFileExplainResponse,
  RepoScanResponse,
} from "../types";
import { MermaidDiagram } from "./MermaidDiagram";

interface FileTreeProps {
  nodes: FileTreeNode[];
  selectedPath: string | null;
  loadingPath: string | null;
  onSelectFile: (path: string) => void;
}

function filterNodes(nodes: FileTreeNode[], query: string): FileTreeNode[] {
  if (!query.trim()) return nodes;
  const q = query.toLowerCase();
  const out: FileTreeNode[] = [];
  for (const node of nodes) {
    if (node.type === "file") {
      if (node.path.toLowerCase().includes(q) || node.name.toLowerCase().includes(q)) {
        out.push(node);
      }
    } else {
      const filteredChildren = filterNodes(node.children, query);
      if (filteredChildren.length > 0 || node.name.toLowerCase().includes(q)) {
        out.push({
          ...node,
          children: filteredChildren.length > 0 ? filteredChildren : node.children,
        });
      }
    }
  }
  return out;
}

const TreeItem: React.FC<{
  node: FileTreeNode;
  depth: number;
  selectedPath: string | null;
  loadingPath: string | null;
  forceExpand: boolean;
  onSelectFile: (path: string) => void;
}> = ({ node, depth, selectedPath, loadingPath, forceExpand, onSelectFile }) => {
  const [expanded, setExpanded] = useState(depth < 1);
  const isOpen = forceExpand || expanded;

  if (node.type === "directory") {
    return (
      <div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
          className="w-full flex items-center gap-1.5 py-1 pr-2 text-left text-xs text-zinc-300 hover:bg-[#141820] rounded transition"
        >
          {isOpen ? (
            <ChevronDown className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
          )}
          {isOpen ? (
            <FolderOpen className="w-3.5 h-3.5 text-amber-400/90 shrink-0" />
          ) : (
            <Folder className="w-3.5 h-3.5 text-amber-400/70 shrink-0" />
          )}
          <span className="truncate font-medium">{node.name}</span>
        </button>
        {isOpen && (
          <div>
            {node.children.map((child) => (
              <TreeItem
                key={child.path}
                node={child}
                depth={depth + 1}
                selectedPath={selectedPath}
                loadingPath={loadingPath}
                forceExpand={forceExpand}
                onSelectFile={onSelectFile}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  const isSelected = selectedPath === node.path;
  const isLoading = loadingPath === node.path;

  return (
    <button
      type="button"
      onClick={() => onSelectFile(node.path)}
      style={{ paddingLeft: `${depth * 12 + 22}px` }}
      className={`w-full flex items-center justify-between gap-2 py-1 pr-2 text-left text-xs rounded transition ${
        isSelected
          ? "bg-amber-400/10 text-amber-200 border-l-2 border-amber-400"
          : "text-zinc-300 hover:bg-[#141820] hover:text-zinc-100 border-l-2 border-transparent"
      }`}
    >
      <span className="flex items-center gap-1.5 min-w-0">
        {isLoading ? (
          <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin shrink-0" />
        ) : (
          <FileCode2 className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
        )}
        <span className="truncate font-mono text-[11px]">{node.name}</span>
      </span>
      {node.size != null && (
        <span className="text-[10px] font-mono tabular-nums text-zinc-600 shrink-0">
          {node.size > 1024 ? `${Math.round(node.size / 1024)}K` : `${node.size}B`}
        </span>
      )}
    </button>
  );
};

export const FileTreeBrowser: React.FC<FileTreeProps> = ({
  nodes,
  selectedPath,
  loadingPath,
  onSelectFile,
}) => {
  const [filter, setFilter] = useState("");
  const filtered = useMemo(() => filterNodes(nodes, filter), [nodes, filter]);

  return (
    <div className="rounded-md border border-[#1f242d] bg-[#090a0c] overflow-hidden flex flex-col">
      <div className="p-2 border-b border-[#1f242d] bg-[#0d0f12]">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-2" />
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter repository files..."
            className="w-full rounded border border-[#1f242d] bg-[#090a0c] pl-8 pr-2.5 py-1 text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-[#333c4d] focus:outline-none"
          />
        </div>
      </div>
      <div className="p-1.5 max-h-[380px] overflow-y-auto space-y-0.5">
        {filtered.length === 0 ? (
          <p className="text-xs font-mono text-zinc-600 text-center py-4">No matching files</p>
        ) : (
          filtered.map((node) => (
            <TreeItem
              key={node.path}
              node={node}
              depth={0}
              selectedPath={selectedPath}
              loadingPath={loadingPath}
              forceExpand={Boolean(filter.trim())}
              onSelectFile={onSelectFile}
            />
          ))
        )}
      </div>
    </div>
  );
};

interface RepoXrayViewProps {
  repo: RepoScanResponse;
  selectedFile: RepoFileExplainResponse | null;
  loadingFilePath: string | null;
  onSelectFile: (path: string) => void;
  onBackToOverview: () => void;
}

export const RepoXrayView: React.FC<RepoXrayViewProps> = ({
  repo,
  selectedFile,
  loadingFilePath,
  onSelectFile,
  onBackToOverview,
}) => {
  const [showRawSource, setShowRawSource] = useState(false);

  if (loadingFilePath) {
    return (
      <div className="rounded-md border border-[#1f242d] bg-[#0d0f12] p-10 flex flex-col items-center justify-center text-center gap-2.5">
        <Loader2 className="w-6 h-6 text-amber-400 animate-spin" />
        <p className="text-xs font-mono text-zinc-200">
          Inspecting {loadingFilePath}...
        </p>
        <p className="text-xs text-zinc-500">
          Mapping component flow and project role inside {repo.repo_name}
        </p>
      </div>
    );
  }

  if (selectedFile) {
    return (
      <div className="space-y-5">
        <section className="rounded-md border border-[#1f242d] bg-[#0d0f12] overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 border-b border-[#1f242d] bg-[#101318]">
            <button
              type="button"
              onClick={onBackToOverview}
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border border-[#262d3b] bg-[#090a0c] hover:border-[#3b4454] text-[11px] font-mono text-zinc-200 transition"
            >
              <ArrowLeft className="w-3 h-3" />
              <span>Architecture</span>
            </button>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded border border-[#262d3b] bg-[#090a0c] text-[10px] font-mono text-amber-300">
                {selectedFile.language}
              </span>
              <button
                type="button"
                onClick={() => setShowRawSource((v) => !v)}
                className="px-2 py-0.5 rounded border border-[#262d3b] hover:bg-[#161b23] text-[11px] font-mono text-zinc-300 transition"
              >
                {showRawSource ? "Hide Source" : "View Source"}
              </button>
            </div>
          </div>

          <div className="p-4 space-y-3">
            <div className="font-mono text-sm font-semibold text-zinc-100 break-all">
              {selectedFile.file_path}
            </div>
            <p className="text-sm text-zinc-200 leading-relaxed">{selectedFile.summary}</p>

            <div className="rounded border border-[#262d3b] bg-[#090a0c] p-3 text-xs text-zinc-200 leading-relaxed">
              <span className="font-mono text-[10px] uppercase tracking-wide text-amber-300 mr-1.5">
                Project Role:
              </span>
              {selectedFile.role_in_project}
            </div>

            {selectedFile.connections.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-zinc-400">
                  <Link2 className="w-3.5 h-3.5 text-zinc-500" />
                  <span>Connections &amp; Dependencies</span>
                </div>
                <ul className="space-y-1 text-xs text-zinc-300">
                  {selectedFile.connections.map((conn, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="text-amber-400 font-mono">→</span>
                      <span>{conn}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>

        {showRawSource && (
          <div className="rounded-md border border-[#1f242d] bg-[#090a0c] overflow-hidden">
            <div className="px-4 py-2 border-b border-[#1f242d] bg-[#101318] text-[11px] font-mono text-zinc-400">
              {selectedFile.file_path}
            </div>
            <pre className="p-4 text-xs font-mono text-zinc-200 overflow-x-auto max-h-[360px] overflow-y-auto leading-relaxed">
              {selectedFile.content}
            </pre>
          </div>
        )}

        <MermaidDiagram
          code={selectedFile.mermaid_diagram}
          title={selectedFile.file_path}
        />

        {selectedFile.key_elements.length > 0 && (
          <section className="rounded-md border border-[#1f242d] bg-[#0d0f12] overflow-hidden">
            <div className="px-4 py-2 border-b border-[#1f242d] bg-[#101318]">
              <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400">
                Key Symbols &amp; Sections
              </span>
            </div>
            <div className="p-3.5 space-y-2.5">
              {selectedFile.key_elements.map((el) => (
                <div
                  key={el.id}
                  className="rounded border border-[#1f242d] bg-[#090a0c] p-3.5 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-zinc-100">{el.title}</span>
                    <span className="text-[11px] font-mono tabular-nums text-zinc-500">
                      L{el.line_start}–{el.line_end}
                    </span>
                  </div>
                  {el.code_excerpt && (
                    <pre className="rounded border border-[#1a1f28] bg-[#0d0f12] p-2.5 text-[11px] font-mono text-zinc-300 overflow-x-auto">
                      {el.code_excerpt}
                    </pre>
                  )}
                  <p className="text-xs text-zinc-200 leading-relaxed">{el.what_it_does}</p>
                  {el.why_written_that_way && (
                    <p className="text-[11px] text-zinc-400 leading-relaxed">
                      <span className="font-mono text-zinc-300">Note: </span>
                      {el.why_written_that_way}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    );
  }

  // System Architecture Overview
  return (
    <div className="space-y-5">
      <section className="rounded-md border border-[#1f242d] bg-[#0d0f12] overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 border-b border-[#1f242d] bg-[#101318]">
          <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400">
            01 / Repository X-Ray · {repo.repo_name}
          </span>
          <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-400">
            <span className="px-2 py-0.5 rounded border border-[#262d3b] bg-[#090a0c] text-zinc-300">
              {repo.source_type}
            </span>
            <span className="tabular-nums">{repo.file_count} files</span>
          </div>
        </div>

        <div className="p-4 space-y-3">
          <p className="text-sm text-zinc-100 leading-relaxed">{repo.summary}</p>

          {repo.tech_stack.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {repo.tech_stack.map((tech, idx) => (
                <span
                  key={idx}
                  className="px-2 py-0.5 rounded border border-[#262d3b] bg-[#141820] font-mono text-[11px] text-zinc-200"
                >
                  {tech}
                </span>
              ))}
            </div>
          )}

          {repo.entry_points.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
              <span className="inline-flex items-center gap-1 font-mono text-[11px] text-zinc-400">
                <GitBranch className="w-3.5 h-3.5 text-emerald-400" />
                Entry points:
              </span>
              {repo.entry_points.map((ep, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => onSelectFile(ep)}
                  className="px-2 py-0.5 rounded border border-[#262d3b] bg-[#090a0c] hover:border-amber-400/60 font-mono text-[11px] text-emerald-300 transition"
                >
                  {ep}
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      <MermaidDiagram code={repo.mermaid_diagram} title="System Architecture" />

      {repo.key_components.length > 0 && (
        <section className="rounded-md border border-[#1f242d] bg-[#0d0f12] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-[#1f242d] bg-[#101318]">
            <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400">
              03 / Key Modules
            </span>
            <span className="text-[11px] font-mono text-zinc-500">
              Click any module or tree item to inspect
            </span>
          </div>
          <div className="p-3.5 grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {repo.key_components.map((comp, idx) => (
              <div
                key={idx}
                onClick={() => {
                  if (comp.path && !comp.path.endsWith("/")) {
                    onSelectFile(comp.path);
                  }
                }}
                className="rounded border border-[#1f242d] bg-[#090a0c] hover:border-amber-400/60 p-3 transition cursor-pointer space-y-1"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-zinc-100">{comp.name}</span>
                  <code className="text-[10px] font-mono text-amber-300 bg-[#141820] border border-[#232934] px-1.5 py-0.5 rounded truncate max-w-[180px]">
                    {comp.path}
                  </code>
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed">{comp.role}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
