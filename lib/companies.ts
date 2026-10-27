import type { ChangeCategory, CompanyAlignment, SimilarCompany } from "./types";
import { levenshtein } from "./levenshtein";
import { normalizeWhitespace, titleWord } from "./text";

const SMALL = new Set(["and", "or", "of", "the", "for", "in", "on", "at", "by", "to", "a", "an", "nor", "de", "du", "la"]);

const ACRONYMS = new Set([
  "usa",
  "us",
  "uk",
  "eu",
  "uae",
  "ibm",
  "ups",
  "usps",
  "hvac",
  "erp",
  "crm",
  "b2b",
  "dba",
  "hq",
  "ymca",
  "poet",
  "basf",
  "aecom",
  "uppco",
  "megi",
  "erco",
  "gfl",
  "mgo",
  "jsi",
  "afk",
  "pwc",
  "kpmg",
  "hsbc",
  "bbva",
  "rbc",
  "bmo",
  "3m",
  "ge",
  "hp",
  "bmw",
  "gm",
  "bp",
  "att",
  "at&t",
  "sap",
  "abb",
  "skf",
  "ncr",
  "amd",
  "intel",
]);

const ACRONYM_DISPLAY: Record<string, string> = {
  "3m": "3M",
  "at&t": "AT&T",
  att: "AT&T",
};

const SUFFIX_WORD =
  "incorporated|inc\\.?|l\\.?l\\.?c\\.?|llc|corp\\.?|corporation|company|co\\.?|ltd\\.?|limited|l\\.?l\\.?p\\.?|llp|lp|p\\.?l\\.?l\\.?c\\.?|pllc|plc|p\\.?c\\.?|pc|gmbh";
const SUFFIX_RE = new RegExp(`^(.*?)(?:[,\\s]+)(${SUFFIX_WORD})$`, "i");

export interface CompanyNote {
  category: Extract<ChangeCategory, "company_format" | "company_align">;
  reason: string;
}

export interface CompanyPass {
  values: string[];
  notes: CompanyNote[][];
  alignments: CompanyAlignment[];
  similar: SimilarCompany[];
}

function standardizeSuffix(word: string): string {
  const key = word.toLowerCase().replace(/\./g, "");
  switch (key) {
    case "incorporated":
    case "inc":
      return "Inc.";
    case "llc":
      return "LLC";
    case "corp":
      return "Corp.";
    case "corporation":
      return "Corporation";
    case "company":
      return "Company";
    case "co":
      return "Co.";
    case "ltd":
    case "limited":
      return "Ltd.";
    case "llp":
      return "LLP";
    case "lp":
      return "LP";
    case "plc":
      return "PLC";
    case "pllc":
      return "PLLC";
    case "pc":
      return "PC";
    case "gmbh":
      return "GmbH";
    default:
      return word;
  }
}

function formatCompanyToken(token: string, index: number): string {
  if (!token || token === "&" || token === "+" || token === "/") return token;
  if (/^([A-Za-z]\.)+[A-Za-z]?\.?$/.test(token) && token.includes(".")) {
    const letters = token.replace(/\./g, "");
    if (letters.length >= 1 && letters.length <= 3) {
      return `${letters.toUpperCase().split("").join(".")}.`;
    }
  }
  if (token.includes("-")) {
    return token
      .split("-")
      .map((part) => (part ? formatCompanyToken(part, index) : part))
      .join("-");
  }

  const lower = token.toLowerCase().replace(/\.$/, "");
  if (lower === "co") return "Co.";
  if (ACRONYMS.has(lower) || ACRONYMS.has(token.toLowerCase())) {
    return ACRONYM_DISPLAY[lower] ?? ACRONYM_DISPLAY[token.toLowerCase()] ?? lower.toUpperCase();
  }
  if (/[a-z]/.test(token) && /[A-Z]/.test(token) && !/^[A-Z]{2,}[a-z]/.test(token)) {
    return token.replace(/\.$/, "");
  }
  if (/^[A-Z0-9&]{2,3}$/.test(token) && !SMALL.has(token.toLowerCase())) return token;
  if (/\d/.test(token)) return token.length <= 5 ? token.toUpperCase() : token;
  if (SMALL.has(lower) && index !== 0) return lower;
  if (/^mc[a-z]{2,}$/.test(lower)) return `Mc${lower.charAt(2).toUpperCase()}${lower.slice(3)}`;
  return titleWord(lower);
}

export function formatCompanyBase(base: string): string {
  const trimmed = normalizeWhitespace(base);
  if (!trimmed) return "";
  if (/^[A-Z0-9&]{2,6}$/.test(trimmed) && ACRONYMS.has(trimmed.toLowerCase())) {
    return ACRONYM_DISPLAY[trimmed.toLowerCase()] ?? trimmed;
  }
  return trimmed
    .split(" ")
    .filter(Boolean)
    .map((token, index) => formatCompanyToken(token, index))
    .join(" ");
}

function extractSuffix(input: string): { body: string; suffix: string; hadComma: boolean } {
  const match = input.match(SUFFIX_RE);
  if (!match) return { body: input, suffix: "", hadComma: false };
  const body = match[1].trim().replace(/[,\s]+$/g, "");
  if (body.replace(/[^a-z0-9]/gi, "").length < 2) return { body: input, suffix: "", hadComma: false };
  const hadComma = /,\s*$/.test(input.slice(0, input.length - match[2].length));
  return { body, suffix: standardizeSuffix(match[2]), hadComma };
}

function formatQualifier(type: "paren" | "dash", value: string): string {
  const inner = normalizeWhitespace(value);
  if (type === "paren") {
    const key = inner.replace(/[^a-z0-9]/gi, "").toLowerCase();
    if (ACRONYMS.has(key) || /^[a-z]{1,3}$/i.test(inner)) return `(${inner.toUpperCase()})`;
    return `(${formatCompanyBase(inner)})`;
  }
  return formatCompanyBase(inner);
}

function extractQualifiers(body: string): { base: string; qualifiers: string[] } {
  let current = body.trim();
  const found: { type: "paren" | "dash"; value: string }[] = [];
  for (let guard = 0; guard < 4; guard++) {
    const paren = current.match(/^(.*)\s+\(([^()]*)\)$/);
    if (paren && paren[1].replace(/[^a-z0-9]/gi, "").length >= 3) {
      found.unshift({ type: "paren", value: paren[2] });
      current = paren[1].trim();
      continue;
    }
    const dash = current.match(/^(.*?)\s+-\s+(.+)$/);
    if (
      dash &&
      dash[1].replace(/[^a-z0-9]/gi, "").length >= 3 &&
      dash[2].replace(/[^a-z0-9]/gi, "").length >= 2
    ) {
      found.unshift({ type: "dash", value: dash[2] });
      current = dash[1].trim();
      continue;
    }
    break;
  }
  return { base: current, qualifiers: found.map((item) => formatQualifier(item.type, item.value)) };
}

export function assembleCompany(base: string, qualifiers: string[], suffix: string, hadComma = false): string {
  let value = base.trim();
  for (const qualifier of qualifiers) {
    value += qualifier.startsWith("(") ? ` ${qualifier}` : ` - ${qualifier}`;
  }
  if (!suffix) return value;
  if (value.endsWith("&")) return `${value} ${suffix}`;
  if (suffix === "Company" || suffix === "Corporation") return `${value} ${suffix}`;
  const comma = hadComma || value.endsWith(".") || suffix === "LLC" || suffix === "LLP" || suffix === "PLLC";
  return comma ? `${value}, ${suffix}` : `${value} ${suffix}`;
}

interface ParsedCompany {
  raw: string;
  empty: boolean;
  full: string;
  base: string;
  key: string;
  qualifiers: string[];
  suffix: string;
  hadComma: boolean;
}

function parseCompany(raw: string): ParsedCompany {
  let normalized = normalizeWhitespace(raw);
  if (!normalized) {
    return { raw, empty: true, full: "", base: "", key: "", qualifiers: [], suffix: "", hadComma: false };
  }
  normalized = normalized.replace(/([A-Za-z]{4,})\.(?=\s+(?:llc|l\.l\.c\.?|inc\.?|corp\.?|co\.?|ltd\.?)\b)/i, "$1,");
  const { body, suffix, hadComma } = extractSuffix(normalized);
  const { base, qualifiers } = extractQualifiers(body);
  const formattedBase = formatCompanyBase(base);
  const full = assembleCompany(formattedBase, qualifiers, suffix, hadComma || formattedBase.endsWith("."));
  const key = formattedBase.toLowerCase().replace(/[^a-z0-9]/g, "");
  return { raw, empty: false, full, base: formattedBase, key, qualifiers, suffix, hadComma: hadComma || formattedBase.endsWith(".") };
}

function modeSuffix(counts: Map<string, number>): { label: string; comma: boolean } {
  let best = { label: "", comma: false };
  let bestCount = -1;
  for (const [key, count] of counts) {
    const comma = key.startsWith("1");
    const label = key.slice(2);
    const prefer = count === bestCount && best.label === "" && label !== "";
    if (count > bestCount || prefer) {
      best = { label, comma };
      bestCount = count;
    }
  }
  return best;
}

function mode(counts: Map<string, number>, preferNonEmpty: boolean): string {
  let best = "";
  let bestCount = -1;
  for (const [key, count] of counts) {
    if (count > bestCount) {
      best = key;
      bestCount = count;
      continue;
    }
    if (count === bestCount && preferNonEmpty && best === "" && key !== "") best = key;
  }
  return best;
}

function findSimilar(parts: ParsedCompany[]): SimilarCompany[] {
  const reps = new Map<string, { label: string; count: number }>();
  for (const part of parts) {
    if (!part.key) continue;
    const current = reps.get(part.key) ?? { label: part.base, count: 0 };
    current.count += 1;
    if (part.base.length > current.label.length) current.label = part.base;
    reps.set(part.key, current);
  }
  const entries = [...reps.entries()];
  const similar: SimilarCompany[] = [];
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const [leftKey, left] = entries[i];
      const [rightKey, right] = entries[j];
      if (leftKey.length < 8 || rightKey.length < 8) continue;
      if (Math.abs(leftKey.length - rightKey.length) > 1) continue;
      if (leftKey.slice(0, 4) !== rightKey.slice(0, 4)) continue;
      if (levenshtein(leftKey, rightKey) !== 1) continue;
      similar.push({ a: left.label, b: right.label, rowsA: left.count, rowsB: right.count });
    }
  }
  similar.sort((a, b) => Math.min(a.rowsA, a.rowsB) - Math.min(b.rowsA, b.rowsB));
  return similar.slice(0, 12);
}

export function standardizeCompanies(rawValues: string[], align: boolean): CompanyPass {
  const parts = rawValues.map(parseCompany);
  const notes: CompanyNote[][] = parts.map(() => []);
  const values = parts.map((part) => part.full);

  if (align) {
    const groups = new Map<string, number[]>();
    parts.forEach((part, index) => {
      if (!part.key) return;
      const list = groups.get(part.key) ?? [];
      list.push(index);
      groups.set(part.key, list);
    });

    for (const indexes of groups.values()) {
      if (indexes.length < 2) continue;
      const bases = new Map<string, number>();
      const suffixGroups = new Map<string, Map<string, number>>();
      for (const index of indexes) {
        const part = parts[index];
        bases.set(part.base, (bases.get(part.base) ?? 0) + 1);
        const qualifierKey = part.qualifiers.join("|");
        const suffixes = suffixGroups.get(qualifierKey) ?? new Map<string, number>();
        const styleKey = `${part.hadComma ? "1" : "0"}|${part.suffix}`;
        suffixes.set(styleKey, (suffixes.get(styleKey) ?? 0) + 1);
        suffixGroups.set(qualifierKey, suffixes);
      }
      const canonicalBase = mode(bases, false);
      const canonicalSuffix = new Map<string, { label: string; comma: boolean }>();
      for (const [qualifierKey, suffixes] of suffixGroups) {
        canonicalSuffix.set(qualifierKey, modeSuffix(suffixes));
      }
      for (const index of indexes) {
        const part = parts[index];
        const qualifierKey = part.qualifiers.join("|");
        const chosen = canonicalSuffix.get(qualifierKey) ?? { label: part.suffix, comma: part.hadComma };
        values[index] = assembleCompany(canonicalBase, part.qualifiers, chosen.label, chosen.comma);
      }
    }
  }

  const alignmentCounts = new Map<string, CompanyAlignment>();
  parts.forEach((part, index) => {
    const after = values[index];
    if (part.raw === after) return;
    if (part.full !== part.raw) {
      notes[index].push({
        category: "company_format",
        reason: "Standardized company capitalization and legal suffix",
      });
    }
    if (after !== part.full) {
      notes[index].push({
        category: "company_align",
        reason: "Aligned to the most common spelling of this company in the file",
      });
    }
    if (notes[index].length === 0) {
      notes[index].push({ category: "company_format", reason: "Standardized company name" });
    }
    const from = normalizeWhitespace(part.raw);
    if (!from || from === after) return;
    const id = `${from}\n${after}`;
    const current = alignmentCounts.get(id) ?? { from, to: after, count: 0 };
    current.count += 1;
    alignmentCounts.set(id, current);
  });

  const alignments = [...alignmentCounts.values()].sort((a, b) => b.count - a.count);

  return { values, notes, alignments, similar: findSimilar(parts) };
}
