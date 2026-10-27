import {
  assessPostal,
  assessState,
  assessWebsite,
  cleanAddress,
  cleanCity,
  cleanCountry,
  cleanIdentifier,
  cleanJobTitle,
  cleanLooseText,
  cleanPostal,
  cleanState,
  cleanWebsite,
  cleanZip4,
  isZip4Header,
} from "./addresses";
import { standardizeCompanies } from "./companies";
import { assessEmail, cleanEmail, domainCounts, emailIsSafeToCopy, emailSyntaxError } from "./emails";
import { cleanPersonName, nameLooksInvalid } from "./names";
import { assessPhone, cleanPhone } from "./phones";
import { lettersOnly } from "./text";
import type {
  CellChange,
  ChangeCategory,
  CleanOptions,
  CleanResult,
  ColumnMapping,
  CompanyAlignment,
  DuplicateGroup,
  FieldKind,
  Flag,
  Issue,
  Kpis,
  SimilarCompany,
} from "./types";

const EMAIL_REVIEW = new Set([
  "invalid_email",
  "email_name_mismatch",
  "email_name_typo",
  "disposable_email",
  "missing_email",
]);

function categoryFor(kind: FieldKind): ChangeCategory {
  switch (kind) {
    case "first_name":
    case "last_name":
    case "full_name":
      return "name";
    case "email":
      return "email";
    case "phone":
      return "phone";
    case "address":
      return "address";
    case "state":
      return "state";
    case "postal_code":
      return "postal";
    case "country":
      return "country";
    case "city":
      return "city";
    case "job_title":
      return "title";
    case "website":
      return "website";
    case "id":
      return "id";
    default:
      return "whitespace";
  }
}

function indexesOf(mappings: ColumnMapping[], kind: FieldKind): number[] {
  return mappings.flatMap((mapping, index) => (mapping.kind === kind ? [index] : []));
}

function firstIndex(mappings: ColumnMapping[], kind: FieldKind): number {
  return mappings.findIndex((mapping) => mapping.kind === kind);
}

interface Note {
  category: ChangeCategory;
  reasons: string[];
}

function personOf(row: string[], firstCol: number, lastCol: number, fullCol: number): { first: string; last: string } {
  const first = firstCol >= 0 ? row[firstCol] ?? "" : "";
  const last = lastCol >= 0 ? row[lastCol] ?? "" : "";
  if (first || last || fullCol < 0) return { first, last };
  const parts = (row[fullCol] ?? "").split(" ").filter(Boolean);
  return { first: parts[0] ?? "", last: parts.slice(1).join(" ") };
}

function distinct(values: string[], normalize: (value: string) => string = (value) => value.trim()): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const display = value.trim();
    if (!display) continue;
    const key = normalize(display);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(display);
  }
  return result;
}

export function cleanRecords(
  headers: string[],
  originalRows: string[][],
  excelRows: number[],
  mappings: ColumnMapping[],
  options: CleanOptions,
): CleanResult {
  const original = originalRows.map((row) => headers.map((_, index) => row[index] ?? ""));
  const cleaned = original.map((row) => row.slice());
  const notes = new Map<string, Note>();

  const addNote = (rowIndex: number, columnIndex: number, category: ChangeCategory, reason: string | null) => {
    if (!reason) return;
    const key = `${rowIndex}:${columnIndex}`;
    const current = notes.get(key);
    if (!current) {
      notes.set(key, { category, reasons: [reason] });
      return;
    }
    if (!current.reasons.includes(reason)) current.reasons.push(reason);
    const rank = (value: ChangeCategory) => (value === "company_align" || value === "duplicate_fill" ? 2 : 1);
    if (rank(category) >= rank(current.category)) current.category = category;
  };

  const emailCols = indexesOf(mappings, "email");
  const phoneCols = indexesOf(mappings, "phone");
  const companyCols = indexesOf(mappings, "company");
  const firstCol = firstIndex(mappings, "first_name");
  const lastCol = firstIndex(mappings, "last_name");
  const fullCol = firstIndex(mappings, "full_name");
  const counts = domainCounts(original.flatMap((row) => emailCols.map((column) => row[column] ?? "")));

  original.forEach((row, rowIndex) => {
    row.forEach((value, columnIndex) => {
      const kind = mappings[columnIndex]?.kind ?? "text";
      if (kind === "ignore" || kind === "text" || kind === "company") return;
      const cleanedField =
        kind === "first_name" || kind === "last_name" || kind === "full_name"
          ? cleanPersonName(value)
          : kind === "email"
            ? cleanEmail(value, counts)
            : kind === "phone"
              ? cleanPhone(value, options.phoneFormat)
              : kind === "address"
                ? cleanAddress(value)
                : kind === "city"
                  ? cleanCity(value)
                  : kind === "state"
                    ? cleanState(value, options.stateFormat)
                      : kind === "postal_code"
                        ? isZip4Header(mappings[columnIndex]?.header ?? "")
                          ? cleanZip4(value)
                          : cleanPostal(value)
                        : kind === "country"
                        ? cleanCountry(value)
                        : kind === "job_title"
                          ? cleanJobTitle(value)
                          : kind === "website"
                            ? cleanWebsite(value)
                            : kind === "id"
                              ? cleanIdentifier(value)
                              : cleanLooseText(value);
      cleaned[rowIndex][columnIndex] = cleanedField.value;
      addNote(rowIndex, columnIndex, categoryFor(kind), cleanedField.reason);
    });
  });

  const companyAlignments: CompanyAlignment[] = [];
  const similarCompanies: SimilarCompany[] = [];
  for (const columnIndex of companyCols) {
    const pass = standardizeCompanies(
      cleaned.map((row) => row[columnIndex] ?? ""),
      options.standardizeCompanies,
    );
    pass.values.forEach((value, rowIndex) => {
      cleaned[rowIndex][columnIndex] = value;
      for (const note of pass.notes[rowIndex] ?? []) addNote(rowIndex, columnIndex, note.category, note.reason);
    });
    companyAlignments.push(...pass.alignments);
    similarCompanies.push(...pass.similar);
  }

  const membership = findDuplicateMembership(cleaned, {
    emailCols,
    firstCol,
    lastCol,
    fullCol,
    companyCol: companyCols[0] ?? -1,
  });

  if (options.fillBlanksFromDuplicates) {
    for (const group of membership) {
      const rows = group.rowIndexes.map((index) => cleaned[index]);
      for (const columnIndex of headers.map((_, index) => index)) {
        const kind = mappings[columnIndex]?.kind ?? "text";
        if (!["email", "phone", "job_title", "address", "city", "state", "postal_code", "country", "website"].includes(kind)) {
          continue;
        }
        const values = distinct(rows.map((row) => row[columnIndex] ?? ""));
        if (values.length !== 1) continue;
        const donor = values[0];
        if (kind === "email") {
          const people = group.rowIndexes.map((index) => personOf(cleaned[index], firstCol, lastCol, fullCol));
          const safe = people.some((person) => emailIsSafeToCopy(donor, person, counts));
          if (!safe) continue;
        }
        if (kind === "phone" && assessPhone(donor).some((flag) => flag.severity === "warning" || flag.severity === "error")) {
          continue;
        }
        for (const rowIndex of group.rowIndexes) {
          if ((cleaned[rowIndex][columnIndex] ?? "").trim()) continue;
          cleaned[rowIndex][columnIndex] = donor;
          addNote(rowIndex, columnIndex, "duplicate_fill", "Filled from a matching duplicate row");
        }
      }
    }
  }

  const duplicates = decorateDuplicates(membership, cleaned, phoneCols, emailCols, firstCol, lastCol, fullCol);
  const issues = assessAll(cleaned, mappings, counts, duplicates, excelRows, { firstCol, lastCol, fullCol, emailCols });
  const changes = buildChanges(original, cleaned, headers, mappings, notes, excelRows);
  const kpis = buildKpis(cleaned.length, headers.length, changes, issues, duplicates);

  return {
    headers,
    mappings,
    excelRows,
    original,
    rows: cleaned,
    changes,
    issues,
    duplicates,
    companyAlignments,
    similarCompanies,
    kpis,
  };
}

interface Membership {
  match: "email" | "name_company";
  rowIndexes: number[];
}

function findDuplicateMembership(
  rows: string[][],
  cols: { emailCols: number[]; firstCol: number; lastCol: number; fullCol: number; companyCol: number },
): Membership[] {
  const parent = rows.map((_, index) => index);
  const find = (index: number): number => {
    let current = index;
    while (parent[current] !== current) {
      parent[current] = parent[parent[current]];
      current = parent[current];
    }
    return current;
  };
  const union = (left: number, right: number) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parent[leftRoot] = rightRoot;
  };
  const connect = (indexes: number[]) => {
    if (indexes.length < 2) return;
    for (let cursor = 1; cursor < indexes.length; cursor++) union(indexes[0], indexes[cursor]);
  };

  const emailGroups = new Map<string, number[]>();
  rows.forEach((row, index) => {
    for (const column of cols.emailCols) {
      const email = (row[column] ?? "").trim().toLowerCase();
      if (!email || emailSyntaxError(email)) continue;
      const list = emailGroups.get(email) ?? [];
      list.push(index);
      emailGroups.set(email, list);
    }
  });
  for (const indexes of emailGroups.values()) connect([...new Set(indexes)]);

  const nameGroups = new Map<string, number[]>();
  rows.forEach((row, index) => {
    const person = personOf(row, cols.firstCol, cols.lastCol, cols.fullCol);
    const first = lettersOnly(person.first);
    const last = lettersOnly(person.last);
    const company = cols.companyCol >= 0 ? lettersOnly(row[cols.companyCol] ?? "") : "";
    if (first.length < 2 || last.length < 2 || company.length < 2) return;
    const key = `${first}|${last}|${company}`;
    const list = nameGroups.get(key) ?? [];
    list.push(index);
    nameGroups.set(key, list);
  });
  for (const indexes of nameGroups.values()) connect(indexes);

  const clusters = new Map<number, number[]>();
  rows.forEach((_, index) => {
    const root = find(index);
    const list = clusters.get(root) ?? [];
    list.push(index);
    clusters.set(root, list);
  });

  const groups: Membership[] = [];
  for (const indexes of clusters.values()) {
    if (indexes.length < 2) continue;
    const emails = new Set<string>();
    for (const index of indexes) {
      for (const column of cols.emailCols) {
        const email = (rows[index][column] ?? "").trim().toLowerCase();
        if (email && !emailSyntaxError(email)) emails.add(email);
      }
    }
    const sharedEmail = emails.size === 1 ? [...emails][0] : "";
    const everyRowHasIt =
      sharedEmail !== "" &&
      indexes.every((index) => cols.emailCols.some((column) => (rows[index][column] ?? "").trim().toLowerCase() === sharedEmail));
    groups.push({
      match: everyRowHasIt ? "email" : "name_company",
      rowIndexes: indexes.slice().sort((a, b) => a - b),
    });
  }

  groups.sort((a, b) => b.rowIndexes.length - a.rowIndexes.length || a.rowIndexes[0] - b.rowIndexes[0]);
  return groups;
}

function decorateDuplicates(
  groups: Membership[],
  rows: string[][],
  phoneCols: number[],
  emailCols: number[],
  firstCol: number,
  lastCol: number,
  fullCol: number,
): DuplicateGroup[] {
  return groups.map((group, index) => {
    const emails = distinct(
      group.rowIndexes.flatMap((rowIndex) => emailCols.map((column) => rows[rowIndex][column] ?? "")),
      (value) => value.toLowerCase(),
    );
    const phones = distinct(
      group.rowIndexes.flatMap((rowIndex) => phoneCols.map((column) => rows[rowIndex][column] ?? "")),
      (value) => value.replace(/\D/g, ""),
    );
    const names = distinct(
      group.rowIndexes.map((rowIndex) => {
        const person = personOf(rows[rowIndex], firstCol, lastCol, fullCol);
        return `${person.first} ${person.last}`.trim();
      }),
      (value) => lettersOnly(value),
    );
    const conflicts: string[] = [];
    if (emails.length > 1) conflicts.push("Emails don’t match");
    if (phones.length > 1) conflicts.push("Phone numbers don’t match");
    if (group.match === "email" && names.length > 1) conflicts.push("Names don’t match");
    return {
      id: `D${String(index + 1).padStart(2, "0")}`,
      match: group.match,
      rowIndexes: group.rowIndexes,
      emails,
      phones,
      conflicts,
    };
  });
}

function assessAll(
  rows: string[][],
  mappings: ColumnMapping[],
  counts: Map<string, number>,
  duplicates: DuplicateGroup[],
  excelRows: number[],
  cols: { firstCol: number; lastCol: number; fullCol: number; emailCols: number[] },
): Issue[] {
  const issues: Issue[] = [];
  const push = (rowIndex: number, columnIndex: number, flag: Flag, value: string) => {
    const mapping = mappings[columnIndex];
    issues.push({
      row: excelRows[rowIndex] ?? rowIndex + 2,
      rowIndex,
      column: mapping?.header ?? "",
      kind: mapping?.kind ?? "text",
      severity: flag.severity,
      code: flag.code,
      message: flag.message,
      value,
    });
  };

  rows.forEach((row, rowIndex) => {
    if (row.every((cell) => !cell.trim())) return;
    const person = personOf(row, cols.firstCol, cols.lastCol, cols.fullCol);
    for (const columnIndex of [cols.firstCol, cols.lastCol, cols.fullCol]) {
      if (columnIndex < 0) continue;
      const value = row[columnIndex] ?? "";
      if (nameLooksInvalid(value)) {
        push(rowIndex, columnIndex, {
          severity: "warning",
          code: "invalid_name",
          message: "This doesn’t look like a person’s name.",
        }, value);
      }
    }
    const nameColumns = [cols.firstCol, cols.lastCol, cols.fullCol].filter((index) => index >= 0);
    if (nameColumns.length && nameColumns.every((index) => !(row[index] ?? "").trim())) {
      push(rowIndex, nameColumns[0], {
        severity: "warning",
        code: "missing_name",
        message: "No name, so a personalized email would have nothing to greet.",
      }, "");
    }

    const emailValues = cols.emailCols.map((column) => ({ column, value: row[column] ?? "" }));
    const filledEmails = emailValues.filter((item) => item.value.trim());
    if (cols.emailCols.length && filledEmails.length === 0) {
      push(rowIndex, cols.emailCols[0], {
        severity: "warning",
        code: "missing_email",
        message: "No email address, so this contact can’t be included in a send.",
      }, "");
    }
    for (const item of filledEmails) {
      for (const flag of assessEmail(item.value, person, counts)) {
        if (flag.code === "missing_email") continue;
        push(rowIndex, item.column, flag, item.value);
      }
    }

    mappings.forEach((mapping, columnIndex) => {
      const value = row[columnIndex] ?? "";
      if (!value.trim()) return;
      const flags =
        mapping.kind === "phone"
          ? assessPhone(value)
          : mapping.kind === "state"
            ? assessState(value)
              : mapping.kind === "postal_code"
                ? isZip4Header(mapping.header)
                  ? []
                  : assessPostal(value)
              : mapping.kind === "website"
                ? assessWebsite(value)
                : [];
      for (const flag of flags) push(rowIndex, columnIndex, flag, value);
    });
  });

  for (const group of duplicates) {
    const excelList = group.rowIndexes.map((index) => excelRows[index] ?? index + 2).join(", ");
    for (const rowIndex of group.rowIndexes) {
      const column = cols.emailCols[0] ?? cols.firstCol ?? 0;
      push(rowIndex, Math.max(column, 0), {
        severity: "warning",
        code: "duplicate",
        message:
          group.match === "email"
            ? `Shares an email with ${group.rowIndexes.length - 1} other row${group.rowIndexes.length === 2 ? "" : "s"} (rows ${excelList}).`
            : `Same name and company as ${group.rowIndexes.length - 1} other row${group.rowIndexes.length === 2 ? "" : "s"} (rows ${excelList}). Review before a send so this person doesn’t get two emails.`,
      }, rows[rowIndex]?.[column] ?? "");
      if (group.conflicts.length) {
        push(rowIndex, Math.max(column, 0), {
          severity: "warning",
          code: "duplicate_conflict",
          message: `These duplicate rows disagree (${group.conflicts.join(", ").toLowerCase()}). Pick the right values before import.`,
        }, "");
      }
    }
  }

  return issues;
}

function buildChanges(
  original: string[][],
  cleaned: string[][],
  headers: string[],
  mappings: ColumnMapping[],
  notes: Map<string, Note>,
  excelRows: number[],
): CellChange[] {
  const changes: CellChange[] = [];
  original.forEach((row, rowIndex) => {
    row.forEach((before, columnIndex) => {
      const after = cleaned[rowIndex][columnIndex] ?? "";
      if (before === after) return;
      const note = notes.get(`${rowIndex}:${columnIndex}`);
      changes.push({
        row: excelRows[rowIndex] ?? rowIndex + 2,
        rowIndex,
        column: headers[columnIndex] ?? "",
        columnIndex,
        kind: mappings[columnIndex]?.kind ?? "text",
        category: note?.category ?? "whitespace",
        before,
        after,
        reason: note?.reasons.join(" · ") || "Trimmed extra whitespace",
      });
    });
  });
  return changes;
}

function buildKpis(
  records: number,
  columns: number,
  changes: CellChange[],
  issues: Issue[],
  duplicates: DuplicateGroup[],
): Kpis {
  const changedRows = new Set(changes.map((change) => change.rowIndex));
  const errorRows = new Set(issues.filter((issue) => issue.severity === "error").map((issue) => issue.rowIndex));
  const warnRows = new Set(issues.filter((issue) => issue.severity === "warning").map((issue) => issue.rowIndex));
  let clear = 0;
  let review = 0;
  for (let index = 0; index < records; index++) {
    if (errorRows.has(index)) continue;
    if (warnRows.has(index)) review += 1;
    else clear += 1;
  }
  return {
    records,
    columns,
    cellsChanged: changes.length,
    recordsChanged: changedRows.size,
    emailsCorrected: changes.filter((change) => change.category === "email").length,
    emailsToReview: issues.filter((issue) => EMAIL_REVIEW.has(issue.code)).length,
    invalidEmails: issues.filter((issue) => issue.code === "invalid_email").length,
    missingEmails: issues.filter((issue) => issue.code === "missing_email").length,
    duplicateGroups: duplicates.length,
    duplicateRecords: new Set(duplicates.flatMap((group) => group.rowIndexes)).size,
    conflictingDuplicates: duplicates.filter((group) => group.conflicts.length > 0).length,
    phonesFormatted: changes.filter((change) => change.category === "phone").length,
    invalidPhones: issues.filter((issue) => issue.code === "invalid_phone").length,
    namesStandardized: changes.filter((change) => change.category === "name").length,
    companiesAligned: changes.filter((change) => change.category === "company_align").length,
    blanksFilled: changes.filter((change) => change.category === "duplicate_fill").length,
    readyRecords: clear,
    reviewRecords: review,
    blockedRecords: errorRows.size,
  };
}
