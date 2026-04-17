import { AnalyzeRequest, PipelineResponse } from "../types";

const API_BASE_URL =
  import.meta.env.VITE_ANALYZE_API_BASE_URL ??
  "https://anchored-flow-stack.onrender.com";
const API_URL = `${API_BASE_URL.replace(/\/+$/, "")}/analyze`;
const ANALYZE_SECRET = import.meta.env.VITE_ANALYZE_SECRET;

export async function analyzeDocumentRequest(
  request: AnalyzeRequest
): Promise<PipelineResponse> {
  if (!ANALYZE_SECRET) {
    throw new Error("Missing VITE_ANALYZE_SECRET");
  }

  const makeRequest = () =>
    fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-analyze-secret": ANALYZE_SECRET,
      },
      body: JSON.stringify(request),
    });

  let response = await makeRequest();

  if (!response.ok) {
    await new Promise((resolve) => setTimeout(resolve, 8000));
    response = await makeRequest();
  }

  if (!response.ok) {
    throw new Error(`Analysis failed (${response.status})`);
  }

  return response.json();
}

