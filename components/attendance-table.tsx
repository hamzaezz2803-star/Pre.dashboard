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
  Clock,
  FileSpreadsheet,
  FileText,
  History,
  LogIn,
  LogOut,
  MapPin,
  RefreshCw,
  X,
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

const TON_STYLES: Record<StatutTon, { text: string; dot: string; bg: string; legend: string }> = {
  present: {
    text: "text-emerald-700 dark:text-emerald-400",
    dot: "bg-emerald-600 dark:bg-emerald-500",
    bg: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
    legend: "Présent",
  },
  anomalie: {
    text: "text-amber-700 dark:text-amber-400",
    dot: "bg-amber-500",
    bg: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
    legend: "Anomalie (retard, entrée ou sortie manquante)",
  },
  absent: {
    text: "text-red-700 dark:text-red-400",
    dot: "bg-red-600 dark:bg-red-500",
    bg: "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/20",
    legend: "Absent",
  },
  "sans-horaire": {
    text: "text-slate-500 dark:text-slate-400",
    dot: "bg-slate-400 dark:bg-slate-500",
    bg: "bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/20",
    legend: "Pas d'horaire",
  },
};

const COLUMN_CLASSES: Record<string, { th: string; td: string }> = {
  empCode: {
    th: "w-[4%] min-w-[36px] text-left",
    td: "w-[4%] min-w-[36px] text-left",
  },
  lastName: {
    th: "w-[12%] min-w-[85px] text-left",
    td: "w-[12%] min-w-[85px] text-left",
  },
  firstName: {
    th: "w-[11%] min-w-[80px] text-left",
    td: "w-[11%] min-w-[80px] text-left",
  },
  deptName: {
    th: "w-[12%] min-w-[85px] text-left",
    td: "w-[12%] min-w-[85px] text-left",
  },
  jour: {
    th: "w-[8%] min-w-[75px] text-left",
    td: "w-[8%] min-w-[75px] text-left",
  },
  premierPointage: {
    th: "w-[7%] min-w-[55px] text-center",
    td: "w-[7%] min-w-[55px] text-center",
  },
  dernierPointage: {
    th: "w-[7%] min-w-[55px] text-center",
    td: "w-[7%] min-w-[55px] text-center",
  },
  nbPointages: {
    th: "w-[5%] min-w-[40px] text-center",
    td: "w-[5%] min-w-[40px] text-center",
  },
  tempsPresenceMin: {
    th: "w-[8%] min-w-[65px] text-center",
    td: "w-[8%] min-w-[65px] text-center",
  },
  statutPresence: {
    th: "w-[22%] min-w-[130px] text-left",
    td: "w-[22%] min-w-[130px] text-left",
  },
  actions: {
    th: "w-[4%] min-w-[36px] text-center",
    td: "w-[4%] min-w-[36px] text-center",
  },
};

interface PunchTimelineItem {
  id: string;
  heure: string;
  attDatetime: string;
  type: string;
  label: string;
  color: string;
  lieu: string;
  appareil: string;
}

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
  const [selectedTimelineRow, setSelectedTimelineRow] = useState<PresenceRow | null>(null);
  const [timelineEvents, setTimelineEvents] = useState<PunchTimelineItem[]>([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);

  const data = useMemo(() => rows, [rows]);

  async function handleOpenTimeline(row: PresenceRow) {
    setSelectedTimelineRow(row);
    setLoadingTimeline(true);
    setTimelineEvents([]);
    try {
      const res = await fetch(
        `/api/presence/timeline?pin=${encodeURIComponent(row.empCode)}&date=${encodeURIComponent(row.jour)}`
      );
      if (res.ok) {
        const d = await res.json();
        setTimelineEvents(d.timeline || []);
      }
    } catch {
      setTimelineEvents([]);
    } finally {
      setLoadingTimeline(false);
    }
  }

  const columns = useMemo<ColumnDef<PresenceRow>[]>(
    () => [
      {
        accessorKey: "empCode",
        header: "ID",
        cell: (c) => (
          <span className="font-mono text-xs text-muted-foreground block truncate" title={c.getValue<string>()}>
            {c.getValue<string>()}
          </span>
        ),
      },
      {
        accessorKey: "lastName",
        header: "Nom",
        cell: (c) => (
          <span className="font-semibold text-foreground text-xs block truncate" title={c.getValue<string>()}>
            {c.getValue<string>()}
          </span>
        ),
      },
      {
        accessorKey: "firstName",
        header: "Prénom",
        cell: (c) => (
          <span className="text-xs text-foreground block truncate" title={c.getValue<string>()}>
            {c.getValue<string>()}
          </span>
        ),
      },
      {
        accessorKey: "deptName",
        header: "Prestation",
        cell: (c) => {
          const val = c.getValue<string>() || "-";
          return (
            <span
              className="block truncate text-xs text-muted-foreground"
              title={val}
            >
              {val}
            </span>
          );
        },
      },
      {
        accessorKey: "jour",
        header: "Date",
        cell: (c) => <span className="tabular-nums text-xs whitespace-nowrap block">{formatDateFr(c.getValue<string>())}</span>,
      },
      {
        accessorKey: "premierPointage",
        header: "1er ptg",
        sortUndefined: "last",
        cell: (c) => {
          const v = c.getValue<string | null>();
          return v ? <span className="tabular-nums text-xs font-mono block text-center">{v}</span> : <div className="text-center">{dash}</div>;
        },
      },
      {
        accessorKey: "dernierPointage",
        header: "Dernier ptg",
        sortUndefined: "last",
        cell: (c) => {
          const v = c.getValue<string | null>();
          return v ? <span className="tabular-nums text-xs font-mono block text-center">{v}</span> : <div className="text-center">{dash}</div>;
        },
      },
      {
        accessorKey: "nbPointages",
        header: "Ptgs",
        cell: (c) => <span className="tabular-nums text-xs text-center block font-medium">{c.getValue<number>()}</span>,
      },
      {
        accessorKey: "tempsPresenceMin",
        header: "Présence",
        cell: (c) => {
          const v = formatDurationLong(c.getValue<number>());
          return v === "-" ? <div className="text-center">{dash}</div> : <span className="tabular-nums text-xs font-medium whitespace-nowrap text-center block">{v}</span>;
        },
      },
      {
        accessorKey: "statutPresence",
        header: "Statut",
        cell: (c) => {
          const statut = c.getValue<string | null>();
          const horaire = c.row.original.horaire;
          const label = formatStatut(statut, c.row.original.nbPointages);
          if (label === "-" && !horaire) return dash;
          const style = TON_STYLES[getStatutTon(statut)];
          const tags = label !== "-" ? label.split(" · ") : [];

          return (
            <div className="flex flex-wrap items-center gap-1">
              {tags.map((tag, idx) => {
                const isEnCours = tag === "En cours — sortie attendue";
                const isTermine = tag === "Terminé";
                return (
                  <span
                    key={idx}
                    className={cn(
                      "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] sm:text-[11px] font-medium leading-tight border max-w-full truncate",
                      isEnCours
                        ? "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20"
                        : style.bg
                    )}
                    title={label}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "size-1.5 shrink-0 rounded-full",
                        isEnCours
                          ? "bg-blue-600 dark:bg-blue-400 animate-pulse"
                          : isTermine
                          ? "bg-emerald-600 dark:bg-emerald-400"
                          : style.dot
                      )}
                    />
                    <span className="truncate">{tag}</span>
                  </span>
                );
              })}
              {horaire && horaire !== "Horaire non défini" && (
                <span
                  className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] sm:text-[11px] font-medium leading-tight border border-primary/20 bg-primary/10 text-primary"
                  title={`Horaire affecté : ${horaire}`}
                >
                  <Clock className="size-2.5 text-primary" />
                  <span className="truncate">{horaire}</span>
                </span>
              )}
            </div>
          );
        },
      },
      {
        id: "actions",
        header: "Détails",
        cell: ({ row }) => (
          <div className="flex items-center justify-center">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleOpenTimeline(row.original);
              }}
              className="p-1 rounded-md hover:bg-muted text-primary cursor-pointer transition-colors"
              title="Voir la timeline (A entré / A sorti et détails)"
            >
              <History className="size-3.5 sm:size-4" />
            </button>
          </div>
        ),
      },
    ],
    []
  );

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
    <>
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

        <div className="overflow-x-auto w-full">
          <table className="w-full border-collapse text-left text-xs table-fixed">
            <thead className="bg-muted text-xs text-muted-foreground">
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((h) => {
                    const sorted = h.column.getIsSorted();
                    const colStyle = COLUMN_CLASSES[h.id] || { th: "", td: "" };
                    return (
                      <th
                        key={h.id}
                        scope="col"
                        aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : "none"}
                        className={cn("px-2 py-2 font-medium text-xs whitespace-nowrap", colStyle.th)}
                      >
                        <button
                          type="button"
                          onClick={h.column.getToggleSortingHandler()}
                          className="inline-flex items-center gap-1 rounded-md hover:text-foreground cursor-pointer"
                        >
                          <span>{flexRender(h.column.columnDef.header, h.getContext())}</span>
                          {sorted === "asc" ? (
                            <ArrowUp className="size-3 shrink-0" aria-hidden="true" />
                          ) : sorted === "desc" ? (
                            <ArrowDown className="size-3 shrink-0" aria-hidden="true" />
                          ) : (
                            <ArrowUpDown className="size-3 shrink-0 opacity-40" aria-hidden="true" />
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
                <tr
                  key={row.id}
                  onClick={() => handleOpenTimeline(row.original)}
                  className="border-t border-border hover:bg-muted/50 cursor-pointer transition-colors"
                >
                  {row.getVisibleCells().map((cell) => {
                    const colStyle = COLUMN_CLASSES[cell.column.id] || { th: "", td: "" };
                    return (
                      <td key={cell.id} className={cn("px-2 py-2 align-middle text-xs", colStyle.td)}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    );
                  })}
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

      {/* MODALE DE TIMELINE DES POINTAGES DE L'EMPLOYÉ */}
      {selectedTimelineRow && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in"
        >
          <Card className="w-full max-w-lg p-0 shadow-xl overflow-hidden animate-in zoom-in-95">
            <div className="p-4 border-b border-border flex items-center justify-between bg-muted/30">
              <div className="flex items-center gap-2.5">
                <div className="size-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold text-xs">
                  <History className="size-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold tracking-tight text-foreground">
                    Timeline des Pointages
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {selectedTimelineRow.lastName} {selectedTimelineRow.firstName} · {formatDateFr(selectedTimelineRow.jour)}
                    {selectedTimelineRow.horaire && selectedTimelineRow.horaire !== "Horaire non défini" && (
                      <span className="ml-1.5 font-medium text-primary">
                        · {selectedTimelineRow.horaire}
                      </span>
                    )}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedTimelineRow(null)}
                className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Récapitulatif Entrée / Sortie / Présence */}
            <div className="p-4 bg-muted/10 border-b border-border grid grid-cols-3 gap-2 text-center text-xs">
              <div className="p-2 rounded-lg bg-surface border border-border/60">
                <span className="text-[11px] text-emerald-700 dark:text-emerald-400 font-semibold flex items-center justify-center gap-1">
                  <LogIn className="size-3" /> A entré
                </span>
                <p className="mt-1 font-bold text-sm tabular-nums text-foreground">
                  {selectedTimelineRow.premierPointage || "-"}
                </p>
              </div>

              <div className="p-2 rounded-lg bg-surface border border-border/60">
                <span className="text-[11px] text-red-700 dark:text-red-400 font-semibold flex items-center justify-center gap-1">
                  <LogOut className="size-3" /> A sorti
                </span>
                <p className="mt-1 font-bold text-sm tabular-nums text-foreground">
                  {selectedTimelineRow.dernierPointage || "-"}
                </p>
              </div>

              <div className="p-2 rounded-lg bg-surface border border-border/60">
                <span className="text-[11px] text-muted-foreground font-semibold flex items-center justify-center gap-1">
                  <Clock className="size-3" /> Présence
                </span>
                <p className="mt-1 font-bold text-sm tabular-nums text-foreground">
                  {formatDurationLong(selectedTimelineRow.tempsPresenceMin, "0h 00m")}
                </p>
              </div>
            </div>

            {/* Liste chronologique détaillée des événements */}
            <div className="p-4 max-h-72 overflow-y-auto space-y-3">
              <p className="text-xs font-semibold text-muted-foreground">
                Chronologie exacte des passages enregistrés :
              </p>

              {loadingTimeline ? (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  Chargement des pointages...
                </div>
              ) : timelineEvents.length > 0 ? (
                <div className="relative pl-5 space-y-3 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-border">
                  {timelineEvents.map((evt, idx) => (
                    <div key={evt.id || idx} className="relative flex items-start gap-2 text-xs">
                      <span
                        className={cn(
                          "absolute -left-5 mt-1 size-2.5 rounded-full ring-4 ring-surface",
                          evt.type === "entree" || evt.type === "pause_in"
                            ? "bg-emerald-500"
                            : "bg-red-500"
                        )}
                      />
                      <div className="flex-1 bg-surface p-2.5 rounded-lg border border-border/60 shadow-2xs">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-foreground flex items-center gap-1.5">
                            {evt.type === "entree" ? (
                              <LogIn className="size-3.5 text-emerald-600" />
                            ) : (
                              <LogOut className="size-3.5 text-red-600" />
                            )}
                            {evt.label}
                          </span>
                          <span className="font-mono font-bold text-xs tabular-nums text-foreground">
                            {evt.heure}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <MapPin className="size-3" />
                          <span>{evt.lieu}</span>
                          <span>·</span>
                          <span>{evt.appareil}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-3 rounded-lg bg-surface border border-dashed border-border text-center text-xs text-muted-foreground">
                  Aucun pointage physique détaillé trouvé dans la base pour ce jour.
                </div>
              )}
            </div>

            <div className="p-3 border-t border-border bg-muted/20 flex justify-end">
              <Button variant="outline" onClick={() => setSelectedTimelineRow(null)} className="h-8 text-xs">
                Fermer
              </Button>
            </div>
          </Card>
        </div>
      )}
    </>
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
