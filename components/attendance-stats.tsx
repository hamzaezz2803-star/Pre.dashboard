"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertCircle,
  ArrowUpDown,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Download,
  FileSpreadsheet,
  FileText,
  FilterX,
  LogIn,
  LogOut,
  PieChart as PieIcon,
  Printer,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
  UserCheck,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatDateFr, formatDurationLong } from "@/lib/dates";
import { exportStatsToExcel, exportStatsToPdf, type StatsExportData } from "@/lib/export-stats";
import { getStatutTon, type StatutTon } from "@/lib/status";
import type { PresenceRow } from "@/lib/types";
import { cn } from "@/lib/utils";

interface AttendanceStatsProps {
  rows: PresenceRow[];
  allRows?: PresenceRow[];
  from: string;
  to: string;
  activeDept?: string;
  activeStatut?: string;
  onResetFilters?: () => void;
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
    label: "Retard / Anomalie",
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
    label: "Sans horaire",
    color: "#94a3b8",
    bgClass: "bg-slate-400",
    textClass: "text-slate-600 dark:text-slate-400",
    borderClass: "border-slate-400/20 bg-slate-400/5",
  },
};

export interface UserTimelineEvent {
  type: "entree" | "activite" | "sortie" | "en_cours" | "hors_ligne";
  title: string;
  time: string;
  timeFormatted: string;
  detail: string;
  state: "success" | "info" | "neutral" | "active";
}

export interface ConnectedUser {
  id: number;
  username: string;
  full_name: string | null;
  role: "super_admin" | "admin";
  active: boolean;
  isOnline: boolean;
  isCurrent: boolean;
  loginTime: string | null;
  logoutTime: string | null;
  lastSeen: string | null;
  durationMinutes: number;
  timeline: UserTimelineEvent[];
}

export interface ConnectedUsersResponse {
  connectedCount: number;
  totalUsers: number;
  users: ConnectedUser[];
}

type DeptSortField = "rate" | "total" | "minutes";

export function AttendanceStats({
  rows,
  allRows,
  from,
  to,
  activeDept,
  activeStatut,
  onResetFilters,
}: AttendanceStatsProps) {
  const [hoveredStatus, setHoveredStatus] = useState<StatutTon | null>(null);
  const [deptSort, setDeptSort] = useState<DeptSortField>("rate");
  const [exporting, setExporting] = useState<"pdf" | "excel" | null>(null);
  const [usersData, setUsersData] = useState<ConnectedUsersResponse | null>(null);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [expandedUserId, setExpandedUserId] = useState<number | null>(null);

  const fetchConnectedUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const res = await fetch("/api/admin/connected-users");
      if (res.ok) {
        const data = await res.json();
        setUsersData(data);
      }
    } catch {
      // Échec silencieux
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/admin/connected-users")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (active && data) {
          setUsersData(data);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoadingUsers(false);
      });

    const timer = setInterval(() => {
      void fetchConnectedUsers();
    }, 20000);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [fetchConnectedUsers]);

  const hasRestrictedFilter =
    (activeDept && activeDept !== "all") || (activeStatut && activeStatut !== "all");

  // 1. Calculs globaux et structuration des données
  const stats = useMemo(() => {
    const totalRecords = rows.length;
    const uniqueEmployees = new Set(rows.map((r) => r.empCode)).size;
    const uniqueDays = new Set(rows.map((r) => r.jour)).size;
    const totalMinutes = rows.reduce((acc, r) => acc + (r.tempsPresenceMin || 0), 0);

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

    const presenceRate =
      totalRecords > 0 ? Math.round(((presentCount + anomalieCount) / totalRecords) * 100) : 0;
    const ponctualityRate =
      totalRecords > 0 ? Math.round((presentCount / totalRecords) * 100) : 0;
    const anomalyRate =
      totalRecords > 0 ? Math.round((anomalieCount / totalRecords) * 100) : 0;
    const avgMinutesPerRecord = totalRecords > 0 ? Math.round(totalMinutes / totalRecords) : 0;

    // Synthèse par département
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

    // Synthèse par date
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

  // Tri des départements selon le critère choisi
  const sortedDepts = useMemo(() => {
    return [...stats.deptsList].sort((a, b) => {
      if (deptSort === "rate") return b.rate - a.rate || b.total - a.total;
      if (deptSort === "total") return b.total - a.total;
      return b.minutes - a.minutes;
    });
  }, [stats.deptsList, deptSort]);

  // Export handlers
  async function handleExportPdf() {
    setExporting("pdf");
    try {
      const exportData: StatsExportData = {
        totalRecords: stats.totalRecords,
        uniqueEmployees: stats.uniqueEmployees,
        uniqueDays: stats.uniqueDays,
        totalMinutes: stats.totalMinutes,
        presenceRate: stats.presenceRate,
        ponctualityRate: stats.ponctualityRate,
        anomalyRate: stats.anomalyRate,
        statusCounts: stats.statusCounts,
        deptsList: sortedDepts,
      };
      await exportStatsToPdf(exportData, from, to);
    } finally {
      setExporting(null);
    }
  }

  async function handleExportExcel() {
    setExporting("excel");
    try {
      const exportData: StatsExportData = {
        totalRecords: stats.totalRecords,
        uniqueEmployees: stats.uniqueEmployees,
        uniqueDays: stats.uniqueDays,
        totalMinutes: stats.totalMinutes,
        presenceRate: stats.presenceRate,
        ponctualityRate: stats.ponctualityRate,
        anomalyRate: stats.anomalyRate,
        statusCounts: stats.statusCounts,
        deptsList: sortedDepts,
      };
      await exportStatsToExcel(exportData, from, to);
    } finally {
      setExporting(null);
    }
  }

  // Calcul du Donut SVG
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

  const maxDayCount = Math.max(...stats.daysList.map((d) => d.total), 1);

  if (rows.length === 0) {
    return (
      <Card className="p-12 text-center text-muted-foreground">
        <p className="font-medium text-base">Aucune donnée disponible</p>
        <p className="mt-1 text-sm">Modifiez vos filtres de dates ou de département pour afficher les graphiques.</p>
        {onResetFilters && (
          <Button variant="outline" className="mt-4" onClick={onResetFilters}>
            Réinitialiser les filtres
          </Button>
        )}
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* 1. Barre d'action supérieure & Options d'export */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 rounded-xl bg-surface border border-border/70 shadow-2xs">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-foreground flex items-center gap-2">
            <PieIcon className="size-4 text-primary" />
            Tableau de Bord Analytique & Graphiques
          </h2>
          <p className="text-xs text-muted-foreground">
            Synthèse d&apos;assiduité du {formatDateFr(from)} au {formatDateFr(to)} ({stats.totalRecords} pointages)
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            onClick={handleExportPdf}
            disabled={exporting !== null}
            className="h-8 px-2.5 text-xs gap-1.5 cursor-pointer hover:border-red-500/40"
          >
            <FileText className="size-3.5 text-red-600" />
            <span>{exporting === "pdf" ? "Export..." : "Rapport PDF"}</span>
          </Button>

          <Button
            variant="outline"
            onClick={handleExportExcel}
            disabled={exporting !== null}
            className="h-8 px-2.5 text-xs gap-1.5 cursor-pointer hover:border-emerald-500/40"
          >
            <FileSpreadsheet className="size-3.5 text-emerald-600" />
            <span>{exporting === "excel" ? "Export..." : "Données Excel"}</span>
          </Button>

          <Button
            variant="outline"
            onClick={() => window.print()}
            className="h-8 px-2.5 text-xs gap-1.5 cursor-pointer"
            title="Imprimer cette vue"
          >
            <Printer className="size-3.5 text-muted-foreground" />
            <span>Imprimer</span>
          </Button>
        </div>
      </div>

      {/* Bannière d'avertissement si un filtre restrictif est actif */}
      {hasRestrictedFilter && onResetFilters && (
        <div className="flex items-center justify-between p-3 rounded-lg border border-amber-500/30 bg-amber-500/10 text-xs text-amber-900 dark:text-amber-200">
          <div className="flex items-center gap-2">
            <AlertCircle className="size-4 shrink-0 text-amber-600" />
            <span>
              <strong>Filtre actif :</strong> Vos graphiques affichent uniquement les données filtrées (
              {activeDept && activeDept !== "all" ? `Département : ${activeDept}` : ""}
              {activeDept && activeDept !== "all" && activeStatut && activeStatut !== "all" ? " · " : ""}
              {activeStatut && activeStatut !== "all" ? `Statut : ${activeStatut}` : ""}
              ).
            </span>
          </div>
          <button
            type="button"
            onClick={onResetFilters}
            className="inline-flex items-center gap-1 font-semibold underline hover:no-underline ml-2 shrink-0 cursor-pointer"
          >
            <FilterX className="size-3.5" />
            Afficher la vue globale
          </button>
        </div>
      )}

      {/* 2. Cartes KPIs Synthétiques (Grands Chiffres Faciles à Analyser) */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4 border-emerald-500/30 bg-emerald-500/5">
          <div className="flex items-center justify-between text-xs font-semibold text-emerald-700 dark:text-emerald-400">
            <span>Taux de Présence Global</span>
            <CheckCircle2 className="size-4" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold tracking-tight text-emerald-700 dark:text-emerald-400 tabular-nums">
              {stats.presenceRate}%
            </span>
            <span className="text-xs text-muted-foreground font-medium">d&apos;assiduité</span>
          </div>
          <div className="mt-3 h-2 w-full rounded-full bg-emerald-500/20 overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-600 dark:bg-emerald-500 transition-all duration-500"
              style={{ width: `${stats.presenceRate}%` }}
            />
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            {stats.statusCounts.present} à l&apos;heure · {stats.statusCounts.anomalie} anomalies
          </p>
        </Card>

        <Card className="p-4 border-amber-500/30 bg-amber-500/5">
          <div className="flex items-center justify-between text-xs font-semibold text-amber-700 dark:text-amber-400">
            <span>Taux de Ponctualité</span>
            <TrendingUp className="size-4" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold tracking-tight text-amber-700 dark:text-amber-400 tabular-nums">
              {stats.ponctualityRate}%
            </span>
            <span className="text-xs text-muted-foreground font-medium">à l&apos;heure</span>
          </div>
          <div className="mt-3 h-2 w-full rounded-full bg-amber-500/20 overflow-hidden">
            <div
              className="h-full rounded-full bg-amber-500 transition-all duration-500"
              style={{ width: `${stats.ponctualityRate}%` }}
            />
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            {stats.statusCounts.anomalie} retards ou sorties manquantes ({stats.anomalyRate}%)
          </p>
        </Card>

        <Card className="p-4 border-border/80">
          <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
            <span>Volume Horaire Cumulé</span>
            <Clock className="size-4" />
          </div>
          <div className="mt-2">
            <span className="text-3xl font-bold tracking-tight tabular-nums">
              {formatDurationLong(stats.totalMinutes, "0h 00m")}
            </span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Moyenne : <strong>{formatDurationLong(stats.avgMinutesPerRecord, "0h 00m")}</strong> / jour-employé
          </p>
        </Card>

        <Card className="p-4 border-border/80">
          <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
            <span>Couverture Globale</span>
            <Users className="size-4" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold tracking-tight tabular-nums">
              {stats.uniqueEmployees}
            </span>
            <span className="text-sm font-medium text-foreground">employés suivis</span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Répartis sur <strong>{stats.deptsList.length} départements</strong> ({stats.uniqueDays} jours analysés)
          </p>
        </Card>
      </div>

      {/* 3. Section des Deux Graphiques Principaux */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* GRAPHIQUE 1 : Répartition par Statut (Donut + Synthèse Rapide) */}
        <Card className="p-5 lg:col-span-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold tracking-tight flex items-center gap-2">
                <PieIcon className="size-4 text-primary" />
                Répartition Globale par Statut
              </h3>
              <span className="text-xs font-mono font-medium text-muted-foreground">
                {stats.totalRecords} total
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Proportion des présences régulières, retards, anomalies et absences.
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
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
                <span className="text-3xl font-extrabold tabular-nums tracking-tight">
                  {hoveredStatus
                    ? stats.statusCounts[hoveredStatus]
                    : `${stats.presenceRate}%`}
                </span>
                <span className="text-xs text-muted-foreground font-semibold px-2 truncate max-w-[120px]">
                  {hoveredStatus ? STATUT_CONFIG[hoveredStatus].label : "Présents"}
                </span>
              </div>
            </div>
          </div>

          {/* Grille explicative et détaillée des statuts */}
          <div className="space-y-2 pt-3 border-t">
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
                    isHovered ? cfg.borderClass : "border-border/50 hover:bg-muted/40"
                  )}
                >
                  <div className="flex items-center gap-2 truncate">
                    <span
                      className="size-3 rounded-full shrink-0 shadow-2xs"
                      style={{ backgroundColor: cfg.color }}
                    />
                    <span className="font-medium text-xs truncate">{cfg.label}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs font-bold tabular-nums">{count} cas</span>
                    <span className="text-xs text-muted-foreground tabular-nums font-semibold min-w-[36px] text-right">
                      {pct}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* GRAPHIQUE 2 : Comparatif des Départements (Intuitif & Triable) */}
        <Card className="p-5 lg:col-span-7 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-sm font-semibold tracking-tight flex items-center gap-2">
                <Building2 className="size-4 text-primary" />
                Comparatif des Départements
              </h3>

              {/* Sélecteur de tri rapide */}
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted p-1 rounded-md">
                <ArrowUpDown className="size-3" />
                <span>Trier :</span>
                <button
                  type="button"
                  onClick={() => setDeptSort("rate")}
                  className={cn(
                    "px-2 py-0.5 rounded cursor-pointer transition-colors font-medium",
                    deptSort === "rate"
                      ? "bg-surface text-foreground shadow-2xs"
                      : "hover:text-foreground"
                  )}
                >
                  Assiduité %
                </button>
                <button
                  type="button"
                  onClick={() => setDeptSort("total")}
                  className={cn(
                    "px-2 py-0.5 rounded cursor-pointer transition-colors font-medium",
                    deptSort === "total"
                      ? "bg-surface text-foreground shadow-2xs"
                      : "hover:text-foreground"
                  )}
                >
                  Pointages
                </button>
                <button
                  type="button"
                  onClick={() => setDeptSort("minutes")}
                  className={cn(
                    "px-2 py-0.5 rounded cursor-pointer transition-colors font-medium",
                    deptSort === "minutes"
                      ? "bg-surface text-foreground shadow-2xs"
                      : "hover:text-foreground"
                  )}
                >
                  Heures
                </button>
              </div>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Analyse de l&apos;assiduité et des volumes de travail par pôle d&apos;activité.
            </p>
          </div>

          {/* Barres comparatives très claires */}
          <div className="my-4 space-y-3 max-h-[380px] overflow-y-auto pr-1">
            {sortedDepts.map((d) => {
              const presentPct = d.total > 0 ? (d.present / d.total) * 100 : 0;
              const anomaliePct = d.total > 0 ? (d.anomalie / d.total) * 100 : 0;
              const absentPct = d.total > 0 ? (d.absent / d.total) * 100 : 0;

              return (
                <div
                  key={d.name}
                  className="p-3 rounded-lg border border-border/70 bg-surface hover:border-primary/40 transition-colors shadow-2xs"
                >
                  <div className="flex items-center justify-between text-xs mb-2">
                    <div className="flex items-center gap-2 truncate">
                      <span className="font-semibold text-foreground truncate">{d.name}</span>
                      <span className="text-muted-foreground text-[11px]">
                        ({d.employeeCount} employés · {d.total} fiches)
                      </span>
                    </div>

                    <div className="flex items-center gap-2.5 shrink-0">
                      <span className="text-muted-foreground font-medium tabular-nums">
                        {formatDurationLong(d.minutes, "0h")}
                      </span>
                      <span
                        className={cn(
                          "px-2 py-0.5 rounded-full text-xs font-bold tabular-nums",
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

                  {/* Barre segmentée avec contrastes élevés */}
                  <div className="h-3.5 w-full rounded-md bg-muted overflow-hidden flex shadow-inner">
                    {presentPct > 0 && (
                      <div
                        title={`Présent : ${d.present}`}
                        className="h-full bg-emerald-500 transition-all duration-300"
                        style={{ width: `${presentPct}%` }}
                      />
                    )}
                    {anomaliePct > 0 && (
                      <div
                        title={`Retard / Anomalie : ${d.anomalie}`}
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

                  {/* Détail chiffré immédiatement lisible sous chaque barre */}
                  <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                    <div className="flex items-center gap-3">
                      <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                        ✓ {d.present} présents
                      </span>
                      {d.anomalie > 0 && (
                        <span className="text-amber-700 dark:text-amber-400 font-medium">
                          ⚠ {d.anomalie} retards
                        </span>
                      )}
                      {d.absent > 0 && (
                        <span className="text-red-700 dark:text-red-400 font-medium">
                          ✕ {d.absent} absents
                        </span>
                      )}
                    </div>
                    <span className="font-medium text-foreground">
                      Ponctualité : {d.ponctualRate}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between pt-2 border-t text-xs text-muted-foreground">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full bg-emerald-500" /> Présent
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full bg-amber-500" /> Retard / Anomalie
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full bg-red-500" /> Absent
              </span>
            </div>
            <span>{sortedDepts.length} département(s) affiché(s)</span>
          </div>
        </Card>
      </div>

      {/* 4. GRAPHIQUE 3 : Évolution Quotidienne (Jour par Jour) */}
      <Card className="p-5">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="text-sm font-semibold tracking-tight flex items-center gap-2">
              <Calendar className="size-4 text-primary" />
              Évolution Quotidienne des Pointages
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Volume des présences enregistrées chaque jour sur la période sélectionnée.
            </p>
          </div>

          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5 font-medium text-emerald-700 dark:text-emerald-400">
              <span className="size-2.5 rounded-full bg-emerald-500" /> Présents
            </span>
            <span className="flex items-center gap-1.5 font-medium text-amber-700 dark:text-amber-400">
              <span className="size-2.5 rounded-full bg-amber-500" /> Retards / Anomalies
            </span>
            <span className="flex items-center gap-1.5 font-medium text-red-700 dark:text-red-400">
              <span className="size-2.5 rounded-full bg-red-500" /> Absents
            </span>
          </div>
        </div>

        <div className="mt-6 pt-4 pb-2">
          <div className="flex items-end justify-between gap-2 sm:gap-4 h-48 border-b border-border/80 px-2 sm:px-4">
            {stats.daysList.map((day) => {
              const totalHeight = (day.total / maxDayCount) * 100;
              const parts = day.jour.split("-");
              const shortDate = parts.length === 3 ? `${parts[2]}/${parts[1]}` : day.jour;

              return (
                <div
                  key={day.jour}
                  className="flex-1 flex flex-col items-center justify-end h-full group relative"
                >
                  {/* Tooltip complet au survol */}
                  <div className="absolute -top-14 opacity-0 group-hover:opacity-100 transition-opacity bg-foreground text-background text-xs rounded-md px-2.5 py-1.5 pointer-events-none shadow-lg z-20 whitespace-nowrap text-center">
                    <p className="font-bold">{day.jour}</p>
                    <p className="text-[11px]">
                      {day.present} prés. · {day.anomalie} retards · {day.absent} abs.
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      Total : {day.total} pointages ({formatDurationLong(day.minutes, "0h")})
                    </p>
                  </div>

                  {/* Chiffre total au-dessus de la barre */}
                  <span className="text-xs font-bold tabular-nums text-foreground mb-1.5 group-hover:text-primary transition-colors">
                    {day.total}
                  </span>

                  {/* Barre empilée verticale avec coins arrondis */}
                  <div
                    className="w-full max-w-[48px] rounded-t-lg bg-muted overflow-hidden flex flex-col-reverse shadow-2xs transition-transform duration-200 group-hover:scale-105"
                    style={{ height: `${Math.max(totalHeight, 10)}%` }}
                  >
                    <div
                      title={`Présents : ${day.present}`}
                      className="bg-emerald-500 transition-all duration-300"
                      style={{ height: `${(day.present / Math.max(day.total, 1)) * 100}%` }}
                    />
                    <div
                      title={`Anomalies : ${day.anomalie}`}
                      className="bg-amber-500 transition-all duration-300"
                      style={{ height: `${(day.anomalie / Math.max(day.total, 1)) * 100}%` }}
                    />
                    <div
                      title={`Absents : ${day.absent}`}
                      className="bg-red-500 transition-all duration-300"
                      style={{ height: `${(day.absent / Math.max(day.total, 1)) * 100}%` }}
                    />
                  </div>

                  {/* Date en bas */}
                  <span className="mt-2 text-xs font-medium text-muted-foreground tabular-nums group-hover:text-foreground">
                    {shortDate}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      {/* 5. Tableau Synthétique d'Analyse (Directement Lisible et Exportable) */}
      <Card className="overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold tracking-tight">
              Tableau Synthétique par Département
            </h3>
            <p className="text-xs text-muted-foreground">
              Indicateurs consolidés pour une analyse managériale rapide.
            </p>
          </div>
          <span className="text-xs text-muted-foreground font-mono">
            {sortedDepts.length} départements
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs sm:text-sm">
            <thead className="bg-muted text-xs text-muted-foreground font-medium">
              <tr>
                <th className="px-3 py-2.5">Département</th>
                <th className="px-3 py-2.5 text-center">Effectif</th>
                <th className="px-3 py-2.5 text-center">Présents</th>
                <th className="px-3 py-2.5 text-center">Retards / Anomalies</th>
                <th className="px-3 py-2.5 text-center">Absents</th>
                <th className="px-3 py-2.5 text-center">Taux Assiduité</th>
                <th className="px-3 py-2.5 text-center">Ponctualité</th>
                <th className="px-3 py-2.5 text-right">Heures Totales</th>
              </tr>
            </thead>
            <tbody>
              {sortedDepts.map((d) => (
                <tr key={d.name} className="border-t border-border hover:bg-muted/40">
                  <td className="px-3 py-2.5 font-semibold text-foreground">{d.name}</td>
                  <td className="px-3 py-2.5 text-center tabular-nums text-muted-foreground">
                    {d.employeeCount}
                  </td>
                  <td className="px-3 py-2.5 text-center tabular-nums text-emerald-700 dark:text-emerald-400 font-semibold">
                    {d.present}
                  </td>
                  <td className="px-3 py-2.5 text-center tabular-nums text-amber-700 dark:text-amber-400 font-semibold">
                    {d.anomalie}
                  </td>
                  <td className="px-3 py-2.5 text-center tabular-nums text-red-700 dark:text-red-400 font-semibold">
                    {d.absent}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <span
                      className={cn(
                        "inline-flex px-2 py-0.5 rounded-full text-xs font-bold tabular-nums",
                        d.rate >= 90
                          ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                          : d.rate >= 75
                          ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                          : "bg-red-500/10 text-red-700 dark:text-red-400"
                      )}
                    >
                      {d.rate}%
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-center tabular-nums text-muted-foreground font-medium">
                    {d.ponctualRate}%
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-foreground">
                    {formatDurationLong(d.minutes, "0h 00m")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* 6. SECTION DES UTILISATEURS CONNECTÉS (Réservée au Super Administrateur) */}
      <Card className="overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            <div className="size-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <ShieldCheck className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold tracking-tight">
                  Utilisateurs du Système & Sessions Connectées
                </h3>
                {usersData && (
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                    <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                    {usersData.connectedCount} en ligne
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Surveillance en temps réel des accès et sessions actives sur le tableau de bord.
              </p>
            </div>
          </div>

          <Button
            variant="outline"
            onClick={fetchConnectedUsers}
            disabled={loadingUsers}
            className="h-8 px-2.5 text-xs gap-1.5 cursor-pointer"
          >
            <RefreshCw className={cn("size-3.5", loadingUsers && "animate-spin")} />
            <span>Actualiser</span>
          </Button>
        </div>

        <div className="p-4">
          {loadingUsers && !usersData ? (
            <div className="py-6 text-center text-xs text-muted-foreground">
              Chargement des utilisateurs connectés...
            </div>
          ) : usersData?.users && usersData.users.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {usersData.users.map((user) => {
                const isExpanded = expandedUserId === user.id;
                const loginFormatted = user.loginTime
                  ? new Date(user.loginTime).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
                  : "-";
                const logoutFormatted = user.isOnline
                  ? "En cours"
                  : user.logoutTime
                  ? new Date(user.logoutTime).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
                  : "Déconnecté";

                return (
                  <div
                    key={user.id}
                    className={cn(
                      "rounded-xl border transition-all shadow-2xs overflow-hidden flex flex-col justify-between",
                      user.isOnline
                        ? "border-emerald-500/30 bg-emerald-500/5 hover:border-emerald-500/50"
                        : "border-border/70 bg-surface hover:border-border"
                    )}
                  >
                    <div className="p-3.5 space-y-3">
                      {/* En-tête de la carte utilisateur */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="relative shrink-0">
                            <div className="size-9 rounded-full bg-surface border border-border flex items-center justify-center font-bold text-xs text-primary shadow-xs">
                              {user.username.slice(0, 2).toUpperCase()}
                            </div>
                            <span
                              className={cn(
                                "absolute bottom-0 right-0 size-2.5 rounded-full border-2 border-surface",
                                user.isOnline ? "bg-emerald-500" : "bg-slate-400"
                              )}
                              title={user.isOnline ? "En ligne" : "Hors ligne"}
                            />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-semibold text-xs text-foreground truncate">
                                {user.full_name || user.username}
                              </span>
                              {user.isCurrent && (
                                <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-primary text-primary-foreground shrink-0">
                                  Vous
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-muted-foreground truncate">
                              @{user.username} · {user.role === "super_admin" ? "Super Admin" : "Admin"}
                            </p>
                          </div>
                        </div>

                        <div className="shrink-0">
                          {user.isOnline ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                              <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              En ligne
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-muted text-muted-foreground">
                              Hors ligne
                            </span>
                          )}
                        </div>
                      </div>

                      {/* BLOC TIMELINE SYNTHÉTIQUE (A entré / A sorti / Durée) */}
                      <div className="p-2.5 rounded-lg bg-surface/80 border border-border/60 text-xs space-y-1.5">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="flex items-center gap-1.5 font-medium text-emerald-700 dark:text-emerald-400">
                            <LogIn className="size-3.5 text-emerald-600" />
                            A entré :
                          </span>
                          <span className="font-semibold tabular-nums text-foreground">
                            {loginFormatted}
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-[11px]">
                          <span className="flex items-center gap-1.5 font-medium text-red-700 dark:text-red-400">
                            <LogOut className="size-3.5 text-red-500" />
                            A sorti :
                          </span>
                          <span className={cn("font-semibold tabular-nums", user.isOnline ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")}>
                            {logoutFormatted}
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-[11px] pt-1 border-t border-border/40">
                          <span className="flex items-center gap-1.5 text-muted-foreground font-medium">
                            <Clock className="size-3.5" />
                            Durée session :
                          </span>
                          <span className="font-semibold tabular-nums text-foreground">
                            {user.isOnline ? `${user.durationMinutes} min` : "-"}
                          </span>
                        </div>
                      </div>

                      {/* DÉTAIL DÉROULANT DE LA TIMELINE */}
                      {isExpanded && user.timeline && user.timeline.length > 0 && (
                        <div className="pt-2 border-t border-border/60 space-y-2 text-xs">
                          <p className="font-semibold text-[11px] text-foreground flex items-center gap-1.5">
                            <Activity className="size-3 text-primary" />
                            Chronologie détaillée des accès
                          </p>
                          <div className="relative pl-4 space-y-2.5 before:absolute before:left-1.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-border">
                            {user.timeline.map((evt, idx) => (
                              <div key={idx} className="relative flex items-start gap-2">
                                <span
                                  className={cn(
                                    "absolute -left-4 mt-1 size-2 rounded-full ring-2 ring-surface",
                                    evt.type === "entree"
                                      ? "bg-emerald-500"
                                      : evt.type === "sortie"
                                      ? "bg-red-500"
                                      : evt.type === "activite"
                                      ? "bg-blue-500"
                                      : "bg-slate-400"
                                  )}
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center justify-between text-[11px]">
                                    <span className="font-semibold text-foreground">{evt.title}</span>
                                    <span className="tabular-nums font-mono text-muted-foreground text-[10px]">
                                      {evt.timeFormatted}
                                    </span>
                                  </div>
                                  <p className="text-[10px] text-muted-foreground mt-0.5">
                                    {evt.detail}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Bouton pour déplier / replier les détails de la timeline */}
                    <button
                      type="button"
                      onClick={() => setExpandedUserId(isExpanded ? null : user.id)}
                      className="w-full py-1.5 px-3 border-t border-border/50 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/30 flex items-center justify-center gap-1 cursor-pointer transition-colors"
                    >
                      <span>{isExpanded ? "Masquer les détails" : "Voir timeline & détails"}</span>
                      {isExpanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground py-2 text-center">
              Aucun utilisateur trouvé.
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}
