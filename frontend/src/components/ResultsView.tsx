import { PipelineResponse, StructureNode } from "../types";

interface ResultsViewProps {
  data: PipelineResponse;
}

function NodeTable({ nodes, title }: { nodes: StructureNode[]; title: string }) {
  if (nodes.length === 0) return <p className="empty">No {title.toLowerCase()}.</p>;
  return (
    <div className="node-table">
      <h4>{title} ({nodes.length})</h4>
      {nodes.map((node) => (
        <div key={node.node_id} className="node-card">
          <div className="node-header">
            <code>{node.node_id}</code>
            <span className="anchor">{node.source_anchor}</span>
          </div>
          <div className="node-text">{node.source_text}</div>
          <div className="node-fields">
            {node.actor && <span className="field">actor: {node.actor}</span>}
            {node.action && <span className="field">action: {node.action}</span>}
            {node.condition && <span className="field">condition: {node.condition}</span>}
            {node.temporal && <span className="field">temporal: {node.temporal}</span>}
            {node.jurisdiction && <span className="field">jurisdiction: {node.jurisdiction}</span>}
            {node.mechanism && <span className="field">mechanism: {node.mechanism}</span>}
            {node.who && <span className="field">who: {node.who}</span>}
            {node.when && <span className="field">when: {node.when}</span>}
            {node.where && <span className="field">where: {node.where}</span>}
            {node.risk && (
              <span className="field">
                risk: likelihood={node.risk.likelihood ?? "null"}, impact={node.risk.impact ?? "null"}
              </span>
            )}
            {node.tags.length > 0 && (
              <span className="field">tags: {node.tags.join(", ")}</span>
            )}
            {node.blocked_flags.length > 0 && (
              <span className="field blocked">blocked: {node.blocked_flags.join(", ")}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export function ResultsView({ data }: ResultsViewProps) {
  return (
    <div className="results">
      {/* 1. Input */}
      <section className="layer-section">
        <h3>1. Input</h3>
        <div className="layer-content">
          <p>Type: <code>{data.input.content_type}</code> | Size: {data.input.size} bytes | Status: <code>{data.input.parse_status}</code></p>
          {data.input.parse_errors.length > 0 && (
            <div className="errors">
              {data.input.parse_errors.map((e, i) => <p key={i} className="error">{e}</p>)}
            </div>
          )}
          <details>
            <summary>Raw content</summary>
            <pre>{data.input.raw_content}</pre>
          </details>
        </div>
      </section>

      {/* 2. Structure */}
      <section className="layer-section">
        <h3>2. Structure</h3>
        <div className="layer-content">
          <p>{data.structure.node_count} node(s) extracted</p>
          <NodeTable nodes={data.structure.nodes} title="Structure Nodes" />
        </div>
      </section>

      {/* 3. Selection */}
      <section className="layer-section">
        <h3>3. Selection</h3>
        <div className="layer-content">
          <p>Selected: {data.selection.selected_nodes.length} | Excluded: {data.selection.excluded_nodes.length}</p>
          <NodeTable nodes={data.selection.selected_nodes} title="Selected Nodes" />
          <NodeTable nodes={data.selection.excluded_nodes} title="Excluded Nodes" />
          <details>
            <summary>Selection Log</summary>
            <pre>{data.selection.selection_log.join("\n")}</pre>
          </details>
        </div>
      </section>

      {/* 4. Meaning */}
      <section className="layer-section">
        <h3>4. Meaning</h3>
        <div className="layer-content">
          <p>Status: <code>{data.meaning.status}</code></p>
          {data.meaning.message && <p>{data.meaning.message}</p>}
          {data.meaning.node_results.map((nr) => (
            <div key={nr.node_id} className="node-card">
              <div className="node-header"><code>{nr.node_id}</code></div>
              <div className="node-text">{nr.source_text}</div>
              <div className="lens-list">
                {nr.lenses.map((l) => (
                  <div key={l.lens} className={`lens ${l.detected ? "detected" : ""}`}>
                    <span>{l.lens}</span>: {l.detected ? "detected" : "not detected"}
                    {l.detail && <span className="detail"> — {l.detail}</span>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 5. Origin */}
      <section className="layer-section">
        <h3>5. Origin</h3>
        <div className="layer-content">
          <p>Status: <code>{data.origin.status}</code></p>
          {data.origin.origin_identity_signals.length > 0 && (
            <div>
              <h4>Identity Signals</h4>
              <pre>{JSON.stringify(data.origin.origin_identity_signals, null, 2)}</pre>
            </div>
          )}
          {data.origin.origin_metadata_signals.length > 0 && (
            <div>
              <h4>Metadata Signals</h4>
              <pre>{JSON.stringify(data.origin.origin_metadata_signals, null, 2)}</pre>
            </div>
          )}
          {data.origin.distribution_signals.length > 0 && (
            <div>
              <h4>Distribution Signals</h4>
              <pre>{JSON.stringify(data.origin.distribution_signals, null, 2)}</pre>
            </div>
          )}
          {data.origin.evidence_trace.length > 0 && (
            <details>
              <summary>Evidence Trace</summary>
              <pre>{data.origin.evidence_trace.join("\n")}</pre>
            </details>
          )}
        </div>
      </section>

      {/* 6. Verification */}
      <section className="layer-section">
        <h3>6. Verification</h3>
        <div className="layer-content">
          <p>Status: <code>{data.verification.status}</code></p>
          {data.verification.node_results.map((vr) => (
            <div key={vr.node_id} className="node-card">
              <div className="node-header"><code>{vr.node_id}</code></div>
              <p>Assertion: {vr.assertion_detected ? `detected (${vr.assertion_type})` : "none"}</p>
              {vr.verification_path_available && (
                <p>Record systems: {vr.expected_record_systems.join(", ")}</p>
              )}
              {vr.verification_notes && <p className="note">{vr.verification_notes}</p>}
            </div>
          ))}
        </div>
      </section>

      {/* 7. Output */}
      <section className="layer-section">
        <h3>7. Output</h3>
        <div className="layer-content">
          <pre>{JSON.stringify(data.output, null, 2)}</pre>
        </div>
      </section>
    </div>
  );
}
