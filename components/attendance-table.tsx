"use client";

import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CalendarX,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  FileText,
  RefreshCw,
} from "lucide-react";
import { useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, Skeleton } from "@/components/ui/card";
import { exportAttendanceToExcel } from "@/lib/export-excel";
import { exportAttendanceToPdf } from "@/lib/export-pdf";
import { formatDateFr, formatDateTimeFr, formatDuration } from "@/lib/dates";
import type { AttendanceRow } from "@/lib/types";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 25;

function AbsenceCell({ row }: { row: AttendanceRow }) {
  const tipId = useId();
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  if (row.absenceCount === 0) {
    return <span className="tabular-nums text-muted-foreground">0</span>;
  }

  function show(el: HTMLElement) {
    const r = el.getBoundingClientRect();
    setPos({ top: r.bottom + 6, left: Math.max(8, Math.min(r.left, window.innerWidth - 232)) });
  }

  return (
    <>
      <button
        type="button"
        aria-describedby={pos ? tipId : undefined}
        onMouseEnter={(e) => show(e.currentTarget)}
        onMouseLeave={() => setPos(null)}
        onFocus={(e) => show(e.currentTarget)}
        onBlur={() => setPos(null)}
        onKeyDown={(e) => e.key === "Escape" && setPos(null)}
        className="inline-flex items-center gap-1.5 rounded-md bg-warning-soft px-2 py-0.5 text-warning tabular-nums"
      >
        <CalendarX className="size-3.5" aria-hidden="true" />
        {row.absenceCount}
        <span className="sr-only">
          {row.absenceCount > 1 ? "absences" : "absence"} : {row.absenceDates.map(formatDateFr).join(", ")}
        </span>
      </button>
      {pos && (
        <div
          id={tipId}
          role="tooltip"
          style={{ top: pos.top, left: pos.left }}
          className="pointer-events-none fixed z-50 max-h-56 w-56 overflow-hidden rounded-md border border-border bg-surface p-3 text-xs shadow-md"
        >
          <p className="mb-1 font-medium">Jours d&apos;absence</p>
          <p className="text-muted-foreground">{row.absenceDates.map(formatDateFr).join(", ")}</p>
        </div>
      )}
    </>
  );
}

const columns: ColumnDef<AttendanceRow>[] = [
  { accessorKey: "id", header: "ID", cell: (c) => <span className="font-mono text-xs">{c.getValue<string>()}</span> },
  { accessorKey: "nom", header: "Nom" },
  { accessorKey: "prenom", header: "Prénom" },
  { accessorKey: "prestation", header: "Prestation" },
  {
    id: "firstPunch",
    header: "Pointage min",
    accessorFn: (r) => r.firstPunch ?? undefined,
    sortUndefined: "last",
    cell: (c) => {
      const v = c.getValue<string | undefined>();
      return v ? <span className="tabular-nums">{formatDateTimeFr(v)}</span> : <span className="text-muted-foreground">Aucun</span>;
    },
  },
  {
    id: "lastPunch",
    header: "Pointage max",
    accessorFn: (r) => r.lastPunch ?? undefined,
    sortUndefined: "last",
    cell: (c) => {
      const v = c.getValue<string | undefined>();
      return v ? <span className="tabular-nums">{formatDateTimeFr(v)}</span> : <span className="text-muted-foreground">Aucun</span>;
    },
  },
  { accessorKey: "punchCount", header: "Nb pointages", cell: (c) => <span className="tabular-nums">{c.getValue<number>()}</span> },
  {
    id: "zones",
    header: "Zones",
    accessorFn: (r) => r.zones.join(", "),
    cell: (c) => {
      const v = c.getValue<string>();
      return v || <span className="text-muted-foreground">Aucune</span>;
    },
  },
  {
    id: "eventTime",
    header: "Horaire de pointage",
    accessorFn: (r) => r.eventTime ?? "",
    cell: (c) => <span className="tabular-nums">{c.getValue<string>() || "-"}</span>,
  },
  {
    accessorKey: "presenceMinutes",
    header: "Temps de présence",
    cell: (c) => <span className="tabular-nums">{formatDuration(c.getValue<number>())}</span>,
  },
  {
    accessorKey: "absenceCount",
    header: "Absences",
    cell: (c) => <AbsenceCell row={c.row.original} />,
  },
];

export function AttendanceTable({
  rows,
  from,
  to,
  onRefresh,
  isRefreshing = false,
  refreshError = null,
}: {
  rows: AttendanceRow[];
  from: string;
  to: string;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  refreshError?: string | null;
}) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [exporting, setExporting] = useState(false);
  const data = useMemo(() => rows, [rows]);

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: PAGE_SIZE } },
  });

  async function handleExport(format: "excel" | "pdf") {
    setExporting(true);
    try {
      const sorted = table.getSortedRowModel().rows.map((r) => r.original);
      if (format === "excel") await exportAttendanceToExcel(sorted, from, to);
      else await exportAttendanceToPdf(sorted, from, to);
    } finally {
      setExporting(false);
    }
  }

  const { pageIndex } = table.getState().pagination;
  const total = rows.length;
  const start = total === 0 ? 0 : pageIndex * PAGE_SIZE + 1;
  const end = Math.min(total, (pageIndex + 1) * PAGE_SIZE);

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-3">
        <div className="flex items-center gap-3">
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {total} {total > 1 ? "lignes" : "ligne"}
          </p>
          {refreshError && (
            <span role="alert" className="text-xs text-danger font-medium">
              {refreshError}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {onRefresh && (
            <Button
              variant="outline"
              onClick={onRefresh}
              disabled={isRefreshing || exporting}
              aria-label="Actualiser les pointages"
            >
              <RefreshCw className={cn("size-4 text-primary", isRefreshing && "animate-spin")} aria-hidden="true" />
              <span>{isRefreshing ? "Mise à jour…" : "Actualiser"}</span>
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => handleExport("excel")}
            disabled={exporting || isRefreshing || total === 0}
            aria-label="Exporter vers Excel (.xlsx)"
          >
            <FileSpreadsheet className="size-4 text-emerald-600" aria-hidden="true" />
            <span>Excel (.xlsx)</span>
          </Button>
          <Button
            variant="outline"
            onClick={() => handleExport("pdf")}
            disabled={exporting || isRefreshing || total === 0}
            aria-label="Exporter vers PDF (.pdf)"
          >
            <FileText className="size-4 text-red-600" aria-hidden="true" />
            <span>PDF (.pdf)</span>
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1100px] border-collapse text-left text-sm">
          <thead className="bg-muted text-xs text-muted-foreground">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => {
                  const sorted = h.column.getIsSorted();
                  return (
                    <th
                      key={h.id}
                      scope="col"
                      aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : "none"}
                      className="whitespace-nowrap px-3 py-2 font-medium"
                    >
                      <button
                        type="button"
                        onClick={h.column.getToggleSortingHandler()}
                        className="inline-flex items-center gap-1 rounded-md hover:text-foreground"
                      >
                        {flexRender(h.column.columnDef.header, h.getContext())}
                        {sorted === "asc" ? (
                          <ArrowUp className="size-3.5" aria-hidden="true" />
                        ) : sorted === "desc" ? (
                          <ArrowDown className="size-3.5" aria-hidden="true" />
                        ) : (
                          <ArrowUpDown className="size-3.5 opacity-50" aria-hidden="true" />
                        )}
                      </button>
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="border-t border-border hover:bg-muted/50">
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    className={cn(
                      "px-3 py-2.5 align-middle",
                      cell.column.id === "zones" ? "min-w-48" : "whitespace-nowrap",
                    )}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border p-3 text-sm">
        <p className="text-muted-foreground">
          {start} à {end} sur {total}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            aria-label="Page précédente"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
            Précédent
          </Button>
          <span className="tabular-nums text-muted-foreground">
            Page {table.getPageCount() === 0 ? 0 : pageIndex + 1} / {table.getPageCount()}
          </span>
          <Button
            variant="outline"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            aria-label="Page suivante"
          >
            Suivant
            <ChevronRight className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
    </Card>
  );
}

export function AttendanceTableSkeleton() {
  return (
    <Card aria-hidden="true">
      <div className="border-b border-border p-3">
        <Skeleton className="h-9 w-40" />
      </div>
      <div className="space-y-3 p-3">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    </Card>
  );
}
