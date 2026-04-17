
import { PipelineResponse, StructureNode } from "../types";

interface ResultsViewProps {
  data: PipelineResponse;
}

function NodeTable({ nodes, title }: { nodes: StructureNode[]; title: string }) {
  if (nodes.length === 0) return <p>No {title.toLowerCase()}.</p>;

  return (
    <div className="node-table">
      <h4>
        {title} ({nodes.length})
      </h4>
      {nodes.map((node) => (
        <div key={node.node_id} className="node-card">
          <div className="node-header">
            <strong>{node.node_id}</strong>
            <span className="anchor">{node.source_anchor}</span>
          </div>
          <div className="node-text">{node.source_text}</div>
        </div>
      ))}
    </div>
  );
}

export function ResultsView({ data }: ResultsViewProps) {
  return (
    <div className="results">
      <section className="layer-section">
        <h3>Input</h3>
        <div className="layer-content">
          <p>Type: {data.input.content_type}</p>
          <p>Status: {data.input.parse_status}</p>
        </div>
      </section>

      <section className="layer-section">
        <h3>Structure</h3>
        <div className="layer-content">
          <NodeTable nodes={data.structure.nodes} title="Nodes" />
        </div>
      </section>

      <section className="layer-section">
        <h3>Selection</h3>
        <div className="layer-content">
          <p>Selected: {data.selection.selected_nodes.length}</p>
          <p>Excluded: {data.selection.excluded_nodes.length}</p>
        </div>
      </section>

      <section className="layer-section">
        <h3>Meaning</h3>
        <div className="layer-content">
          <p>Status: {data.meaning.status}</p>
        </div>
      </section>

      <section className="layer-section">
        <h3>Origin</h3>
        <div className="layer-content">
          <p>Status: {data.origin.status}</p>
        </div>
      </section>

      <section className="layer-section">
        <h3>Verification</h3>
        <div className="layer-content">
          <p>Status: {data.verification.status}</p>
        </div>
      </section>

      <section className="layer-section">
        <h3>Output</h3>
        <div className="layer-content">
          <pre>{JSON.stringify(data.output, null, 2)}</pre>
        </div>
      </section>
    </div>
  );
}

