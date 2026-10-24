"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Award,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  PieChart as PieIcon,
  TrendingUp,
  Users,
  XCircle,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { formatDurationLong } from "@/lib/dates";
import { formatStatut, getStatutTon, type StatutTon } from "@/lib/status";
import type { PresenceRow } from "@/lib/types";
import { cn } from "@/lib/utils";

interface AttendanceStatsProps {
  rows: PresenceRow[];
  from?: string;
  to?: string;
}

const STATUT_CONFIG: Record<
  StatutTon,
  { label: string; color: string; bgClass: string; textClass: string; borderClass: string }
> = {
  present: {
    label: "Présent",
    color: "#10b981",
    bgClass: "bg-emerald-500",
    textClass: "text-emerald-700 dark:text-emerald-400",
    borderClass: "border-emerald-500/20 bg-emerald-500/5",
  },
  anomalie: {
    label: "Anomalie / Retard",
    color: "#f59e0b",
    bgClass: "bg-amber-500",
    textClass: "text-amber-700 dark:text-amber-400",
    borderClass: "border-amber-500/20 bg-amber-500/5",
  },
  absent: {
    label: "Absent",
    color: "#ef4444",
    bgClass: "bg-red-500",
    textClass: "text-red-700 dark:text-red-400",
    borderClass: "border-red-500/20 bg-red-500/5",
  },
  "sans-horaire": {
    label: "Pas d'horaire",
    color: "#94a3b8",
    bgClass: "bg-slate-400",
    textClass: "text-slate-600 dark:text-slate-400",
    borderClass: "border-slate-400/20 bg-slate-400/5",
  },
};

export function AttendanceStats({ rows, from, to }: AttendanceStatsProps) {
  const [hoveredStatus, setHoveredStatus] = useState<StatutTon | null>(null);
  const [selectedDept, setSelectedDept] = useState<string | null>(null);

  // 1. Calculs globaux
  const stats = useMemo(() => {
    const totalRecords = rows.length;
    const uniqueEmployees = new Set(rows.map((r) => r.empCode)).size;
    const uniqueDays = new Set(rows.map((r) => r.jour)).size;
    const totalMinutes = rows.reduce((acc, r) => acc + (r.tempsPresenceMin || 0), 0);

    // Répartition par statut
    const statusCounts: Record<StatutTon, number> = {
      present: 0,
      anomalie: 0,
      absent: 0,
      "sans-horaire": 0,
    };

    rows.forEach((r) => {
      const ton = getStatutTon(r.statutPresence);
      statusCounts[ton] = (statusCounts[ton] || 0) + 1;
    });

    const presentCount = statusCounts.present;
    const anomalieCount = statusCounts.anomalie;
    const absentCount = statusCounts.absent;

    const presenceRate =
      totalRecords > 0 ? Math.round(((presentCount + anomalieCount) / totalRecords) * 100) : 0;
    const ponctualityRate =
      totalRecords > 0 ? Math.round((presentCount / totalRecords) * 100) : 0;
    const anomalyRate = totalRecords > 0 ? Math.round((anomalieCount / totalRecords) * 100) : 0;

    const avgMinutesPerRecord = totalRecords > 0 ? Math.round(totalMinutes / totalRecords) : 0;

    // Répartition par département
    const deptsMap = new Map<
      string,
      {
        total: number;
        present: number;
        anomalie: number;
        absent: number;
        sansHoraire: number;
        minutes: number;
        employees: Set<string>;
      }
    >();

    rows.forEach((r) => {
      const dept = r.deptName || "Non assigné";
      if (!deptsMap.has(dept)) {
        deptsMap.set(dept, {
          total: 0,
          present: 0,
          anomalie: 0,
          absent: 0,
          sansHoraire: 0,
          minutes: 0,
          employees: new Set(),
        });
      }
      const d = deptsMap.get(dept)!;
      d.total += 1;
      d.minutes += r.tempsPresenceMin || 0;
      d.employees.add(r.empCode);

      const ton = getStatutTon(r.statutPresence);
      if (ton === "present") d.present += 1;
      else if (ton === "anomalie") d.anomalie += 1;
      else if (ton === "absent") d.absent += 1;
      else d.sansHoraire += 1;
    });

    const deptsList = Array.from(deptsMap.entries()).map(([name, data]) => {
      const rate = data.total > 0 ? Math.round(((data.present + data.anomalie) / data.total) * 100) : 0;
      const ponctualRate = data.total > 0 ? Math.round((data.present / data.total) * 100) : 0;
      return {
        name,
        total: data.total,
        present: data.present,
        anomalie: data.anomalie,
        absent: data.absent,
        sansHoraire: data.sansHoraire,
        minutes: data.minutes,
        employeeCount: data.employees.size,
        rate,
        ponctualRate,
      };
    });

    // Trier par nombre total décroissant
    deptsList.sort((a, b) => b.total - a.total);

    // Répartition par date
    const daysMap = new Map<
      string,
      { jour: string; present: number; anomalie: number; absent: number; total: number; minutes: number }
    >();

    rows.forEach((r) => {
      const j = r.jour;
      if (!daysMap.has(j)) {
        daysMap.set(j, { jour: j, present: 0, anomalie: 0, absent: 0, total: 0, minutes: 0 });
      }
      const day = daysMap.get(j)!;
      day.total += 1;
      day.minutes += r.tempsPresenceMin || 0;
      const ton = getStatutTon(r.statutPresence);
      if (ton === "present") day.present += 1;
      else if (ton === "anomalie") day.anomalie += 1;
      else if (ton === "absent") day.absent += 1;
    });

    const daysList = Array.from(daysMap.values()).sort((a, b) => a.jour.localeCompare(b.jour));

    return {
      totalRecords,
      uniqueEmployees,
      uniqueDays,
      totalMinutes,
      statusCounts,
      presenceRate,
      ponctualityRate,
      anomalyRate,
      avgMinutesPerRecord,
      deptsList,
      daysList,
    };
  }, [rows]);

  if (rows.length === 0) {
    return (
      <Card className="p-12 text-center text-muted-foreground">
        Aucune donnée disponible pour afficher les graphiques avec les filtres sélectionnés.
      </Card>
    );
  }

  // Calcul des coordonnées SVG pour le Donut
  const donutSegments = useMemo(() => {
    const total = stats.totalRecords || 1;
    let accumulatedAngle = 0;

    return (Object.keys(STATUT_CONFIG) as StatutTon[]).map((key) => {
      const count = stats.statusCounts[key];
      const percentage = (count / total) * 100;
      const angle = (count / total) * 360;
      const startAngle = accumulatedAngle;
      accumulatedAngle += angle;

      return {
        key,
        count,
        percentage: Math.round(percentage),
        startAngle,
        endAngle: accumulatedAngle,
        color: STATUT_CONFIG[key].color,
        label: STATUT_CONFIG[key].label,
      };
    });
  }, [stats.statusCounts, stats.totalRecords]);

  // Fonction utilitaire pour dessiner un arc SVG
  function describeArc(
    x: number,
    y: number,
    radius: number,
    innerRadius: number,
    startAngle: number,
    endAngle: number
  ) {
    if (endAngle - startAngle >= 359.99) {
      endAngle = startAngle + 359.99;
    }
    const startRad = ((startAngle - 90) * Math.PI) / 180.0;
    const endRad = ((endAngle - 90) * Math.PI) / 180.0;

    const x1 = x + radius * Math.cos(startRad);
    const y1 = y + radius * Math.sin(startRad);
    const x2 = x + radius * Math.cos(endRad);
    const y2 = y + radius * Math.sin(endRad);

    const x3 = x + innerRadius * Math.cos(endRad);
    const y3 = y + innerRadius * Math.sin(endRad);
    const x4 = x + innerRadius * Math.cos(startRad);
    const y4 = y + innerRadius * Math.sin(startRad);

    const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";

    return [
      `M ${x1} ${y1}`,
      `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}`,
      `L ${x3} ${y3}`,
      `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${x4} ${y4}`,
      "Z",
    ].join(" ");
  }

  const maxDeptCount = Math.max(...stats.deptsList.map((d) => d.total), 1);
  const maxDayCount = Math.max(...stats.daysList.map((d) => d.total), 1);

  return (
    <div className="space-y-6">
      {/* 1. Ligne de KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4 transition-all hover:shadow-xs border-primary/20 bg-primary/5">
          <div className="flex items-center justify-between text-sm text-primary">
            <span className="font-medium">Taux d&apos;Assiduité Global</span>
            <CheckCircle2 className="size-5" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-bold tracking-tight text-primary tabular-nums">
              {stats.presenceRate}%
            </span>
            <span className="text-xs text-muted-foreground">de présence</span>
          </div>
          <div className="mt-2.5 h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${stats.presenceRate}%` }}
            />
          </div>
        </Card>

        <Card className="p-4 transition-all hover:shadow-xs border-amber-500/20 bg-amber-500/5">
          <div className="flex items-center justify-between text-sm text-amber-700 dark:text-amber-400">
            <span className="font-medium">Taux de Ponctualité</span>
            <TrendingUp className="size-5" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-bold tracking-tight text-amber-700 dark:text-amber-400 tabular-nums">
              {stats.ponctualityRate}%
            </span>
            <span className="text-xs text-muted-foreground">à l&apos;heure</span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {stats.statusCounts.anomalie} anomalies / retards détectés
          </p>
        </Card>

        <Card className="p-4 transition-all hover:shadow-xs">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span className="font-medium">Temps de Travail Total</span>
            <Clock className="size-5" />
          </div>
          <div className="mt-3">
            <span className="text-3xl font-bold tracking-tight tabular-nums">
              {formatDurationLong(stats.totalMinutes, "0h 00min")}
            </span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Moyenne : {formatDurationLong(stats.avgMinutesPerRecord, "0h 00min")} / jour-employé
          </p>
        </Card>

        <Card className="p-4 transition-all hover:shadow-xs">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span className="font-medium">Volume & Départements</span>
            <Building2 className="size-5" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-bold tracking-tight tabular-nums">
              {stats.deptsList.length}
            </span>
            <span className="text-sm font-medium text-foreground">départements</span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {stats.uniqueEmployees} employés distincts sur {stats.uniqueDays} jours
          </p>
        </Card>
      </div>

      {/* 2. Deux graphiques majeurs : Statuts (Donut) & Départements (Barres empilées) */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* GRAPHE 1 : Répartition par Statut (Donut) */}
        <Card className="p-5 lg:col-span-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold tracking-tight flex items-center gap-2">
                <PieIcon className="size-4 text-primary" />
                Répartition par Statut
              </h2>
              <span className="text-xs text-muted-foreground font-mono">
                {stats.totalRecords} total
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Proportion des présences, retards, anomalies et absences.
            </p>
          </div>

          <div className="my-6 flex flex-col items-center justify-center">
            <div className="relative size-48">
              <svg className="size-full" viewBox="0 0 200 200">
                {donutSegments.map((seg) => {
                  if (seg.count === 0) return null;
                  const isHovered = hoveredStatus === seg.key;
                  const d = describeArc(
                    100,
                    100,
                    isHovered ? 88 : 84,
                    isHovered ? 52 : 56,
                    seg.startAngle,
                    seg.endAngle
                  );
                  return (
                    <path
                      key={seg.key}
                      d={d}
                      fill={seg.color}
                      className="cursor-pointer transition-all duration-200 hover:opacity-90"
                      onMouseEnter={() => setHoveredStatus(seg.key)}
                      onMouseLeave={() => setHoveredStatus(null)}
                    />
                  );
                })}
              </svg>
              {/* Centre du Donut */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
                <span className="text-2xl font-bold tabular-nums">
                  {hoveredStatus
                    ? stats.statusCounts[hoveredStatus]
                    : `${stats.presenceRate}%`}
                </span>
                <span className="text-xs text-muted-foreground font-medium px-2 truncate max-w-[110px]">
                  {hoveredStatus ? STATUT_CONFIG[hoveredStatus].label : "Présents"}
                </span>
              </div>
            </div>
          </div>

          {/* Légende interactive sous le Donut */}
          <div className="grid grid-cols-2 gap-2 pt-2 border-t text-xs">
            {(Object.keys(STATUT_CONFIG) as StatutTon[]).map((key) => {
              const cfg = STATUT_CONFIG[key];
              const count = stats.statusCounts[key];
              const pct = stats.totalRecords > 0 ? Math.round((count / stats.totalRecords) * 100) : 0;
              const isHovered = hoveredStatus === key;

              return (
                <div
                  key={key}
                  onMouseEnter={() => setHoveredStatus(key)}
                  onMouseLeave={() => setHoveredStatus(null)}
                  className={cn(
                    "flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors border",
                    isHovered ? cfg.borderClass : "border-transparent hover:bg-muted/50"
                  )}
                >
                  <div className="flex items-center gap-2 truncate">
                    <span
                      className="size-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: cfg.color }}
                    />
                    <span className="truncate font-medium">{cfg.label}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 pl-1">
                    <span className="font-semibold tabular-nums">{count}</span>
                    <span className="text-muted-foreground">({pct}%)</span>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* GRAPHE 2 : Répartition par Département (Barres empilées horizontales) */}
        <Card className="p-5 lg:col-span-7 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold tracking-tight flex items-center gap-2">
                <Building2 className="size-4 text-primary" />
                Présence par Département
              </h2>
              <span className="text-xs text-muted-foreground font-mono">
                {stats.deptsList.length} départements
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Volume des pointages et décomposition des statuts par pôle d&apos;activité.
            </p>
          </div>

          <div className="my-4 space-y-4 max-h-[380px] overflow-y-auto pr-1">
            {stats.deptsList.map((d) => {
              const presentPct = d.total > 0 ? (d.present / d.total) * 100 : 0;
              const anomaliePct = d.total > 0 ? (d.anomalie / d.total) * 100 : 0;
              const absentPct = d.total > 0 ? (d.absent / d.total) * 100 : 0;
              const relativeWidth = (d.total / maxDeptCount) * 100;

              return (
                <div
                  key={d.name}
                  onClick={() => setSelectedDept(selectedDept === d.name ? null : d.name)}
                  className={cn(
                    "p-2.5 rounded-lg border transition-all cursor-pointer",
                    selectedDept === d.name
                      ? "border-primary bg-primary/5 shadow-xs"
                      : "border-border/60 hover:bg-muted/40"
                  )}
                >
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <div className="flex items-center gap-2 truncate">
                      <span className="font-semibold text-foreground truncate">{d.name}</span>
                      <span className="text-muted-foreground">({d.employeeCount} employés)</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-muted-foreground tabular-nums">
                        {formatDurationLong(d.minutes, "0h")}
                      </span>
                      <span
                        className={cn(
                          "px-2 py-0.5 rounded-full text-[11px] font-semibold tabular-nums",
                          d.rate >= 90
                            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                            : d.rate >= 75
                            ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                            : "bg-red-500/10 text-red-700 dark:text-red-400"
                        )}
                      >
                        {d.rate}% assiduité
                      </span>
                    </div>
                  </div>

                  {/* Barre empilée */}
                  <div className="flex items-center gap-2">
                    <div className="relative h-3 w-full rounded-md bg-muted overflow-hidden flex">
                      {presentPct > 0 && (
                        <div
                          title={`Présent : ${d.present}`}
                          className="h-full bg-emerald-500 transition-all duration-300"
                          style={{ width: `${presentPct}%` }}
                        />
                      )}
                      {anomaliePct > 0 && (
                        <div
                          title={`Anomalie : ${d.anomalie}`}
                          className="h-full bg-amber-500 transition-all duration-300"
                          style={{ width: `${anomaliePct}%` }}
                        />
                      )}
                      {absentPct > 0 && (
                        <div
                          title={`Absent : ${d.absent}`}
                          className="h-full bg-red-500 transition-all duration-300"
                          style={{ width: `${absentPct}%` }}
                        />
                      )}
                    </div>
                    <span className="text-xs font-semibold tabular-nums text-muted-foreground min-w-[28px] text-right">
                      {d.total}
                    </span>
                  </div>

                  {/* Détails complémentaires si le département est sélectionné */}
                  {selectedDept === d.name && (
                    <div className="mt-2.5 pt-2 border-t border-border/50 grid grid-cols-4 gap-2 text-[11px] text-center">
                      <div className="p-1.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-medium">
                        {d.present} Présents
                      </div>
                      <div className="p-1.5 rounded bg-amber-500/10 text-amber-700 dark:text-amber-400 font-medium">
                        {d.anomalie} Anomalies
                      </div>
                      <div className="p-1.5 rounded bg-red-500/10 text-red-700 dark:text-red-400 font-medium">
                        {d.absent} Absents
                      </div>
                      <div className="p-1.5 rounded bg-muted text-muted-foreground font-medium">
                        {d.sansHoraire} Sans horaire
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between pt-2 border-t text-xs text-muted-foreground">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-emerald-500" /> Présent
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-amber-500" /> Retard/Anomalie
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-red-500" /> Absent
              </span>
            </div>
            <span>Cliquez sur un département pour le détail</span>
          </div>
        </Card>
      </div>

      {/* 3. GRAPHE 3 : Évolution Quotidienne des Pointages (Colonnes verticales par jour) */}
      <Card className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold tracking-tight flex items-center gap-2">
              <Calendar className="size-4 text-primary" />
              Évolution Journalière des Présences
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Pointages enregistrés par jour sur la période sélectionnée.
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-emerald-500" /> Présents
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-amber-500" /> Anomalies
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-red-500" /> Absents
            </span>
          </div>
        </div>

        <div className="mt-6 pt-4 pb-2">
          <div className="flex items-end justify-between gap-3 h-44 border-b border-border/80 px-2">
            {stats.daysList.map((day) => {
              const presentHeight = (day.present / maxDayCount) * 100;
              const anomalieHeight = (day.anomalie / maxDayCount) * 100;
              const absentHeight = (day.absent / maxDayCount) * 100;
              const totalHeight = ((day.present + day.anomalie + day.absent) / maxDayCount) * 100;

              // Format date court (ex: "24/10")
              const parts = day.jour.split("-");
              const shortDate = parts.length === 3 ? `${parts[2]}/${parts[1]}` : day.jour;

              return (
                <div
                  key={day.jour}
                  className="flex-1 flex flex-col items-center justify-end h-full group relative"
                >
                  {/* Infobulle au survol */}
                  <div className="absolute -top-12 opacity-0 group-hover:opacity-100 transition-opacity bg-foreground text-background text-[11px] rounded px-2 py-1 pointer-events-none shadow-md z-10 whitespace-nowrap text-center">
                    <p className="font-semibold">{day.jour}</p>
                    <p>
                      {day.present} prés. | {day.anomalie} anom. | {day.absent} abs.
                    </p>
                  </div>

                  {/* Nombre total au-dessus de la colonne */}
                  <span className="text-[11px] font-semibold tabular-nums text-muted-foreground mb-1 group-hover:text-primary transition-colors">
                    {day.total}
                  </span>

                  {/* Barre empilée verticale */}
                  <div className="w-full max-w-[42px] rounded-t-md bg-muted overflow-hidden flex flex-col-reverse transition-all group-hover:scale-105 duration-200" style={{ height: `${Math.max(totalHeight, 8)}%` }}>
                    <div
                      className="bg-emerald-500 transition-all duration-300"
                      style={{ height: `${(day.present / Math.max(day.total, 1)) * 100}%` }}
                    />
                    <div
                      className="bg-amber-500 transition-all duration-300"
                      style={{ height: `${(day.anomalie / Math.max(day.total, 1)) * 100}%` }}
                    />
                    <div
                      className="bg-red-500 transition-all duration-300"
                      style={{ height: `${(day.absent / Math.max(day.total, 1)) * 100}%` }}
                    />
                  </div>

                  {/* Libellé date sous l'axe X */}
                  <span className="mt-2 text-[11px] font-medium text-muted-foreground tabular-nums group-hover:text-foreground">
                    {shortDate}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </Card>
    </div>
  );
}
