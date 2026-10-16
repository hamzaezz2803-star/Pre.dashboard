"use client";

import { AlertCircle, RotateCcw, SearchX } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AttendanceTable, AttendanceTableSkeleton } from "@/components/attendance-table";
import { EmployeeSearch } from "@/components/employee-search";
import { SummaryCards, SummaryCardsSkeleton } from "@/components/summary-cards";
import { Button } from "@/components/ui/button";
import { Card, fieldClass } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { getDepartments } from "@/lib/attendance-service";
import { currentMonthRange, isValidISODate } from "@/lib/dates";
import type { AttendanceRow } from "@/lib/types";

type DataState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; rows: AttendanceRow[]; syncedAt: string | null };

interface ApiPointageRow {
  id: string | number;
  nom: string | null;
  prenom: string | null;
  prestation: string | null;
  departement: string | null;
  pointage_min: string | null;
  pointage_max: string | null;
  nb_pointages: number | null;
  zones: string | null;
  temps_presence_min: number | null;
  absence_min: number | null;
}

interface ApiResponse {
  syncedAt: string | null;
  rows: ApiPointageRow[];
  error?: string;
}

/** Formate la date de synchronisation en "JJ/MM/AAAA HH:mm" */
function formatSyncedAt(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return String(dateStr);
  const pad = (n: number) => String(n).padStart(2, "0");
  const day = pad(d.getDate());
  const month = pad(d.getMonth() + 1);
  const year = d.getFullYear();
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

export function Dashboard() {
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
  const rangeError = from > to;

  const [departments, setDepartments] = useState<string[]>([]);
  const [state, setState] = useState<DataState>({ status: "loading" });
  const [retryKey, setRetryKey] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setRefreshError(null);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const data = await res.json().catch(() => ({}));

      if (!res.ok && res.status !== 202) {
        throw new Error(data.error || "Échec de synchronisation");
      }

      const lastRun = data.syncState?.lastRun;
      if (lastRun) {
        setState((prev) => (prev.status === "success" ? { ...prev, syncedAt: lastRun } : prev));
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
    fetch('/api/departements')
      .then((res) => res.json())
      .then((depts) => {
        if (!cancelled && Array.isArray(depts) && depts.length > 0) {
          setDepartments(depts);
        } else {
          getDepartments().then((d) => {
            if (!cancelled) setDepartments(d);
          });
        }
      })
      .catch(() => {
        getDepartments().then((d) => {
          if (!cancelled) setDepartments(d);
        });
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
      if (!cancelled) {
        setState({ status: "loading" });
      }
    });

    async function fetchPointages() {
      try {
        const queryParams = new URLSearchParams();
        if (from) queryParams.set("debut", from);
        if (to) queryParams.set("fin", to);
        if (department && department !== "all") queryParams.set("departement", department);
        if (query && query.trim() !== "") queryParams.set("personnel", query.trim());

        const res = await fetch(`/api/pointages?${queryParams.toString()}`, {
          signal: controller.signal,
        });

        const data: ApiResponse = await res.json().catch(() => ({ syncedAt: null, rows: [] }));

        if (!res.ok) {
          throw new Error(
            data.error ||
              `Erreur lors de la récupération des données (code HTTP ${res.status}).`
          );
        }

        if (cancelled) return;

        const mappedRows: AttendanceRow[] = (data.rows || []).map((r) => {
          const zonesArray = r.zones
            ? r.zones
                .split(",")
                .map((z) => z.trim())
                .filter(Boolean)
            : [];

          const absenceMinutes = Number(r.absence_min || 0);
          const absenceCount = absenceMinutes > 0 ? Math.max(1, Math.round(absenceMinutes / 480)) : 0;

          return {
            id: String(r.id),
            nom: r.nom || "",
            prenom: r.prenom || "",
            prestation: r.prestation || "",
            firstPunch: r.pointage_min,
            lastPunch: r.pointage_max,
            punchCount: Number(r.nb_pointages || 0),
            zones: zonesArray,
            presenceMinutes: Number(r.temps_presence_min || 0),
            absenceCount,
            absenceDates: [],
          };
        });

        setState({
          status: "success",
          rows: mappedRows,
          syncedAt: data.syncedAt,
        });
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

    fetchPointages();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [from, to, department, query, rangeError, retryKey]);

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Pointages du personnel</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Consultez les présences, zones et absences par département et par période.
          </p>
        </div>
        {state.status === "success" && state.syncedAt && (
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-xs">
            <span className="size-2 rounded-full bg-emerald-500 animate-pulse" aria-hidden="true" />
            <span>Données à jour au {formatSyncedAt(state.syncedAt)}</span>
          </div>
        )}
      </div>

      <Card className="p-4">
        <form
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
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
            <p className="mt-1 text-sm text-muted-foreground max-w-md">
              {state.message}
            </p>
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
            <p className="text-sm text-muted-foreground">Aucun personnel ne correspond à ces filtres.</p>
          </div>
          <Button variant="outline" onClick={() => updateParams({ dept: null, q: null, from: null, to: null })}>
            Réinitialiser les filtres
          </Button>
        </Card>
      ) : (
        <>
          <SummaryCards rows={state.rows} />
          <AttendanceTable
            rows={state.rows}
            from={from}
            to={to}
            onRefresh={handleRefresh}
            isRefreshing={isRefreshing}
            refreshError={refreshError}
          />
        </>
      )}
    </main>
  );
}
