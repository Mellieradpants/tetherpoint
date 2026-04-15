import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { enforceAnalyzeSecurity } from "./analyze-security.server";
import { runMeaningLayer } from "./meaning.server";

// Minimal TypeScript reimplementation of the Tetherpoint pipeline for the preview.
// The canonical implementation is backend/app/ (Python).

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
  const blocks: string[] = [];
  const blockRe = /<(p|h[1-6]|li|td|th|title|blockquote|figcaption)[^>]*>([\s\S]*?)<\/\1>/gi;
  let m;
  while ((m = blockRe.exec(content)) !== null) {
    const text = m[2].replace(/<[^>]+>/g, "").trim();
    if (text) blocks.push(text);
  }
  if (blocks.length === 0) {
    return splitSentences(content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
  }
  const results: string[] = [];
  for (const block of blocks) results.push(...splitSentences(block));
  return results;
}

const JURISDICTION_RE = /\b(federal|state|national|court|SEC|FDA|EPA|FCC|FERC|NERC|Congress|Senate|House)\b/i;
const MECHANISM_RE = /\b(enforce(?:ment|d|s)?|penalty|fine|audit|compliance|regulation|rule|statute)\b/i;
const WHEN_RE = /\b((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s*\d{4}|\d{4}-\d{2}-\d{2})\b/i;
const ACTION_RE = /\b(shall|must|may|will|enacted|issued|published|reported|ruled|filed|announced|declared|stated|required|approved|signed|established|created|removed|amended|authorized|prohibited|mandated|ordered|determined|concluded|found|held|decided|rejected|granted|denied|proposed|adopted|implemented|enforced|suspended|revoked|repealed|overturned|upheld|affirmed|reversed|dismissed|certified|designated|allocated|distributed|transferred|submitted|registered|disclosed|notified|assessed|evaluated|reviewed|examined|investigated|prosecuted|convicted|sentenced|fined|penalized|sanctioned|regulated|monitored|supervised|administered|managed|operated|maintained|controlled|directed|instructed|recommended|advised|warned|cautioned|restricted|limited|expanded|extended|renewed|modified|revised|updated|replaced|eliminated|reduced|increased|decreased|raised|lowered|set|fixed|defined|specified|identified|classified|categorized|assigned|appointed|elected|nominated|confirmed|ratified|endorsed|supported|opposed|vetoed|blocked|halted|delayed|postponed|accelerated|expedited)\b/i;
const INTENT_RE = /\b(intend(?:s|ed)?|aim(?:s|ed)?|goal is)\b/i;

// --- Sentence completeness detection ---
// A subject pattern: capitalized word(s) or known entity patterns at start or after comma
const SUBJECT_RE = /(?:^|[,;]\s*)(?:the\s+)?(?:[A-Z][a-zA-Z]*(?:\s+(?:of|and|for|the|in)\s+)?)+/;
// A predicate pattern: a verb or verbal phrase
const PREDICATE_RE = /\b(is|are|was|were|has|had|have|will|shall|must|may|can|could|would|should|do|does|did|said|says|announced|stated|reported|declared|enacted|issued|published|ruled|filed|requires?|provides?|establishes?|creates?|removes?|amends?|authorizes?|prohibits?|mandates?|orders?|determines?|concludes?|finds?|holds?|decides?|grants?|denies?|proposes?|adopts?|implements?|enforces?|revokes?|repeals?|signed|approved|upheld|affirmed|reversed|dismissed|passed|submitted|allocated|transferred|designated|certified|assessed|evaluated|reviewed|examined|investigated|convicted|sentenced|regulated|monitored|administered|operated|maintained|controlled|directed|recommended|restricted|expanded|extended|renewed|modified|revised|updated|replaced|eliminated|reduced|increased|set|defined|specified|identified|classified|appointed|elected|nominated|confirmed|ratified|endorsed|supported|opposed|vetoed|blocked|delayed|complied?)\b/i;

/**
 * Check if a text segment is a semantically complete sentence
 * (has both a subject/actor and a predicate/action).
 */
function isCompleteStatement(text: string): boolean {
  const trimmed = text.trim();
  // Too short to be a real sentence
  if (trimmed.length < 10) return false;
  // Must have a subject-like pattern
  if (!SUBJECT_RE.test(trimmed)) return false;
  // Must have a verb/predicate
  if (!PREDICATE_RE.test(trimmed)) return false;
  // Must end with sentence-ending punctuation or be long enough to be meaningful
  if (!/[.!?;]$/.test(trimmed) && trimmed.length < 40) return false;
  return true;
}

/**
 * Merge fragments forward until each segment is a complete statement.
 * Fragments that cannot be completed are marked as non_actionable_fragment.
 */
function mergeFragments(segments: string[]): { text: string; fragment: boolean }[] {
  const results: { text: string; fragment: boolean }[] = [];
  let buffer = "";

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i].trim();
    if (!seg) continue;

    if (buffer) {
      buffer = buffer + " " + seg;
    } else {
      buffer = seg;
    }

    if (isCompleteStatement(buffer)) {
      results.push({ text: buffer, fragment: false });
      buffer = "";
    }
  }

  // Remaining buffer: try to emit if complete, otherwise mark as fragment
  if (buffer.trim()) {
    if (isCompleteStatement(buffer)) {
      results.push({ text: buffer, fragment: false });
    } else {
      results.push({ text: buffer, fragment: true });
    }
  }

  return results;
}

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

function buildNode(idx: number, text: string, isFragment: boolean = false) {
  const jurisdiction = JURISDICTION_RE.exec(text)?.[0] || null;
  const mechanism = MECHANISM_RE.exec(text)?.[0] || null;
  const when = WHEN_RE.exec(text)?.[0] || null;
  const action = ACTION_RE.exec(text)?.[0] || null;
  const blocked_flags: string[] = [];
  if (INTENT_RE.test(text)) blocked_flags.push("intent_attribution");
  if (isFragment) blocked_flags.push("non_actionable_fragment");
  const tags: string[] = [];
  if (jurisdiction) tags.push("has_jurisdiction");
  if (mechanism) tags.push("has_mechanism");

  return {
    node_id: `node-${String(idx).padStart(4, "0")}`,
    source_anchor: `char:${idx}`,
    source_text: text,
    normalized_text: text.replace(/\s+/g, " ").trim(),
    
    actor: null, action, condition: null, temporal: null,
    jurisdiction, mechanism, risk: null, tags, blocked_flags,
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

interface AnalyzeInput {
  content: string;
  content_type: string;
  options: { run_meaning: boolean; run_origin: boolean; run_verification: boolean };
}

export const analyzePipeline = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => input as AnalyzeInput)
  .handler(async ({ data }: { data: AnalyzeInput }) => {
    const { content, content_type: contentType, options } = data;

    // --- Security enforcement ---
    let clientIp = "unknown";
    try {
      const forwarded = getRequestHeader("x-forwarded-for");
      clientIp = forwarded?.split(",")[0].trim() ?? "unknown";
    } catch {}

    const security = enforceAnalyzeSecurity({
      content,
      content_type: contentType,
      options,
      clientIp,
    });

    if (security.reject) {
      throw new Error(`[${security.reject.status}] ${security.reject.message}`);
    }

    // Force meaning off if not authorized
    const effectiveOptions = {
      ...options,
      run_meaning: options.run_meaning && security.meaningAllowed,
    };

    // 1. Input
    const inputResult = {
      raw_content: content,
      content_type: contentType,
      size: new TextEncoder().encode(content).length,
      parse_status: "ok",
      parse_errors: [] as string[],
    };

    // 2. Structure – merge fragments into complete statements
    const rawSegments = contentType === "html" ? extractFromHtml(content) : splitSentences(content);
    const merged = mergeFragments(rawSegments.filter(s => s.trim()));
    const nodes = merged.map((m, i) => buildNode(i, m.text.trim(), m.fragment));

    // 3. Selection
    const selected = nodes.filter(n => n.blocked_flags.length === 0 && (n.tags.length > 0 || n.action));
    const excluded = nodes.filter(n => !selected.includes(n));

    // 4. Meaning
    let meaningResult: { status: string; message: string; node_results: Array<{ node_id: string; lenses: string[]; summary: string | null }> };

    if (effectiveOptions.run_meaning) {
      meaningResult = await runMeaningLayer(
        selected.map((n) => ({ node_id: n.node_id, source_text: n.source_text })),
      );
    } else {
      meaningResult = {
        status: "skipped",
        message: options.run_meaning && !security.meaningAllowed
          ? "Unauthorized — meaning blocked"
          : "Skipped by options",
        node_results: [],
      };
    }

    // 5. Origin
    const originSignals = options.run_origin && contentType === "html"
      ? extractOriginHtml(content) : { identity: [], metadata: [], distribution: [] };

    // 6. Verification
    const verificationNodes = options.run_verification ? selected.map(n => {
      let aType: string | null = null;
      let detected = false;
      for (const [re, type] of ASSERTION_PATTERNS) {
        if (re.test(n.source_text)) { aType = type; detected = true; break; }
      }
      return {
        node_id: n.node_id, assertion_detected: detected, assertion_type: aType,
        verification_path_available: detected,
        expected_record_systems: aType ? (RECORD_SYSTEMS[aType] || []) : [],
        verification_notes: detected ? `Type '${aType}' detected` : "No assertion detected",
      };
    }) : [];

    return {
      input: inputResult,
      structure: { nodes, node_count: nodes.length },
      selection: {
        selected_nodes: selected, excluded_nodes: excluded,
        selection_log: nodes.map(n => `${n.node_id}: ${selected.includes(n) ? "SELECTED" : "EXCLUDED"}`),
      },
      meaning: meaningResult,
      origin: {
        status: options.run_origin ? "executed" : "skipped",
        origin_identity_signals: originSignals.identity,
        origin_metadata_signals: originSignals.metadata,
        distribution_signals: originSignals.distribution,
        evidence_trace: [],
      },
      verification: { status: options.run_verification ? "executed" : "skipped", node_results: verificationNodes },
      output: {
        summary: { content_type: contentType, parse_status: "ok", input_size: inputResult.size },
        total_nodes: nodes.length, selected_count: selected.length, excluded_count: excluded.length,
        meaning_status: meaningResult.status,
        origin_status: options.run_origin ? "executed" : "skipped",
        verification_status: options.run_verification ? "executed" : "skipped",
      },
      errors: [],
    };
  });
