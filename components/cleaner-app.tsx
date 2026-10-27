"use client";

import { useMemo, useState } from "react";
import { DEMO_FILE_NAME, DEMO_HEADERS, DEMO_ROWS } from "@/lib/demo-data";
import { detectColumns } from "@/lib/detect";
import { cleanRecords } from "@/lib/clean";
import { parseSpreadsheet, type ParsedSheet } from "@/lib/parse";
import { defaultOptions, type CleanOptions, type ColumnMapping, type FieldKind } from "@/lib/types";
import { ResultsDashboard } from "@/components/results-dashboard";

interface LoadedFile {
  fileName: string;
  sheets: ParsedSheet[];
  sheetName: string;
}

const SINGULAR = new Set<FieldKind>(["first_name", "last_name", "full_name", "company", "job_title", "website"]);

export function CleanerApp() {
  const [loaded, setLoaded] = useState<LoadedFile | null>(null);
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [options, setOptions] = useState<CleanOptions>(defaultOptions);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const sheet = loaded?.sheets.find((item) => item.name === loaded.sheetName) ?? loaded?.sheets[0];

  const result = useMemo(() => {
    if (!sheet || mappings.length !== sheet.headers.length) return null;
    return cleanRecords(sheet.headers, sheet.rows, sheet.excelRows, mappings, options);
  }, [sheet, mappings, options]);

  function loadSheet(fileName: string, sheets: ParsedSheet[], sheetName: string) {
    const nextSheet = sheets.find((item) => item.name === sheetName) ?? sheets[0];
    setLoaded({ fileName, sheets, sheetName: nextSheet.name });
    setMappings(detectColumns(nextSheet.headers, nextSheet.rows));
    setError(null);
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      setError("That file is over 20 MB. Split it into a smaller export and try again.");
      return;
    }
    setParsing(true);
    setError(null);
    try {
      const parsed = await parseSpreadsheet(file);
      loadSheet(parsed.fileName, parsed.sheets, parsed.sheets[0].name);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That file couldn’t be read. Use a CSV or Excel workbook.");
    } finally {
      setParsing(false);
    }
  }

  function loadDemo() {
    loadSheet(DEMO_FILE_NAME, [{ name: "Contacts", headers: DEMO_HEADERS, rows: DEMO_ROWS, excelRows: DEMO_ROWS.map((_, index) => index + 2) }], "Contacts");
  }

  function updateMapping(index: number, kind: FieldKind) {
    setMappings((current) =>
      current.map((mapping, mappingIndex) => {
        if (mappingIndex === index) return { ...mapping, kind, confidence: 1, reason: "Chosen by you" };
        if (SINGULAR.has(kind) && mapping.kind === kind) {
          return { ...mapping, kind: "text", confidence: 1, reason: "Released because another column uses this field" };
        }
        return mapping;
      }),
    );
  }

  return (
    <div className="min-h-screen">
      <div className="h-1.5 bg-[#ff7a59]" />
      <header className="border-b border-[#e5edf5] bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#ff7a59] text-white shadow-[0_8px_16px_rgba(255,122,89,0.28)]">
              <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
                <path d="M5 12.5 9.2 17 19 7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <span>
              <span className="block text-[15px] font-semibold tracking-tight text-[#33475b]">Contact Cleaner</span>
              <span className="block text-xs text-[#7c98b6]">For HubSpot imports</span>
            </span>
          </div>
          <p className="hidden text-right text-xs leading-5 text-[#516f90] sm:block">
            Runs in your browser.
            <br />
            Files are not uploaded.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-12">
        {!result || !sheet || !loaded ? (
          <UploadPanel
            dragging={dragging}
            parsing={parsing}
            error={error}
            onDrag={setDragging}
            onFile={onFile}
            onDemo={loadDemo}
          />
        ) : (
          <ResultsDashboard
            key={`${loaded.fileName}:${sheet.name}`}
            fileName={loaded.fileName}
            sheetNames={loaded.sheets.map((item) => item.name)}
            sheetName={sheet.name}
            onSheet={(name) => loadSheet(loaded.fileName, loaded.sheets, name)}
            result={result}
            options={options}
            onOptions={setOptions}
            onMapping={updateMapping}
            onReset={() => {
              setLoaded(null);
              setMappings([]);
              setError(null);
            }}
          />
        )}
      </main>
    </div>
  );
}

function UploadPanel({
  dragging,
  parsing,
  error,
  onDrag,
  onFile,
  onDemo,
}: {
  dragging: boolean;
  parsing: boolean;
  error: string | null;
  onDrag: (value: boolean) => void;
  onFile: (file: File | undefined) => void;
  onDemo: () => void;
}) {
  return (
    <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)]">
      <section>
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#ff7a59]">Email-ready contact data</p>
        <h1 className="mt-3 max-w-xl text-4xl font-semibold tracking-tight text-[#2d3e50] sm:text-5xl sm:leading-[1.08]">
          Clean the list before HubSpot sees it.
        </h1>
        <p className="mt-4 max-w-xl text-base leading-7 text-[#516f90]">
          Upload a CSV or Excel export. Names, companies, phones, and addresses come back in one consistent shape,
          duplicate people are lined up, and emails that would bounce or belong to someone else are flagged.
        </p>

        <label
          onDragEnter={() => onDrag(true)}
          onDragOver={(event) => {
            event.preventDefault();
            onDrag(true);
          }}
          onDragLeave={() => onDrag(false)}
          onDrop={(event) => {
            event.preventDefault();
            onDrag(false);
            onFile(event.dataTransfer.files?.[0]);
          }}
          className={`mt-8 flex cursor-pointer flex-col items-center rounded-3xl border-2 border-dashed px-6 py-12 text-center transition ${
            dragging ? "border-[#ff7a59] bg-[#fff4f0]" : "border-[#d5e0ea] bg-white hover:border-[#ff7a59]"
          }`}
        >
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#fff1ec] text-[#ff7a59]">
            <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
              <path d="M12 16V5m0 0 4 4M12 5 8 9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M5 16.5V18a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-1.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </span>
          <span className="mt-4 text-base font-semibold text-[#33475b]">{parsing ? "Reading the file…" : "Drop a CSV or Excel file"}</span>
          <span className="mt-1 text-sm text-[#7c98b6]">or click to browse. Up to 20 MB. Nothing leaves this browser.</span>
          <input
            type="file"
            accept=".csv,.xlsx,.xls,.xlsm,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            disabled={parsing}
            onChange={(event) => {
              onFile(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </label>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onDemo}
            className="rounded-lg border border-[#cbd6e2] bg-white px-4 py-2.5 text-sm font-semibold text-[#33475b] transition hover:border-[#ff7a59]"
          >
            Try a demo list
          </button>
          <p className="text-sm text-[#7c98b6]">The demo uses fake contacts with the same kinds of mess.</p>
        </div>
        {error ? <p className="mt-4 rounded-xl bg-[#fdecee] px-4 py-3 text-sm text-[#c93b41]">{error}</p> : null}
      </section>

      <aside className="rounded-3xl border border-[#e5edf5] bg-white p-6 shadow-[0_16px_40px_rgba(45,62,80,0.06)]">
        <h2 className="text-sm font-semibold text-[#33475b]">What changes</h2>
        <div className="mt-4 grid gap-3">
          <Compare
            label="Before"
            lines={["CARSON BALL", "georgia pacific", "Ryan moore@billerud .com", "740.808.4003"]}
            muted
          />
          <Compare
            label="After"
            lines={["Carson Ball", "Georgia Pacific", "ryan.moore@billerud.com", "(740) 808-4003"]}
          />
        </div>
        <ul className="mt-5 space-y-2 text-sm leading-6 text-[#516f90]">
          <li>Company spellings collapse so segments don’t split.</li>
          <li>Bad, mismatched, and role emails are called out.</li>
          <li>Duplicate people stay in your file and are grouped for review.</li>
        </ul>
      </aside>
    </div>
  );
}

function Compare({ label, lines, muted }: { label: string; lines: string[]; muted?: boolean }) {
  return (
    <div className={`rounded-2xl px-4 py-3 ${muted ? "bg-[#f5f8fa]" : "bg-[#fff4f0]"}`}>
      <p className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${muted ? "text-[#7c98b6]" : "text-[#ff7a59]"}`}>{label}</p>
      <div className="mt-2 space-y-1">
        {lines.map((line) => (
          <p key={line} className={`truncate text-sm ${muted ? "text-[#516f90]" : "font-medium text-[#33475b]"}`}>
            {line}
          </p>
        ))}
      </div>
    </div>
  );
}
