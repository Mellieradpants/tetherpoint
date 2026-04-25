import { useEffect, useMemo, useState, type ReactNode } from "react";

interface StructureNode {
  node_id: string;
  section_id: string;
  parent_id: string | null;
  role:
    | "PRIMARY_RULE"
    | "EVIDENCE"
    | "CONDITION"
    | "EXCEPTION"
    | "CONSEQUENCE"
    | "DEFINITION"
    | "BOILERPLATE";
  depth: number;
  source_span_start: number | null;
  source_span_end: number | null;
  validation_status: "valid" | "repaired" | "invalid";
  validation_errors: string[];
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

interface MeaningLens {
  lens: string;
  detected: boolean;
  detail?: string | null;
}

interface MeaningScopeDetail {
  scope: string;
  detail?: string | null;
  evidence?: string | null;
}

interface MeaningNodeResult {
  node_id: string;
  source_text: string;
  status: string | null;
  error?: string | null;
  message?: string | null;
  raw_response?: string | null;
  lenses: MeaningLens[];
  detected_scopes?: string[];
  plain_meaning?: string | null;
  scope_details?: MeaningScopeDetail[];
  missing_information?: string[];
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

interface StructureValidationIssue {
  section_id: string;
  issue_type: string;
  message: string;
  node_id?: string | null;
}

interface VerificationRouteSummary {
  system: string;
  assertionTypes: string[];
  nodeIds: string[];
  evidence: string[];
}

export interface PipelineResponse {
  input: {
    raw_content: string;
    content_type: string;
    size: number;
    parse_status: string;
    parse_errors: string[];
  };
  structure: {
    nodes: StructureNode[];
    node_count: number;
    section_count: number;
    validation_report: {
      status: "clean" | "repaired" | "failed";
      issues: StructureValidationIssue[];
      repaired_sections: string[];
    };
  };
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
    <div className="flex items-start gap-3 border-b border-border/50 py-2 last:border-0">
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

  if (meaning.status === "executed") {
    const detectedScopes =
      meaning.detected_scopes && meaning.detected_scopes.length > 0
        ? meaning.detected_scopes
        : meaning.lenses.filter((lens) => lens.detected).map((lens) => lens.lens);
    const scopeDetails =
      meaning.scope_details && meaning.scope_details.length > 0
        ? meaning.scope_details
        : meaning.lenses
            .filter((lens) => lens.detected && lens.detail)
            .map((lens) => ({ scope: lens.lens, detail: lens.detail }));
    const missingInformation = meaning.missing_information || [];

    return (
      <div className="space-y-3">
        <div>
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-gold-muted">
            Detected Scopes
          </div>
          {detectedScopes.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {detectedScopes.map((scope) => (
                <span
                  key={`${meaning.node_id}-${scope}`}
                  className="rounded bg-secondary px-2.5 py-1 text-[11px] text-foreground"
                >
                  {scope}
                </span>
              ))}
            </div>
          ) : (
            <EmptyState message="No Meaning scopes detected for this node." />
          )}
        </div>

        <div>
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-gold-muted">
            Plain Meaning
          </div>
          {meaning.plain_meaning ? (
            <div className="text-sm leading-relaxed text-foreground">
              {meaning.plain_meaning}
            </div>
          ) : (
            <EmptyState message="Plain-language Meaning was not returned for this node." />
          )}
        </div>

        {scopeDetails.length > 0 && (
          <div>
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-gold-muted">
              Scope Details
            </div>
            <div className="space-y-2">
              {scopeDetails.map((detail) => (
                <div
                  key={`${meaning.node_id}-${detail.scope}`}
                  className="rounded border border-border/50 bg-background/40 p-2"
                >
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gold-muted">
                    {detail.scope}
                  </div>
                  {detail.detail && (
                    <div className="mt-1 text-sm leading-relaxed text-muted-foreground">
                      {detail.detail}
                    </div>
                  )}
                  {detail.evidence && (
                    <div className="mt-1 text-sm leading-relaxed text-foreground">
                      {detail.evidence}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {missingInformation.length > 0 && (
          <div>
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-gold-muted">
              Missing Information
            </div>
            <div className="space-y-1">
              {missingInformation.map((item) => (
                <div
                  key={`${meaning.node_id}-${item}`}
                  className="text-sm leading-relaxed text-muted-foreground"
                >
                  {item}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <EmptyState
      message={meaning.message || meaning.error || "Meaning unavailable for this node."}
    />
  );
}

export function Workspace({ data }: { data: PipelineResponse }) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>("meaning");

  const selectedIds = useMemo(
    () => new Set(data.selection.selected_nodes.map((node) => node.node_id)),
    [data.selection.selected_nodes]
  );
  const displayNodes = useMemo(
    () =>
      data.selection.selected_nodes.length > 0
        ? data.selection.selected_nodes
        : data.structure.nodes,
    [data.selection.selected_nodes, data.structure.nodes]
  );
  const displayNodeIds = useMemo(
    () => new Set(displayNodes.map((node) => node.node_id)),
    [displayNodes]
  );
  const meaningMap = useMemo(
    () => new Map(data.meaning.node_results.map((node) => [node.node_id, node])),
    [data.meaning.node_results]
  );
  const verificationSummary = useMemo(() => {
    const nodeById = new Map(data.structure.nodes.map((node) => [node.node_id, node]));
    const routes = new Map<string, { assertionTypes: Set<string>; nodeIds: Set<string>; evidence: string[] }>();
    const assertionTypes = new Set<string>();
    let detectedCount = 0;
    let routedCount = 0;

    for (const result of data.verification.node_results) {
      if (result.assertion_detected) {
        detectedCount += 1;
      }
      if (result.assertion_type) {
        assertionTypes.add(result.assertion_type);
      }
      if (result.expected_record_systems.length > 0) {
        routedCount += 1;
      }

      for (const system of result.expected_record_systems) {
        if (!routes.has(system)) {
          routes.set(system, {
            assertionTypes: new Set<string>(),
            nodeIds: new Set<string>(),
            evidence: [],
          });
        }

        const route = routes.get(system)!;
        route.nodeIds.add(result.node_id);
        if (result.assertion_type) {
          route.assertionTypes.add(result.assertion_type);
        }

        const nodeText = nodeById.get(result.node_id)?.source_text?.trim();
        if (nodeText && route.evidence.length < 3 && !route.evidence.includes(nodeText)) {
          route.evidence.push(nodeText);
        }
      }
    }

    return {
      detectedCount,
      routedCount,
      total: data.verification.node_results.length,
      assertionTypes: Array.from(assertionTypes),
      routes: Array.from(routes.entries()).map(([system, route]): VerificationRouteSummary => ({
        system,
        assertionTypes: Array.from(route.assertionTypes),
        nodeIds: Array.from(route.nodeIds),
        evidence: route.evidence,
      })),
    };
  }, [data.structure.nodes, data.verification.node_results]);

  useEffect(() => {
    const preferredNodeId = displayNodes[0]?.node_id ?? null;

    if (!preferredNodeId) {
      setSelectedNodeId(null);
      return;
    }

    const stillVisible = displayNodeIds.has(selectedNodeId || "");

    if (!selectedNodeId || !stillVisible) {
      setSelectedNodeId(preferredNodeId);
    }
  }, [displayNodes, displayNodeIds, selectedNodeId]);

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-4 py-3 text-[11px] text-muted-foreground">
        <span>
          <span className="font-medium text-foreground">{data.structure.node_count}</span>{" "}
          nodes
        </span>
        <span className="text-border">·</span>
        <span>
          <span className="font-medium text-foreground">{data.structure.section_count}</span>{" "}
          sections
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
          Meaning: <span className="font-medium text-primary">{data.meaning.status}</span>
        </span>
        <span>
          Origin: <span className="font-medium text-foreground">{data.origin.status}</span>
        </span>
        <span>
          Verification:{" "}
          <span className="font-medium text-foreground">{data.verification.status}</span>
        </span>
        <span>
          Validation:{" "}
          <span className="font-medium text-foreground">
            {data.structure.validation_report.status}
          </span>
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

      <div className="border-b border-border bg-surface/30 px-4 py-3">
        <div className="flex flex-wrap gap-2">
          {(["meaning", "verification", "origin"] as DetailTab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              aria-pressed={activeTab === tab}
              className={`rounded-full border px-3.5 py-2 text-sm font-medium capitalize transition-colors ${
                activeTab === tab
                  ? "border-gold/30 bg-gold/10 text-foreground"
                  : "border-border/60 bg-background/20 text-muted-foreground hover:border-border hover:text-foreground"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {activeTab === "meaning" && (
          <div className="space-y-1 p-4">
            {displayNodes.map((node, index) => {
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
                      <span className="rounded bg-secondary px-2.5 py-1 text-[11px] text-foreground">
                        {node.role}
                      </span>
                      <span className="rounded bg-secondary px-2.5 py-1 text-[11px] text-muted-foreground">
                        depth {node.depth}
                      </span>
                      {node.parent_id && (
                        <span className="rounded bg-secondary px-2.5 py-1 text-[11px] text-muted-foreground">
                          parent {node.parent_id}
                        </span>
                      )}
                      <span className="rounded bg-secondary px-2.5 py-1 text-[11px] text-muted-foreground">
                        {node.validation_status}
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
                      <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-gold-muted">
                        Meaning
                      </div>
                      <MeaningSummary
                        meaning={nodeMeaning}
                        isSelectedNode={isSelected}
                      />
                    </div>
                    {node.validation_errors.length > 0 && (
                      <div className="mt-4 rounded-xl border border-border/60 bg-background/60 p-3">
                        <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-gold-muted">
                          Validation Errors
                        </div>
                        {node.validation_errors.map((error) => (
                          <div
                            key={`${node.node_id}-${error}`}
                            className="border-b border-border/50 py-2 text-sm text-destructive last:border-0"
                          >
                            {error}
                          </div>
                        ))}
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
            <div className="text-sm font-mono text-muted-foreground">document</div>

            <Section title="Document Verification Summary">
              <FieldRow
                label="status"
                value={data.verification.status}
              />
              <FieldRow
                label="checked"
                value={`${verificationSummary.total} selected node(s)`}
              />
              <FieldRow
                label="detected"
                value={`${verificationSummary.detectedCount} node(s) with verification signals`}
              />
              <FieldRow
                label="routed"
                value={`${verificationSummary.routedCount} node(s) routed to record systems`}
              />
            </Section>

            <Section title="Expected Record Systems">
              {verificationSummary.routes.length > 0 ? (
                <div className="space-y-3">
                  {verificationSummary.routes.map((route) => (
                    <div
                      key={route.system}
                      className="rounded-xl border border-border/50 bg-background/40 p-3"
                    >
                      <div className="text-sm font-semibold text-foreground">
                        {route.system}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Triggered by {route.nodeIds.length} selected node(s)
                        {route.assertionTypes.length > 0
                          ? ` · ${route.assertionTypes.join(", ")}`
                          : ""}
                      </div>
                      {route.evidence.length > 0 && (
                        <div className="mt-3 space-y-2">
                          {route.evidence.map((snippet) => (
                            <div
                              key={`${route.system}-${snippet}`}
                              className="rounded border border-border/40 bg-surface p-2 text-sm leading-relaxed text-muted-foreground"
                            >
                              {snippet}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState message="No document-level record systems were detected for this input." />
              )}
            </Section>

            <Section title="Assertion Types">
              {verificationSummary.assertionTypes.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {verificationSummary.assertionTypes.map((type) => (
                    <span
                      key={type}
                      className="rounded bg-secondary px-3 py-2 text-sm font-medium text-foreground"
                    >
                      {type}
                    </span>
                  ))}
                </div>
              ) : (
                <EmptyState message="No assertion types detected." />
              )}
            </Section>
          </div>
        )}

        {activeTab === "origin" && (
          <div className="space-y-5 px-5 py-6 pb-12">
            <div className="text-sm font-mono text-muted-foreground">document</div>
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
