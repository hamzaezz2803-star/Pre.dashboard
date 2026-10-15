"use client";

import { AlertCircle, RotateCcw, SearchX } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AttendanceTable, AttendanceTableSkeleton } from "@/components/attendance-table";
import { EmployeeSearch } from "@/components/employee-search";
import { SummaryCards, SummaryCardsSkeleton } from "@/components/summary-cards";
import { Button } from "@/components/ui/button";
import { Card, fieldClass } from "@/components/ui/card";
import { getAttendance, getDepartments } from "@/lib/attendance-service";
import { currentMonthRange, isValidISODate } from "@/lib/dates";
import type { AttendanceRow } from "@/lib/types";

type DataState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "success"; rows: AttendanceRow[] };

export function Dashboard() {
  // useSearchParams en premier : la valeur par défaut des dates dépend de l'heure courante.
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
  const simulateError = params.get("simulate") === "error";
  const rangeError = from > to;

  const [departments, setDepartments] = useState<string[]>([]);
  const [state, setState] = useState<DataState>({ status: "loading" });
  const [retryKey, setRetryKey] = useState(0);

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
    getDepartments().then((d) => {
      if (!cancelled) setDepartments(d);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (rangeError) return;
    let cancelled = false;
    setState({ status: "loading" });
    getAttendance({ from, to, department, query, simulateError })
      .then((rows) => {
        if (!cancelled) setState({ status: "success", rows });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [from, to, department, query, simulateError, rangeError, retryKey]);

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Pointages du personnel</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Consultez les présences, zones et absences par département et par période.
        </p>
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
            <input
              id="filter-from"
              type="date"
              className={fieldClass}
              value={from}
              max={to}
              aria-invalid={rangeError}
              aria-describedby={rangeError ? "range-error" : undefined}
              onChange={(e) => updateParams({ from: e.target.value || null })}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="filter-to" className="text-sm font-medium">
              Date de fin
            </label>
            <input
              id="filter-to"
              type="date"
              className={fieldClass}
              value={to}
              aria-invalid={rangeError}
              aria-describedby={rangeError ? "range-error" : undefined}
              onChange={(e) => updateParams({ to: e.target.value || null })}
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
        <Card role="alert" className="flex flex-col items-center gap-3 p-8 text-center">
          <AlertCircle className="size-8 text-danger" aria-hidden="true" />
          <div>
            <p className="font-medium">Impossible de charger les pointages</p>
            <p className="text-sm text-muted-foreground">Une erreur est survenue. Vérifiez votre connexion puis réessayez.</p>
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
          <AttendanceTable rows={state.rows} from={from} to={to} />
        </>
      )}
    </main>
  );
}
