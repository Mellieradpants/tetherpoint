import { PipelineResponse, StructureNode } from "../types";

interface ResultsViewProps {
  data: PipelineResponse;
}

function NodeTable({ nodes, title }: { nodes: StructureNode[]; title: string }) {
  if (nodes.length === 0) return <p>No {title.toLowerCase()}.</p>;

  return (
  <div style={{
  background: "#020617",
  color: "#e5e7eb",
  minHeight: "100vh",
  padding: "16px",
  fontFamily: "system-ui"
}}>
      <h4>{title} ({nodes.length})</h4>
      {nodes.map((node) => (
        <div key={node.node_id} style={{ border: "1px solid #ccc", margin: "8px 0", padding: "8px" }}>
          <div><strong>{node.node_id}</strong></div>
          <div>{node.source_text}</div>
        </div>
      ))}
    </div>
  );
}

export function ResultsView({ data }: ResultsViewProps) {
  return (
    <div>
      <h3>Input</h3>
      <p>Type: {data.input.content_type}</p>
      <p>Status: {data.input.parse_status}</p>

      <h3>Structure</h3>
      <NodeTable nodes={data.structure.nodes} title="Nodes" />

      <h3>Selection</h3>
      <p>Selected: {data.selection.selected_nodes.length}</p>
      <p>Excluded: {data.selection.excluded_nodes.length}</p>

      <h3>Meaning</h3>
      <p>Status: {data.meaning.status}</p>

      <h3>Origin</h3>
      <p>Status: {data.origin.status}</p>

      <h3>Verification</h3>
      <p>Status: {data.verification.status}</p>

      <h3>Output</h3>
      <pre>{JSON.stringify(data.output, null, 2)}</pre>
    </div>
  );
}