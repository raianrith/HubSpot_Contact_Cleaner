import { lookupState } from "./addresses";
import type { ColumnMapping, FieldKind } from "./types";

export const FIELD_OPTIONS: { value: FieldKind; label: string }[] = [
  { value: "first_name", label: "First name" },
  { value: "last_name", label: "Last name" },
  { value: "full_name", label: "Full name" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "company", label: "Company" },
  { value: "job_title", label: "Job title" },
  { value: "address", label: "Street address" },
  { value: "city", label: "City" },
  { value: "state", label: "State / region" },
  { value: "postal_code", label: "Postal code" },
  { value: "country", label: "Country" },
  { value: "website", label: "Website" },
  { value: "id", label: "Record ID" },
  { value: "text", label: "Other text" },
  { value: "ignore", label: "Leave untouched" },
];

const SINGULAR = new Set<FieldKind>([
  "first_name",
  "last_name",
  "full_name",
  "company",
  "job_title",
  "website",
]);

interface Guess {
  kind: FieldKind;
  score: number;
  reason: string;
}

function headerGuess(header: string): Guess | null {
  const spaced = header.toLowerCase().replace(/[_./]+/g, " ").replace(/\s+/g, " ").trim();
  const compact = spaced.replace(/[^a-z0-9]/g, "");
  const rules: Guess[] = [];
  const add = (kind: FieldKind, score: number, reason: string, ok: boolean) => {
    if (ok) rules.push({ kind, score, reason });
  };

  const words = spaced.replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
  const has = (...needles: string[]) => needles.some((needle) => words.includes(needle));

  add("email", 10, "Header looks like email", /email/.test(compact));
  add(
    "phone",
    10,
    "Header looks like a phone number",
    has("phone", "mobile", "cellphone", "fax") && !has("type", "ext", "extension"),
  );
  add(
    "first_name",
    9,
    "Header looks like a first name",
    /first(\s*name)?$/.test(spaced) || /firstname|fname|givenname|contacfirst|contactfirst/.test(compact),
  );
  add(
    "last_name",
    9,
    "Header looks like a last name",
    /last(\s*name)?$/.test(spaced) || /lastname|lname|surname|familyname/.test(compact) || /lst$/.test(compact),
  );
  add(
    "full_name",
    8,
    "Header looks like a full name",
    /^(name|full name|contact name|display name)$/.test(spaced),
  );
  add(
    "company",
    8,
    "Header looks like a company",
    /company|organisation|organization/.test(compact) ||
      /^(customer|account|business|employer)$/.test(spaced) ||
      /customer name|account name/.test(spaced),
  );
  add("job_title", 8, "Header looks like a job title", /jobtitle|job title/.test(spaced) || /^(title|position|role)$/.test(spaced));
  add("address", 8, "Header looks like a street address", (has("address", "street", "addr") || /address|street/.test(compact)) && !has("email") && !/email/.test(compact));
  add("city", 8, "Header looks like a city", has("city", "town"));
  add("state", 8, "Header looks like a state", has("state", "province", "region"));
  add("postal_code", 8, "Header looks like a postal code", has("zip", "postal", "postcode") || words.includes("zip4"));
  add("country", 8, "Header looks like a country", has("country", "nation"));
  add("website", 7, "Header looks like a website", has("website", "webpage", "url", "domain"));
  add(
    "id",
    7,
    "Header looks like an ID",
    /^(id|hsobjectid)$/.test(compact) || /custno|recordid|contactid|objectid/.test(compact) || /customer(no|number|id)$/.test(compact),
  );

  rules.sort((a, b) => b.score - a.score);
  return rules[0] ?? null;
}

function ratio(values: string[], test: (value: string) => boolean): number {
  if (!values.length) return 0;
  return values.filter(test).length / values.length;
}

function valueGuess(values: string[]): Guess | null {
  if (values.length < 3) return null;
  const email = ratio(values, (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()));
  if (email >= 0.55) return { kind: "email", score: 6 + email, reason: "Most values look like email addresses" };
  const phone = ratio(values, (value) => {
    const digits = value.replace(/\D/g, "");
    return digits.length >= 10 && digits.length <= 15 && /^[+().\-\s\d]+$/.test(value.trim());
  });
  if (phone >= 0.55) return { kind: "phone", score: 6 + phone, reason: "Most values look like phone numbers" };
  const state = ratio(values, (value) => lookupState(value) !== null);
  if (state >= 0.6) return { kind: "state", score: 6 + state, reason: "Most values look like states" };
  const postal = ratio(values, (value) => /^\d{4,5}(?:-\d{4})?$/.test(value.trim()) || /^[A-Za-z]\d[A-Za-z]\s?\d[A-Za-z]\d$/.test(value.trim()));
  if (postal >= 0.6) return { kind: "postal_code", score: 6 + postal, reason: "Most values look like postal codes" };
  return null;
}

export function detectColumns(headers: string[], rows: string[][]): ColumnMapping[] {
  const sample = rows.slice(0, 250);
  const guesses = headers.map((header, index) => {
    const values = sample.map((row) => row[index] ?? "").filter((value) => value.trim() !== "");
    const fromHeader = headerGuess(header);
    const fromValues = valueGuess(values);
    if (fromHeader && (fromHeader.kind === "email" || fromHeader.kind === "phone") && values.length >= 5) {
      const looks =
        fromHeader.kind === "email"
          ? ratio(values, (value) => value.includes("@"))
          : ratio(values, (value) => value.replace(/\D/g, "").length >= 7);
      if (looks < 0.15 && fromValues) return fromValues;
      if (looks < 0.15) return { kind: "text" as const, score: 1, reason: "Header was ambiguous, so this stays general text" };
    }
    if (fromHeader && fromHeader.score >= 7) return fromHeader;
    if (fromValues && (!fromHeader || fromValues.score > fromHeader.score)) return fromValues;
    if (fromHeader) return fromHeader;
    return { kind: "text" as const, score: 1, reason: "No specific field detected" };
  });

  const taken = new Set<FieldKind>();
  const order = guesses.map((guess, index) => ({ index, score: guess.score })).sort((a, b) => b.score - a.score);
  const assigned: Guess[] = guesses.map((guess) => ({ ...guess }));

  for (const item of order) {
    const guess = assigned[item.index];
    if (SINGULAR.has(guess.kind) && taken.has(guess.kind)) {
      assigned[item.index] = { kind: "text", score: 1, reason: "Another column already uses this field" };
      continue;
    }
    if (SINGULAR.has(guess.kind)) taken.add(guess.kind);
  }

  return headers.map((header, index) => ({
    header,
    kind: assigned[index].kind,
    confidence: Math.min(1, assigned[index].score / 10),
    reason: assigned[index].reason,
  }));
}

export function fieldLabel(kind: FieldKind): string {
  return FIELD_OPTIONS.find((option) => option.value === kind)?.label ?? kind;
}
