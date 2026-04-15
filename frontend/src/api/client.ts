import { AnalyzeRequest, PipelineResponse } from "../types";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

export async function analyzeDocument(
  request: AnalyzeRequest
): Promise<PipelineResponse> {
  const response = await fetch(`${API_BASE}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API error ${response.status}: ${text}`);
  }

  return response.json();
}
