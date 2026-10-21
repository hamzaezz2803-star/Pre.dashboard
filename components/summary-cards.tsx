import { Calendar, Clock, Users } from "lucide-react";
import { Card, Skeleton } from "@/components/ui/card";
import { formatDurationLong } from "@/lib/dates";
import type { PresenceRow } from "@/lib/types";

/** Cartes de synthèse calculées uniquement depuis les lignes affichées. */
export function SummaryCards({ rows }: { rows: PresenceRow[] }) {
  const employees = new Set(rows.map((r) => r.empCode)).size;
  const days = new Set(rows.map((r) => r.jour)).size;
  const totalMinutes = rows.reduce((s, r) => s + (r.tempsPresenceMin || 0), 0);

  const items = [
    {
      label: "Nombre d'employés",
      value: String(employees),
      hint: "Employés distincts dans les données affichées",
      Icon: Users,
    },
    {
      label: "Nombre de jours",
      value: String(days),
      hint: "Jours distincts dans les données affichées",
      Icon: Calendar,
    },
    {
      label: "Temps de présence total",
      value: formatDurationLong(totalMinutes, "0h 00min"),
      hint: "Somme des temps de présence affichés",
      Icon: Clock,
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {items.map(({ label, value, hint, Icon }) => (
        <Card key={label} className="p-4">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{label}</span>
            <Icon className="size-4" aria-hidden="true" />
          </div>
          <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
        </Card>
      ))}
    </div>
  );
}

export function SummaryCardsSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-3" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <Card key={i} className="p-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="mt-3 h-8 w-24" />
          <Skeleton className="mt-2 h-3 w-44" />
        </Card>
      ))}
    </div>
  );
}
