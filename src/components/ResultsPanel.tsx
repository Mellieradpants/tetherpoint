import { useState } from "react";

interface PipelineResponse {
  input: Record<string, unknown>;
  structure: Record<string, unknown>;
  selection: Record<string, unknown>;
  meaning: Record<string, unknown>;
  origin: Record<string, unknown>;
  verification: Record<string, unknown>;
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

function LayerSection({ label, color, data, defaultOpen }: { label: string; color: string; data: unknown; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen ?? false);
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
        <pre className="max-h-80 overflow-auto border-t border-border bg-secondary/50 p-3 text-xs font-mono text-foreground">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}

export function ResultsPanel({ data }: { data: PipelineResponse }) {
  const structureData = data.structure as { node_count?: number };
  const selectionData = data.selection as { selected_nodes?: unknown[]; excluded_nodes?: unknown[] };
  const outputData = data.output as { meaning_status?: string; origin_status?: string; verification_status?: string };

  return (
    <div className="space-y-3">
      {/* Summary bar */}
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="rounded bg-secondary px-2 py-1 text-secondary-foreground">
          Nodes: {structureData.node_count ?? 0}
        </span>
        <span className="rounded bg-secondary px-2 py-1 text-secondary-foreground">
          Selected: {selectionData.selected_nodes?.length ?? 0}
        </span>
        <span className="rounded bg-secondary px-2 py-1 text-secondary-foreground">
          Excluded: {selectionData.excluded_nodes?.length ?? 0}
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

      {/* Layer sections */}
      {LAYERS.map((layer) => (
        <LayerSection
          key={layer.key}
          label={layer.label}
          color={layer.color}
          data={data[layer.key as keyof PipelineResponse]}
          defaultOpen={layer.key === "structure" || layer.key === "verification"}
        />
      ))}
    </div>
  );
}
