import { useState } from "react";

// ─── Data interfaces (unchanged from pipeline contract) ───

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

interface OriginSignal {
  signal: string;
  value: string;
  category: string | null;
}

interface OriginData {
  status: string;
  origin_identity_signals: OriginSignal[];
  origin_metadata_signals: OriginSignal[];
  distribution_signals: OriginSignal[];
  evidence_trace: unknown[];
}

export interface PipelineResponse {
  input: Record<string, unknown>;
  structure: { nodes: StructureNode[]; node_count: number };
  selection: { selected_nodes: StructureNode[]; excluded_nodes: StructureNode[]; selection_log: string[] };
  meaning: Record<string, unknown>;
  origin: OriginData;
  verification: { status: string; node_results: VerificationNode[] };
  output: Record<string, unknown>;
  errors: Array<Record<string, unknown>>;
}

// ─── Field helpers ───

function FieldRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-baseline gap-3 py-1.5 border-b border-border/50 last:border-0">
      <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider w-24 shrink-0">{label}</span>
      <span className="text-sm text-foreground">{value || "Not specified"}</span>
    </div>
  );
}

function FieldGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="text-[10px] font-semibold text-gold-muted uppercase tracking-widest mb-2">{title}</div>
      <div className="rounded-md bg-surface p-3 border border-border/50">
        {children}
      </div>
    </div>
  );
}

function TagPill({ children, variant = "default" }: { children: React.ReactNode; variant?: "default" | "destructive" | "gold" }) {
  const colors = {
    default: "bg-secondary text-secondary-foreground",
    destructive: "bg-destructive/20 text-destructive",
    gold: "bg-gold/15 text-gold",
  };
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-[10px] font-medium ${colors[variant]}`}>
      {children}
    </span>
  );
}

// ─── Detail tabs ───

type DetailTab = "structure" | "text" | "signals";

function StructureTab({ node }: { node: StructureNode }) {
  const hasActors = node.actor || node.who;
  const hasActions = node.action || node.what || node.how;
  const hasTiming = node.when || node.temporal;
  const hasJurisdiction = node.jurisdiction || node.where;
  const hasMechanism = node.mechanism || node.condition;
  const hasTags = node.tags.length > 0;
  const hasBlocked = node.blocked_flags.length > 0;

  return (
    <div className="space-y-1">
      {(hasActors || true) && (
        <FieldGroup title="Actors">
          <FieldRow label="Actor" value={node.actor} />
          <FieldRow label="Who" value={node.who} />
        </FieldGroup>
      )}
      {(hasActions || true) && (
        <FieldGroup title="Actions">
          <FieldRow label="Action" value={node.action} />
          <FieldRow label="What" value={node.what} />
          <FieldRow label="How" value={node.how} />
          <FieldRow label="Why" value={node.why} />
        </FieldGroup>
      )}
      <FieldGroup title="Timing">
        <FieldRow label="When" value={node.when} />
        <FieldRow label="Temporal" value={node.temporal} />
      </FieldGroup>
      <FieldGroup title="Jurisdiction">
        <FieldRow label="Jurisdiction" value={node.jurisdiction} />
        <FieldRow label="Where" value={node.where} />
      </FieldGroup>
      <FieldGroup title="Mechanism">
        <FieldRow label="Mechanism" value={node.mechanism} />
        <FieldRow label="Condition" value={node.condition} />
      </FieldGroup>
      {(hasTags || hasBlocked) && (
        <FieldGroup title="Tags & Flags">
          <div className="flex flex-wrap gap-1.5">
            {node.tags.map(t => <TagPill key={t} variant="gold">{t}</TagPill>)}
            {node.blocked_flags.map(f => <TagPill key={f} variant="destructive">⚠ {f}</TagPill>)}
            {!hasTags && !hasBlocked && <span className="text-xs text-muted-foreground">None</span>}
          </div>
        </FieldGroup>
      )}
    </div>
  );
}

function TextTab({ node }: { node: StructureNode }) {
  return (
    <div className="space-y-4">
      <div>
        <div className="text-[10px] font-semibold text-gold-muted uppercase tracking-widest mb-2">Source Text</div>
        <div className="rounded-md bg-surface border border-border/50 p-4 text-sm text-foreground leading-relaxed font-mono whitespace-pre-wrap">
          {node.source_text}
        </div>
      </div>
      <div>
        <div className="text-[10px] font-semibold text-gold-muted uppercase tracking-widest mb-2">Normalized Text</div>
        <div className="rounded-md bg-surface border border-border/50 p-4 text-sm text-muted-foreground leading-relaxed">
          {node.normalized_text}
        </div>
      </div>
    </div>
  );
}

function SignalsTab({ node, verification, selectionStatus }: {
  node: StructureNode;
  verification?: VerificationNode;
  selectionStatus: "selected" | "excluded";
}) {
  return (
    <div className="space-y-4">
      <FieldGroup title="Selection">
        <div className="flex items-center gap-2">
          <TagPill variant={selectionStatus === "selected" ? "gold" : "destructive"}>
            {selectionStatus.toUpperCase()}
          </TagPill>
        </div>
      </FieldGroup>

      {verification && (
        <FieldGroup title="Verification">
          <FieldRow label="Assertion" value={verification.assertion_detected ? "Detected" : "Not detected"} />
          <FieldRow label="Type" value={verification.assertion_type} />
          <FieldRow label="Path" value={verification.verification_path_available ? "Available" : "Not available"} />
          {verification.expected_record_systems.length > 0 && (
            <div className="pt-2">
              <span className="text-[11px] text-muted-foreground uppercase tracking-wider">Expected Record Systems</span>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {verification.expected_record_systems.map(s => <TagPill key={s}>{s}</TagPill>)}
              </div>
            </div>
          )}
          <div className="pt-2">
            <span className="text-[11px] text-muted-foreground uppercase tracking-wider">Notes</span>
            <div className="text-xs text-foreground mt-1">{verification.verification_notes}</div>
          </div>
        </FieldGroup>
      )}

      {node.tags.length > 0 && (
        <FieldGroup title="Tags">
          <div className="flex flex-wrap gap-1.5">
            {node.tags.map(t => <TagPill key={t} variant="gold">{t}</TagPill>)}
          </div>
        </FieldGroup>
      )}

      {node.blocked_flags.length > 0 && (
        <FieldGroup title="Blocked Flags">
          <div className="flex flex-wrap gap-1.5">
            {node.blocked_flags.map(f => <TagPill key={f} variant="destructive">⚠ {f}</TagPill>)}
          </div>
        </FieldGroup>
      )}
    </div>
  );
}

// ─── Origin panel ───

function OriginPanel({ origin }: { origin: OriginData }) {
  const total = origin.origin_identity_signals.length + origin.origin_metadata_signals.length + origin.distribution_signals.length;

  if (origin.status === "skipped") {
    return <div className="text-xs text-muted-foreground italic p-4">Origin analysis was skipped.</div>;
  }
  if (total === 0) {
    return <div className="text-xs text-muted-foreground italic p-4">No origin signals detected.</div>;
  }

  const renderGroup = (title: string, icon: string, signals: OriginSignal[]) => {
    if (signals.length === 0) return null;
    return (
      <FieldGroup title={`${icon} ${title}`}>
        {signals.map((sig, i) => (
          <div key={`${sig.signal}-${i}`} className="flex items-center gap-2 py-1.5 border-b border-border/50 last:border-0">
            <span className="text-[11px] font-mono font-medium text-muted-foreground w-28 shrink-0">{sig.signal}</span>
            <span className="text-sm text-foreground flex-1 truncate">{sig.value}</span>
            {sig.category && <TagPill>{sig.category}</TagPill>}
          </div>
        ))}
      </FieldGroup>
    );
  };

  return (
    <div className="space-y-1">
      <div className="text-xs text-muted-foreground mb-3">{total} signal{total !== 1 ? "s" : ""} extracted</div>
      {renderGroup("Identity", "👤", origin.origin_identity_signals)}
      {renderGroup("Metadata", "📄", origin.origin_metadata_signals)}
      {renderGroup("Distribution", "🌐", origin.distribution_signals)}
    </div>
  );
}

// ─── Debug JSON toggle ───

function DebugJson({ data }: { data: unknown }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t border-border/50 mt-4 pt-3">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="text-[10px] text-muted-foreground hover:text-foreground transition-colors uppercase tracking-widest"
      >
        {open ? "Hide" : "Show"} raw JSON
      </button>
      {open && (
        <pre className="mt-2 max-h-60 overflow-auto rounded bg-surface p-3 text-[11px] font-mono text-muted-foreground">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}

// ─── Main workspace ───

export function Workspace({ data }: { data: PipelineResponse }) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(
    data.structure.nodes.length > 0 ? data.structure.nodes[0].node_id : null
  );
  const [activeTab, setActiveTab] = useState<DetailTab>("structure");
  const [showOrigin, setShowOrigin] = useState(false);

  const allNodes = data.structure.nodes;
  const selectedIds = new Set(data.selection.selected_nodes.map(n => n.node_id));
  const verificationMap = new Map(data.verification.node_results.map(v => [v.node_id, v]));
  const currentNode = allNodes.find(n => n.node_id === selectedNodeId) || null;
  const outputData = data.output as Record<string, unknown>;

  const tabs: { key: DetailTab; label: string }[] = [
    { key: "structure", label: "Structure" },
    { key: "text", label: "Text" },
    { key: "signals", label: "Signals" },
  ];

  return (
    <div className="flex flex-col md:h-full">
      {/* Summary bar */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 border-b border-border bg-surface text-[11px]">
        <span className="text-muted-foreground">
          <span className="text-foreground font-medium">{data.structure.node_count}</span> nodes
        </span>
        <span className="text-border">·</span>
        <span className="text-muted-foreground">
          <span className="text-foreground font-medium">{data.selection.selected_nodes.length}</span> selected
        </span>
        <span className="text-border">·</span>
        <span className="text-muted-foreground">
          <span className="text-foreground font-medium">{data.selection.excluded_nodes.length}</span> excluded
        </span>
        <div className="flex-1" />
        <span className="text-muted-foreground">
          Origin: <span className="text-foreground">{String(outputData.origin_status ?? "—")}</span>
        </span>
        <span className="text-muted-foreground">
          Verification: <span className="text-foreground">{String(outputData.verification_status ?? "—")}</span>
        </span>
      </div>

      {/* Errors */}
      {data.errors.length > 0 && (
        <div className="mx-4 mt-3 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          <strong>Errors:</strong>
          <ul className="mt-1 list-inside list-disc text-xs">
            {data.errors.map((e, i) => (
              <li key={i}>{String(e.layer)}: {String(e.error)}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Desktop: side-by-side | Mobile: stacked */}
      <div className="flex-1 flex flex-col md:flex-row md:overflow-hidden">

        {/* Left: Structure tree */}
        <div className="md:w-72 lg:w-80 border-b md:border-b-0 md:border-r border-border bg-surface/50 md:overflow-y-auto shrink-0">
          <div className="px-3 py-2 border-b border-border/50">
            <span className="text-[10px] font-semibold text-gold-muted uppercase tracking-widest">Structure</span>
          </div>
          <div className="p-1.5 space-y-0.5">
            {allNodes.map((node, idx) => {
              const isSelected = node.node_id === selectedNodeId;
              const isBlockedNode = node.blocked_flags.length > 0;
              const isPipelineSelected = selectedIds.has(node.node_id);
              return (
                <button
                  key={node.node_id}
                  type="button"
                  onClick={() => { setSelectedNodeId(node.node_id); setShowOrigin(false); }}
                  className={`w-full text-left rounded-md px-3 py-2 transition-colors group ${
                    isSelected
                      ? "bg-gold/10 border border-gold/30"
                      : "hover:bg-surface-raised border border-transparent"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-mono ${isSelected ? "text-gold" : "text-muted-foreground"}`}>
                      {String(idx + 1).padStart(2, "0")}
                    </span>
                    <span className={`flex-1 text-xs leading-snug line-clamp-2 ${
                      isSelected ? "text-foreground" : "text-secondary-foreground"
                    }`}>
                      {node.source_text.slice(0, 80)}{node.source_text.length > 80 ? "…" : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 mt-1 ml-6">
                    {isBlockedNode && (
                      <span className="text-[9px] text-destructive font-medium">BLOCKED</span>
                    )}
                    {!isBlockedNode && isPipelineSelected && (
                      <span className="text-[9px] text-gold-muted font-medium">SELECTED</span>
                    )}
                    {!isBlockedNode && !isPipelineSelected && (
                      <span className="text-[9px] text-muted-foreground">EXCLUDED</span>
                    )}
                    {node.tags.slice(0, 2).map(t => (
                      <span key={t} className="text-[9px] text-muted-foreground bg-secondary rounded px-1">{t}</span>
                    ))}
                  </div>
                </button>
              );
            })}

            {/* Origin row */}
            <button
              type="button"
              onClick={() => { setSelectedNodeId(null); setShowOrigin(true); }}
              className={`w-full text-left rounded-md px-3 py-2 mt-2 transition-colors border ${
                showOrigin
                  ? "bg-gold/10 border-gold/30"
                  : "hover:bg-surface-raised border-transparent"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className={`text-[10px] ${showOrigin ? "text-gold" : "text-muted-foreground"}`}>◎</span>
                <span className={`text-xs font-medium ${showOrigin ? "text-foreground" : "text-secondary-foreground"}`}>
                  Origin Signals
                </span>
                <span className="text-[9px] text-muted-foreground ml-auto">
                  {data.origin.origin_identity_signals.length +
                    data.origin.origin_metadata_signals.length +
                    data.origin.distribution_signals.length} signals
                </span>
              </div>
            </button>
          </div>
        </div>

        {/* Right: Detail panel */}
        <div className="flex-1 flex flex-col md:overflow-hidden">
          {showOrigin ? (
            <div className="p-4 md:flex-1 md:overflow-y-auto">
              <div className="text-sm font-medium text-foreground mb-4">Origin Signals</div>
              <OriginPanel origin={data.origin} />
              <DebugJson data={data.origin} />
            </div>
          ) : currentNode ? (
            <>
              {/* Tabs */}
              <div className="flex border-b border-border bg-surface/30 sticky top-0 z-10 md:static">
                {tabs.map(tab => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key)}
                    className={`px-4 py-2.5 text-xs font-medium transition-colors relative ${
                      activeTab === tab.key
                        ? "text-gold"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {tab.label}
                    {activeTab === tab.key && (
                      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gold rounded-t" />
                    )}
                  </button>
                ))}
                <div className="flex-1" />
                <div className="flex items-center pr-3">
                  <span className="text-[10px] font-mono text-muted-foreground">{currentNode.node_id}</span>
                </div>
              </div>

              {/* Tab content */}
              <div className="p-4 pb-8 md:flex-1 md:overflow-y-auto">
                {activeTab === "structure" && <StructureTab node={currentNode} />}
                {activeTab === "text" && <TextTab node={currentNode} />}
                {activeTab === "signals" && (
                  <SignalsTab
                    node={currentNode}
                    verification={verificationMap.get(currentNode.node_id)}
                    selectionStatus={selectedIds.has(currentNode.node_id) ? "selected" : "excluded"}
                  />
                )}
                <DebugJson data={currentNode} />
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
              Select a node to inspect
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
