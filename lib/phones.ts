import type { FieldClean, Flag } from "./types";
import { normalizeWhitespace } from "./text";

export type PhoneFormat = "national" | "e164";

function extensionOf(input: string): { body: string; extension: string } {
  const match = input.match(/(?:ext\.?|extension|x)\s*(\d{1,8})\s*$/i);
  if (!match || match.index === undefined) return { body: input, extension: "" };
  return { body: input.slice(0, match.index).trim(), extension: match[1] };
}

function national(digits: string, format: PhoneFormat): string {
  const ten = digits.length === 11 ? digits.slice(1) : digits;
  if (format === "e164") return `+1${ten}`;
  return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`;
}

export function cleanPhone(input: string, format: PhoneFormat): FieldClean {
  const trimmed = normalizeWhitespace(input);
  if (!trimmed) return { value: "", reason: null };

  const { body, extension } = extensionOf(trimmed);
  const digits = body.replace(/\D/g, "");
  let formatted = trimmed;
  let recognized = false;

  if (digits.length === 10 || (digits.length === 11 && digits.startsWith("1"))) {
    formatted = national(digits, format);
    recognized = true;
  } else if (digits.length >= 11 && digits.length <= 15) {
    formatted = `+${digits}`;
    recognized = true;
  }

  if (recognized && extension) formatted += ` ext. ${extension}`;
  if (!recognized) {
    return {
      value: trimmed,
      reason: trimmed === input ? null : "Trimmed extra whitespace",
    };
  }
  if (formatted === input) return { value: formatted, reason: null };
  return { value: formatted, reason: "Formatted phone number" };
}

export function assessPhone(value: string): Flag[] {
  if (!value) return [];
  const { body } = extensionOf(value);
  const digits = body.replace(/\D/g, "");
  if (digits.length === 10 || (digits.length === 11 && digits.startsWith("1"))) {
    const ten = digits.length === 11 ? digits.slice(1) : digits;
    if (ten.startsWith("0") || ten.startsWith("1")) {
      return [
        {
          severity: "warning",
          code: "invalid_phone",
          message: "This US phone number has an area code that can’t start with 0 or 1.",
        },
      ];
    }
    return [];
  }
  if (digits.length >= 11 && digits.length <= 15 && value.startsWith("+")) {
    return [
      {
        severity: "info",
        code: "international_phone",
        message: "Formatted as an international number. Confirm the country code before you call or text.",
      },
    ];
  }
  return [
    {
      severity: "warning",
      code: "invalid_phone",
      message: `This phone number has ${digits.length || "no"} digits, so it doesn’t look dialable.`,
    },
  ];
}
