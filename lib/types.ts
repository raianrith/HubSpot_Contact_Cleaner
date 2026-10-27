export type FieldKind =
  | "ignore"
  | "id"
  | "first_name"
  | "last_name"
  | "full_name"
  | "email"
  | "phone"
  | "company"
  | "job_title"
  | "address"
  | "city"
  | "state"
  | "postal_code"
  | "country"
  | "website"
  | "text";

export type ChangeCategory =
  | "name"
  | "company_format"
  | "company_align"
  | "email"
  | "phone"
  | "address"
  | "state"
  | "postal"
  | "country"
  | "city"
  | "title"
  | "website"
  | "whitespace"
  | "duplicate_fill"
  | "id";

export type Severity = "error" | "warning" | "info";

export interface ColumnMapping {
  header: string;
  kind: FieldKind;
  confidence: number;
  reason: string;
}

export interface CleanOptions {
  phoneFormat: "national" | "e164";
  stateFormat: "abbr" | "full";
  standardizeCompanies: boolean;
  fillBlanksFromDuplicates: boolean;
}

export const defaultOptions: CleanOptions = {
  phoneFormat: "national",
  stateFormat: "abbr",
  standardizeCompanies: true,
  fillBlanksFromDuplicates: true,
};

export interface CellChange {
  row: number;
  rowIndex: number;
  column: string;
  columnIndex: number;
  kind: FieldKind;
  category: ChangeCategory;
  before: string;
  after: string;
  reason: string;
}

export interface Issue {
  row: number;
  rowIndex: number;
  column: string;
  kind: FieldKind;
  severity: Severity;
  code: string;
  message: string;
  value: string;
}

export interface DuplicateGroup {
  id: string;
  match: "email" | "name_company";
  rowIndexes: number[];
  emails: string[];
  phones: string[];
  conflicts: string[];
}

export interface CompanyAlignment {
  from: string;
  to: string;
  count: number;
}

export interface SimilarCompany {
  a: string;
  b: string;
  rowsA: number;
  rowsB: number;
}

export interface Kpis {
  records: number;
  columns: number;
  cellsChanged: number;
  recordsChanged: number;
  emailsCorrected: number;
  emailsToReview: number;
  invalidEmails: number;
  missingEmails: number;
  duplicateGroups: number;
  duplicateRecords: number;
  conflictingDuplicates: number;
  phonesFormatted: number;
  invalidPhones: number;
  namesStandardized: number;
  companiesAligned: number;
  blanksFilled: number;
  readyRecords: number;
  reviewRecords: number;
  blockedRecords: number;
}

export interface CleanResult {
  headers: string[];
  mappings: ColumnMapping[];
  excelRows: number[];
  original: string[][];
  rows: string[][];
  changes: CellChange[];
  issues: Issue[];
  duplicates: DuplicateGroup[];
  companyAlignments: CompanyAlignment[];
  similarCompanies: SimilarCompany[];
  kpis: Kpis;
}

export interface Flag {
  severity: Severity;
  code: string;
  message: string;
}

export interface FieldClean {
  value: string;
  reason: string | null;
}
