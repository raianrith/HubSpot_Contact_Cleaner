export function normalizeWhitespace(input: string): string {
  return (input ?? "")
    .normalize("NFC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, " ")
    .replace(/[‘’‛ʼ]/g, "'")
    .replace(/[“”‟]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

export function lettersOnly(input: string): string {
  return input.toLowerCase().replace(/[^a-z]/g, "");
}

/** Title-case a word, keeping short apostrophe tails like 's lowercase. */
export function titleWord(lower: string): string {
  if (!lower) return lower;
  if (lower.includes("'")) {
    return lower
      .split("'")
      .map((part, index) => {
        if (!part) return "";
        if (index > 0 && part.length <= 2) return part.toLowerCase();
        return part.charAt(0).toUpperCase() + part.slice(1);
      })
      .join("'");
  }
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}
