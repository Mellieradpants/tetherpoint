import { useState } from "react";

interface StructureNode {
  node_id: string;
  source_text: string;
  normalized_text: string;
  actor: string | null;
  action: string | null;
  condition: string | null;
  temporal: string | null;
  jurisdiction: string | null;
  mechanism: string | null;
  risk: Record<string, string> | null;
  tags: string[];
  blocked_flags: string[];
  who: string | null;
  what: string | null;
  when: string | null;
  where: string | null;
  why: string | null;
  how: string | null;
}

interface VerificationNode {
  node_id: string;
  assertion_detected: boolean;
  assertion_type: string | null;
  verification_path_available: boolean;
  expected_record_systems: string[];
  verification_notes: string;
}

interface PipelineResponse {
  input: Record<string, unknown>;
  structure: { nodes: StructureNode[]; node_count: number };
  selection: { selected_nodes: StructureNode[]; excluded_nodes: StructureNode[]; selection_log: string[] };
  meaning: Record<string, unknown>;
  origin: Record<string, unknown>;
  verification: { status: string; node_results: VerificationNode[] };
  output: Record<string, unknown>;
  errors: Array<Record<string, unknown>>;
}

const LAYERS = [
  { key: "input", label: "1. Input", color: "bg-chart-1" },
  { key: "structure", label: "2. Structure", color: "bg-chart-2" },
  { key: "selection", label: "3. Selection", color: "bg-chart-3" },
  { key: "meaning", label: "4. Meaning", color: "bg-chart-4" },
  { key: "origin", label: "5. Origin", color: "bg-chart-5" },
  { key: "verification", label: "6. Verification", color: "bg-primary" },
  { key: "output", label: "7. Output", color: "bg-muted-foreground" },
] as const;

function Signal({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded bg-accent px-1.5 py-0.5 text-[10px] text-accent-foreground">
      <span className="font-medium text-muted-foreground">{label}:</span>
      <span>{value}</span>
    </span>
  );
}

function NodeRow({ node, status, verification }: { node: StructureNode; status: "selected" | "excluded"; verification?: VerificationNode }) {
  const [expanded, setExpanded] = useState(false);
  const isBlocked = node.blocked_flags.length > 0;

  return (
    <div className={`rounded border ${isBlocked ? "border-destructive/30 bg-destructive/5" : status === "excluded" ? "border-border bg-muted/30" : "border-border"}`}>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-start gap-2 px-3 py-2 text-left text-xs hover:bg-accent/30 transition-colors"
      >
        <span className="shrink-0 font-mono text-muted-foreground">{node.node_id}</span>
        <span className="flex-1 text-foreground line-clamp-2">{node.source_text}</span>
        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${
          isBlocked ? "bg-destructive/20 text-destructive" : status === "selected" ? "bg-chart-2/20 text-chart-2" : "bg-muted text-muted-foreground"
        }`}>
          {isBlocked ? "BLOCKED" : status === "selected" ? "SELECTED" : "EXCLUDED"}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-border px-3 py-2 space-y-2">
          {/* Signals row */}
          <div className="flex flex-wrap gap-1">
            <Signal label="actor" value={node.actor} />
            <Signal label="action" value={node.action} />
            <Signal label="jurisdiction" value={node.jurisdiction} />
            <Signal label="mechanism" value={node.mechanism} />
            <Signal label="temporal" value={node.temporal} />
            <Signal label="who" value={node.who} />
            <Signal label="when" value={node.when} />
            <Signal label="where" value={node.where} />
            <Signal label="condition" value={node.condition} />
            {node.tags.map(t => (
              <span key={t} className="inline-flex rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">{t}</span>
            ))}
            {node.blocked_flags.map(f => (
              <span key={f} className="inline-flex rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] text-destructive">⚠ {f}</span>
            ))}
          </div>

          {/* Verification */}
          {verification && verification.assertion_detected && (
            <div className="rounded bg-secondary/50 px-2 py-1.5 text-[11px]">
              <span className="font-medium text-muted-foreground">Assertion: </span>
              <span className="text-foreground">{verification.assertion_type}</span>
              <span className="text-muted-foreground"> → </span>
              <span className="text-foreground">{verification.expected_record_systems.join(", ")}</span>
            </div>
          )}

          {/* Normalized text */}
          <div className="text-[11px] text-muted-foreground">
            <span className="font-medium">Normalized: </span>{node.normalized_text}
          </div>
        </div>
      )}
    </div>
  );
}

function NodeViewer({ data }: { data: PipelineResponse }) {
  const allNodes = data.structure.nodes;
  const selectedIds = new Set(data.selection.selected_nodes.map(n => n.node_id));
  const verificationMap = new Map(data.verification.node_results.map(v => [v.node_id, v]));

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-medium text-muted-foreground">
          {allNodes.length} nodes · {data.selection.selected_nodes.length} selected · {data.selection.excluded_nodes.length} excluded
        </span>
      </div>
      {allNodes.map(node => (
        <NodeRow
          key={node.node_id}
          node={node}
          status={selectedIds.has(node.node_id) ? "selected" : "excluded"}
          verification={verificationMap.get(node.node_id)}
        />
      ))}
    </div>
  );
}

function LayerSection({ label, color, data, defaultOpen, children }: {
  label: string; color: string; data: unknown; defaultOpen?: boolean; children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  const [showRaw, setShowRaw] = useState(false);

  return (
    <div className="rounded-md border border-border overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-foreground hover:bg-accent/50 transition-colors"
      >
        <span className={`h-2 w-2 rounded-full ${color}`} />
        <span className="flex-1">{label}</span>
        <span className="text-xs text-muted-foreground">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="border-t border-border">
          {children && !showRaw ? (
            <div className="p-3">
              {children}
              <button
                type="button"
                onClick={() => setShowRaw(true)}
                className="mt-2 text-[10px] text-muted-foreground hover:text-foreground underline"
              >
                Show raw JSON
              </button>
            </div>
          ) : (
            <div>
              <pre className="max-h-80 overflow-auto bg-secondary/50 p-3 text-xs font-mono text-foreground">
                {JSON.stringify(data, null, 2)}
              </pre>
              {children && (
                <button
                  type="button"
                  onClick={() => setShowRaw(false)}
                  className="px-3 py-1 text-[10px] text-muted-foreground hover:text-foreground underline"
                >
                  Show structured view
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ResultsPanel({ data }: { data: PipelineResponse }) {
  const outputData = data.output as { meaning_status?: string; origin_status?: string; verification_status?: string };

  return (
    <div className="space-y-3">
      {/* Summary bar */}
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="rounded bg-secondary px-2 py-1 text-secondary-foreground">
          Nodes: {data.structure.node_count}
        </span>
        <span className="rounded bg-secondary px-2 py-1 text-secondary-foreground">
          Selected: {data.selection.selected_nodes.length}
        </span>
        <span className="rounded bg-secondary px-2 py-1 text-secondary-foreground">
          Excluded: {data.selection.excluded_nodes.length}
        </span>
        <span className="rounded bg-secondary px-2 py-1 text-secondary-foreground">
          Meaning: {outputData.meaning_status ?? "—"}
        </span>
        <span className="rounded bg-secondary px-2 py-1 text-secondary-foreground">
          Origin: {outputData.origin_status ?? "—"}
        </span>
        <span className="rounded bg-secondary px-2 py-1 text-secondary-foreground">
          Verification: {outputData.verification_status ?? "—"}
        </span>
      </div>

      {/* Errors */}
      {data.errors.length > 0 && (
        <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
          <strong>Errors:</strong>
          <ul className="mt-1 list-inside list-disc text-xs">
            {data.errors.map((e, i) => (
              <li key={i}>{String(e.layer)}: {String(e.error)}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Node viewer — combines Structure + Selection + Verification */}
      <div className="rounded-md border border-border overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-foreground bg-accent/20">
          <span className="h-2 w-2 rounded-full bg-chart-2" />
          <span>Nodes</span>
          <span className="text-xs text-muted-foreground">(Structure · Selection · Verification)</span>
        </div>
        <div className="border-t border-border p-3">
          <NodeViewer data={data} />
        </div>
      </div>

      {/* Individual layer sections */}
      {LAYERS.map((layer) => (
        <LayerSection
          key={layer.key}
          label={layer.label}
          color={layer.color}
          data={data[layer.key as keyof PipelineResponse]}
        />
      ))}
    </div>
  );
}
