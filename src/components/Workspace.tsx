import { useEffect, useMemo, useState, type ReactNode } from "react";

interface StructureNode {
  node_id: string;
  source_anchor: string;
  source_text: string;
  normalized_text: string;
  actor: string | null;
  action: string | null;
  condition: string | null;
  temporal: string | null;
  jurisdiction: string | null;
  mechanism: string | null;
  risk: { likelihood?: string | null; impact?: string | null } | null;
  tags: string[];
  blocked_flags: string[];
  who: string | null;
  what: string | null;
  when: string | null;
  where: string | null;
  why: string | null;
  how: string | null;
}

interface MeaningNodeResult {
  node_id: string;
  status: "success" | "error" | "empty";
  plain_meaning: string | null;
  structured: {
    actors: string[];
    actions: string[];
    object: string | null;
    temporal: string | null;
    jurisdiction: string | null;
  } | null;
  reason?: string | null;
}

interface MeaningData {
  status: string;
  message: string | null;
  node_results: MeaningNodeResult[];
}

interface VerificationNode {
  node_id: string;
  assertion_detected: boolean;
  assertion_type: string | null;
  verification_path_available: boolean;
  expected_record_systems: string[];
  verification_notes: string | null;
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
  input: {
    raw_content: string;
    content_type: string;
    size: number;
    parse_status: string;
    parse_errors: string[];
  };
  structure: { nodes: StructureNode[]; node_count: number };
  selection: {
    selected_nodes: StructureNode[];
    excluded_nodes: StructureNode[];
    selection_log: string[];
  };
  meaning: MeaningData;
  origin: OriginData;
  verification: { status: string; node_results: VerificationNode[] };
  output: {
    total_nodes: number;
    selected_count: number;
    excluded_count: number;
    meaning_status: string;
    origin_status: string;
    verification_status: string;
  };
  errors: Array<{ layer: string; error: string; fatal?: boolean }>;
}

type DetailTab = "meaning" | "verification" | "origin";

function FieldRow({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="flex items-start gap-3 py-2 border-b border-border/50 last:border-0">
      <span className="w-28 shrink-0 text-[11px] uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      <span className="text-sm leading-relaxed text-foreground">
        {value || "Not specified"}
      </span>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="mb-5">
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-gold-muted">
        {title}
      </div>
      <div className="rounded-2xl border border-border/60 bg-surface p-4 md:rounded-xl md:p-3">
        {children}
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return <div className="text-sm italic text-muted-foreground">{message}</div>;
}

function OriginSignalList({ signals }: { signals: OriginSignal[] }) {
  if (signals.length === 0) {
    return <EmptyState message="No origin signals in this section." />;
  }

  return (
    <div>
      {signals.map((signal, index) => (
        <FieldRow
          key={`${signal.signal}-${signal.value}-${index}`}
          label={signal.signal}
          value={signal.category ? `${signal.value} (${signal.category})` : signal.value}
        />
      ))}
    </div>
  );
}

function MeaningSummary({
  meaning,
  isSelectedNode,
}: {
  meaning: MeaningNodeResult | undefined;
  isSelectedNode: boolean;
}) {
  if (!isSelectedNode) {
    return <EmptyState message="Excluded from Meaning." />;
  }

  if (!meaning) {
    return <EmptyState message="No Meaning data for this node." />;
  }

  if (meaning.status === "success") {
    return (
      <div className="space-y-2">
        <div className="text-sm leading-relaxed text-foreground">
          {meaning.plain_meaning}
        </div>
        {meaning.structured && (
          <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
            {meaning.structured.actors.length > 0 && (
              <span className="rounded bg-secondary px-2.5 py-1">
                Actors: {meaning.structured.actors.join(", ")}
              </span>
            )}
            {meaning.structured.actions.length > 0 && (
              <span className="rounded bg-secondary px-2.5 py-1">
                Actions: {meaning.structured.actions.join(", ")}
              </span>
            )}
            {meaning.structured.object && (
              <span className="rounded bg-secondary px-2.5 py-1">
                Object: {meaning.structured.object}
              </span>
            )}
            {meaning.structured.temporal && (
              <span className="rounded bg-secondary px-2.5 py-1">
                Temporal: {meaning.structured.temporal}
              </span>
            )}
            {meaning.structured.jurisdiction && (
              <span className="rounded bg-secondary px-2.5 py-1">
                Jurisdiction: {meaning.structured.jurisdiction}
              </span>
            )}
          </div>
        )}
      </div>
    );
  }

  return <EmptyState message={meaning.reason || "Meaning unavailable for this node."} />;
}

export function Workspace({ data }: { data: PipelineResponse }) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>("meaning");

  const selectedIds = useMemo(
    () => new Set(data.selection.selected_nodes.map((node) => node.node_id)),
    [data.selection.selected_nodes]
  );
  const meaningMap = useMemo(
    () => new Map(data.meaning.node_results.map((node) => [node.node_id, node])),
    [data.meaning.node_results]
  );
  const verificationMap = useMemo(
    () => new Map(data.verification.node_results.map((node) => [node.node_id, node])),
    [data.verification.node_results]
  );

  useEffect(() => {
    const preferredNodeId =
      data.selection.selected_nodes[0]?.node_id ??
      data.structure.nodes[0]?.node_id ??
      null;

    if (!preferredNodeId) {
      setSelectedNodeId(null);
      return;
    }

    const stillExists = data.structure.nodes.some(
      (node) => node.node_id === selectedNodeId
    );

    if (!selectedNodeId || !stillExists) {
      setSelectedNodeId(preferredNodeId);
    }
  }, [data.structure.nodes, data.selection.selected_nodes, selectedNodeId]);

  const currentNode =
    data.structure.nodes.find((node) => node.node_id === selectedNodeId) ?? null;
  const isSelectedNode = currentNode ? selectedIds.has(currentNode.node_id) : false;
  const currentMeaning = currentNode ? meaningMap.get(currentNode.node_id) : undefined;
  const currentVerification = currentNode
    ? verificationMap.get(currentNode.node_id)
    : undefined;

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-4 py-3 text-[11px] text-muted-foreground">
        <span>
          <span className="font-medium text-foreground">{data.structure.node_count}</span>{" "}
          nodes
        </span>
        <span className="text-border">·</span>
        <span>
          <span className="font-medium text-foreground">
            {data.selection.selected_nodes.length}
          </span>{" "}
          selected
        </span>
        <span className="text-border">·</span>
        <span>
          <span className="font-medium text-foreground">
            {data.selection.excluded_nodes.length}
          </span>{" "}
          excluded
        </span>
        <div className="hidden flex-1 md:block" />
        <span>
          Meaning:{" "}
          <span className="font-medium text-primary">{data.meaning.status}</span>
        </span>
        <span>
          Origin: <span className="font-medium text-foreground">{data.origin.status}</span>
        </span>
        <span>
          Verification:{" "}
          <span className="font-medium text-foreground">{data.verification.status}</span>
        </span>
      </div>

      {data.errors.length > 0 && (
        <div className="mx-4 mt-3 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          <strong>Errors</strong>
          <ul className="mt-1 list-inside list-disc text-xs">
            {data.errors.map((error, index) => (
              <li key={`${error.layer}-${index}`}>
                {error.layer}: {error.error}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex border-b border-border bg-surface/30">
        {(["meaning", "verification", "origin"] as DetailTab[]).map(
          (tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`relative flex-1 px-2 py-3 text-sm font-medium capitalize transition-colors md:flex-none md:px-5 ${
                activeTab === tab
                  ? "text-gold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab}
              {activeTab === tab && (
                <div className="absolute bottom-0 left-3 right-3 h-0.5 rounded-t bg-gold" />
              )}
            </button>
          )
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {activeTab === "meaning" && (
          <div className="space-y-1 p-4">
            {data.structure.nodes.map((node, index) => {
              const isActive = node.node_id === selectedNodeId;
              const isSelected = selectedIds.has(node.node_id);
              const nodeMeaning = meaningMap.get(node.node_id);

              return (
                <button
                  key={node.node_id}
                  type="button"
                  onClick={() => setSelectedNodeId(node.node_id)}
                  className={`flex w-full items-start gap-4 rounded-xl border px-4 py-4 text-left transition-colors ${
                    isActive
                      ? "border-gold/40 bg-gold/10"
                      : "border-transparent hover:bg-surface"
                  }`}
                >
                  <span
                    className={`pt-1 text-base font-medium ${
                      isActive ? "text-gold" : "text-muted-foreground"
                    }`}
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="line-clamp-3 text-lg font-semibold leading-snug text-foreground">
                      {node.source_text}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span
                        className={`rounded px-2.5 py-1 text-[11px] font-semibold ${
                          isSelected
                            ? "bg-gold/15 text-gold"
                            : "bg-secondary text-muted-foreground"
                        }`}
                      >
                        {isSelected ? "SELECTED" : "EXCLUDED"}
                      </span>
                      {node.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded bg-secondary px-2.5 py-1 text-[11px] text-muted-foreground"
                        >
                          {tag}
                        </span>
                      ))}
                      {node.blocked_flags.map((flag) => (
                        <span
                          key={flag}
                          className="rounded bg-destructive/15 px-2.5 py-1 text-[11px] text-destructive"
                        >
                          {flag}
                        </span>
                      ))}
                    </div>
                    <div className="mt-4 rounded-xl border border-border/60 bg-surface p-3">
                      <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-gold-muted">
                        Source Context
                      </div>
                      <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed text-foreground">
                        {node.source_text}
                      </pre>
                    </div>
                    <div className="mt-4 rounded-xl border border-border/60 bg-background/60 p-3">
                      {isSelected && nodeMeaning?.status === "success" ? (
                        <>
                          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-gold-muted">
                            Plain Meaning
                          </div>
                          <div className="text-sm leading-relaxed text-foreground">
                            {nodeMeaning.plain_meaning}
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-gold-muted">
                            Meaning
                          </div>
                          <MeaningSummary
                            meaning={nodeMeaning}
                            isSelectedNode={isSelected}
                          />
                        </>
                      )}
                    </div>
                    {isSelected && nodeMeaning?.status === "success" && (
                      <div className="mt-4 rounded-xl border border-border/60 bg-background/60 p-3">
                        <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-gold-muted">
                          Structured Meaning
                        </div>
                        <FieldRow
                          label="actors"
                          value={nodeMeaning.structured?.actors.join(", ")}
                        />
                        <FieldRow
                          label="actions"
                          value={nodeMeaning.structured?.actions.join(", ")}
                        />
                        <FieldRow
                          label="object"
                          value={nodeMeaning.structured?.object}
                        />
                        <FieldRow
                          label="temporal"
                          value={nodeMeaning.structured?.temporal}
                        />
                        <FieldRow
                          label="jurisdiction"
                          value={nodeMeaning.structured?.jurisdiction}
                        />
                      </div>
                    )}
                    {isSelected && !nodeMeaning && (
                      <div className="mt-4 rounded-xl border border-border/60 bg-background/60 p-3">
                        <EmptyState message="No Meaning data for this node." />
                      </div>
                    )}
                    {isSelected && nodeMeaning && nodeMeaning.status !== "success" && (
                      <div className="mt-4 rounded-xl border border-border/60 bg-background/60 p-3">
                        <EmptyState
                          message={nodeMeaning.reason || "Meaning unavailable for this node."}
                        />
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {activeTab === "verification" && (
          <div className="space-y-5 px-5 py-6 pb-12">
            <div className="text-sm font-mono text-muted-foreground">
              {currentNode?.node_id || "No node selected"}
            </div>

            {!currentNode ? (
              <EmptyState message="No data for this node." />
            ) : (
              <>
                <Section title="Selection">
                  <div className="flex flex-wrap gap-2">
                    <span
                      className={`rounded px-3 py-2 text-sm font-medium ${
                        isSelectedNode
                          ? "bg-gold/15 text-gold"
                          : "bg-secondary text-muted-foreground"
                      }`}
                    >
                      {isSelectedNode ? "SELECTED" : "EXCLUDED"}
                    </span>
                  </div>
                </Section>

                {!isSelectedNode ? (
                  <Section title="Verification">
                    <EmptyState message="This node is excluded. No Verification data for this node." />
                  </Section>
                ) : !currentVerification ? (
                  <Section title="Verification">
                    <EmptyState message="No Verification data for this node." />
                  </Section>
                ) : (
                  <>
                    <Section title="Verification">
                      <FieldRow
                        label="assertion"
                        value={
                          currentVerification.assertion_detected
                            ? "Detected"
                            : "Not detected"
                        }
                      />
                      <FieldRow label="type" value={currentVerification.assertion_type} />
                      <FieldRow
                        label="path"
                        value={
                          currentVerification.verification_path_available
                            ? "Available"
                            : "Unavailable"
                        }
                      />
                      <FieldRow
                        label="notes"
                        value={currentVerification.verification_notes}
                      />
                    </Section>

                    <Section title="Expected Record Systems">
                      {currentVerification.expected_record_systems.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {currentVerification.expected_record_systems.map((system) => (
                            <span
                              key={system}
                              className="rounded bg-secondary px-3 py-2 text-sm font-medium text-foreground"
                            >
                              {system}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <EmptyState message="No record systems for this node." />
                      )}
                    </Section>
                  </>
                )}

                <Section title="Tags">
                  {currentNode.tags.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {currentNode.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded bg-gold/15 px-3 py-2 text-sm font-medium text-gold"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <EmptyState message="No tags for this node." />
                  )}
                </Section>
              </>
            )}
          </div>
        )}

        {activeTab === "origin" && (
          <div className="space-y-5 px-5 py-6 pb-12">
            <div className="text-sm font-mono text-muted-foreground">
              document
            </div>
            <Section title="Origin Identity Signals">
              <OriginSignalList signals={data.origin.origin_identity_signals} />
            </Section>

            <Section title="Origin Metadata Signals">
              <OriginSignalList signals={data.origin.origin_metadata_signals} />
            </Section>

            <Section title="Distribution Signals">
              <OriginSignalList signals={data.origin.distribution_signals} />
            </Section>

            <Section title="Evidence Trace">
              {data.origin.evidence_trace.length > 0 ? (
                <pre className="overflow-auto whitespace-pre-wrap text-[11px] leading-relaxed text-muted-foreground">
                  {JSON.stringify(data.origin.evidence_trace, null, 2)}
                </pre>
              ) : (
                <EmptyState message="No evidence trace returned." />
              )}
            </Section>
          </div>
        )}
      </div>
    </div>
  );
}
