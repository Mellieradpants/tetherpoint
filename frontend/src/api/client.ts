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
    // Log full error for debugging, show safe message to user
    try {
      const text = await response.text();
      console.error(`API error ${response.status}:`, text);
    } catch {}
    throw new Error(
      response.status === 422
        ? "Invalid request — please check your input."
        : response.status === 429
          ? "Too many requests — please wait and try again."
          : "Analysis failed. Please try again."
    );
  }

  return response.json();
}
