"use client";

import type { ImportKind, PreviewRow } from "@opentab/core";
import { AlertTriangle, CheckCircle2, FileUp, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { commitImportAction, previewImportAction } from "@/app/tab/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { NativeSelect, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/misc";
import { useAction } from "@/lib/use-action";
import { cn } from "@/lib/utils";

const LABELS: Record<ImportKind, string> = {
  schools: "schools",
  entries: "entries",
  judges: "judges",
  rooms: "rooms",
};

export function ImportDialog({
  slug,
  tournamentId,
  kind,
  fields,
  template,
}: {
  slug: string;
  tournamentId: string;
  kind: ImportKind;
  fields: { key: string; label: string; required?: boolean }[];
  template: string;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, number | null>>({});
  const [rows, setRows] = useState<PreviewRow[] | null>(null);
  const [dragging, setDragging] = useState(false);
  const { exec, pending } = useAction();
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setText("");
    setHeaders([]);
    setMapping({});
    setRows(null);
  };

  async function preview(csv = text, m?: Record<string, number | null>) {
    const res = await exec(() => previewImportAction(tournamentId, kind, csv, m), { quiet: true });
    if (res.ok) {
      setHeaders(res.data.headers);
      setMapping(res.data.mapping);
      setRows(res.data.rows);
    }
  }

  async function loadFile(file: File) {
    const csv = await file.text();
    setText(csv);
    await preview(csv);
  }

  async function commit() {
    if (!rows) return;
    const res = await exec(() => commitImportAction(slug, tournamentId, kind, rows), {
      success: (d) =>
        `Imported ${d.created} ${LABELS[kind]}${d.schoolsCreated ? ` and ${d.schoolsCreated} new schools` : ""}`,
    });
    if (res.ok) {
      setOpen(false);
      reset();
    }
  }

  const errors = rows?.filter((r) => r.errors.length) ?? [];
  const shown = fields.filter((f) => mapping[f.key] != null);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm">
          <Upload /> Import CSV
        </Button>
      </DialogTrigger>
      <DialogContent
        size="xl"
        title={`Import ${LABELS[kind]}`}
        description="Paste or drop a CSV. We match your columns automatically — check the preview before importing."
      >
        {!rows ? (
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                const f = e.dataTransfer.files[0];
                if (f) void loadFile(f);
              }}
              className={cn(
                "flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 text-sm transition",
                dragging
                  ? "border-brand bg-brand-soft"
                  : "border-border-strong hover:border-brand/60 hover:bg-surface-2",
              )}
            >
              <FileUp className="size-6 text-brand" aria-hidden />
              <span className="font-medium">Drop a .csv file or click to browse</span>
              <span className="text-xs text-fg-muted">
                Exports from spreadsheets, Tabroom or Google Forms work.
              </span>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={(e) => e.target.files?.[0] && loadFile(e.target.files[0])}
            />
            <div className="text-center text-xs text-fg-subtle">or paste below</div>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={7}
              placeholder={template}
              className="font-mono text-xs"
              aria-label="CSV text"
            />
            <div className="flex items-center justify-between">
              <Button variant="link" size="sm" onClick={() => setText(template)}>
                Use example
              </Button>
              <Button onClick={() => preview()} disabled={!text.trim()} loading={pending}>
                Preview
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {fields.map((f) => (
                <label key={f.key} className="grid gap-1 text-xs">
                  <span className="font-medium text-fg-muted">
                    {f.label}
                    {f.required && <span className="text-danger"> *</span>}
                  </span>
                  <NativeSelect
                    value={mapping[f.key] ?? ""}
                    onChange={(e) => {
                      const next = {
                        ...mapping,
                        [f.key]: e.target.value === "" ? null : Number(e.target.value),
                      };
                      setMapping(next);
                      void preview(text, next);
                    }}
                  >
                    <option value="">— not in file —</option>
                    {headers.map((h, i) => (
                      <option key={`${h}-${i}`} value={i}>
                        {h || `Column ${i + 1}`}
                      </option>
                    ))}
                  </NativeSelect>
                </label>
              ))}
            </div>
            {errors.length > 0 ? (
              <Alert
                tone="warning"
                icon={AlertTriangle}
                title={`${errors.length} row${errors.length === 1 ? "" : "s"} need attention`}
              >
                Fix them in your file (or adjust the column mapping) and preview again.
              </Alert>
            ) : (
              <Alert
                tone="success"
                icon={CheckCircle2}
                title={`${rows.length} rows ready to import`}
              />
            )}
            <div className="max-h-80 overflow-auto rounded-lg border border-border">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-surface-2">
                  <tr>
                    <th className="px-2 py-1.5 text-left font-medium text-fg-muted">#</th>
                    {shown.map((f) => (
                      <th key={f.key} className="px-2 py-1.5 text-left font-medium text-fg-muted">
                        {f.label}
                      </th>
                    ))}
                    <th className="px-2 py-1.5 text-left font-medium text-fg-muted">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 300).map((r) => (
                    <tr
                      key={r.index}
                      className={cn(
                        "border-t border-border",
                        r.errors.length && "bg-danger-soft/60",
                      )}
                    >
                      <td className="px-2 py-1 text-fg-subtle">{r.index + 2}</td>
                      {shown.map((f) => (
                        <td key={f.key} className="max-w-48 truncate px-2 py-1">
                          {r.values[f.key]}
                        </td>
                      ))}
                      <td className="px-2 py-1">
                        {r.errors.length ? (
                          <span className="text-danger">{r.errors.join("; ")}</span>
                        ) : (
                          <span className="text-success">OK</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between">
              <Button variant="ghost" onClick={reset}>
                Start over
              </Button>
              <Button
                onClick={commit}
                disabled={errors.length > 0 || rows.length === 0}
                loading={pending}
              >
                Import {rows.length} {LABELS[kind]}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
