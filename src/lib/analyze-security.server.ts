/**
 * Security guards for the analyze pipeline (server-only).
 * Ported from backend/app/security/guards.py.
 */

const MAX_CONTENT_LENGTH = 500_000;
const VALID_CONTENT_TYPES = new Set(["text", "html", "xml", "json"]);
const GENERAL_LIMIT = 30;
const MEANING_LIMIT = 5;
const WINDOW_SECONDS = 60_000; // ms

// In-memory sliding window rate limiter
const generalBuckets = new Map<string, number[]>();
const meaningBuckets = new Map<string, number[]>();

function prune(timestamps: number[], now: number): number[] {
  const cutoff = now - WINDOW_SECONDS;
  return timestamps.filter((t) => t > cutoff);
}

function checkRateLimit(
  clientIp: string,
  wantsMeaning: boolean
): string | null {
  const now = Date.now();

  // General
  let gen = generalBuckets.get(clientIp) ?? [];
  gen = prune(gen, now);
  if (gen.length >= GENERAL_LIMIT) {
    return `Rate limit exceeded: ${GENERAL_LIMIT} requests per ${WINDOW_SECONDS / 1000}s`;
  }
  gen.push(now);
  generalBuckets.set(clientIp, gen);

  // Meaning (stricter)
  if (wantsMeaning) {
    let m = meaningBuckets.get(clientIp) ?? [];
    m = prune(m, now);
    if (m.length >= MEANING_LIMIT) {
      return `Meaning rate limit exceeded: ${MEANING_LIMIT} requests per ${WINDOW_SECONDS / 1000}s`;
    }
    m.push(now);
    meaningBuckets.set(clientIp, m);
  }

  return null;
}

export interface SecurityCheckResult {
  /** If set, reject with this status + message */
  reject?: { status: number; message: string };
  /** Whether meaning execution is allowed */
  meaningAllowed: boolean;
}

export function enforceAnalyzeSecurity(input: {
  content: string;
  content_type: string;
  options: { run_meaning: boolean; run_origin: boolean; run_verification: boolean };
  clientIp?: string;
  authHeader?: string;
  analyzeSecretHeader?: string;
}): SecurityCheckResult {
  const clientIp = input.clientIp ?? "unknown";
  const contentLen = input.content.length;

  // 1. Empty content
  if (!input.content || !input.content.trim()) {
    console.warn(
      `[security] Rejected empty content from ${clientIp}`
    );
    return { reject: { status: 400, message: "content must not be empty" }, meaningAllowed: false };
  }

  // 2. Content size
  if (contentLen > MAX_CONTENT_LENGTH) {
    console.warn(
      `[security] Rejected oversized request from ${clientIp}: ${contentLen} bytes (max ${MAX_CONTENT_LENGTH})`
    );
    return {
      reject: { status: 413, message: `content too large: ${contentLen} bytes (max ${MAX_CONTENT_LENGTH})` },
      meaningAllowed: false,
    };
  }

  // 3. Content type validation
  if (!VALID_CONTENT_TYPES.has(input.content_type)) {
    console.warn(
      `[security] Rejected invalid content_type "${input.content_type}" from ${clientIp}`
    );
    return {
      reject: { status: 400, message: `Invalid content_type: must be one of ${[...VALID_CONTENT_TYPES].join(", ")}` },
      meaningAllowed: false,
    };
  }

  // 4. Meaning authorization
  let meaningAllowed = false;
  if (input.options.run_meaning) {
    const serverSecret = process.env.ANALYZE_SECRET ?? "";

    if (serverSecret && input.analyzeSecretHeader === serverSecret) {
      meaningAllowed = true;
    } else if (
      input.authHeader &&
      input.authHeader.startsWith("Bearer ") &&
      input.authHeader.length > 10
    ) {
      meaningAllowed = true;
    }

    if (!meaningAllowed) {
      console.info(
        `[security] Meaning blocked for unauthorized caller ${clientIp} — forcing skip`
      );
    }
  }

  // 5. Rate limiting
  const rateResult = checkRateLimit(
    clientIp,
    input.options.run_meaning && meaningAllowed
  );
  if (rateResult) {
    console.warn(`[security] Rate limited ${clientIp}: ${rateResult}`);
    return { reject: { status: 429, message: rateResult }, meaningAllowed: false };
  }

  // 6. Security log
  console.info(
    `[security] analyze request ip=${clientIp} size=${contentLen} meaning_requested=${input.options.run_meaning} meaning_allowed=${input.options.run_meaning ? meaningAllowed : "n/a"} content_type=${input.content_type}`
  );

  return { meaningAllowed };
}
