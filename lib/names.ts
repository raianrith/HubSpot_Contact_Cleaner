import type { FieldClean } from "./types";
import { normalizeWhitespace, titleWord } from "./text";

const PARTICLES = new Set([
  "da",
  "de",
  "del",
  "della",
  "di",
  "du",
  "la",
  "le",
  "van",
  "von",
  "der",
  "den",
  "ten",
  "ter",
  "bin",
  "al",
]);

const NAME_SUFFIXES: Record<string, string> = {
  jr: "Jr.",
  sr: "Sr.",
  ii: "II",
  iii: "III",
  iv: "IV",
};

function formatInitials(token: string): string | null {
  if (/^([A-Za-z]\.)+[A-Za-z]?\.?$/.test(token) && token.includes(".")) {
    const letters = token.replace(/\./g, "");
    if (letters.length < 1 || letters.length > 3) return null;
    return `${letters.toUpperCase().split("").join(".")}.`;
  }
  if (/^[A-Za-z]$/.test(token)) return token.toUpperCase();
  if (/^[A-Z]{2}$/.test(token) && !/[AEIOUY]/.test(token)) return token;
  return null;
}

function formatToken(
  token: string,
  index: number,
  count: number,
  originalWasUniform: boolean,
): string {
  const suffixKey = token.toLowerCase().replace(/\./g, "");
  if (index === count - 1 && count > 1 && NAME_SUFFIXES[suffixKey]) {
    return NAME_SUFFIXES[suffixKey];
  }

  const initials = formatInitials(token);
  if (initials) return initials;

  if (token.includes("-")) {
    return token
      .split("-")
      .map((part) => (part ? formatToken(part, 0, 1, originalWasUniform) : part))
      .join("-");
  }

  const lower = token.toLowerCase();
  if (index > 0 && PARTICLES.has(lower)) {
    if (!originalWasUniform && token === token.toLowerCase()) return lower;
    return titleWord(lower);
  }

  if (token.includes("'")) return titleWord(lower);
  if (/^mc[a-z]{2,}$/.test(lower)) {
    return `Mc${lower.charAt(2).toUpperCase()}${lower.slice(3)}`;
  }
  return titleWord(lower);
}

const PLACEHOLDER_NAMES = new Set(["null", "na", "n/a", "none", "unknown", "tbd", "nil"]);

function isPlaceholderName(token: string): boolean {
  const compact = token.toLowerCase().replace(/[^a-z0-9/]/g, "");
  return PLACEHOLDER_NAMES.has(compact) || /^[-.?]+$/.test(token);
}

export function cleanPersonName(input: string): FieldClean {
  let value = normalizeWhitespace(input);
  if (!value) return { value: "", reason: null };

  const tokens = value.split(" ").filter(Boolean);
  const kept = tokens.filter((token) => !isPlaceholderName(token));
  if (kept.length === 0) return { value: "", reason: "Removed a placeholder name" };
  const removedPlaceholder = kept.length !== tokens.length;
  value = kept.join(" ");

  const original = value;
  let reordered = false;
  if (/^[^,]+,[^,]+$/.test(value)) {
    const [last, rest] = value.split(",").map((part) => part.trim());
    if (last && rest && /[A-Za-z]/.test(last) && /[A-Za-z]/.test(rest)) {
      value = `${rest} ${last}`;
      reordered = true;
    }
  }

  const letters = value.replace(/[^A-Za-z]/g, "");
  const originalWasUniform =
    letters.length > 0 && (letters === letters.toUpperCase() || letters === letters.toLowerCase());
  const nameTokens = value.split(" ").filter(Boolean);
  const next = nameTokens
    .map((token, index) => formatToken(token, index, nameTokens.length, originalWasUniform))
    .join(" ");

  if (next === input.trim() && !removedPlaceholder) return { value: next, reason: null };
  if (removedPlaceholder && next === original && !reordered) return { value: next, reason: "Removed a placeholder name" };
  const reason = [
    removedPlaceholder ? "Removed a placeholder name" : "",
    reordered ? "Reordered to first name, then last name" : "",
    next !== original || (!removedPlaceholder && next !== input.trim()) ? "Standardized name capitalization" : "",
  ].filter(Boolean);
  return { value: next, reason: reason.join(" · ") || null };
}

export function nameLooksInvalid(value: string): boolean {
  if (!value) return false;
  if (value.includes("@")) return true;
  if (!/[A-Za-z]/.test(value)) return true;
  return false;
}
