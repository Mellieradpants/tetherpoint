export interface AnalyzeOptions {
  run_meaning: boolean;
  run_origin: boolean;
  run_verification: boolean;
}

export interface AnalyzeRequest {
  content: string;
  content_type: "xml" | "html" | "json" | "text";
  options: AnalyzeOptions;
}

export interface InputResult {
  raw_content: string;
  content_type: string;
  size: number;
  parse_status: string;
  parse_errors: string[];
}

export interface RiskInfo {
  likelihood: string | null;
  impact: string | null;
}

export interface StructureNode {
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
  risk: RiskInfo | null;
  tags: string[];
  blocked_flags: string[];
  who: string | null;
  what: string | null;
  when: string | null;
  where: string | null;
  why: string | null;
  how: string | null;
}

export interface StructureResult {
  nodes: StructureNode[];
  node_count: number;
}

export interface SelectionResult {
  selected_nodes: StructureNode[];
  excluded_nodes: StructureNode[];
  selection_log: string[];
}

export interface MeaningLens {
  lens: string;
  detected: boolean;
  detail: string | null;
}

export interface MeaningNodeResult {
  node_id: string;
  source_text: string;
  lenses: MeaningLens[];
}

export interface MeaningResult {
  status: string;
  message: string | null;
  node_results: MeaningNodeResult[];
}

export interface OriginSignal {
  signal: string;
  value: string;
  category?: string;
}

export interface OriginResult {
  status: string;
  origin_identity_signals: OriginSignal[];
  origin_metadata_signals: OriginSignal[];
  distribution_signals: OriginSignal[];
  evidence_trace: string[];
}

export interface VerificationNodeResult {
  node_id: string;
  assertion_detected: boolean;
  assertion_type: string | null;
  verification_path_available: boolean;
  expected_record_systems: string[];
  verification_notes: string | null;
}

export interface VerificationResult {
  status: string;
  node_results: VerificationNodeResult[];
}

export interface OutputResult {
  summary: Record<string, unknown>;
  total_nodes: number;
  selected_count: number;
  excluded_count: number;
  meaning_status: string;
  origin_status: string;
  verification_status: string;
}

export interface PipelineResponse {
  input: InputResult;
  structure: StructureResult;
  selection: SelectionResult;
  meaning: MeaningResult;
  origin: OriginResult;
  verification: VerificationResult;
  output: OutputResult;
}
