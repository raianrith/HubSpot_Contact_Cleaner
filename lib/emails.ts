import type { FieldClean, Flag } from "./types";
import { levenshtein } from "./levenshtein";
import { lettersOnly, normalizeWhitespace } from "./text";

const DOMAIN_TYPOS: Record<string, string> = {
  "gmial.com": "gmail.com",
  "gmal.com": "gmail.com",
  "gamil.com": "gmail.com",
  "gnail.com": "gmail.com",
  "gmai.com": "gmail.com",
  "gmail.co": "gmail.com",
  "gmail.con": "gmail.com",
  "gmail.cm": "gmail.com",
  "hotmal.com": "hotmail.com",
  "hotmai.com": "hotmail.com",
  "hotmial.com": "hotmail.com",
  "hotmail.co": "hotmail.com",
  "hotmail.con": "hotmail.com",
  "yahooo.com": "yahoo.com",
  "yaho.com": "yahoo.com",
  "yahoo.co": "yahoo.com",
  "yhaoo.com": "yahoo.com",
  "outloo.com": "outlook.com",
  "outlok.com": "outlook.com",
  "outlook.co": "outlook.com",
  "outlook.con": "outlook.com",
  "icloud.co": "icloud.com",
  "icloud.con": "icloud.com",
};

const TLD_TYPOS: Record<string, string> = {
  con: "com",
  cmo: "com",
  ocm: "com",
  comm: "com",
  coom: "com",
  ent: "net",
  nett: "net",
  ogr: "org",
  orgg: "org",
};

const DISPOSABLE = new Set([
  "mailinator.com",
  "guerrillamail.com",
  "guerrillamail.net",
  "10minutemail.com",
  "tempmail.com",
  "temp-mail.org",
  "yopmail.com",
  "trashmail.com",
  "getnada.com",
  "sharklasers.com",
  "dispostable.com",
  "maildrop.cc",
  "fakeinbox.com",
  "throwawaymail.com",
  "mailnesia.com",
  "tempail.com",
  "moakt.com",
  "emailondeck.com",
]);

const PERSONAL = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.co.uk",
  "ymail.com",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "msn.com",
  "aol.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "comcast.net",
  "sbcglobal.net",
  "att.net",
  "verizon.net",
  "proton.me",
  "protonmail.com",
  "gmx.com",
  "mail.com",
]);

const ROLE_SEGMENTS = new Set([
  "info",
  "sales",
  "sale",
  "admin",
  "administrator",
  "support",
  "contact",
  "contacts",
  "office",
  "hello",
  "marketing",
  "hr",
  "team",
  "webmaster",
  "postmaster",
  "noreply",
  "no-reply",
  "donotreply",
  "do-not-reply",
  "inquiries",
  "enquiry",
  "enquiries",
  "service",
  "services",
  "customerservice",
  "customercare",
  "mail",
  "email",
  "general",
  "billing",
  "accounts",
  "reception",
  "help",
  "helpdesk",
  "careers",
  "jobs",
  "media",
  "press",
  "newsletter",
]);

const NICKNAMES: Record<string, string[]> = {
  robert: ["bob", "rob", "bobby", "robbie"],
  william: ["bill", "will", "billy", "liam", "willy"],
  james: ["jim", "jimmy", "jamie"],
  john: ["jack", "johnny", "jon"],
  richard: ["rick", "rich", "dick", "ricky"],
  charles: ["charlie", "chuck", "chas"],
  joseph: ["joe", "joey"],
  thomas: ["tom", "tommy"],
  christopher: ["chris", "topher"],
  michael: ["mike", "mikey"],
  david: ["dave", "davy"],
  steven: ["steve", "stephen"],
  stephen: ["steve", "steven"],
  matthew: ["matt", "matty"],
  daniel: ["dan", "danny"],
  anthony: ["tony"],
  andrew: ["andy", "drew"],
  edward: ["ed", "eddie", "ted", "teddy"],
  edwin: ["ed", "eddie"],
  elizabeth: ["liz", "beth", "lizzy", "eliza"],
  jennifer: ["jen", "jenny"],
  katherine: ["kate", "kathy", "katie", "cathy"],
  catherine: ["cathy", "kate", "katie"],
  patricia: ["pat", "patty", "tricia"],
  patrick: ["pat", "paddy"],
  alexander: ["alex", "xander"],
  benjamin: ["ben", "benny"],
  nicholas: ["nick", "nicky"],
  jonathan: ["jon"],
  jeffrey: ["jeff", "geoff"],
  geoffrey: ["geoff", "jeff"],
  gregory: ["greg"],
  timothy: ["tim", "timmy"],
  kenneth: ["ken", "kenny"],
  ronald: ["ron", "ronnie"],
  donald: ["don", "donnie"],
  raymond: ["ray"],
  lawrence: ["larry"],
  peter: ["pete"],
  phillip: ["phil"],
  philip: ["phil"],
  samuel: ["sam", "sammy"],
  joshua: ["josh"],
  zachary: ["zach", "zack"],
  zachery: ["zach", "zack"],
  nathan: ["nate"],
  nathaniel: ["nate"],
  margaret: ["maggie", "meg", "peggy"],
  susan: ["sue", "susie"],
  deborah: ["deb", "debbie"],
  barbara: ["barb"],
  kimberly: ["kim"],
  pamela: ["pam"],
  cynthia: ["cindy"],
  rebecca: ["becky", "becca"],
  victoria: ["vicky", "tori"],
  theresa: ["terry", "tess"],
  teresa: ["terry", "tess"],
  jacob: ["jake"],
  theodore: ["ted", "theo"],
  abigail: ["abby"],
};

const NICK_TO_FORMAL = new Map<string, string[]>();
for (const [formal, nicks] of Object.entries(NICKNAMES)) {
  for (const nick of nicks) {
    const list = NICK_TO_FORMAL.get(nick) ?? [];
    list.push(formal);
    NICK_TO_FORMAL.set(nick, list);
  }
}

function firstNameVariants(first: string): string[] {
  const base = lettersOnly(first);
  if (!base) return [];
  const variants = new Set<string>([base]);
  for (const nick of NICKNAMES[base] ?? []) variants.add(nick);
  for (const formal of NICK_TO_FORMAL.get(base) ?? []) {
    variants.add(formal);
    for (const nick of NICKNAMES[formal] ?? []) variants.add(nick);
  }
  return [...variants];
}

export function lightDomain(input: string): string {
  const value = normalizeWhitespace(input).toLowerCase().replace(/^mailto:/, "");
  const at = value.lastIndexOf("@");
  if (at === -1) return "";
  return value.slice(at + 1).replace(/\s+/g, "").replace(/\.+$/g, "");
}

export function domainCounts(values: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) {
    const domain = lightDomain(value);
    if (!domain) continue;
    counts.set(domain, (counts.get(domain) ?? 0) + 1);
  }
  return counts;
}

function fixTld(domain: string): { domain: string; changed: boolean } {
  const parts = domain.split(".");
  if (parts.length < 2) return { domain, changed: false };
  const tld = parts[parts.length - 1];
  const fixed = TLD_TYPOS[tld];
  if (!fixed) return { domain, changed: false };
  parts[parts.length - 1] = fixed;
  return { domain: parts.join("."), changed: true };
}

function unglueDomain(domain: string, counts: Map<string, number>): string | null {
  if (domain.includes(".")) return null;
  for (const tld of ["com", "net", "org", "edu", "biz", "info"]) {
    if (!domain.endsWith(tld) || domain.length <= tld.length + 2) continue;
    const candidate = `${domain.slice(0, -tld.length)}.${tld}`;
    const stem = candidate.slice(0, candidate.length - tld.length - 1);
    if ((counts.get(candidate) ?? 0) >= 1) return candidate;
    if (stem.length >= 8 && (tld === "com" || tld === "net" || tld === "org")) return candidate;
  }
  return null;
}

function compactDomainFix(domain: string, counts: Map<string, number>): string | null {
  if ((counts.get(domain) ?? 0) > 1) return null;
  const compact = domain.replace(/\./g, "");
  if (compact.length < 6) return null;
  let best: string | null = null;
  let bestCount = 0;
  for (const [candidate, count] of counts) {
    if (candidate === domain || count < 15) continue;
    const candidateCompact = candidate.replace(/\./g, "");
    if (compact.slice(0, 4) !== candidateCompact.slice(0, 4)) continue;
    if (Math.abs(compact.length - candidateCompact.length) > 1) continue;
    if (levenshtein(compact, candidateCompact) !== 1) continue;
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}

function nearbyDomain(domain: string, counts: Map<string, number>): string | null {
  if (domain.length < 8 || !domain.includes(".")) return null;
  const tld = domain.slice(domain.lastIndexOf("."));
  let best: string | null = null;
  let bestCount = 0;
  for (const [candidate, count] of counts) {
    if (candidate === domain || count < 8) continue;
    if (!candidate.endsWith(tld)) continue;
    if (Math.abs(candidate.length - domain.length) > 1) continue;
    if (candidate.slice(0, 4) !== domain.slice(0, 4)) continue;
    if (levenshtein(domain, candidate) !== 1) continue;
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}

export function cleanEmail(input: string, counts: Map<string, number>): FieldClean {
  const value = normalizeWhitespace(input).replace(/^mailto:/i, "").replace(/[<>]/g, "").trim();
  if (!value) return { value: "", reason: null };
  const reasons: string[] = [];
  if (value !== value.toLowerCase()) reasons.push("Lowercased email");

  const atMatches = value.match(/@/g)?.length ?? 0;
  if (atMatches !== 1) {
    const next = value.replace(/\s+/g, "").toLowerCase();
    if (next === input) return { value: next, reason: null };
    const bits = [...reasons];
    if (/\s/.test(value) && !bits.some((bit) => bit.startsWith("Removed"))) bits.push("Removed spaces");
    return { value: next, reason: bits.join(" · ") || "Cleaned email formatting" };
  }

  let local = value.slice(0, value.indexOf("@")).trim().toLowerCase();
  let domain = value.slice(value.indexOf("@") + 1).trim().toLowerCase();
  if (/\s/.test(local)) reasons.push("Turned spaces in the mailbox name into periods");
  if (local.includes(",")) reasons.push("Replaced a comma with a period");
  if (/\s/.test(domain)) reasons.push("Removed spaces from the domain");
  local = local.replace(/\s+/g, ".").replace(/,/g, ".").replace(/\.{2,}/g, ".").replace(/^\.+|\.+$/g, "");
  domain = domain.replace(/\s+/g, "").replace(/\.{2,}/g, ".").replace(/^\.+|\.+$/g, "");

  const tld = fixTld(domain);
  if (tld.changed) {
    domain = tld.domain;
    reasons.push("Corrected the domain extension");
  }
  if (DOMAIN_TYPOS[domain]) {
    domain = DOMAIN_TYPOS[domain];
    reasons.push(`Corrected the domain to ${domain}`);
  } else {
    const unglued = unglueDomain(domain, counts);
    if (unglued && unglued !== domain) {
      domain = unglued;
      reasons.push(`Corrected the domain to ${domain}`);
    } else if ((counts.get(domain) ?? 0) <= 1) {
      const nearby = nearbyDomain(domain, counts) ?? compactDomainFix(domain, counts);
      if (nearby) {
        domain = nearby;
        reasons.push(`Corrected the domain to ${domain}, which is common in this file`);
      }
    }
  }

  const next = `${local}@${domain}`;
  if (next === input) return { value: next, reason: null };
  const unique = [...new Set(reasons)];
  return { value: next, reason: unique.join(" · ") || "Cleaned email formatting" };
}

const EMAIL_RE = /^[a-z0-9](?:[a-z0-9._%+-]*[a-z0-9])?@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;

export function emailSyntaxError(value: string): string | null {
  if (!value) return "missing";
  if ((value.match(/@/g) ?? []).length > 1) return "This email has more than one @, so it can’t be delivered.";
  if (!value.includes("@")) {
    return value.includes(".")
      ? "Missing the mailbox name. This is only a domain, so it can’t receive mail."
      : "This isn’t an email address.";
  }
  const [local, domain] = value.split("@");
  if (!local || !domain || !domain.includes(".")) {
    return domain && !domain.includes(".")
      ? `The domain “${domain}” is missing a period before the extension.`
      : "This isn’t a complete email address.";
  }
  if (!EMAIL_RE.test(value)) return "This email uses characters or a shape mail servers reject.";
  return null;
}

export function suggestDomain(domain: string, counts: Map<string, number>): string | null {
  const compact = domain.replace(/\./g, "");
  let best: string | null = null;
  let bestCount = 0;
  for (const [candidate, count] of counts) {
    if (candidate === domain || count < 5) continue;
    const dist = levenshtein(compact, candidate.replace(/\./g, ""));
    if (dist !== 1) continue;
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}

function isRoleMailbox(local: string): boolean {
  const segments = local.toLowerCase().split(/[._+-]/).filter(Boolean);
  if (segments.some((segment) => ROLE_SEGMENTS.has(segment))) return true;
  return /(manager|mailbox|department)$/i.test(local.replace(/[._+-]/g, ""));
}

function closeEnough(haystack: string, needle: string): boolean {
  if (!needle || needle.length < 3 || !haystack) return false;
  if (haystack === needle || haystack.includes(needle)) return true;
  if (needle.includes(haystack) && haystack.length >= Math.max(4, needle.length - 2)) return true;
  const limit = needle.length >= 8 ? 2 : 1;
  if (Math.abs(haystack.length - needle.length) <= limit && levenshtein(haystack, needle) <= limit) return true;
  const min = Math.max(4, needle.length - 1);
  const max = needle.length + 2;
  for (let size = min; size <= max; size++) {
    for (let start = 0; start + size <= haystack.length; start++) {
      if (levenshtein(haystack.slice(start, start + size), needle) <= 1) return true;
    }
  }
  return false;
}

export type NameMatch = "match" | "typo" | "mismatch" | "initials" | "unknown";

export function emailMatchesName(email: string, first: string, last: string): NameMatch {
  const local = email.split("@")[0] ?? "";
  const compact = lettersOnly(local);
  const lastName = lettersOnly(last);
  const firstNames = firstNameVariants(first);
  if (!compact || (!lastName && firstNames.length === 0)) return "unknown";
  if (compact.length <= 3) return "initials";

  const targets: string[] = [];
  if (lastName) targets.push(lastName);
  for (const name of firstNames) {
    targets.push(name);
    if (lastName) {
      targets.push(name + lastName, lastName + name, name.charAt(0) + lastName, lastName + name.charAt(0));
      if (name.length >= 2) targets.push(name.slice(0, 2) + lastName);
    }
  }

  for (const target of targets) {
    if (target.length < 3) continue;
    if (compact === target || compact.includes(target) || (target.includes(compact) && compact.length >= Math.min(5, target.length))) {
      return "match";
    }
  }

  if (lastName.length >= 4 && compact.startsWith(lettersOnly(first).charAt(0))) {
    const stripped = [compact.slice(1), compact.slice(2)];
    for (const part of stripped) {
      if (part.length >= 4 && (lastName.startsWith(part) || part.startsWith(lastName.slice(0, Math.min(part.length, lastName.length))))) {
        return "match";
      }
    }
  }

  for (const target of targets) {
    if (closeEnough(compact, target)) return "typo";
  }
  if (lastName.length >= 3 || firstNames.some((name) => name.length >= 4)) return "mismatch";
  return "unknown";
}

export function assessEmail(
  value: string,
  person: { first: string; last: string },
  counts: Map<string, number>,
): Flag[] {
  if (!value) {
    return [
      {
        severity: "warning",
        code: "missing_email",
        message: "No email address, so this contact can’t be included in a send.",
      },
    ];
  }

  const syntax = emailSyntaxError(value);
  if (syntax && syntax !== "missing") {
    const domain = value.includes("@") ? value.slice(value.lastIndexOf("@") + 1) : value;
    const suggestion = domain ? suggestDomain(domain, counts) : null;
    return [
      {
        severity: "error",
        code: "invalid_email",
        message: suggestion
          ? `${syntax} Closest domain in this file is ${suggestion}.`
          : syntax,
      },
    ];
  }

  const domain = value.slice(value.lastIndexOf("@") + 1);
  const local = value.slice(0, value.lastIndexOf("@"));
  const flags: Flag[] = [];

  if (DISPOSABLE.has(domain)) {
    flags.push({
      severity: "warning",
      code: "disposable_email",
      message: "This is a disposable inbox. It won’t be reliable for ongoing email.",
    });
    return flags;
  }

  const alignment = emailMatchesName(value, person.first, person.last);
  const role = isRoleMailbox(local);
  if (role && alignment !== "match") {
    flags.push({
      severity: "info",
      code: "role_email",
      message: "This looks like a shared inbox rather than a named person.",
    });
  } else if (alignment === "mismatch") {
    flags.push({
      severity: "warning",
      code: "email_name_mismatch",
      message: "This email doesn’t look like it belongs to this contact. Confirm it before a send.",
    });
  } else if (alignment === "typo") {
    flags.push({
      severity: "warning",
      code: "email_name_typo",
      message: "The email spelling is close to this name, but not exact. Check for a typo.",
    });
  }

  if (PERSONAL.has(domain)) {
    flags.push({
      severity: "info",
      code: "personal_email",
      message: "Personal email domain. Fine for a person, easy to miss in an account-based segment.",
    });
  }
  return flags;
}

export function emailIsSafeToCopy(value: string, person: { first: string; last: string }, counts: Map<string, number>): boolean {
  if (!value || emailSyntaxError(value)) return false;
  return assessEmail(value, person, counts).every((flag) => flag.severity === "info" && flag.code !== "role_email");
}
