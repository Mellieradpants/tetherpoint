export const config = {
  runtime: "nodejs",
};

type AnalyzeOptions = {
  run_meaning: boolean;
  run_origin: boolean;
  run_verification: boolean;
};

type AnalyzeBody = {
  content: string;
  content_type: string;
  options: AnalyzeOptions;
};

type SecurityCheckResult = {
  reject?: { status: number; message: string };
  meaningAllowed: boolean;
};

const MAX_CONTENT_LENGTH = 500_000;
const VALID_CONTENT_TYPES = new Set(["text", "html", "xml", "json"]);
const GENERAL_LIMIT = 30;
const MEANING_LIMIT = 5;
const WINDOW_SECONDS = 60_000;

const generalBuckets = new Map<string, number[]>();
const meaningBuckets = new Map<string, number[]>();

function getVisibleEnvNames(): string[] {
  return Object.keys(process.env)
    .filter((name) => /ANALYZE|SECRET|API|VERCEL/i.test(name))
    .sort();
}

function getBackendConfig() {
  const apiBaseUrl =
    process.env.ANALYZE_API_BASE_URL ?? "https://anchored-flow-stack.onrender.com";
  const analyzeSecretRaw = process.env.ANALYZE_SECRET;
  const analyzeSecret =
    typeof analyzeSecretRaw === "string" && analyzeSecretRaw.trim().length > 0
      ? analyzeSecretRaw.trim()
      : undefined;

  return {
    apiUrl: `${apiBaseUrl.replace(/\/+$/, "")}/analyze`,
    analyzeSecret,
  };
}

function sendJson(res: any, status: number, payload: Record<string, unknown>) {
  res.status(status).setHeader("Content-Type", "application/json; charset=utf-8");
  res.send(JSON.stringify(payload));
}

function prune(timestamps: number[], now: number): number[] {
  const cutoff = now - WINDOW_SECONDS;
  return timestamps.filter((timestamp) => timestamp > cutoff);
}

function checkRateLimit(clientIp: string, wantsMeaning: boolean): string | null {
  const now = Date.now();

  let general = generalBuckets.get(clientIp) ?? [];
  general = prune(general, now);
  if (general.length >= GENERAL_LIMIT) {
    return `Rate limit exceeded: ${GENERAL_LIMIT} requests per ${WINDOW_SECONDS / 1000}s`;
  }
  general.push(now);
  generalBuckets.set(clientIp, general);

  if (wantsMeaning) {
    let meaning = meaningBuckets.get(clientIp) ?? [];
    meaning = prune(meaning, now);
    if (meaning.length >= MEANING_LIMIT) {
      return `Meaning rate limit exceeded: ${MEANING_LIMIT} requests per ${WINDOW_SECONDS / 1000}s`;
    }
    meaning.push(now);
    meaningBuckets.set(clientIp, meaning);
  }

  return null;
}

function enforceAnalyzeSecurity(input: {
  content: string;
  content_type: string;
  options: AnalyzeOptions;
  clientIp?: string;
}): SecurityCheckResult {
  const clientIp = input.clientIp ?? "unknown";
  const contentLength = input.content.length;

  if (!input.content || !input.content.trim()) {
    console.warn(`[security] Rejected empty content from ${clientIp}`);
    return {
      reject: { status: 400, message: "content must not be empty" },
      meaningAllowed: false,
    };
  }

  if (contentLength > MAX_CONTENT_LENGTH) {
    console.warn(
      `[security] Rejected oversized request from ${clientIp}: ${contentLength} bytes (max ${MAX_CONTENT_LENGTH})`
    );
    return {
      reject: {
        status: 413,
        message: `content too large: ${contentLength} bytes (max ${MAX_CONTENT_LENGTH})`,
      },
      meaningAllowed: false,
    };
  }

  if (!VALID_CONTENT_TYPES.has(input.content_type)) {
    console.warn(
      `[security] Rejected invalid content_type "${input.content_type}" from ${clientIp}`
    );
    return {
      reject: {
        status: 400,
        message: `Invalid content_type: must be one of ${[...VALID_CONTENT_TYPES].join(", ")}`,
      },
      meaningAllowed: false,
    };
  }

  let meaningAllowed = false;
  if (input.options.run_meaning) {
    if (getBackendConfig().analyzeSecret) {
      meaningAllowed = true;
    }

    if (!meaningAllowed) {
      console.info(
        `[security] Meaning blocked - ANALYZE_SECRET not configured. Client ${clientIp}`
      );
    }
  }

  const rateLimitError = checkRateLimit(
    clientIp,
    input.options.run_meaning && meaningAllowed
  );
  if (rateLimitError) {
    console.warn(`[security] Rate limited ${clientIp}: ${rateLimitError}`);
    return {
      reject: { status: 429, message: rateLimitError },
      meaningAllowed: false,
    };
  }

  console.info(
    `[security] analyze request ip=${clientIp} size=${contentLength} meaning_requested=${input.options.run_meaning} meaning_allowed=${input.options.run_meaning ? meaningAllowed : "n/a"} content_type=${input.content_type}`
  );

  return { meaningAllowed };
}

async function readRawBody(req: any): Promise<string> {
  return await new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    req.on("data", (chunk: Buffer | string) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    req.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });

    req.on("error", (error: Error) => {
      reject(error);
    });

    req.on("aborted", () => {
      reject(new Error("Request body was aborted."));
    });
  });
}

function parseAnalyzeBody(rawBody: string): AnalyzeBody {
  let parsed: unknown = {};

  if (rawBody.trim()) {
    parsed = JSON.parse(rawBody);
  }

  const body = parsed && typeof parsed === "object" ? parsed : {};
  const record = body as Record<string, unknown>;
  const rawOptions =
    record.options && typeof record.options === "object"
      ? (record.options as Record<string, unknown>)
      : {};

  return {
    content: typeof record.content === "string" ? record.content : "",
    content_type:
      typeof record.content_type === "string" ? record.content_type : "",
    options: {
      run_meaning: Boolean(rawOptions.run_meaning),
      run_origin: Boolean(rawOptions.run_origin),
      run_verification: Boolean(rawOptions.run_verification),
    },
  };
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    sendJson(res, 405, { message: "Method not allowed" });
    return;
  }

  let body: AnalyzeBody;

  try {
    const rawBody = await readRawBody(req);
    body = parseAnalyzeBody(rawBody);
  } catch (error) {
    sendJson(res, 400, {
      message:
        error instanceof Error ? error.message : "Invalid JSON request body.",
    });
    return;
  }

  const clientIpHeader = req.headers["x-forwarded-for"];
  const clientIp = Array.isArray(clientIpHeader)
    ? clientIpHeader[0]
    : clientIpHeader?.split(",")[0].trim() ?? "unknown";

  try {
    const security = enforceAnalyzeSecurity({
      content: body.content,
      content_type: body.content_type,
      options: body.options,
      clientIp,
    });

    if (security.reject) {
      sendJson(res, security.reject.status, { message: security.reject.message });
      return;
    }

    const { apiUrl, analyzeSecret } = getBackendConfig();

    if (!analyzeSecret) {
      sendJson(res, 500, {
        message: "TOP_LEVEL_ANALYZE_SECRET_MISSING_V2",
        diagnostics: {
          hasAnalyzeSecretEnv: Boolean(process.env.ANALYZE_SECRET),
          vercelEnv: process.env.VERCEL_ENV ?? null,
          configPath: "process.env.ANALYZE_SECRET -> getBackendConfig().analyzeSecret",
          apiBaseUrlSource: process.env.ANALYZE_API_BASE_URL ? "env" : "default",
          visibleEnvNames: getVisibleEnvNames(),
        },
      });
      return;
    }

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-analyze-secret": analyzeSecret,
      },
      body: JSON.stringify({
        content: body.content,
        content_type: body.content_type,
        options: body.options,
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

      sendJson(res, response.status, { message });
      return;
    }

    try {
      sendJson(res, 200, JSON.parse(text));
    } catch {
      sendJson(res, 502, { message: "Backend returned invalid JSON." });
    }
  } catch (error) {
    sendJson(res, 502, {
      message:
        error instanceof Error
          ? error.message
          : "Analyze proxy request failed before backend completion.",
    });
  }
}
