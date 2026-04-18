import { useMemo, useState } from "react";
import type {
  MeaningLens,
  MeaningNodeResult,
  PipelineResponse,
  StructureNode,
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
    <div className="field-row">
      <span className="field-label">{label}</span>
      <span className="field-value">{value || "Not specified"}</span>
    </div>
  );
}

function FieldGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="detail-block">
      <h3>{title}</h3>
      <div>{children}</div>
    </section>
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

function StructurePanel({ node }: { node: StructureNode }) {
  return (
    <div className="detail-grid">
      <FieldGroup title="Actors">
        <FieldRow label="actor" value={node.actor} />
        <FieldRow label="who" value={node.who} />
      </FieldGroup>

      <FieldGroup title="Actions">
        <FieldRow label="action" value={node.action} />
        <FieldRow label="what" value={node.what} />
        <FieldRow label="how" value={node.how} />
        <FieldRow label="why" value={node.why} />
      </FieldGroup>

      <FieldGroup title="Timing">
        <FieldRow label="when" value={node.when} />
        <FieldRow label="temporal" value={node.temporal} />
      </FieldGroup>

      <FieldGroup title="Jurisdiction">
        <FieldRow label="jurisdiction" value={node.jurisdiction} />
        <FieldRow label="where" value={node.where} />
      </FieldGroup>
    </div>
  );
}

function TextPanel({ node }: { node: StructureNode }) {
  return (
    <div className="detail-grid">
      <FieldGroup title="Source Text">
        <pre>{node.source_text}</pre>
      </FieldGroup>

      <FieldGroup title="Normalized Text">
        <pre>{node.normalized_text}</pre>
      </FieldGroup>
    </div>
  );
}

function MeaningPanel({
  currentMeaning,
  meaning,
  selectedNodeId,
}: {
  currentMeaning: MeaningNodeResult | undefined;
  meaning: PipelineResponse["meaning"];
  selectedNodeId: string | null;
}) {
  const normalizedLenses = normalizeLenses(currentMeaning?.lenses);
  const detected = normalizedLenses.filter((lens) => lens.detected);
  const notDetected = normalizedLenses.filter((lens) => !lens.detected);

  return (
    <div className="detail-grid">
      <FieldGroup title="Meaning Status">
        <FieldRow label="status" value={meaning.status} />
        <FieldRow label="message" value={meaning.message} />
        <FieldRow label="node" value={currentMeaning?.node_id || selectedNodeId} />
      </FieldGroup>

      {!currentMeaning && (
        <FieldGroup title="Meaning Output">
          <div className="muted-inline">
            No meaning result exists for the selected node.
          </div>
        </FieldGroup>
      )}

      {currentMeaning && (
        <>
          <FieldGroup title="Detected Lenses">
            {detected.length > 0 ? (
              <div className="tag-row">
                {detected.map((lens) => (
                  <span key={lens.lens} className="tag tag-accent">
                    {lens.lens}
                  </span>
                ))}
              </div>
            ) : (
              <div className="muted-inline">
                Meaning result found, but no detected lenses were returned for this node.
              </div>
            )}
          </FieldGroup>

          <FieldGroup title="Not Detected">
            {notDetected.length > 0 ? (
              <div className="tag-row">
                {notDetected.map((lens) => (
                  <span key={lens.lens} className="tag">
                    {lens.lens}
                  </span>
                ))}
              </div>
            ) : (
              <div className="muted-inline">No explicit negative lens results returned.</div>
            )}
          </FieldGroup>

          <FieldGroup title="Summary">
            <div className="field-value">
              {currentMeaning.summary || "No summary field returned for this node."}
            </div>
          </FieldGroup>

          <FieldGroup title="Raw Meaning Result">
            <pre>{JSON.stringify(currentMeaning, null, 2)}</pre>
          </FieldGroup>
        </>
      )}
    </div>
  );
}

function VerificationPanel({
  currentVerification,
}: {
  currentVerification: VerificationNodeResult | undefined;
}) {
  return (
    <div className="detail-grid">
      <FieldGroup title="Verification Trace">
        <FieldRow
          label="assertion"
          value={
            currentVerification
              ? currentVerification.assertion_detected
                ? "Detected"
                : "Not detected"
              : "No verification result for this node"
          }
        />
        <FieldRow label="type" value={currentVerification?.assertion_type} />
        <FieldRow
          label="path"
          value={
            currentVerification
              ? currentVerification.verification_path_available
                ? "Available"
                : "Unavailable"
              : "Not specified"
          }
        />
        <FieldRow label="notes" value={currentVerification?.verification_notes} />
      </FieldGroup>

      <FieldGroup title="Expected Record Systems">
        {currentVerification?.expected_record_systems?.length ? (
          <div className="tag-row">
            {currentVerification.expected_record_systems.map((system) => (
              <span key={system} className="tag">
                {system}
              </span>
            ))}
          </div>
        ) : (
          <div className="muted-inline">No record systems listed.</div>
        )}
      </FieldGroup>
    </div>
  );
}

export function ResultsView({ data }: ResultsViewProps) {
  const selectedIds = useMemo(
    () => new Set(data.selection.selected_nodes.map((node) => node.node_id)),
    [data.selection.selected_nodes]
  );

  const initialNodeId =
    data.selection.selected_nodes[0]?.node_id ??
    data.structure.nodes[0]?.node_id ??
    null;

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(initialNodeId);
  const [activeTab, setActiveTab] = useState<DetailTab>("structure");

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
    ? data.meaning.node_results.find((node) => node.node_id === currentNode.node_id)
    : undefined;

  const currentVerification = currentNode
    ? verificationMap.get(currentNode.node_id)
    : undefined;

  const tabs: Array<{ key: DetailTab; label: string }> = [
    { key: "structure", label: "Structure" },
    { key: "text", label: "Text" },
    { key: "meaning", label: "Meaning" },
    { key: "verification", label: "Verification" },
  ];

  return (
    <div className="pipeline-shell">
      <div className="pipeline-summary">
        <span className="stage-status">
          Meaning: <strong>{data.meaning.status}</strong>
        </span>
        <span className="stage-status">
          Origin: <strong>{data.origin.status}</strong>
        </span>
        <span className="stage-status">
          Verification: <strong>{data.verification.status}</strong>
        </span>
      </div>

      <div className="pipeline-layout">
        <aside className="node-panel">
          <div className="panel-heading">Structure</div>
          <div className="node-list">
            {data.structure.nodes.map((node, index) => {
              const selected = node.node_id === selectedNodeId;
              const selectedForMeaning = selectedIds.has(node.node_id);

              return (
                <button
                  key={node.node_id}
                  type="button"
                  className={selected ? "node-item active" : "node-item"}
                  onClick={() => setSelectedNodeId(node.node_id)}
                >
                  <div className="node-item-top">
                    <span className="node-index">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="node-id">{node.node_id}</span>
                  </div>
                  <div className="node-preview">{node.source_text}</div>
                  <div className="node-meta">
                    <span className={selectedForMeaning ? "tag tag-accent" : "tag"}>
                      {selectedForMeaning ? "selected" : "excluded"}
                    </span>
                    {node.blocked_flags.map((flag) => (
                      <span key={flag} className="tag tag-warning">
                        {flag}
                      </span>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="detail-panel">
          {!currentNode ? (
            <div className="detail-body">
              <div className="empty-state">No node selected.</div>
            </div>
          ) : (
            <>
              <div className="detail-header">
                <div>
                  <div className="panel-heading">Selected Node</div>
                  <div className="selected-node-id">{currentNode.node_id}</div>
                </div>
                <div className="selected-node-anchor">{currentNode.source_anchor}</div>
              </div>

              <div className="tab-row">
                {tabs.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    className={activeTab === tab.key ? "tab-button active" : "tab-button"}
                    onClick={() => setActiveTab(tab.key)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="detail-body">
                {activeTab === "structure" && <StructurePanel node={currentNode} />}
                {activeTab === "text" && <TextPanel node={currentNode} />}
                {activeTab === "meaning" && (
                  <MeaningPanel
                    currentMeaning={currentMeaning}
                    meaning={data.meaning}
                    selectedNodeId={selectedNodeId}
                  />
                )}
                {activeTab === "verification" && (
                  <VerificationPanel currentVerification={currentVerification} />
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
