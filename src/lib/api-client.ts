/**
 * Frontend API client — routes analysis requests.
 *
 * When meaning (AI) is requested, the call goes through the TanStack server
 * function which has access to ANALYZE_SECRET and OPENAI_API_KEY.
 * Otherwise, it calls the Render backend directly.
 */

import { analyzePipeline } from "./analyze";

const API_BASE = import.meta.env.VITE_API_URL ?? "https://anchored-flow-stack.onrender.com";

interface AnalyzeRequest {
  content: string;
  content_type: string;
  language?: string;
  options: {
    run_meaning: boolean;
    run_origin: boolean;
    run_verification: boolean;
  };
}

export async function analyzeDocument(request: AnalyzeRequest) {
  // Route through server function when meaning is enabled (needs secrets)
  if (request.options.run_meaning) {
    return analyzePipeline({
      content: request.content,
      content_type: request.content_type,
      options: request.options,
    });
  }

  // Otherwise, call the Render backend directly
  if (!API_BASE) {
    throw new Error("Backend unavailable: VITE_API_URL is not configured.");
  }

  const url = `${API_BASE.replace(/\/+$/, "")}/analyze`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
  } catch (err) {
    throw new Error(
      "Backend unavailable: could not reach the analysis service.",
    );
  }

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const body = await response.json();
      if (body.detail) detail = String(body.detail);
      else if (body.message) detail = String(body.message);
    } catch {}
    throw new Error(detail);
  }

  return response.json();
}
