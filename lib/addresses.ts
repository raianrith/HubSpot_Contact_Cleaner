import type { FieldClean, Flag } from "./types";
import { normalizeWhitespace, titleWord } from "./text";

export type StateFormat = "abbr" | "full";

const REGIONS: [string, string][] = [
  ["AL", "Alabama"],
  ["AK", "Alaska"],
  ["AZ", "Arizona"],
  ["AR", "Arkansas"],
  ["CA", "California"],
  ["CO", "Colorado"],
  ["CT", "Connecticut"],
  ["DE", "Delaware"],
  ["DC", "District of Columbia"],
  ["FL", "Florida"],
  ["GA", "Georgia"],
  ["HI", "Hawaii"],
  ["ID", "Idaho"],
  ["IL", "Illinois"],
  ["IN", "Indiana"],
  ["IA", "Iowa"],
  ["KS", "Kansas"],
  ["KY", "Kentucky"],
  ["LA", "Louisiana"],
  ["ME", "Maine"],
  ["MD", "Maryland"],
  ["MA", "Massachusetts"],
  ["MI", "Michigan"],
  ["MN", "Minnesota"],
  ["MS", "Mississippi"],
  ["MO", "Missouri"],
  ["MT", "Montana"],
  ["NE", "Nebraska"],
  ["NV", "Nevada"],
  ["NH", "New Hampshire"],
  ["NJ", "New Jersey"],
  ["NM", "New Mexico"],
  ["NY", "New York"],
  ["NC", "North Carolina"],
  ["ND", "North Dakota"],
  ["OH", "Ohio"],
  ["OK", "Oklahoma"],
  ["OR", "Oregon"],
  ["PA", "Pennsylvania"],
  ["RI", "Rhode Island"],
  ["SC", "South Carolina"],
  ["SD", "South Dakota"],
  ["TN", "Tennessee"],
  ["TX", "Texas"],
  ["UT", "Utah"],
  ["VT", "Vermont"],
  ["VA", "Virginia"],
  ["WA", "Washington"],
  ["WV", "West Virginia"],
  ["WI", "Wisconsin"],
  ["WY", "Wyoming"],
  ["AS", "American Samoa"],
  ["GU", "Guam"],
  ["MP", "Northern Mariana Islands"],
  ["PR", "Puerto Rico"],
  ["VI", "U.S. Virgin Islands"],
  ["AB", "Alberta"],
  ["BC", "British Columbia"],
  ["MB", "Manitoba"],
  ["NB", "New Brunswick"],
  ["NL", "Newfoundland and Labrador"],
  ["NS", "Nova Scotia"],
  ["NT", "Northwest Territories"],
  ["NU", "Nunavut"],
  ["ON", "Ontario"],
  ["PE", "Prince Edward Island"],
  ["QC", "Quebec"],
  ["SK", "Saskatchewan"],
  ["YT", "Yukon"],
];

const ALIASES: Record<string, string> = {
  wash: "WA",
  wisc: "WI",
  wis: "WI",
  mass: "MA",
  mich: "MI",
  minn: "MN",
  tenn: "TN",
  calif: "CA",
  fla: "FL",
  penn: "PA",
  dc: "DC",
  districtofcolumbia: "DC",
  washingtondc: "DC",
  pei: "PE",
  nfld: "NL",
  newfoundland: "NL",
  que: "QC",
};

const NAMES: Record<string, string> = {};
const INDEX = new Map<string, string>();

for (const [abbr, name] of REGIONS) {
  NAMES[abbr] = name;
  INDEX.set(abbr.toLowerCase(), abbr);
  INDEX.set(name.toLowerCase().replace(/[^a-z]/g, ""), abbr);
}
for (const [alias, abbr] of Object.entries(ALIASES)) INDEX.set(alias, abbr);

export function lookupState(input: string): string | null {
  const key = normalizeWhitespace(input).toLowerCase().replace(/[^a-z]/g, "");
  if (!key) return null;
  return INDEX.get(key) ?? null;
}

const SMALL = new Set(["and", "or", "of", "the", "for", "in", "on", "at", "de", "du", "la"]);
const PLACE_ABBREV: Record<string, string> = { st: "St.", ft: "Ft.", mt: "Mt.", so: "So." };

export function titleCasePlace(input: string): string {
  const tokens = normalizeWhitespace(input).split(" ").filter(Boolean);
  return tokens
    .map((token, index) => {
      const bare = token.replace(/\./g, "").toLowerCase();
      if (PLACE_ABBREV[bare]) return PLACE_ABBREV[bare];
      if (SMALL.has(bare) && index !== 0) return bare;
      if (/^mc[a-z]{2,}$/.test(bare)) return `Mc${bare.charAt(2).toUpperCase()}${bare.slice(3)}`;
      return titleWord(bare);
    })
    .join(" ");
}

export function cleanState(input: string, format: StateFormat): FieldClean & { recognized: boolean } {
  const original = normalizeWhitespace(input);
  if (!original) return { value: "", reason: null, recognized: true };
  const abbr = lookupState(original);
  if (!abbr) {
    return {
      value: original,
      reason: original === input ? null : "Trimmed extra whitespace",
      recognized: false,
    };
  }
  const value = format === "abbr" ? abbr : NAMES[abbr];
  return {
    value,
    reason: value === input ? null : "Standardized state",
    recognized: true,
  };
}

export function assessState(value: string): Flag[] {
  if (!value) return [];
  if (lookupState(value)) return [];
  return [
    {
      severity: "warning",
      code: "unrecognized_state",
      message: "This isn’t a recognized US state or Canadian province, so a state segment would miss it.",
    },
  ];
}

export function cleanCity(input: string): FieldClean {
  const original = normalizeWhitespace(input);
  if (!original) return { value: "", reason: null };
  const value = titleCasePlace(original);
  return { value, reason: value === original ? null : "Standardized city capitalization" };
}

const STREET: Record<string, string> = {
  street: "St",
  st: "St",
  avenue: "Ave",
  ave: "Ave",
  boulevard: "Blvd",
  blvd: "Blvd",
  drive: "Dr",
  dr: "Dr",
  road: "Rd",
  rd: "Rd",
  lane: "Ln",
  ln: "Ln",
  court: "Ct",
  ct: "Ct",
  place: "Pl",
  pl: "Pl",
  terrace: "Ter",
  ter: "Ter",
  trail: "Trl",
  trl: "Trl",
  parkway: "Pkwy",
  pkwy: "Pkwy",
  highway: "Hwy",
  hwy: "Hwy",
  circle: "Cir",
  cir: "Cir",
  suite: "Ste",
  ste: "Ste",
  apartment: "Apt",
  apt: "Apt",
  unit: "Unit",
  floor: "Fl",
  fl: "Fl",
  room: "Rm",
  rm: "Rm",
  building: "Bldg",
  bldg: "Bldg",
};

const KEEP_CAPS = new Set(["afb", "usa", "us", "rr", "hc"]);

const DIRECTIONALS: Record<string, string> = {
  north: "N",
  south: "S",
  east: "E",
  west: "W",
  northeast: "NE",
  northwest: "NW",
  southeast: "SE",
  southwest: "SW",
  n: "N",
  s: "S",
  e: "E",
  w: "W",
  ne: "NE",
  nw: "NW",
  se: "SE",
  sw: "SW",
};

function bare(token: string): string {
  return token.replace(/[.,]/g, "").toLowerCase();
}

function withComma(token: string, value: string): string {
  return token.endsWith(",") ? `${value},` : value;
}

export function cleanAddress(input: string): FieldClean {
  let original = normalizeWhitespace(input);
  if (!original) return { value: "", reason: null };
  original = original.replace(/\bP\.?\s*O\.?\s*Box\b/gi, "PO Box");
  const tokens = original.split(" ").filter(Boolean);
  const value = tokens
    .map((token, index) => {
      const key = bare(token);
      if (/^\d/.test(token)) return withComma(token, token.toUpperCase() === token ? token.replace(/,$/, "") : token.replace(/,$/, "").replace(/[a-z]+$/i, (letters) => letters.toUpperCase()));
      const prev = index > 0 ? bare(tokens[index - 1]) : "";
      const prevIsNumber = index > 0 && /^\d/.test(tokens[index - 1]);
      const prevIsSuffix = Boolean(STREET[prev]);
      if (DIRECTIONALS[key] && (prevIsNumber || prevIsSuffix || key.length <= 2)) {
        return withComma(token, DIRECTIONALS[key]);
      }
      const state = key.length === 2 ? lookupState(key) : null;
      if (state && !DIRECTIONALS[key]) return withComma(token, state);
      if (key === "po") return "PO";
      if (key === "box") return "Box";
      if (STREET[key] && index > 0) return withComma(token, STREET[key]);
      if (KEEP_CAPS.has(key)) return withComma(token, key.toUpperCase());
      if (/^mc[a-z]{2,}$/.test(key)) return withComma(token, `Mc${key.charAt(2).toUpperCase()}${key.slice(3)}`);
      return withComma(token, titleWord(key));
    })
    .join(" ");
  return { value, reason: value === normalizeWhitespace(input) ? null : "Standardized address formatting" };
}

export function cleanPostal(input: string): FieldClean {
  const original = normalizeWhitespace(input);
  if (!original) return { value: "", reason: null };
  const digits = original.replace(/\D/g, "");
  if (!/[A-Za-z]/.test(original)) {
    if (digits.length === 4) {
      return { value: digits.padStart(5, "0"), reason: "Restored a leading zero on the ZIP code" };
    }
    if (digits.length === 5) {
      return { value: digits, reason: digits === original ? null : "Standardized ZIP code" };
    }
    if (digits.length === 9) {
      const zip = `${digits.slice(0, 5)}-${digits.slice(5)}`;
      return { value: zip, reason: zip === original ? null : "Standardized ZIP code" };
    }
  }
  const compact = original.toUpperCase().replace(/\s+/g, "");
  if (/^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(compact)) {
    const postal = `${compact.slice(0, 3)} ${compact.slice(3)}`;
    return { value: postal, reason: postal === original ? null : "Standardized postal code" };
  }
  return { value: original, reason: original === input ? null : "Trimmed extra whitespace" };
}

export function isZip4Header(header: string): boolean {
  return /zip\s*-?\s*(?:four|4)|plus\s*-?\s*4|\+4/i.test(header);
}

export function cleanZip4(input: string): FieldClean {
  const original = normalizeWhitespace(input);
  if (!original) return { value: "", reason: null };
  const digits = original.replace(/\D/g, "");
  if (digits.length >= 1 && digits.length <= 4 && Number(digits) !== 0) {
    const value = digits.padStart(4, "0");
    return { value, reason: value === original ? null : "Standardized ZIP+4" };
  }
  return { value: original, reason: original === input ? null : "Trimmed extra whitespace" };
}

export function assessPostal(value: string): Flag[] {
  if (!value) return [];
  if (/^\d{5}(?:-\d{4})?$/.test(value)) return [];
  if (/^[A-Z]\d[A-Z] \d[A-Z]\d$/.test(value)) return [];
  return [
    {
      severity: "warning",
      code: "check_postal",
      message: "This doesn’t look like a US ZIP or Canadian postal code.",
    },
  ];
}

const COUNTRIES: Record<string, string> = {
  us: "United States",
  usa: "United States",
  unitedstates: "United States",
  unitedstatesofamerica: "United States",
  america: "United States",
  ca: "Canada",
  can: "Canada",
  canada: "Canada",
  uk: "United Kingdom",
  gb: "United Kingdom",
  greatbritain: "United Kingdom",
  unitedkingdom: "United Kingdom",
  britain: "United Kingdom",
  mx: "Mexico",
  mexico: "Mexico",
  au: "Australia",
  australia: "Australia",
  nz: "New Zealand",
  newzealand: "New Zealand",
  de: "Germany",
  germany: "Germany",
  deutschland: "Germany",
  fr: "France",
  france: "France",
  es: "Spain",
  spain: "Spain",
  it: "Italy",
  italy: "Italy",
  nl: "Netherlands",
  netherlands: "Netherlands",
  holland: "Netherlands",
  be: "Belgium",
  belgium: "Belgium",
  ie: "Ireland",
  ireland: "Ireland",
  se: "Sweden",
  sweden: "Sweden",
  no: "Norway",
  norway: "Norway",
  dk: "Denmark",
  denmark: "Denmark",
  fi: "Finland",
  finland: "Finland",
  ch: "Switzerland",
  switzerland: "Switzerland",
  at: "Austria",
  austria: "Austria",
  br: "Brazil",
  brazil: "Brazil",
  brasil: "Brazil",
  jp: "Japan",
  japan: "Japan",
  cn: "China",
  china: "China",
  in: "India",
  india: "India",
  kr: "South Korea",
  southkorea: "South Korea",
  sg: "Singapore",
  singapore: "Singapore",
  pl: "Poland",
  poland: "Poland",
  ph: "Philippines",
  philippines: "Philippines",
  tr: "Turkey",
  turkey: "Turkey",
  ng: "Nigeria",
  nigeria: "Nigeria",
  si: "Slovenia",
  slovenia: "Slovenia",
  il: "Israel",
  israel: "Israel",
  sr: "Suriname",
  suriname: "Suriname",
  gt: "Guatemala",
  guatemala: "Guatemala",
  co: "Colombia",
  colombia: "Colombia",
  unitedstatesminoroutlyingislands: "United States Minor Outlying Islands",
};

export function cleanCountry(input: string): FieldClean {
  const original = normalizeWhitespace(input);
  if (!original) return { value: "", reason: null };
  const stripped = original.replace(/\s*\(the\)\s*$/i, "").trim();
  const key = stripped.toLowerCase().replace(/[^a-z]/g, "");
  const mapped = COUNTRIES[key];
  if (mapped) return { value: mapped, reason: mapped === original ? null : "Standardized country name" };
  if (/\d/.test(stripped)) return { value: stripped, reason: stripped === input ? null : "Trimmed extra whitespace" };
  const titled = titleCasePlace(stripped);
  return { value: titled, reason: titled === original ? null : "Standardized capitalization" };
}

const TITLE_ACRONYMS: Record<string, string> = {
  vp: "VP",
  svp: "SVP",
  evp: "EVP",
  avp: "AVP",
  ceo: "CEO",
  cfo: "CFO",
  coo: "COO",
  cto: "CTO",
  cio: "CIO",
  cmo: "CMO",
  cro: "CRO",
  hr: "HR",
  it: "IT",
  pr: "PR",
  qa: "QA",
  ux: "UX",
  ui: "UI",
  seo: "SEO",
  gm: "GM",
  md: "MD",
  phd: "PhD",
  cpa: "CPA",
  pmp: "PMP",
  csr: "CSR",
  ae: "AE",
  sdr: "SDR",
  bdr: "BDR",
  bdm: "BDM",
  "r&d": "R&D",
};

export function cleanJobTitle(input: string): FieldClean {
  const original = normalizeWhitespace(input);
  if (!original) return { value: "", reason: null };
  const tokens = original.split(" ").filter(Boolean);
  const value = tokens
    .map((token, index) => {
      const lower = token.toLowerCase().replace(/\./g, "");
      if (TITLE_ACRONYMS[lower]) return TITLE_ACRONYMS[lower];
      if (TITLE_ACRONYMS[token.toLowerCase()]) return TITLE_ACRONYMS[token.toLowerCase()];
      if (SMALL.has(lower) && index !== 0) return lower;
      return titleWord(lower);
    })
    .join(" ");
  return { value, reason: value === original ? null : "Standardized job title" };
}

export function cleanWebsite(input: string): FieldClean {
  const original = normalizeWhitespace(input);
  if (!original) return { value: "", reason: null };
  const withProtocol = /^https?:\/\//i.test(original) ? original : `https://${original}`;
  try {
    const url = new URL(withProtocol);
    if (!url.hostname.includes(".")) throw new Error("bad host");
    url.hostname = url.hostname.toLowerCase();
    const path = url.pathname === "/" && !url.search && !url.hash ? "" : `${url.pathname}${url.search}${url.hash}`;
    const value = `${url.protocol}//${url.host}${path}`;
    return { value, reason: value === input ? null : "Standardized website" };
  } catch {
    return { value: original, reason: original === input ? null : "Trimmed extra whitespace" };
  }
}

export function assessWebsite(value: string): Flag[] {
  if (!value) return [];
  try {
    const url = new URL(value);
    if (!url.hostname.includes(".")) throw new Error("bad");
    return [];
  } catch {
    return [
      {
        severity: "warning",
        code: "invalid_website",
        message: "This doesn’t parse as a website.",
      },
    ];
  }
}

export function cleanIdentifier(input: string): FieldClean {
  const original = normalizeWhitespace(input);
  if (!original) return { value: "", reason: null };
  if (/^\d+\.0+$/.test(original)) {
    return { value: original.replace(/\.0+$/, ""), reason: "Removed a trailing decimal from the ID" };
  }
  return { value: original, reason: original === input ? null : "Trimmed extra whitespace" };
}

export function cleanLooseText(input: string): FieldClean {
  const value = normalizeWhitespace(input);
  return { value, reason: value === input ? null : "Trimmed extra whitespace" };
}
