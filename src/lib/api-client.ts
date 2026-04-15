/**
 * Frontend API client — calls the backend /analyze endpoint.
 * No server secrets are sent from the frontend.
 */

const API_BASE = import.meta.env.VITE_API_URL ?? "";

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
