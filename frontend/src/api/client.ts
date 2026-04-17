import { AnalyzeRequest, PipelineResponse } from "../types";

const API_URL = "https://anchored-flow-stack.onrender.com/analyze";

export async function analyzeDocumentRequest(
  request: AnalyzeRequest
): Promise<PipelineResponse> {
  const makeRequest = () =>
    fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-analyze-secret": "Apple_Banana_Bridge!123",
      },
      body: JSON.stringify(request),
    });

  let response = await makeRequest();

  if (!response.ok) {
    // wait for Render cold start
    await new Promise((resolve) => setTimeout(resolve, 8000));
    response = await makeRequest();
  }

  if (!response.ok) {
    throw new Error("Analysis failed");
  }

  return response.json();
}