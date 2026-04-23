import { enforceAnalyzeSecurity } from "../src/lib/analyze-security.server";

function getBackendConfig() {
  const apiBaseUrl =
    process.env.ANALYZE_API_BASE_URL ??
    process.env.VITE_ANALYZE_API_BASE_URL ??
    "https://anchored-flow-stack.onrender.com";
  const analyzeSecret =
    process.env.ANALYZE_SECRET ?? process.env.VITE_ANALYZE_SECRET ?? "";

  return {
    apiUrl: `${apiBaseUrl.replace(/\/+$/, "")}/analyze`,
    analyzeSecret,
  };
}

function readAnalyzeBody(req: any) {
  try {
    const parsedBody = req.body;

    if (typeof parsedBody === "string") {
      const trimmed = parsedBody.trim();
      return trimmed ? JSON.parse(trimmed) : {};
    }

    if (parsedBody && typeof parsedBody === "object") {
      return parsedBody;
    }

    return {};
  } catch (error) {
    throw new Error(
      error instanceof Error ? error.message : "Invalid JSON request body."
    );
  }
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.status(405).json({ message: "Method not allowed" });
    return;
  }

  let body: any;

  try {
    body = readAnalyzeBody(req);
  } catch (error) {
    res.status(400).json({
      message:
        error instanceof Error ? error.message : "Invalid JSON request body.",
    });
    return;
  }

  const content = typeof body.content === "string" ? body.content : "";
  const contentType = typeof body.content_type === "string" ? body.content_type : "";
  const options = body.options ?? {
    run_meaning: false,
    run_origin: true,
    run_verification: true,
  };

  const clientIpHeader = req.headers["x-forwarded-for"];
  const clientIp = Array.isArray(clientIpHeader)
    ? clientIpHeader[0]
    : clientIpHeader?.split(",")[0].trim() ?? "unknown";

  const security = enforceAnalyzeSecurity({
    content,
    content_type: contentType,
    options,
    clientIp,
  });

  if (security.reject) {
    res.status(security.reject.status).json({ message: security.reject.message });
    return;
  }

  const { apiUrl, analyzeSecret } = getBackendConfig();

  if (!analyzeSecret) {
    res.status(500).json({ message: "ANALYZE_SECRET is not configured on the server." });
    return;
  }

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-analyze-secret": analyzeSecret,
      },
      body: JSON.stringify({
        content,
        content_type: contentType,
        options,
      }),
    });

    const text = await response.text();

    if (!response.ok) {
      let message = `Backend analyze failed (${response.status})`;

      try {
        const parsed = JSON.parse(text);
        if (typeof parsed?.detail === "string") {
          message = parsed.detail;
        } else if (Array.isArray(parsed?.detail) && parsed.detail[0]?.msg) {
          message = parsed.detail[0].msg;
        } else if (Array.isArray(parsed?.errors) && parsed.errors[0]?.error) {
          message = parsed.errors[0].error;
        } else if (typeof parsed?.message === "string") {
          message = parsed.message;
        }
      } catch {
        if (text.trim()) {
          message = text;
        }
      }

      res.status(response.status).json({ message });
      return;
    }

    try {
      res.status(200).json(JSON.parse(text));
    } catch {
      res.status(502).json({ message: "Backend returned invalid JSON." });
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Analyze proxy request failed.";
    res.status(502).json({ message });
  }
}
