import { createFileRoute } from "@tanstack/react-router";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// Minimal TypeScript reimplementation of the Tetherpoint pipeline for the preview.
// The canonical implementation is backend/app/ (Python). This is a lightweight
// mirror so the frontend can be tested without running the FastAPI server.

const ABBREVIATIONS = new Set([
  "v","vs","mr","mrs","ms","dr","jr","sr","inc","corp","ltd","co","no","nos",
  "st","ave","dept","gen","gov","prof","rep","sen","etc","al","vol","rev","ed",
]);

function splitSentences(text: string): string[] {
  const raw = text.split(/(?<=[.!?])\s+(?=[A-Z])/);
  const merged: string[] = [];
  for (const part of raw) {
    if (merged.length > 0) {
      const prev = merged[merged.length - 1];
      const m = prev.match(/\b(\w+)\.\s*$/);
      if (m && ABBREVIATIONS.has(m[1].toLowerCase())) {
        merged[merged.length - 1] = prev + " " + part;
        continue;
      }
    }
    merged.push(part);
  }
  return merged;
}

function extractFromHtml(content: string): string[] {
  // Extract text from block elements
  const blocks: string[] = [];
  const blockRe = /<(p|h[1-6]|li|td|th|title|blockquote|figcaption)[^>]*>([\s\S]*?)<\/\1>/gi;
  let m;
  while ((m = blockRe.exec(content)) !== null) {
    const text = m[2].replace(/<[^>]+>/g, "").trim();
    if (text) blocks.push(text);
  }
  if (blocks.length === 0) {
    const text = content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    return splitSentences(text);
  }
  const results: string[] = [];
  for (const block of blocks) {
    results.push(...splitSentences(block));
  }
  return results;
}

const JURISDICTION_RE = /\b(federal|state|national|court|SEC|FDA|EPA|FCC|FERC|NERC|Congress|Senate|House)\b/i;
const MECHANISM_RE = /\b(enforce(?:ment|d|s)?|penalty|fine|audit|compliance|regulation|rule|statute)\b/i;
const WHEN_RE = /\b((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s*\d{4}|\d{4}-\d{2}-\d{2})\b/i;
const ACTION_RE = /\b(shall|must|may|will|enacted|issued|published|reported|ruled|filed)\b/i;
const INTENT_RE = /\b(intend(?:s|ed)?|aim(?:s|ed)?|goal is)\b/i;

const ASSERTION_PATTERNS: [RegExp, string][] = [
  [/\b(enacted|statute|Public Law|legislation|Congress)\b/i, "legal_legislative"],
  [/\b(court|ruled|judgment|opinion|v\.\s)/i, "court_case_law"],
  [/\b(government|agency|executive order|federal register)\b/i, "government_regulatory"],
  [/\b(study|published|journal|research|clinical)\b/i, "scientific_biomedical"],
  [/\b(\d+%|percent|statistic|survey|median|average)\b/i, "statistical_data"],
  [/\b(SEC|revenue|earnings|quarterly|fiscal|stock|shares)\b/i, "corporate_financial"],
  [/\b(grid|energy|infrastructure|transmission|pipeline|utility)\b/i, "infrastructure_energy"],
];

const RECORD_SYSTEMS: Record<string, string[]> = {
  legal_legislative: ["Congress.gov", "GovInfo", "Federal Register"],
  court_case_law: ["CourtListener", "GovInfo"],
  government_regulatory: ["Federal Register", "Regulations.gov"],
  scientific_biomedical: ["PubMed", "JSTOR"],
  statistical_data: ["Census.gov", "BLS"],
  corporate_financial: ["SEC EDGAR"],
  infrastructure_energy: ["FERC", "NERC", "EIA"],
};

function detectAssertion(text: string): { type: string | null; detected: boolean } {
  for (const [re, type] of ASSERTION_PATTERNS) {
    if (re.test(text)) return { type, detected: true };
  }
  return { type: null, detected: false };
}

function buildNode(idx: number, text: string) {
  const jurisdiction = JURISDICTION_RE.exec(text)?.[0] || null;
  const mechanism = MECHANISM_RE.exec(text)?.[0] || null;
  const when = WHEN_RE.exec(text)?.[0] || null;
  const action = ACTION_RE.exec(text)?.[0] || null;
  const blocked_flags: string[] = [];
  if (INTENT_RE.test(text)) blocked_flags.push("intent_attribution");

  const tags: string[] = [];
  if (jurisdiction) tags.push("has_jurisdiction");
  if (mechanism) tags.push("has_mechanism");

  return {
    node_id: `node-${String(idx).padStart(4, "0")}`,
    source_anchor: `char:${idx}`,
    source_text: text,
    normalized_text: text.replace(/\s+/g, " ").trim(),
    actor: null, action, condition: null, temporal: null,
    jurisdiction, mechanism, risk: null,
    tags, blocked_flags,
    who: null, what: null, when, where: null, why: null, how: null,
  };
}

function extractOriginHtml(content: string) {
  const identity: { signal: string; value: string; category: string | null }[] = [];
  const metadata: typeof identity = [];
  const distribution: typeof identity = [];

  const authorMatch = content.match(/<meta\s+name=["']author["']\s+content=["']([^"']+)["']/i);
  if (authorMatch) identity.push({ signal: "author", value: authorMatch[1], category: null });

  const titleMatch = content.match(/<title>([^<]+)<\/title>/i);
  if (titleMatch) metadata.push({ signal: "title", value: titleMatch[1], category: null });

  const ogRe = /<meta\s+property=["'](og:[^"']+)["']\s+content=["']([^"']+)["']/gi;
  let ogM;
  while ((ogM = ogRe.exec(content)) !== null) {
    distribution.push({ signal: ogM[1], value: ogM[2], category: "opengraph" });
  }

  // JSON-LD
  const ldMatch = content.match(/<script\s+type=["']application\/ld\+json["']>([\s\S]*?)<\/script>/i);
  if (ldMatch) {
    try {
      const ld = JSON.parse(ldMatch[1]);
      if (ld.publisher?.name) identity.push({ signal: "jsonld_publisher", value: ld.publisher.name, category: null });
      if (ld.author?.name) identity.push({ signal: "jsonld_author", value: ld.author.name, category: null });
    } catch {}
  }

  return { identity, metadata, distribution };
}

function runPipeline(content: string, contentType: string, options: { run_meaning: boolean; run_origin: boolean; run_verification: boolean }) {
  // 1. Input
  const inputResult = {
    raw_content: content,
    content_type: contentType,
    size: new TextEncoder().encode(content).length,
    parse_status: "ok" as string,
    parse_errors: [] as string[],
  };

  // 2. Structure
  let statements: string[];
  if (contentType === "html") {
    statements = extractFromHtml(content);
  } else {
    statements = splitSentences(content);
  }
  const nodes = statements.filter(s => s.trim()).map((s, i) => buildNode(i, s.trim()));
  const structureResult = { nodes, node_count: nodes.length };

  // 3. Selection
  const selected = nodes.filter(n => n.blocked_flags.length === 0 && (n.tags.length > 0 || n.action));
  const excluded = nodes.filter(n => !selected.includes(n));
  const selectionResult = {
    selected_nodes: selected,
    excluded_nodes: excluded,
    selection_log: nodes.map(n =>
      selected.includes(n) ? `${n.node_id}: SELECTED` : `${n.node_id}: EXCLUDED`
    ),
  };

  // 4. Meaning
  const meaningResult = {
    status: "skipped",
    message: options.run_meaning ? "Meaning not executed: no OPENAI_API_KEY configured" : "Meaning layer skipped by options",
    node_results: [],
  };

  // 5. Origin
  let originResult;
  if (options.run_origin) {
    const signals = contentType === "html" ? extractOriginHtml(content) : { identity: [], metadata: [], distribution: [] };
    originResult = {
      status: "executed",
      origin_identity_signals: signals.identity,
      origin_metadata_signals: signals.metadata,
      distribution_signals: signals.distribution,
      evidence_trace: [],
    };
  } else {
    originResult = { status: "skipped", origin_identity_signals: [], origin_metadata_signals: [], distribution_signals: [], evidence_trace: [] };
  }

  // 6. Verification
  let verificationResult;
  if (options.run_verification) {
    const nodeResults = selected.map(n => {
      const { type, detected } = detectAssertion(n.source_text);
      return {
        node_id: n.node_id,
        assertion_detected: detected,
        assertion_type: type,
        verification_path_available: detected,
        expected_record_systems: type ? (RECORD_SYSTEMS[type] || []) : [],
        verification_notes: detected ? `Assertion type '${type}' detected` : "No assertion detected",
      };
    });
    verificationResult = { status: "executed", node_results: nodeResults };
  } else {
    verificationResult = { status: "skipped", node_results: [] };
  }

  // 7. Output
  const outputResult = {
    summary: { content_type: contentType, parse_status: inputResult.parse_status, input_size: inputResult.size },
    total_nodes: nodes.length,
    selected_count: selected.length,
    excluded_count: excluded.length,
    meaning_status: meaningResult.status,
    origin_status: originResult.status,
    verification_status: verificationResult.status,
  };

  return {
    input: inputResult,
    structure: structureResult,
    selection: selectionResult,
    meaning: meaningResult,
    origin: originResult,
    verification: verificationResult,
    output: outputResult,
    errors: [],
  };
}

export const Route = createFileRoute("/api/analyze")({
  server: {
    handlers: {
      OPTIONS: async () => {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
      },
      POST: async ({ request }) => {
        try {
          const body = await request.json();
          const { content, content_type, options } = body as {
            content: string;
            content_type: string;
            options: { run_meaning: boolean; run_origin: boolean; run_verification: boolean };
          };

          const result = runPipeline(
            content,
            content_type,
            options || { run_meaning: false, run_origin: true, run_verification: true },
          );

          return new Response(JSON.stringify(result), {
            status: 200,
            headers: { "Content-Type": "application/json", ...CORS_HEADERS },
          });
        } catch (e) {
          return new Response(JSON.stringify({ error: String(e) }), {
            status: 422,
            headers: { "Content-Type": "application/json", ...CORS_HEADERS },
          });
        }
      },
    },
  },
});
