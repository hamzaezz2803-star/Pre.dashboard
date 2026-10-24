"use client";

import { AlertCircle, BarChart3, RotateCcw, SearchX, TableProperties } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AttendanceStats } from "@/components/attendance-stats";
import { AttendanceTable, AttendanceTableSkeleton } from "@/components/attendance-table";
import { EmployeeSearch } from "@/components/employee-search";
import { SummaryCards, SummaryCardsSkeleton } from "@/components/summary-cards";
import { Button } from "@/components/ui/button";
import { Card, fieldClass } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { currentMonthRange, isValidISODate } from "@/lib/dates";
import { formatStatut, getStatutTon, type StatutTon } from "@/lib/status";
import type { PresenceRow } from "@/lib/types";
import { cn } from "@/lib/utils";

const STATUT_OPTIONS: { value: StatutTon; label: string }[] = [
  { value: "present", label: "Présent" },
  { value: "anomalie", label: "Anomalie" },
  { value: "absent", label: "Absent" },
  { value: "sans-horaire", label: "Pas d'horaire" },
];

type DataState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; rows: PresenceRow[] };

/** Ligne telle que renvoyée par /api/presence (colonnes de v_presence_jour). */
interface ApiPresenceRow {
  emp_code: string | number;
  last_name: string | null;
  first_name: string | null;
  dept_name: string | null;
  jour: string;
  premier_pointage: string | null;
  dernier_pointage: string | null;
  nb_pointages: number | null;
  temps_presence_min: number | null;
  statut_presence: string | null;
}

interface ApiResponse {
  rows: ApiPresenceRow[];
  error?: string;
}

export function Dashboard({ userRole = "admin" }: { userRole?: string }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const defaults = currentMonthRange();
  const rawFrom = params.get("from");
  const rawTo = params.get("to");
  const from = isValidISODate(rawFrom) ? rawFrom : defaults.from;
  const to = isValidISODate(rawTo) ? rawTo : defaults.to;
  const department = params.get("dept") ?? "all";
  const query = params.get("q") ?? "";
  const rawStatut = params.get("statut");
  const statutFilter: StatutTon | "all" = STATUT_OPTIONS.some((o) => o.value === rawStatut)
    ? (rawStatut as StatutTon)
    : "all";
  const rangeError = from > to;

  const [departments, setDepartments] = useState<string[]>([]);
  const [state, setState] = useState<DataState>({ status: "loading" });
  const [activeView, setActiveView] = useState<"table" | "stats">("table");
  const [retryKey, setRetryKey] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  /** Relance la synchronisation des données sources puis recharge le tableau. */
  const handleRefresh = async () => {
    setIsRefreshing(true);
    setRefreshError(null);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok && res.status !== 202) {
        throw new Error(data.error || "Échec de synchronisation");
      }
      setRetryKey((k) => k + 1);
    } catch {
      setRefreshError("Échec de l'actualisation des données. Veuillez réessayer.");
    } finally {
      setIsRefreshing(false);
    }
  };

  const updateParams = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === "") next.delete(key);
        else next.set(key, value);
      }
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  useEffect(() => {
    let cancelled = false;
    fetch("/api/presence/departements")
      .then((res) => res.json())
      .then((depts: unknown) => {
        if (!cancelled && Array.isArray(depts)) setDepartments(depts as string[]);
      })
      .catch(() => {
        if (!cancelled) setDepartments([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (rangeError) return;
    let cancelled = false;
    const controller = new AbortController();

    queueMicrotask(() => {
      if (!cancelled) setState({ status: "loading" });
    });

    async function fetchPresence() {
      try {
        const queryParams = new URLSearchParams();
        queryParams.set("debut", from);
        queryParams.set("fin", to);
        if (department && department !== "all") queryParams.set("departement", department);
        if (query.trim() !== "") queryParams.set("personnel", query.trim());

        const res = await fetch(`/api/presence?${queryParams.toString()}`, {
          signal: controller.signal,
        });
        const data: ApiResponse = await res.json().catch(() => ({ rows: [] }));

        if (!res.ok) {
          throw new Error(
            data.error || `Erreur lors de la récupération des données (code HTTP ${res.status}).`,
          );
        }
        if (cancelled) return;

        const rows: PresenceRow[] = (data.rows || []).map((r) => ({
          empCode: String(r.emp_code),
          lastName: r.last_name || "",
          firstName: r.first_name || "",
          deptName: r.dept_name || "",
          jour: r.jour,
          premierPointage: r.premier_pointage || null,
          dernierPointage: r.dernier_pointage || null,
          nbPointages: Number(r.nb_pointages || 0),
          tempsPresenceMin: Number(r.temps_presence_min || 0),
          statutPresence: r.statut_presence || "",
        }));
        setState({ status: "success", rows });
      } catch (err: unknown) {
        if (cancelled) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        setState({
          status: "error",
          message:
            err instanceof Error
              ? err.message
              : "Impossible de joindre le serveur. Veuillez vérifier votre connexion.",
        });
      }
    }

    fetchPresence();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [from, to, department, query, rangeError, retryKey]);

  /** Filtre par catégorie de statut, côté client (la vue et les requêtes restent inchangées). */
  const filteredRows = (rows: PresenceRow[]) =>
    statutFilter === "all"
      ? rows
      : rows.filter(
          (r) =>
            formatStatut(r.statutPresence, r.nbPointages) !== "-" && getStatutTon(r.statutPresence) === statutFilter,
        );

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Pointages du personnel</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Consultez la présence de chaque employé, jour par jour, par département et par période.
        </p>
      </div>

      <Card className="p-4">
        <form
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5"
          onSubmit={(e) => e.preventDefault()}
          aria-label="Filtres"
        >
          <div className="space-y-1.5">
            <label htmlFor="filter-department" className="text-sm font-medium">
              Département
            </label>
            <select
              id="filter-department"
              className={fieldClass}
              value={department}
              onChange={(e) => updateParams({ dept: e.target.value === "all" ? null : e.target.value })}
            >
              <option value="all">Tous</option>
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="filter-statut" className="text-sm font-medium">
              Statut
            </label>
            <select
              id="filter-statut"
              className={fieldClass}
              value={statutFilter}
              onChange={(e) => updateParams({ statut: e.target.value === "all" ? null : e.target.value })}
            >
              <option value="all">Tous</option>
              {STATUT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="filter-search" className="text-sm font-medium">
              Personnel
            </label>
            <EmployeeSearch value={query} onCommit={(v) => updateParams({ q: v || null })} />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="filter-from" className="text-sm font-medium">
              Date de début
            </label>
            <DatePicker
              id="filter-from"
              value={from}
              max={to}
              aria-invalid={rangeError}
              aria-describedby={rangeError ? "range-error" : undefined}
              onChange={(val) => updateParams({ from: val || null })}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="filter-to" className="text-sm font-medium">
              Date de fin
            </label>
            <DatePicker
              id="filter-to"
              value={to}
              min={from}
              aria-invalid={rangeError}
              aria-describedby={rangeError ? "range-error" : undefined}
              onChange={(val) => updateParams({ to: val || null })}
            />
          </div>
        </form>
        {rangeError && (
          <p id="range-error" role="alert" className="mt-3 flex items-center gap-2 text-sm text-danger">
            <AlertCircle className="size-4" aria-hidden="true" />
            La date de fin doit être postérieure ou égale à la date de début.
          </p>
        )}
      </Card>

      {rangeError ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Corrigez la période pour afficher les pointages.
        </Card>
      ) : state.status === "loading" ? (
        <div role="status" aria-label="Chargement des pointages" className="space-y-6">
          <SummaryCardsSkeleton />
          <AttendanceTableSkeleton />
        </div>
      ) : state.status === "error" ? (
        <Card role="alert" className="flex flex-col items-center gap-3 p-8 text-center border-danger/30 bg-danger/5">
          <AlertCircle className="size-8 text-danger" aria-hidden="true" />
          <div>
            <p className="font-semibold text-danger">Impossible de charger les pointages</p>
            <p className="mt-1 text-sm text-muted-foreground max-w-md">{state.message}</p>
          </div>
          <Button onClick={() => setRetryKey((k) => k + 1)}>
            <RotateCcw className="size-4" aria-hidden="true" />
            Réessayer
          </Button>
        </Card>
      ) : state.rows.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 p-8 text-center">
          <SearchX className="size-8 text-muted-foreground" aria-hidden="true" />
          <div>
            <p className="font-medium">Aucun résultat</p>
            <p className="text-sm text-muted-foreground">Aucune donnée ne correspond à ces filtres.</p>
          </div>
          <Button variant="outline" onClick={() => updateParams({ dept: null, q: null, from: null, to: null, statut: null })}>
            Réinitialiser les filtres
          </Button>
        </Card>
      ) : (
        <>
          <SummaryCards rows={state.rows} />

          <div className="flex items-center justify-between pt-2">
            <div className="inline-flex rounded-lg bg-muted p-1 border border-border/60">
              <button
                type="button"
                onClick={() => setActiveView("table")}
                className={cn(
                  "inline-flex items-center gap-2 rounded-md px-3.5 py-1.5 text-sm font-medium transition-all cursor-pointer",
                  activeView === "table"
                    ? "bg-surface text-foreground shadow-xs font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <TableProperties className="size-4" />
                Tableau ({filteredRows(state.rows).length})
              </button>
              <button
                type="button"
                onClick={() => setActiveView("stats")}
                className={cn(
                  "inline-flex items-center gap-2 rounded-md px-3.5 py-1.5 text-sm font-medium transition-all cursor-pointer",
                  activeView === "stats"
                    ? "bg-surface text-primary shadow-xs font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <BarChart3 className="size-4" />
                Statistiques & Graphiques
              </button>
            </div>
          </div>

          {activeView === "table" ? (
            <AttendanceTable
              rows={filteredRows(state.rows)}
              from={from}
              to={to}
              onRefresh={userRole === "super_admin" ? handleRefresh : undefined}
              isRefreshing={isRefreshing}
              refreshError={refreshError}
            />
          ) : (
            <AttendanceStats
              rows={filteredRows(state.rows)}
              from={from}
              to={to}
            />
          )}
        </>
      )}
    </main>
  );
}
