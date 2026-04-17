import { useMemo, useState } from "react";
import type {
  MeaningLens,
  MeaningNodeResult,
  PipelineResponse,
  VerificationNodeResult,
} from "../types";


interface ResultsViewProps {
  data: PipelineResponse;
}

type DetailTab = "structure" | "text" | "meaning" | "verification";

function FieldRow({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "140px 1fr",
        gap: "12px",
        padding: "10px 0",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <div
        style={{
          fontSize: "0.72rem",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--muted)",
          fontWeight: 700,
        }}
      >
        {label}
      </div>
      <div style={{ color: "var(--fg)" }}>{value || "Not specified"}</div>
    </div>
  );
}

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        border: "1px solid var(--border)",
        borderRadius: "14px",
        background: "var(--card-bg)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "12px 16px",
          borderBottom: "1px solid var(--border)",
          background: "var(--panel)",
          fontSize: "0.78rem",
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--muted)",
        }}
      >
        {title}
      </div>
      <div style={{ padding: "0 16px 8px" }}>{children}</div>
    </section>
  );
}

function StatusPill({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  const normalized = (value || "unknown").toLowerCase();
  const bg =
    normalized === "executed"
      ? "rgba(199, 169, 79, 0.16)"
      : normalized === "skipped"
        ? "rgba(255,255,255,0.06)"
        : "rgba(255,123,114,0.16)";

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "8px",
        padding: "8px 10px",
        borderRadius: "999px",
        background: bg,
        border: "1px solid var(--border)",
        fontSize: "0.78rem",
      }}
    >
      <span style={{ color: "var(--muted)", textTransform: "uppercase" }}>
        {label}
      </span>
      <strong style={{ color: "var(--fg)" }}>{value || "unknown"}</strong>
    </div>
  );
}

function Chip({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        padding: "6px 10px",
        borderRadius: "999px",
        background: "rgba(199, 169, 79, 0.16)",
        border: "1px solid var(--border)",
        fontSize: "0.78rem",
        color: "var(--fg)",
      }}
    >
      {children}
    </span>
  );
}

function normalizeLenses(
  lenses: Array<MeaningLens | string> | undefined
): MeaningLens[] {
  if (!Array.isArray(lenses)) return [];
  return lenses.map((lens) =>
    typeof lens === "string"
      ? { lens, detected: true, detail: null }
      : lens
  );
}

export function ResultsView({ data }: ResultsViewProps) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(
    data.structure.nodes[0]?.node_id ?? null
  );
  const [activeTab, setActiveTab] = useState<DetailTab>("structure");
  const [showMeaningJson, setShowMeaningJson] = useState(false);

  const selectedIds = useMemo(
    () => new Set(data.selection.selected_nodes.map((node) => node.node_id)),
    [data.selection.selected_nodes]
  );

  const meaningMap = useMemo(
    () =>
      new Map<string, MeaningNodeResult>(
        data.meaning.node_results.map((node) => [node.node_id, node])
      ),
    [data.meaning.node_results]
  );

  const verificationMap = useMemo(
    () =>
      new Map<string, VerificationNodeResult>(
        data.verification.node_results.map((node) => [node.node_id, node])
      ),
    [data.verification.node_results]
  );

  const currentNode =
    data.structure.nodes.find((node) => node.node_id === selectedNodeId) ?? null;

  const currentMeaning = currentNode
    ? meaningMap.get(currentNode.node_id)
    : undefined;

  const currentVerification = currentNode
    ? verificationMap.get(currentNode.node_id)
    : undefined;

  const detectedLenses = normalizeLenses(currentMeaning?.lenses).filter(
    (lens) => lens.detected
  );

  return (
    <div style={{ display: "grid", gap: "16px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "16px",
          alignItems: "center",
          flexWrap: "wrap",
          border: "1px solid var(--border)",
          borderRadius: "16px",
          padding: "14px 16px",
          background: "var(--panel)",
        }}
      >
        <div>
          <div
            style={{
              fontSize: "0.72rem",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: "var(--muted)",
              marginBottom: "6px",
            }}
          >
            Selected Node
          </div>
          <div style={{ fontSize: "1rem", fontWeight: 700, color: "var(--fg)" }}>
            {currentNode?.node_id || "No node selected"}
          </div>
        </div>

        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <StatusPill label="Meaning" value={data.meaning.status} />
          <StatusPill label="Origin" value={data.origin.status} />
          <StatusPill label="Verification" value={data.verification.status} />
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "320px minmax(0, 1fr)",
          gap: "16px",
        }}
      >
        <aside
          style={{
            border: "1px solid var(--border)",
            borderRadius: "16px",
            background: "var(--card-bg)",
            overflow: "hidden",
            minWidth: 0,
          }}
        >
          <div
            style={{
              padding: "12px 16px",
              borderBottom: "1px solid var(--border)",
              background: "var(--panel)",
              fontSize: "0.78rem",
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--muted)",
            }}
          >
            Node Trace
          </div>

          <div style={{ padding: "10px", display: "grid", gap: "8px" }}>
            {data.structure.nodes.map((node) => {
              const active = node.node_id === selectedNodeId;
              const selected = selectedIds.has(node.node_id);

              return (
                <button
                  key={node.node_id}
                  type="button"
                  onClick={() => setSelectedNodeId(node.node_id)}
                  style={{
                    textAlign: "left",
                    border: "1px solid var(--border)",
                    borderRadius: "12px",
                    background: active ? "var(--panel-2)" : "var(--panel)",
                    padding: "12px",
                    cursor: "pointer",
                    color: "var(--fg)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: "8px",
                      marginBottom: "8px",
                    }}
                  >
                    <strong>{node.node_id}</strong>
                    <span style={{ color: "var(--muted)", fontSize: "0.78rem" }}>
                      {selected ? "selected" : "excluded"}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: "0.84rem",
                      color: "var(--fg)",
                      opacity: 0.9,
                      lineHeight: 1.4,
                    }}
                  >
                    {node.source_text}
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        <section
          style={{
            border: "1px solid var(--border)",
            borderRadius: "16px",
            background: "var(--card-bg)",
            overflow: "hidden",
            minWidth: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              gap: "8px",
              padding: "10px 12px",
              borderBottom: "1px solid var(--border)",
              background: "var(--panel)",
              flexWrap: "wrap",
            }}
          >
            {(["structure", "text", "meaning", "verification"] as DetailTab[]).map(
              (tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  style={{
                    border: "1px solid var(--border)",
                    borderRadius: "999px",
                    padding: "8px 12px",
                    background:
                      activeTab === tab ? "var(--accent)" : "transparent",
                    color: activeTab === tab ? "#16120a" : "var(--fg)",
                    textTransform: "capitalize",
                    cursor: "pointer",
                  }}
                >
                  {tab}
                </button>
              )
            )}
          </div>

          <div style={{ padding: "16px", display: "grid", gap: "16px" }}>
            {!currentNode && <div>No node selected.</div>}

            {currentNode && activeTab === "structure" && (
              <>
                <SectionCard title="Actors">
                  <FieldRow label="actor" value={currentNode.actor} />
                  <FieldRow label="who" value={currentNode.who} />
                </SectionCard>

                <SectionCard title="Actions">
                  <FieldRow label="action" value={currentNode.action} />
                  <FieldRow label="what" value={currentNode.what} />
                  <FieldRow label="how" value={currentNode.how} />
                  <FieldRow label="why" value={currentNode.why} />
                </SectionCard>

                <SectionCard title="Timing">
                  <FieldRow label="when" value={currentNode.when} />
                  <FieldRow label="temporal" value={currentNode.temporal} />
                </SectionCard>

                <SectionCard title="Jurisdiction">
                  <FieldRow label="jurisdiction" value={currentNode.jurisdiction} />
                  <FieldRow label="where" value={currentNode.where} />
                </SectionCard>
              </>
            )}

            {currentNode && activeTab === "text" && (
              <>
                <SectionCard title="Source Text">
                  <pre>{currentNode.source_text}</pre>
                </SectionCard>

                <SectionCard title="Normalized Text">
                  <pre>{currentNode.normalized_text}</pre>
                </SectionCard>
              </>
            )}

            {currentNode && activeTab === "meaning" && (
              <>
                <SectionCard title="Detected Lenses">
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                    {detectedLenses.length > 0 ? (
                      detectedLenses.map((lens) => (
                        <Chip key={lens.lens}>{lens.lens}</Chip>
                      ))
                    ) : (
                      <span style={{ color: "var(--muted)" }}>No lenses detected</span>
                    )}
                  </div>
                </SectionCard>

                <SectionCard title="Summary">
                  <div style={{ paddingTop: "10px", color: "var(--fg)" }}>
                    {currentMeaning?.summary ||
                      data.meaning.message ||
                      "Not specified"}
                  </div>
                </SectionCard>

                <SectionCard title="Meaning Trace">
                  <FieldRow label="status" value={data.meaning.status} />
                  <FieldRow label="message" value={data.meaning.message} />
                  <FieldRow label="node" value={currentMeaning?.node_id} />
                  <div style={{ paddingTop: "12px" }}>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => setShowMeaningJson((v) => !v)}
                    >
                      {showMeaningJson ? "Hide raw JSON" : "Show raw JSON"}
                    </button>
                  </div>
                  {showMeaningJson && (
                    <pre style={{ marginTop: "12px" }}>
                      {JSON.stringify(currentMeaning ?? null, null, 2)}
                    </pre>
                  )}
                </SectionCard>
              </>
            )}

            {currentNode && activeTab === "verification" && (
              <>
                <SectionCard title="Verification Trace">
                  <FieldRow label="status" value={data.verification.status} />
                  <FieldRow
                    label="assertion detected"
                    value={
                      currentVerification
                        ? currentVerification.assertion_detected
                          ? "Yes"
                          : "No"
                        : "Not specified"
                    }
                  />
                  <FieldRow
                    label="assertion type"
                    value={currentVerification?.assertion_type}
                  />
                  <FieldRow
                    label="verification path"
                    value={
                      currentVerification
                        ? currentVerification.verification_path_available
                          ? "Available"
                          : "Unavailable"
                        : "Not specified"
                    }
                  />
                  <FieldRow
                    label="verification notes"
                    value={currentVerification?.verification_notes}
                  />
                </SectionCard>

                <SectionCard title="Expected Record Systems">
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                    {currentVerification?.expected_record_systems?.length ? (
                      currentVerification.expected_record_systems.map((system) => (
                        <Chip key={system}>{system}</Chip>
                      ))
                    ) : (
                      <span style={{ color: "var(--muted)" }}>
                        No record systems listed
                      </span>
                    )}
                  </div>
                </SectionCard>
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

