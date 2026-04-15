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

interface MeaningLens {
  lens: string;
  detected: boolean;
  detail: string | null;
}

interface MeaningNodeResult {
  node_id: string;
  source_text?: string;
  summary?: string;
  lenses: (MeaningLens | string)[];
}

interface MeaningData {
  status: string;
  message: string | null;
  node_results?: MeaningNodeResult[];
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
  meaning: MeaningData;
  origin: OriginData;
  verification: { status: string; node_results: VerificationNode[] };
  output: Record<string, unknown>;
  errors: Array<Record<string, unknown>>;
}

// ─── Field helpers ───

function FieldRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-baseline gap-3 py-2 md:py-1.5 border-b border-border/50 last:border-0">
      <span className="text-xs md:text-[11px] font-medium text-muted-foreground uppercase tracking-wider w-28 md:w-24 shrink-0">{label}</span>
      <span className="text-[15px] md:text-sm text-foreground leading-snug">{value || "Not specified"}</span>
    </div>
  );
}

function FieldGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6 md:mb-4">
      <div className="text-xs md:text-[10px] font-semibold text-gold-muted uppercase tracking-widest mb-2.5 md:mb-2">{title}</div>
      <div className="rounded-lg md:rounded-md bg-surface p-4 md:p-3 border border-border/50">
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

type DetailTab = "structure" | "text" | "meaning" | "signals";

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

// ─── Meaning tab ───

function MeaningTab({ node, meaning }: { node: StructureNode; meaning: MeaningData }) {
  if (!meaning) {
    return (
      <div className="text-sm text-muted-foreground italic">
        No meaning data returned for this node.
      </div>
    );
  }

  if (meaning.status === "skipped") {
    return (
      <div className="text-sm text-muted-foreground italic">
        {meaning.message || "Meaning analysis was skipped."}
      </div>
    );
  }
  if (meaning.status === "error") {
    return (
      <div className="text-sm text-destructive">
        {meaning.message || "Meaning analysis encountered an error."}
      </div>
    );
  }

  if (!meaning.node_results || meaning.node_results.length === 0) {
    return (
      <div className="text-sm text-muted-foreground italic">
        {meaning.status === "executed"
          ? "Meaning executed but returned no interpretable results."
          : "No meaning data returned for this node."}
      </div>
    );
  }

  const nodeResult = meaning.node_results.find(r => r.node_id === node.node_id);

  if (!nodeResult) {
    return (
      <div className="text-sm text-muted-foreground italic">
        Meaning data could not be mapped to this node.
      </div>
    );
  }

  const rawLenses = Array.isArray(nodeResult.lenses) ? nodeResult.lenses : [];

  const normalizedLenses: MeaningLens[] = rawLenses
    .filter((l): l is string | MeaningLens => l != null)
    .map(l =>
      typeof l === "string" ? { lens: l, detected: true, detail: null } : l
    );

  const detected = normalizedLenses.filter(l => l.detected);
  const notDetected = normalizedLenses.filter(l => !l.detected);

  const hasLenses = detected.length > 0 || notDetected.length > 0;
  const hasSummary = typeof nodeResult.summary === "string" && nodeResult.summary.trim().length > 0;

  if (!hasLenses && !hasSummary) {
    return (
      <div className="text-sm text-muted-foreground italic">
        Meaning executed but returned no interpretable results.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {detected.length > 0 && (
        <FieldGroup title="Detected Lenses">
          {detected.map(lens => (
            <div key={lens.lens} className="py-2 border-b border-border/50 last:border-0">
              <div className="flex items-center gap-2 mb-1">
                <TagPill variant="gold">{lens.lens}</TagPill>
              </div>
              {lens.detail && (
                <div className="text-sm text-foreground leading-relaxed ml-0.5 mt-1">{lens.detail}</div>
              )}
            </div>
          ))}
        </FieldGroup>
      )}
      {notDetected.length > 0 && (
        <FieldGroup title="Not Detected">
          <div className="flex flex-wrap gap-1.5">
            {notDetected.map(lens => (
              <TagPill key={lens.lens}>{lens.lens}</TagPill>
            ))}
          </div>
        </FieldGroup>
      )}
      {hasSummary && (
        <FieldGroup title="Summary">
          <div className="text-sm text-foreground leading-relaxed">{nodeResult.summary}</div>
        </FieldGroup>
      )}
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

  const TAB_TEST_IDS: Record<string, string> = {
    structure: "tab-structure",
    text: "tab-text",
    meaning: "tab-meaning",
    signals: "tab-verification",
    origin: "tab-origin",
  };

  const tabs: { key: DetailTab; label: string }[] = [
    { key: "structure", label: "Structure" },
    { key: "text", label: "Text" },
    { key: "meaning", label: "Meaning" },
    { key: "signals", label: "Verification" },
  ];

  type TopTab = "structure" | "text" | "meaning" | "signals" | "origin";

  const topTabs: { key: TopTab; label: string }[] = [
    { key: "structure", label: "Structure" },
    { key: "text", label: "Text" },
    { key: "meaning", label: "Meaning" },
    { key: "signals", label: "Verification" },
    { key: "origin", label: "Origin" },
  ];

  const [mobileTab, setMobileTab] = useState<TopTab>("structure");

  // Node list used in both mobile Structure tab and desktop left panel
  const nodeList = (
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
    </div>
  );

  // Detail content for a selected node given a detail tab
  const renderNodeDetail = (tab: DetailTab) => {
    if (!currentNode) {
      return (
        <div className="px-5 py-12 md:p-8 text-center text-sm text-muted-foreground">
          Select a node in the Structure tab first
        </div>
      );
    }
    return (
      <div className="px-5 py-6 pb-12 md:p-4 md:pb-8">
        <div className="flex items-center gap-2 mb-5 md:mb-4">
          <span className="text-[11px] md:text-[10px] font-mono text-muted-foreground">{currentNode.node_id}</span>
        </div>
        {tab === "structure" && <StructureTab node={currentNode} />}
        {tab === "text" && <TextTab node={currentNode} />}
        {tab === "meaning" && <MeaningTab node={currentNode} meaning={data.meaning} />}
        {tab === "signals" && (
          <SignalsTab
            node={currentNode}
            verification={verificationMap.get(currentNode.node_id)}
            selectionStatus={selectedIds.has(currentNode.node_id) ? "selected" : "excluded"}
          />
        )}
        <DebugJson data={currentNode} />
      </div>
    );
  };

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
          Meaning: <span className={`font-medium ${outputData.meaning_status === "executed" ? "text-primary" : outputData.meaning_status === "error" ? "text-destructive" : "text-foreground"}`}>{String(outputData.meaning_status ?? "—")}</span>
        </span>
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

      {/* ─── MOBILE: top-level tabs replace entire content ─── */}
      <div className="md:hidden">
        {/* Tab bar */}
        <div role="tablist" aria-label="Analysis tabs" className="flex border-b-2 border-border bg-surface/50 shadow-sm">
          {topTabs.map(tab => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              id={`mobile-${TAB_TEST_IDS[tab.key]}`}
              aria-selected={mobileTab === tab.key}
              aria-controls={`mobile-tabpanel-${tab.key}`}
              data-testid={TAB_TEST_IDS[tab.key]}
              onClick={() => setMobileTab(tab.key)}
              className={`flex-1 px-2 py-3 text-sm font-medium transition-colors relative ${
                mobileTab === tab.key
                  ? "text-gold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
              {mobileTab === tab.key && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gold rounded-t" />
              )}
            </button>
          ))}
        </div>

        {/* Tab content — full page, no inner scroll */}
        <div role="tabpanel" id={`mobile-tabpanel-${mobileTab}`} aria-labelledby={`mobile-${TAB_TEST_IDS[mobileTab]}`} data-testid={`tabpanel-${mobileTab}`}>
        {mobileTab === "structure" && nodeList}
        {mobileTab === "text" && renderNodeDetail("text")}
        {mobileTab === "meaning" && renderNodeDetail("meaning")}
        {mobileTab === "signals" && renderNodeDetail("signals")}
        {mobileTab === "origin" && (
          <div className="px-5 py-6 pb-12">
            <div className="text-base font-medium text-foreground mb-5">Origin Signals</div>
            <OriginPanel origin={data.origin} />
            <DebugJson data={data.origin} />
          </div>
        )}
        </div>
      </div>

      {/* ─── DESKTOP: side-by-side layout ─── */}
      <div className="hidden md:flex flex-1 flex-row overflow-hidden">
        {/* Left: Structure tree */}
        <div className="w-72 lg:w-80 border-r border-border bg-surface/50 overflow-y-auto shrink-0">
          <div className="px-3 py-2 border-b border-border/50">
            <span className="text-[10px] font-semibold text-gold-muted uppercase tracking-widest">Structure</span>
          </div>
          {nodeList}

          {/* Origin row */}
          <div className="p-1.5">
            <button
              type="button"
              onClick={() => { setSelectedNodeId(null); setShowOrigin(true); }}
              className={`w-full text-left rounded-md px-3 py-2 mt-1 transition-colors border ${
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
        <div className="flex-1 flex flex-col overflow-hidden">
          {showOrigin ? (
            <div className="p-4 flex-1 overflow-y-auto">
              <div className="text-sm font-medium text-foreground mb-4">Origin Signals</div>
              <OriginPanel origin={data.origin} />
              <DebugJson data={data.origin} />
            </div>
          ) : currentNode ? (
            <>
              {/* Desktop detail tabs */}
              <div role="tablist" aria-label="Node detail tabs" className="flex border-b border-border bg-surface/30">
                {tabs.map(tab => (
                  <button
                    key={tab.key}
                    type="button"
                    role="tab"
                    id={`desktop-${TAB_TEST_IDS[tab.key]}`}
                    aria-selected={activeTab === tab.key}
                    aria-controls={`desktop-tabpanel-${tab.key}`}
                    data-testid={TAB_TEST_IDS[tab.key]}
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
              <div role="tabpanel" id={`desktop-tabpanel-${activeTab}`} aria-labelledby={`desktop-${TAB_TEST_IDS[activeTab]}`} data-testid={`tabpanel-${activeTab}`} className="p-4 pb-8 flex-1 overflow-y-auto">
                {activeTab === "structure" && <StructureTab node={currentNode} />}
                {activeTab === "text" && <TextTab node={currentNode} />}
                {activeTab === "meaning" && <MeaningTab node={currentNode} meaning={data.meaning} />}
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
