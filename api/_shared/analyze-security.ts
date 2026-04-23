const MAX_CONTENT_LENGTH = 500_000;
const VALID_CONTENT_TYPES = new Set(["text", "html", "xml", "json"]);
const GENERAL_LIMIT = 30;
const MEANING_LIMIT = 5;
const WINDOW_SECONDS = 60_000; // ms

const generalBuckets = new Map<string, number[]>();
const meaningBuckets = new Map<string, number[]>();

function prune(timestamps: number[], now: number): number[] {
  const cutoff = now - WINDOW_SECONDS;
  return timestamps.filter((t) => t > cutoff);
}

function checkRateLimit(clientIp: string, wantsMeaning: boolean): string | null {
  const now = Date.now();

  let gen = generalBuckets.get(clientIp) ?? [];
  gen = prune(gen, now);
  if (gen.length >= GENERAL_LIMIT) {
    return `Rate limit exceeded: ${GENERAL_LIMIT} requests per ${WINDOW_SECONDS / 1000}s`;
  }
  gen.push(now);
  generalBuckets.set(clientIp, gen);

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

export interface SecurityCheckResult {
  reject?: { status: number; message: string };
  meaningAllowed: boolean;
}

export function enforceAnalyzeSecurity(input: {
  content: string;
  content_type: string;
  options: { run_meaning: boolean; run_origin: boolean; run_verification: boolean };
  clientIp?: string;
}): SecurityCheckResult {
  const clientIp = input.clientIp ?? "unknown";
  const contentLen = input.content.length;

  if (!input.content || !input.content.trim()) {
    console.warn(`[security] Rejected empty content from ${clientIp}`);
    return {
      reject: { status: 400, message: "content must not be empty" },
      meaningAllowed: false,
    };
  }

  if (contentLen > MAX_CONTENT_LENGTH) {
    console.warn(
      `[security] Rejected oversized request from ${clientIp}: ${contentLen} bytes (max ${MAX_CONTENT_LENGTH})`
    );
    return {
      reject: {
        status: 413,
        message: `content too large: ${contentLen} bytes (max ${MAX_CONTENT_LENGTH})`,
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
    const serverSecret = process.env.ANALYZE_SECRET ?? "";
    if (serverSecret) {
      meaningAllowed = true;
    }

    if (!meaningAllowed) {
      console.info(
        `[security] Meaning blocked - ANALYZE_SECRET not configured. Client ${clientIp}`
      );
    }
  }

  const rateResult = checkRateLimit(
    clientIp,
    input.options.run_meaning && meaningAllowed
  );
  if (rateResult) {
    console.warn(`[security] Rate limited ${clientIp}: ${rateResult}`);
    return { reject: { status: 429, message: rateResult }, meaningAllowed: false };
  }

  console.info(
    `[security] analyze request ip=${clientIp} size=${contentLen} meaning_requested=${input.options.run_meaning} meaning_allowed=${input.options.run_meaning ? meaningAllowed : "n/a"} content_type=${input.content_type}`
  );

  return { meaningAllowed };
}
