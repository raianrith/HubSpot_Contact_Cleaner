"use client";

import { useMemo, useState } from "react";
import { FIELD_OPTIONS, fieldLabel } from "@/lib/detect";
import { downloadCsv, downloadWorkbook } from "@/lib/export";
import { DUPLICATE_ISSUE_CODES, issueLabel } from "@/lib/issue-copy";
import type { CleanOptions, CleanResult, FieldKind, Severity } from "@/lib/types";

type Tab = "preview" | "issues" | "duplicates" | "changes" | "companies" | "address" | "website";
type RowFilter = "all" | "changed" | "attention";

const PAGE_SIZE = 25;

export function ResultsDashboard({
  fileName,
  sheetNames,
  sheetName,
  onSheet,
  result,
  options,
  onOptions,
  onMapping,
  onReset,
}: {
  fileName: string;
  sheetNames: string[];
  sheetName: string;
  onSheet: (name: string) => void;
  result: CleanResult;
  options: CleanOptions;
  onOptions: (options: CleanOptions) => void;
  onMapping: (index: number, kind: FieldKind) => void;
  onReset: () => void;
}) {
  const [tab, setTab] = useState<Tab>("preview");
  const [query, setQuery] = useState("");
  const [rowFilter, setRowFilter] = useState<RowFilter>("all");
  const [page, setPage] = useState(0);
  const [issueCode, setIssueCode] = useState<string | "action">("action");
  const [busy, setBusy] = useState<"xlsx" | "csv" | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const changed = useMemo(() => {
    const cells = new Set<string>();
    const rows = new Set<number>();
    for (const change of result.changes) {
      cells.add(`${change.rowIndex}:${change.columnIndex}`);
      rows.add(change.rowIndex);
    }
    return { cells, rows };
  }, [result.changes]);

  const attentionRows = useMemo(() => {
    const rows = new Set<number>();
    for (const issue of result.issues) {
      if (issue.severity !== "info") rows.add(issue.rowIndex);
    }
    return rows;
  }, [result.issues]);

  const changeByCell = useMemo(() => {
    const map = new Map<string, string>();
    for (const change of result.changes) map.set(`${change.rowIndex}:${change.columnIndex}`, change.before);
    return map;
  }, [result.changes]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return result.rows
      .map((row, index) => ({ row, index }))
      .filter(({ row, index }) => {
        if (rowFilter === "changed" && !changed.rows.has(index)) return false;
        if (rowFilter === "attention" && !attentionRows.has(index)) return false;
        if (!needle) return true;
        const excelRow = String(result.excelRows[index] ?? "");
        return excelRow.includes(needle) || row.some((cell) => cell.toLowerCase().includes(needle));
      });
  }, [result.rows, result.excelRows, query, rowFilter, changed.rows, attentionRows]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pages - 1);
  const visible = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const kpis = result.kpis;

  const listedIssues = useMemo(
    () => result.issues.filter((issue) => !DUPLICATE_ISSUE_CODES.has(issue.code)),
    [result.issues],
  );

  const issueGroups = useMemo(() => {
    const groups = new Map<string, { code: string; count: number; severity: Severity }>();
    for (const issue of listedIssues) {
      const current = groups.get(issue.code) ?? { code: issue.code, count: 0, severity: issue.severity };
      current.count += 1;
      if (issue.severity === "error") current.severity = "error";
      groups.set(issue.code, current);
    }
    return [...groups.values()].sort((a, b) => severityRank(a.severity) - severityRank(b.severity) || b.count - a.count);
  }, [listedIssues]);

  const visibleIssues = listedIssues.filter((issue) => {
    if (issueCode === "action") return issue.severity !== "info";
    return issue.code === issueCode;
  });

  async function saveWorkbook() {
    setBusy("xlsx");
    setDownloadError(null);
    try {
      await downloadWorkbook(result, fileName);
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : "The Excel file could not be created.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="rounded-2xl border border-[#e5edf5] bg-white px-5 py-5 shadow-[0_8px_24px_rgba(45,62,80,0.04)] sm:px-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="truncate text-sm text-[#7c98b6]">{fileName}</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-[#2d3e50]">Ready for review</h1>
            <p className="mt-2 text-sm leading-6 text-[#516f90]">
              {kpis.cellsChanged.toLocaleString()} fields cleaned
              <span className="px-1.5 text-[#c5d0dc]">·</span>
              {kpis.invalidEmails > 0
                ? `${kpis.invalidEmails.toLocaleString()} emails can’t be sent`
                : "No unusable emails"}
              <span className="px-1.5 text-[#c5d0dc]">·</span>
              {kpis.duplicateGroups > 0
                ? `${kpis.duplicateGroups.toLocaleString()} duplicate groups`
                : "No duplicate groups"}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <div className="flex flex-nowrap items-center gap-2">
            <button type="button" onClick={onReset} className="whitespace-nowrap rounded-lg px-3 py-2.5 text-sm font-semibold text-[#516f90] hover:bg-[#f5f8fa] hover:text-[#33475b]">
              Start over
            </button>
            <button
              type="button"
              onClick={() => downloadCsv(result, fileName)}
              className="whitespace-nowrap rounded-lg border border-[#cbd6e2] bg-white px-4 py-2.5 text-sm font-semibold text-[#33475b] hover:border-[#ff7a59]"
            >
              Download CSV
            </button>
            <button
              type="button"
              onClick={saveWorkbook}
              disabled={busy === "xlsx"}
              className="whitespace-nowrap rounded-lg bg-[#ff7a59] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#ff8f73] disabled:opacity-60"
            >
              {busy === "xlsx" ? "Preparing…" : "Download cleaned Excel"}
            </button>
            </div>
            {downloadError ? <p className="max-w-xs text-right text-xs text-[#c93b41]">{downloadError}</p> : null}
          </div>
        </div>
      </div>

      <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Kpi label="Contacts" value={kpis.records} detail={`${kpis.columns} columns read`} onClick={() => setTab("preview")} />
        <Kpi label="Fields cleaned" value={kpis.cellsChanged} detail={`${kpis.recordsChanged.toLocaleString()} contacts touched`} onClick={() => { setTab("changes"); }} />
        <Kpi
          label="Emails to review"
          value={kpis.emailsToReview}
          detail={kpis.emailsCorrected ? `${kpis.emailsCorrected.toLocaleString()} corrected automatically` : "Nothing could be auto-corrected"}
          tone={kpis.invalidEmails ? "bad" : kpis.emailsToReview ? "warn" : "good"}
          onClick={() => { setTab("issues"); setIssueCode("action"); }}
        />
        <Kpi
          label="Duplicate groups"
          value={kpis.duplicateGroups}
          detail={`${kpis.duplicateRecords.toLocaleString()} rows · ${kpis.conflictingDuplicates.toLocaleString()} disagree`}
          tone={kpis.conflictingDuplicates ? "warn" : "good"}
          onClick={() => setTab("duplicates")}
        />
        <Kpi label="Company names aligned" value={kpis.companiesAligned} detail="Same business, one spelling" onClick={() => setTab("companies")} />
        <Kpi
          label="Clear to import"
          value={kpis.readyRecords}
          detail={`${kpis.reviewRecords.toLocaleString()} need review · ${kpis.blockedRecords.toLocaleString()} blocked`}
          tone={kpis.blockedRecords ? "warn" : "good"}
          onClick={() => { setTab("preview"); setRowFilter("attention"); setPage(0); }}
        />
      </section>

      <section className="mt-4 rounded-2xl border border-[#e5edf5] bg-white p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <p className="text-sm font-semibold text-[#33475b]">Cleaning rules</p>
          <div className="flex flex-wrap gap-2">
            <Select
              label="Phones"
              value={options.phoneFormat}
              onChange={(value) => onOptions({ ...options, phoneFormat: value as CleanOptions["phoneFormat"] })}
              options={[["national", "(555) 010-1234"], ["e164", "+15550101234"]]}
            />
            <Select
              label="States"
              value={options.stateFormat}
              onChange={(value) => onOptions({ ...options, stateFormat: value as CleanOptions["stateFormat"] })}
              options={[["abbr", "WI"], ["full", "Wisconsin"]]}
            />
            <Toggle
              checked={options.standardizeCompanies}
              onChange={(checked) => onOptions({ ...options, standardizeCompanies: checked })}
              label="Align company spellings"
            />
            <Toggle
              checked={options.fillBlanksFromDuplicates}
              onChange={(checked) => onOptions({ ...options, fillBlanksFromDuplicates: checked })}
              label="Fill blanks from duplicates"
            />
          </div>
        </div>
        {sheetNames.length > 1 ? (
          <label className="mt-3 flex items-center gap-2 text-sm text-[#516f90]">
            Sheet
            <select
              value={sheetName}
              onChange={(event) => onSheet(event.target.value)}
              className="rounded-lg border border-[#d5e0ea] bg-white px-2 py-1.5 text-[#33475b]"
            >
              {sheetNames.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </label>
        ) : null}
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {result.mappings.map((mapping, index) => (
            <label key={`${mapping.header}-${index}`} className="min-w-40 flex-1 rounded-xl bg-[#f5f8fa] px-3 py-2">
              <span className="block truncate text-[11px] font-medium uppercase tracking-wide text-[#7c98b6]" title={mapping.header}>
                {mapping.header}
              </span>
              <select
                aria-label={`Field type for ${mapping.header}`}
                value={mapping.kind}
                onChange={(event) => onMapping(index, event.target.value as FieldKind)}
                className="mt-1 w-full bg-transparent text-sm font-medium text-[#33475b] outline-none"
              >
                {FIELD_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </section>

      <div className="mt-6 flex gap-1 overflow-x-auto border-b border-[#e5edf5]">
        {(
          [
            ["preview", "Preview"],
            ["issues", "Issues"],
            ["duplicates", "Duplicates"],
            ["changes", "What changed"],
            ["companies", "Companies"],
            ["address", "Address"],
            ["website", "Website"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`shrink-0 border-b-2 px-3 py-2.5 text-sm font-semibold ${
              tab === id ? "border-[#ff7a59] text-[#33475b]" : "border-transparent text-[#7c98b6] hover:text-[#33475b]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {tab === "preview" ? (
          <div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ["all", "All rows"],
                    ["changed", "Changed"],
                    ["attention", "Needs attention"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => { setRowFilter(id); setPage(0); }}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                      rowFilter === id ? "bg-[#33475b] text-white" : "bg-white text-[#516f90] ring-1 ring-[#e5edf5]"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <input
                value={query}
                onChange={(event) => { setQuery(event.target.value); setPage(0); }}
                placeholder="Search names, emails, companies"
                className="w-full rounded-xl border border-[#d5e0ea] bg-white px-3 py-2 text-sm text-[#33475b] outline-none placeholder:text-[#7c98b6] focus:border-[#ff7a59] sm:max-w-xs"
              />
            </div>
            <div className="mt-3 max-h-[640px] overflow-auto rounded-2xl border border-[#e5edf5] bg-white">
              <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
                <thead className="sticky top-0 z-10 bg-[#f8fafc]">
                  <tr>
                    <th className="whitespace-nowrap border-b border-[#e5edf5] px-3 py-2 text-xs font-semibold text-[#7c98b6]">Row</th>
                    {result.headers.map((header, headerIndex) => (
                      <th key={`${header}-${headerIndex}`} className="whitespace-nowrap border-b border-[#e5edf5] px-3 py-2 text-xs font-semibold text-[#516f90]">
                        {header}
                        <span className="mt-0.5 block font-medium text-[#7c98b6]">{fieldLabel(result.mappings[headerIndex]?.kind ?? "text")}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visible.map(({ row, index }) => (
                    <tr key={index} className={attentionRows.has(index) ? "bg-[#fffaf8]" : undefined}>
                      <td className="whitespace-nowrap border-b border-[#f1f5f9] px-3 py-2 align-top text-xs font-medium text-[#7c98b6]">
                        {result.excelRows[index]}
                      </td>
                      {row.map((cell, columnIndex) => {
                        const before = changeByCell.get(`${index}:${columnIndex}`);
                        return (
                          <td
                            key={`${index}-${columnIndex}`}
                            className={`max-w-56 border-b border-[#f1f5f9] px-3 py-2 align-top ${before !== undefined ? "bg-[#fff4f0]" : ""}`}
                          >
                            <div className="truncate text-[#33475b]" title={cell}>{cell || <span className="text-[#c5d0dc]">—</span>}</div>
                            {before !== undefined ? (
                              <div className="truncate text-[11px] text-[#ff7a59] line-through decoration-[#ffb5a4]" title={before}>
                                {before || "empty"}
                              </div>
                            ) : null}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  {visible.length === 0 ? (
                    <tr>
                      <td colSpan={result.headers.length + 1} className="px-4 py-10 text-center text-sm text-[#7c98b6]">
                        No rows match this view.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <Pager page={safePage} pages={pages} total={filtered.length} onPage={setPage} />
          </div>
        ) : null}

        {tab === "issues" ? (
          <div>
            <div className="flex gap-2 overflow-x-auto pb-2">
              <FilterChip active={issueCode === "action"} onClick={() => setIssueCode("action")} label="Needs action" count={listedIssues.filter((issue) => issue.severity !== "info").length} />
              {issueGroups.map((group) => (
                <FilterChip
                  key={group.code}
                  active={issueCode === group.code}
                  onClick={() => setIssueCode(group.code)}
                  label={issueLabel(group.code)}
                  count={group.count}
                  severity={group.severity}
                />
              ))}
            </div>
            <IssueTable issues={visibleIssues} result={result} />
            {visibleIssues.length === 0 ? <Empty text="Nothing in this group." /> : null}
          </div>
        ) : null}

        {tab === "duplicates" ? (
          result.duplicates.length === 0 ? (
            <Empty text="No duplicate people. Matches are the same email, or the same first name, last name, and company." />
          ) : (
            <div className="grid max-h-[720px] gap-3 overflow-auto">
              {result.duplicates.map((group) => (
                <article key={group.id} className={`rounded-2xl border bg-white p-4 ${group.conflicts.length ? "border-[#f5c9a0]" : "border-[#e5edf5]"}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-[#33475b]">
                      {group.id} · {group.match === "email" ? "Same email" : "Same name and company"} · {group.rowIndexes.length} rows
                    </h3>
                    {group.conflicts.length ? (
                      <span className="rounded-full bg-[#fff6e8] px-2 py-1 text-[11px] font-semibold text-[#b86e00]">{group.conflicts.join(" · ")}</span>
                    ) : (
                      <span className="rounded-full bg-[#e6f7f2] px-2 py-1 text-[11px] font-semibold text-[#0b8a6a]">Values agree</span>
                    )}
                  </div>
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    {group.rowIndexes.map((index) => {
                      const row = result.rows[index];
                      const person = personLine(result, index);
                      const email = cellByKind(result, row, "email");
                      const phone = cellByKind(result, row, "phone");
                      return (
                        <div key={index} className="rounded-xl bg-[#f5f8fa] px-3 py-2 text-sm">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#7c98b6]">Row {result.excelRows[index]}</p>
                          <p className="mt-1 font-medium text-[#33475b]">{person || "Unnamed contact"}</p>
                          <p className="truncate text-[#516f90]">{email || "No email on this row"}</p>
                          <p className="truncate text-[#7c98b6]">{cellByKind(result, row, "company") || "No company"} · {phone || "No phone"}</p>
                        </div>
                      );
                    })}
                  </div>
                </article>
              ))}
            </div>
          )
        ) : null}

        {tab === "changes" ? <ChangesPanel result={result} /> : null}
        {tab === "companies" ? <CompaniesPanel result={result} /> : null}
        {tab === "address" ? (
          <FieldChangesPanel
            result={result}
            categories={["address", "city", "state", "postal", "country"]}
            issueCodes={["unrecognized_state", "check_postal"]}
            empty="Streets, cities, states, ZIP codes, and countries were already consistent."
            reviewTitle="Left for a closer look"
          />
        ) : null}
        {tab === "website" ? (
          <FieldChangesPanel
            result={result}
            categories={["website"]}
            issueCodes={["invalid_website"]}
            empty="Websites were already consistent."
            reviewTitle="Websites that could not be formatted"
          />
        ) : null}
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  detail,
  tone = "neutral",
  onClick,
}: {
  label: string;
  value: number;
  detail: string;
  tone?: "neutral" | "good" | "warn" | "bad";
  onClick: () => void;
}) {
  const accent = tone === "bad" ? "text-[#c93b41]" : tone === "warn" ? "text-[#b86e00]" : tone === "good" ? "text-[#0b8a6a]" : "text-[#2d3e50]";
  return (
    <button type="button" onClick={onClick} className="rounded-2xl border border-[#e5edf5] bg-white p-4 text-left shadow-[0_8px_24px_rgba(45,62,80,0.04)] transition hover:-translate-y-0.5 hover:border-[#ffc7b8]">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7c98b6]">{label}</p>
      <p className={`mt-2 text-3xl font-semibold tracking-tight ${accent}`}>{value.toLocaleString()}</p>
      <p className="mt-1 text-xs leading-5 text-[#516f90]">{detail}</p>
    </button>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: [string, string][];
}) {
  return (
    <label className="flex items-center gap-2 rounded-full bg-[#f5f8fa] px-3 py-1.5 text-xs font-semibold text-[#516f90]">
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)} className="bg-transparent text-[#33475b] outline-none">
        {options.map(([id, text]) => (
          <option key={id} value={id}>{text}</option>
        ))}
      </select>
    </label>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 rounded-full bg-[#f5f8fa] px-3 py-1.5 text-xs font-semibold text-[#33475b]">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="accent-[#ff7a59]" />
      {label}
    </label>
  );
}

function FilterChip({
  active,
  onClick,
  label,
  count,
  severity,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  severity?: Severity;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${active ? "bg-[#33475b] text-white" : "bg-white text-[#516f90] ring-1 ring-[#e5edf5]"}`}
    >
      <span className={severity === "error" && !active ? "text-[#c93b41]" : undefined}>{label}</span>
      <span className="ml-1 opacity-70">{count}</span>
    </button>
  );
}

function IssueTable({ issues, result }: { issues: CleanResult["issues"]; result: CleanResult }) {
  if (!issues.length) return null;
  return (
    <div className="max-h-[720px] overflow-auto rounded-2xl border border-[#e5edf5] bg-white">
      <table className="min-w-full text-left text-sm">
        <thead className="sticky top-0 z-10 bg-[#f8fafc] text-xs uppercase tracking-wide text-[#7c98b6]">
          <tr>
            <th className="px-3 py-2 font-semibold">Row</th>
            <th className="px-3 py-2 font-semibold">Name</th>
            <th className="px-3 py-2 font-semibold">Email</th>
            <th className="px-3 py-2 font-semibold">Phone</th>
            <th className="px-3 py-2 font-semibold">Issue</th>
            <th className="px-3 py-2 font-semibold">Why it matters</th>
          </tr>
        </thead>
        <tbody>
          {issues.map((issue, index) => {
            const contact = contactLine(result, issue.rowIndex);
            const matches = issue.code === "duplicate" || issue.code === "duplicate_conflict" ? otherRecords(result, issue.rowIndex) : [];
            return (
              <tr key={`${issue.row}-${issue.code}-${index}`} className="border-t border-[#f1f5f9] align-top">
                <td className="whitespace-nowrap px-3 py-2 text-[#7c98b6]">{issue.row}</td>
                <td className="whitespace-nowrap px-3 py-2 font-medium text-[#33475b]">{contact.name}</td>
                <td className="px-3 py-2 text-[#33475b]">{contact.email}</td>
                <td className="whitespace-nowrap px-3 py-2 text-[#33475b]">{contact.phone}</td>
                <td className="px-3 py-2">
                  <span className={`whitespace-nowrap rounded-full px-2 py-1 text-[11px] font-semibold ${pillClass(issue.severity)}`}>{issueLabel(issue.code)}</span>
                </td>
                <td className="min-w-72 px-3 py-2 text-[#516f90]">
                  <p>{issue.message}</p>
                  {matches.length ? (
                    <ul className="mt-2 space-y-1.5 border-t border-[#f1f5f9] pt-2 text-[#33475b]">
                      {matches.map((match) => (
                        <li key={match.row}>
                          <span className="text-xs font-semibold uppercase tracking-wide text-[#7c98b6]">Row {match.row}</span>
                          <span className="mt-0.5 block">{match.name}</span>
                          <span className="block text-[#516f90]">{match.email}</span>
                          <span className="block text-xs text-[#7c98b6]">{match.phone}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ChangesPanel({ result }: { result: CleanResult }) {
  const counts = new Map<string, number>();
  for (const change of result.changes) counts.set(change.category, (counts.get(change.category) ?? 0) + 1);
  const labels: Record<string, string> = {
    name: "Names",
    company_format: "Company formatting",
    company_align: "Company alignment",
    email: "Emails",
    phone: "Phones",
    address: "Addresses",
    state: "States",
    postal: "Postal codes",
    country: "Countries",
    city: "Cities",
    title: "Job titles",
    website: "Websites",
    whitespace: "Whitespace",
    duplicate_fill: "Filled from duplicates",
    id: "IDs",
  };
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        {[...counts.entries()].sort((a, b) => b[1] - a[1]).map(([category, count]) => (
          <span key={category} className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[#33475b] ring-1 ring-[#e5edf5]">
            {labels[category] ?? category} · {count.toLocaleString()}
          </span>
        ))}
      </div>
      <div className="overflow-auto rounded-2xl border border-[#e5edf5] bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-[#f8fafc] text-xs uppercase tracking-wide text-[#7c98b6]">
            <tr>
              <th className="px-3 py-2 font-semibold">Row</th>
              <th className="px-3 py-2 font-semibold">Column</th>
              <th className="px-3 py-2 font-semibold">Before</th>
              <th className="px-3 py-2 font-semibold">After</th>
              <th className="px-3 py-2 font-semibold">Why</th>
            </tr>
          </thead>
          <tbody>
            {result.changes.slice(0, 250).map((change, index) => (
              <tr key={`${change.rowIndex}-${change.columnIndex}-${index}`} className="border-t border-[#f1f5f9]">
                <td className="px-3 py-2 text-[#7c98b6]">{change.row}</td>
                <td className="px-3 py-2 text-[#33475b]">{change.column}</td>
                <td className="max-w-48 truncate px-3 py-2 text-[#c93b41]" title={change.before}>{change.before || "empty"}</td>
                <td className="max-w-48 truncate px-3 py-2 font-medium text-[#0b8a6a]" title={change.after}>{change.after || "empty"}</td>
                <td className="px-3 py-2 text-[#516f90]">{change.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {result.changes.length > 250 ? <p className="mt-2 text-xs text-[#7c98b6]">Showing 250 of {result.changes.length.toLocaleString()} changes. The workbook has the full list.</p> : null}
      {result.changes.length === 0 ? <Empty text="Nothing needed to change." /> : null}
    </div>
  );
}

function CompaniesPanel({ result }: { result: CleanResult }) {
  return (
    <div className="grid gap-4">
      {result.similarCompanies.length ? (
        <div className="rounded-2xl border border-[#f5c9a0] bg-[#fffaf3] p-4">
          <h3 className="text-sm font-semibold text-[#8a5a00]">Similar names left unchanged</h3>
          <p className="mt-1 text-sm text-[#516f90]">These are one letter apart, but they were not merged automatically.</p>
          <ul className="mt-3 space-y-1 text-sm text-[#33475b]">
            {result.similarCompanies.map((item) => (
              <li key={`${item.a}-${item.b}`}>{item.a} ({item.rowsA}) and {item.b} ({item.rowsB})</li>
            ))}
          </ul>
        </div>
      ) : null}
      {result.companyAlignments.length === 0 ? (
        <Empty text="Company names were already consistent." />
      ) : (
        <div className="overflow-auto rounded-2xl border border-[#e5edf5] bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-[#f8fafc] text-xs uppercase tracking-wide text-[#7c98b6]">
              <tr>
                <th className="px-3 py-2 font-semibold">Original</th>
                <th className="px-3 py-2 font-semibold">Cleaned</th>
                <th className="px-3 py-2 font-semibold">Rows</th>
              </tr>
            </thead>
            <tbody>
              {result.companyAlignments.slice(0, 200).map((item) => (
                <tr key={`${item.from}-${item.to}`} className="border-t border-[#f1f5f9]">
                  <td className="px-3 py-2 text-[#516f90]">{item.from}</td>
                  <td className="px-3 py-2 font-medium text-[#33475b]">{item.to}</td>
                  <td className="px-3 py-2 text-[#7c98b6]">{item.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FieldChangesPanel({
  result,
  categories,
  issueCodes,
  empty,
  reviewTitle,
}: {
  result: CleanResult;
  categories: string[];
  issueCodes: string[];
  empty: string;
  reviewTitle: string;
}) {
  const grouped = new Map<string, { column: string; before: string; after: string; count: number }>();
  for (const change of result.changes) {
    if (!categories.includes(change.category)) continue;
    const key = `${change.column}\0${change.before}\0${change.after}`;
    const current = grouped.get(key) ?? { column: change.column, before: change.before, after: change.after, count: 0 };
    current.count += 1;
    grouped.set(key, current);
  }
  const rows = [...grouped.values()].sort((a, b) => b.count - a.count || a.column.localeCompare(b.column));

  const review = new Map<string, { column: string; value: string; message: string; rows: number[] }>();
  for (const issue of result.issues) {
    if (!issueCodes.includes(issue.code)) continue;
    const key = `${issue.column}\0${issue.value}\0${issue.message}`;
    const current = review.get(key) ?? { column: issue.column, value: issue.value, message: issue.message, rows: [] };
    current.rows.push(issue.row);
    review.set(key, current);
  }
  const flagged = [...review.values()].sort((a, b) => b.rows.length - a.rows.length);

  if (!rows.length && !flagged.length) return <Empty text={empty} />;

  return (
    <div className="grid gap-4">
      {flagged.length ? (
        <div className="rounded-2xl border border-[#f5c9a0] bg-[#fffaf3] p-4">
          <h3 className="text-sm font-semibold text-[#8a5a00]">{reviewTitle}</h3>
          <ul className="mt-3 space-y-2 text-sm text-[#33475b]">
            {flagged.slice(0, 40).map((item) => (
              <li key={`${item.column}-${item.value}-${item.message}`}>
                <span className="font-medium">{item.value || "empty"}</span>
                <span className="text-[#7c98b6]"> · {item.column}</span>
                <span className="mt-0.5 block text-[#516f90]">{item.message}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {rows.length ? (
        <div className="max-h-[640px] overflow-auto rounded-2xl border border-[#e5edf5] bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="sticky top-0 bg-[#f8fafc] text-xs uppercase tracking-wide text-[#7c98b6]">
              <tr>
                <th className="px-3 py-2 font-semibold">Column</th>
                <th className="px-3 py-2 font-semibold">Original</th>
                <th className="px-3 py-2 font-semibold">Cleaned</th>
                <th className="px-3 py-2 font-semibold">Rows</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 200).map((item) => (
                <tr key={`${item.column}-${item.before}-${item.after}`} className="border-t border-[#f1f5f9]">
                  <td className="whitespace-nowrap px-3 py-2 text-[#7c98b6]">{item.column}</td>
                  <td className="px-3 py-2 text-[#516f90]">{item.before || "empty"}</td>
                  <td className="px-3 py-2 font-medium text-[#33475b]">{item.after || "empty"}</td>
                  <td className="px-3 py-2 text-[#7c98b6]">{item.count.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

function Pager({ page, pages, total, onPage }: { page: number; pages: number; total: number; onPage: (page: number) => void }) {
  if (total === 0) return null;
  return (
    <div className="mt-3 flex items-center justify-between text-xs text-[#7c98b6]">
      <span>{total.toLocaleString()} rows</span>
      <div className="flex items-center gap-2">
        <button type="button" disabled={page === 0} onClick={() => onPage(page - 1)} className="rounded-lg bg-white px-2 py-1 ring-1 ring-[#e5edf5] disabled:opacity-40">Previous</button>
        <span>{page + 1} / {pages}</span>
        <button type="button" disabled={page >= pages - 1} onClick={() => onPage(page + 1)} className="rounded-lg bg-white px-2 py-1 ring-1 ring-[#e5edf5] disabled:opacity-40">Next</button>
      </div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-2xl border border-dashed border-[#d5e0ea] bg-white px-4 py-10 text-center text-sm text-[#7c98b6]">{text}</p>;
}

function pillClass(severity: Severity): string {
  if (severity === "error") return "bg-[#fdecee] text-[#c93b41]";
  if (severity === "warning") return "bg-[#fff6e8] text-[#b86e00]";
  return "bg-[#e7f6f9] text-[#007a8c]";
}

function severityRank(severity: Severity): number {
  if (severity === "error") return 0;
  if (severity === "warning") return 1;
  return 2;
}

function contactLine(result: CleanResult, index: number) {
  const row = result.rows[index] ?? [];
  return {
    name: personLine(result, index) || "No name",
    email: cellByKind(result, row, "email") || "No email",
    phone: cellByKind(result, row, "phone") || "No phone",
  };
}

function otherRecords(result: CleanResult, rowIndex: number) {
  const group = result.duplicates.find((item) => item.rowIndexes.includes(rowIndex));
  if (!group) return [];
  return group.rowIndexes
    .filter((index) => index !== rowIndex)
    .map((index) => ({ row: result.excelRows[index] ?? index + 2, ...contactLine(result, index) }));
}

function cellByKind(result: CleanResult, row: string[], kind: FieldKind): string {
  const index = result.mappings.findIndex((mapping) => mapping.kind === kind);
  return index >= 0 ? row[index] ?? "" : "";
}

function personLine(result: CleanResult, index: number): string {
  const row = result.rows[index];
  const full = cellByKind(result, row, "full_name");
  if (full) return full;
  return [cellByKind(result, row, "first_name"), cellByKind(result, row, "last_name")].filter(Boolean).join(" ");
}
