import { CalendarX, Clock, Users } from "lucide-react";
import { Card, Skeleton } from "@/components/ui/card";
import { formatDuration } from "@/lib/dates";
import type { AttendanceRow } from "@/lib/types";

export function SummaryCards({ rows }: { rows: AttendanceRow[] }) {
  const withPunch = rows.filter((r) => r.punchCount > 0);
  const withoutPunch = rows.length - withPunch.length;
  const totalMinutes = rows.reduce((s, r) => s + r.presenceMinutes, 0);
  const average = withPunch.length ? totalMinutes / withPunch.length : 0;
  const totalAbsences = rows.reduce((s, r) => s + r.absenceCount, 0);
  const absentEmployees = rows.filter((r) => r.absenceCount > 0).length;

  const items = [
    {
      label: "Personnel avec pointage",
      value: `${withPunch.length} / ${rows.length}`,
      hint:
        withoutPunch > 0
          ? `${withoutPunch} sans aucun pointage sur la période`
          : "Tout le personnel affiché a pointé",
      Icon: Users,
    },
    {
      label: "Temps de présence total",
      value: formatDuration(totalMinutes),
      hint: `Moyenne par personne pointée : ${formatDuration(average)}`,
      Icon: Clock,
    },
    {
      label: "Absences (jours ouvrés)",
      value: String(totalAbsences),
      hint: `${absentEmployees} ${absentEmployees > 1 ? "personnes concernées" : "personne concernée"}`,
      Icon: CalendarX,
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
