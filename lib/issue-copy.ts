export const ISSUE_LABELS: Record<string, string> = {
  invalid_email: "Unusable email",
  email_name_mismatch: "Email doesn’t match the person",
  email_name_typo: "Email spelling differs from the name",
  role_email: "Shared or role inbox",
  personal_email: "Personal email domain",
  disposable_email: "Disposable email",
  missing_email: "Missing email",
  invalid_phone: "Phone number looks wrong",
  international_phone: "International phone",
  invalid_name: "Name looks wrong",
  missing_name: "Missing name",
  duplicate: "Duplicate contact",
  duplicate_conflict: "Duplicates disagree",
  unrecognized_state: "State not recognized",
  check_postal: "Postal code looks off",
  invalid_website: "Website looks off",
};

export const ISSUE_HELP: Record<string, string> = {
  invalid_email: "These would bounce or never send. Correct them before the list is used for a campaign.",
  email_name_mismatch:
    "The mailbox doesn’t resemble this person’s name. It may belong to someone else, which breaks segmentation and replies.",
  email_name_typo: "Very close to the contact’s name, but not quite. Usually a typo in the email or the name.",
  role_email: "A shared inbox like sales@ or info@. Fine for a company, weak for a named contact.",
  personal_email: "Gmail, Outlook, and similar. Useful to know when you’re building account-based segments.",
  disposable_email: "Temporary inboxes. Don’t use these for ongoing email.",
  missing_email: "No address, so this contact can’t be mailed until one is added.",
  invalid_phone: "The number isn’t a complete US or international phone.",
  international_phone: "Kept in international format. Worth a glance if you expected a US number.",
  invalid_name: "Blank of letters, or it contains an email address. HubSpot will show it as junk.",
  missing_name: "No first or last name, so personalization tokens will fall back.",
  duplicate: "The same email, or the same person at the same company, appears more than once.",
  duplicate_conflict: "Those duplicate rows don’t share the same email or phone. Importing both can email the wrong person.",
  unrecognized_state: "Not a US state or Canadian province, so a state segment would miss it.",
  check_postal: "Doesn’t look like a US ZIP or Canadian postal code.",
  invalid_website: "This doesn’t parse as a web address.",
};

export const DUPLICATE_ISSUE_CODES = new Set(["duplicate", "duplicate_conflict"]);

export function issueLabel(code: string): string {
  return ISSUE_LABELS[code] ?? code;
}
