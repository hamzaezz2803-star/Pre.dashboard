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
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  FileText,
  RefreshCw,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, Skeleton } from "@/components/ui/card";
import { exportAttendanceToExcel } from "@/lib/export-excel";
import { exportAttendanceToPdf } from "@/lib/export-pdf";
import { formatDateFr, formatDurationLong } from "@/lib/dates";
import { formatStatut, getStatutTon, type StatutTon } from "@/lib/status";
import type { PresenceRow } from "@/lib/types";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 25;

const dash = <span className="text-muted-foreground">-</span>;

const TON_STYLES: Record<StatutTon, { text: string; dot: string; legend: string }> = {
  present: { text: "text-emerald-700 dark:text-emerald-400", dot: "bg-emerald-600 dark:bg-emerald-500", legend: "Présent" },
  anomalie: {
    text: "text-amber-700 dark:text-amber-400",
    dot: "bg-amber-500",
    legend: "Anomalie (retard, entrée ou sortie manquante)",
  },
  absent: { text: "text-red-700 dark:text-red-400", dot: "bg-red-600 dark:bg-red-500", legend: "Absent" },
  "sans-horaire": { text: "text-slate-500 dark:text-slate-400", dot: "bg-slate-400 dark:bg-slate-500", legend: "Pas d'horaire" },
};

const columns: ColumnDef<PresenceRow>[] = [
  {
    accessorKey: "empCode",
    header: "ID",
    cell: (c) => <span className="font-mono text-xs">{c.getValue<string>()}</span>,
  },
  { accessorKey: "lastName", header: "Nom" },
  { accessorKey: "firstName", header: "Prénom" },
  { accessorKey: "deptName", header: "Prestation" },
  {
    accessorKey: "jour",
    header: "Date",
    cell: (c) => <span className="tabular-nums">{formatDateFr(c.getValue<string>())}</span>,
  },
  {
    accessorKey: "premierPointage",
    header: "1er pointage",
    sortUndefined: "last",
    cell: (c) => {
      const v = c.getValue<string | null>();
      return v ? <span className="tabular-nums">{v}</span> : dash;
    },
  },
  {
    accessorKey: "dernierPointage",
    header: "Dernier pointage",
    sortUndefined: "last",
    cell: (c) => {
      const v = c.getValue<string | null>();
      return v ? <span className="tabular-nums">{v}</span> : dash;
    },
  },
  {
    accessorKey: "nbPointages",
    header: "Nombre de pointages",
    cell: (c) => <span className="tabular-nums">{c.getValue<number>()}</span>,
  },
  {
    accessorKey: "tempsPresenceMin",
    header: "Temps de présence",
    cell: (c) => {
      const v = formatDurationLong(c.getValue<number>());
      return v === "-" ? dash : <span className="tabular-nums">{v}</span>;
    },
  },
  {
    accessorKey: "statutPresence",
    header: "Statut",
    cell: (c) => {
      const statut = c.getValue<string | null>();
      const label = formatStatut(statut, c.row.original.nbPointages);
      if (label === "-") return dash;
      const style = TON_STYLES[getStatutTon(statut)];
      return (
        <span className={cn("inline-flex items-center gap-2", style.text)}>
          <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", style.dot)} />
          {label}
        </span>
      );
    },
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
  rows: PresenceRow[];
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
              <span>{isRefreshing ? "Mise à jour..." : "Actualiser"}</span>
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
                  <td key={cell.id} className="whitespace-nowrap px-3 py-2.5 align-middle">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul
        aria-label="Légende des statuts"
        className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border px-3 py-2 text-xs"
      >
        {(Object.keys(TON_STYLES) as StatutTon[]).map((ton) => (
          <li key={ton} className={cn("inline-flex items-center gap-1.5", TON_STYLES[ton].text)}>
            <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", TON_STYLES[ton].dot)} />
            {TON_STYLES[ton].legend}
          </li>
        ))}
      </ul>

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
