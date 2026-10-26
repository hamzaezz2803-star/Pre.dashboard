"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  CalendarClock,
  Search,
  RotateCcw,
  FileSpreadsheet,
  FileText,
  Moon,
  Sun,
  Info,
  History,
  X,
  LogIn,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Building,
  Clock,
  Tablet,
  MapPin,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { currentMonthRange, formatDateFr, formatDurationLong } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { HoraireItem } from "./horaires-parametrage";

interface SuiviRow {
  empCode: string | number;
  nomComplet: string;
  lastName: string | null;
  firstName: string | null;
  deptName: string;
  dateService: string;
  horaire: {
    code: string;
    nom: string;
    libelle: string;
    heureDebut?: string;
    heureFin?: string;
    estNuit?: boolean;
    conforme?: boolean;
  };
  dateEntree: string;
  heureEntree: string | null;
  dateSortie: string;
  heureSortie: string | null;
  dureeMinutes: number;
  statut: string;
  isNightShift: boolean;
  nightShiftBadge: string | null;
  nbPointages: number;
}

const STATUT_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  Présent: {
    bg: "bg-emerald-500/10 border-emerald-500/20",
    text: "text-emerald-700 dark:text-emerald-400",
    dot: "bg-emerald-600 dark:bg-emerald-500",
  },
  Retard: {
    bg: "bg-amber-500/10 border-amber-500/20",
    text: "text-amber-700 dark:text-amber-400",
    dot: "bg-amber-500",
  },
  "Pointage incomplet": {
    bg: "bg-orange-500/10 border-orange-500/20",
    text: "text-orange-700 dark:text-orange-400",
    dot: "bg-orange-500",
  },
  Absent: {
    bg: "bg-red-500/10 border-red-500/20",
    text: "text-red-700 dark:text-red-400",
    dot: "bg-red-600 dark:bg-red-500",
  },
  "Horaire non défini": {
    bg: "bg-slate-500/10 border-slate-500/20",
    text: "text-slate-600 dark:text-slate-400",
    dot: "bg-slate-400 dark:bg-slate-500",
  },
};

const PAGE_SIZE = 25;

export function HorairesSuivi() {
  const defaults = currentMonthRange();
  const [debut, setDebut] = useState(defaults.from);
  const [fin, setFin] = useState(defaults.to);
  const [departement, setDepartement] = useState("all");
  const [recherche, setRecherche] = useState("");
  const [horaireFilter, setHoraireFilter] = useState("all");
  const [statutFilter, setStatutFilter] = useState("all");

  const [departmentsList, setDepartmentsList] = useState<string[]>([]);
  const [configuredHoraires, setConfiguredHoraires] = useState<HoraireItem[]>([]);
  const [rows, setRows] = useState<SuiviRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Pagination
  const [page, setPage] = useState(1);

  // Timeline modal
  const [selectedRow, setSelectedRow] = useState<SuiviRow | null>(null);
  const [timelineEvents, setTimelineEvents] = useState<unknown[]>([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);

  // Exportation
  const [exporting, setExporting] = useState(false);

  // Chargement des départements
  useEffect(() => {
    fetch("/api/presence/departements")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setDepartmentsList(data);
      })
      .catch(() => {});
  }, []);

  // Chargement des présences
  const chargerDonnees = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (debut) qs.set("debut", debut);
      if (fin) qs.set("fin", fin);
      if (departement && departement !== "all") qs.set("departement", departement);
      if (recherche) qs.set("personnel", recherche);
      if (horaireFilter && horaireFilter !== "all") qs.set("horaire", horaireFilter);
      if (statutFilter && statutFilter !== "all") qs.set("statut", statutFilter);

      const res = await fetch(`/api/horaires/suivi?${qs.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur de chargement des présences");

      setRows(data.rows || []);
      if (data.horaires) setConfiguredHoraires(data.horaires);
      setPage(1);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur inattendue");
    } finally {
      setLoading(false);
    }
  }, [debut, fin, departement, recherche, horaireFilter, statutFilter]);

  useEffect(() => {
    let active = true;
    const qs = new URLSearchParams();
    if (debut) qs.set("debut", debut);
    if (fin) qs.set("fin", fin);
    if (departement && departement !== "all") qs.set("departement", departement);
    if (recherche) qs.set("personnel", recherche);
    if (horaireFilter && horaireFilter !== "all") qs.set("horaire", horaireFilter);
    if (statutFilter && statutFilter !== "all") qs.set("statut", statutFilter);

    fetch(`/api/horaires/suivi?${qs.toString()}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (active && data) {
          setRows(data.rows || []);
          if (data.horaires) setConfiguredHoraires(data.horaires);
          setPage(1);
        }
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : "Erreur inattendue");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [debut, fin, departement, recherche, horaireFilter, statutFilter]);

  // Statistiques calculées
  const stats = useMemo(() => {
    const total = rows.length;
    const presents = rows.filter((r) => r.statut === "Présent").length;
    const retards = rows.filter((r) => r.statut === "Retard").length;
    const incomplets = rows.filter((r) => r.statut === "Pointage incomplet").length;
    const nuits = rows.filter((r) => r.isNightShift).length;
    return { total, presents, retards, incomplets, nuits };
  }, [rows]);

  // Données paginées
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const paginatedRows = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return rows.slice(start, start + PAGE_SIZE);
  }, [rows, page]);

  // Ouvrir timeline
  const handleOpenTimeline = async (row: SuiviRow) => {
    setSelectedRow(row);
    setLoadingTimeline(true);
    try {
      const res = await fetch(
        `/api/presence/timeline?pin=${encodeURIComponent(row.empCode)}&date=${encodeURIComponent(row.dateService)}&date_fin=${encodeURIComponent(row.dateSortie || row.dateService)}`
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
  };

  // Export Excel
  const handleExportExcel = async () => {
    setExporting(true);
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Suivi Présences Horaires");

      ws.columns = [
        { header: "Matricule", key: "empCode", width: 12 },
        { header: "Nom et Prénom", key: "nomComplet", width: 25 },
        { header: "Département", key: "deptName", width: 22 },
        { header: "Date Service", key: "dateService", width: 14 },
        { header: "Horaire Affecté", key: "horaire", width: 18 },
        { header: "Entrée", key: "entree", width: 14 },
        { header: "Sortie", key: "sortie", width: 18 },
        { header: "Durée Présence", key: "duree", width: 15 },
        { header: "Statut", key: "statut", width: 18 },
      ];

      // Style d'en-tête
      ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
      ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F6B4F" } };

      rows.forEach((r) => {
        ws.addRow({
          empCode: r.empCode,
          nomComplet: r.nomComplet,
          deptName: r.deptName,
          dateService: formatDateFr(r.dateService),
          horaire: r.horaire?.libelle || "Non défini",
          entree: r.heureEntree || "-",
          sortie: r.heureSortie ? `${r.heureSortie}${r.dateSortie !== r.dateService ? " (+1)" : ""}` : "-",
          duree: formatDurationLong(r.dureeMinutes),
          statut: r.statut,
        });
      });

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `suivi_presences_horaires_${debut}_${fin}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Export Excel error", e);
    } finally {
      setExporting(false);
    }
  };

  // Export PDF
  const handleExportPdf = async () => {
    setExporting(true);
    try {
      const { jsPDF } = await import("jspdf");
      const autoTable = (await import("jspdf-autotable")).default;

      const doc = new jsPDF({ orientation: "landscape" });
      doc.setFontSize(14);
      doc.text("OCP Phosboucraâ - Suivi des présences et affectation horaire", 14, 15);
      doc.setFontSize(9);
      doc.text(`Période : ${formatDateFr(debut)} au ${formatDateFr(fin)} | Total : ${rows.length} enregistrements`, 14, 21);

      const tableData = rows.map((r) => [
        String(r.empCode),
        r.nomComplet,
        r.deptName,
        formatDateFr(r.dateService),
        r.horaire?.libelle || "Non défini",
        r.heureEntree || "-",
        r.heureSortie ? `${r.heureSortie}${r.dateSortie !== r.dateService ? " (+1)" : ""}` : "-",
        formatDurationLong(r.dureeMinutes),
        r.statut,
      ]);

      autoTable(doc, {
        startY: 26,
        head: [["ID", "Personnel", "Département", "Date", "Horaire", "Entrée", "Sortie", "Présence", "Statut"]],
        body: tableData,
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [15, 107, 79], textColor: [255, 255, 255], fontStyle: "bold" },
      });

      doc.save(`suivi_presences_horaires_${debut}_${fin}.pdf`);
    } catch (e) {
      console.error("Export PDF error", e);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="w-full space-y-6 px-3 py-5 sm:px-5 lg:px-6">
      {/* En-tête */}
      <div className="flex flex-col gap-1 border-b border-border pb-4">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <CalendarClock className="size-5" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              Suivi des présences avec affectation horaire
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Affectation dynamique des postes (Matin H001, Après-midi H002, Nuit H003) selon les pointages réels.
            </p>
          </div>
        </div>
      </div>

      {/* Cartes de synthèse */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Card className="p-3.5 border-border">
          <span className="text-xs text-muted-foreground">Total Services</span>
          <p className="text-xl font-bold text-foreground mt-1 tabular-nums">{stats.total}</p>
        </Card>
        <Card className="p-3.5 border-border">
          <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">Présents</span>
          <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-1 tabular-nums">{stats.presents}</p>
        </Card>
        <Card className="p-3.5 border-border">
          <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">Retards</span>
          <p className="text-xl font-bold text-amber-600 dark:text-amber-400 mt-1 tabular-nums">{stats.retards}</p>
        </Card>
        <Card className="p-3.5 border-border">
          <span className="text-xs text-indigo-600 dark:text-indigo-400 font-medium flex items-center gap-1">
            <Moon className="size-3" /> Services de Nuit
          </span>
          <p className="text-xl font-bold text-indigo-600 dark:text-indigo-400 mt-1 tabular-nums">{stats.nuits}</p>
        </Card>
        <Card className="p-3.5 border-border col-span-2 sm:col-span-1">
          <span className="text-xs text-orange-600 dark:text-orange-400 font-medium">Incomplets</span>
          <p className="text-xl font-bold text-orange-600 dark:text-orange-400 mt-1 tabular-nums">{stats.incomplets}</p>
        </Card>
      </div>

      {/* Bandeau d'information sur la gestion visuelle des horaires de nuit */}
      <div className="flex items-start gap-3 rounded-lg border border-indigo-500/20 bg-indigo-500/5 p-4 text-xs text-indigo-900 dark:text-indigo-200">
        <Info className="size-4 shrink-0 text-indigo-600 dark:text-indigo-400 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold text-foreground">
            Gestion visuelle des services de nuit (traversant minuit J+1)
          </p>
          <p className="text-muted-foreground leading-relaxed">
            Pour les postes de nuit (ex: entrée le 25/10 à 22:00 et sortie le 26/10 à 06:00), les événements sont présentés de manière unifiée sur la date de service initiale avec la mention <strong>(+1 jour)</strong>.
            Cette phase 1 assure l&apos;affichage et la navigation sans altérer les règles de calcul brutes de la base officielle.
          </p>
        </div>
      </div>

      {/* Barre de filtres complets */}
      <Card className="p-4 border-border space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          {/* Période début */}
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1">Date début</label>
            <DatePicker value={debut} onChange={(v) => setDebut(v)} />
          </div>

          {/* Période fin */}
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1">Date fin</label>
            <DatePicker value={fin} onChange={(v) => setFin(v)} />
          </div>

          {/* Département */}
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1">Département</label>
            <select
              value={departement}
              onChange={(e) => setDepartement(e.target.value)}
              className="w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none"
            >
              <option value="all">Tous les départements</option>
              {departmentsList.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          {/* Horaire affecté */}
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1">Horaire</label>
            <select
              value={horaireFilter}
              onChange={(e) => setHoraireFilter(e.target.value)}
              className="w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none"
            >
              <option value="all">Tous les horaires</option>
              {configuredHoraires.map((h) => (
                <option key={h.code} value={h.code}>
                  {h.code} {h.nom} ({h.heure_debut} - {h.heure_fin})
                </option>
              ))}
              <option value="NON_DEFINI">Horaire non défini</option>
            </select>
          </div>

          {/* Statut */}
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1">Statut</label>
            <select
              value={statutFilter}
              onChange={(e) => setStatutFilter(e.target.value)}
              className="w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none"
            >
              <option value="all">Tous les statuts</option>
              <option value="Présent">Présent</option>
              <option value="Retard">Retard</option>
              <option value="Pointage incomplet">Pointage incomplet</option>
              <option value="Absent">Absent</option>
              <option value="Horaire non défini">Horaire non défini</option>
            </select>
          </div>

          {/* Recherche personnel */}
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1">Personnel / Matricule</label>
            <div className="relative">
              <Search className="size-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
              <input
                type="text"
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
                placeholder="Nom ou code..."
                className="w-full rounded-md border border-border bg-surface pl-8 pr-2.5 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Boutons d'actions et Exports */}
        <div className="flex items-center justify-between border-t border-border pt-3 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={chargerDonnees}
              disabled={loading}
              className="h-8 text-xs gap-1.5"
            >
              <RotateCcw className={cn("size-3.5 text-primary", loading && "animate-spin")} />
              Actualiser
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={handleExportExcel}
              disabled={exporting || rows.length === 0}
              className="h-8 text-xs gap-1.5"
            >
              <FileSpreadsheet className="size-3.5 text-emerald-600" />
              Excel (.xlsx)
            </Button>
            <Button
              variant="outline"
              onClick={handleExportPdf}
              disabled={exporting || rows.length === 0}
              className="h-8 text-xs gap-1.5"
            >
              <FileText className="size-3.5 text-red-600" />
              PDF (.pdf)
            </Button>
          </div>
        </div>
      </Card>

      {/* Tableau des présences avec affectation horaire */}
      <Card className="border-border overflow-hidden">
        <div className="flex flex-wrap items-center justify-between border-b border-border p-3 text-xs text-muted-foreground gap-2">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-foreground">
              {rows.length} {rows.length > 1 ? "enregistrements trouvés" : "enregistrement trouvé"}
            </span>
            <span className="text-muted-foreground text-[11px] hidden md:inline">
              · Cliquez sur une ligne pour ouvrir le détail complet des pointages
            </span>
          </div>
          {error && <span className="text-danger font-medium">{error}</span>}
        </div>

        <div className="w-full overflow-hidden">
          <table className="w-full border-collapse text-left text-xs table-fixed">
            <thead className="bg-muted text-xs text-muted-foreground">
              <tr>
                <th className="px-1.5 py-2.5 font-medium text-center w-[6%]">Matricule</th>
                <th className="px-2 py-2.5 font-medium w-[18%]">Personnel</th>
                <th className="px-2 py-2.5 font-medium w-[15%]">Département</th>
                <th className="px-1 py-2.5 font-medium text-center w-[9%]">Date service</th>
                <th className="px-1.5 py-2.5 font-medium w-[15%]">Horaire affecté</th>
                <th className="px-1 py-2.5 font-medium text-center w-[7%]">Entrée</th>
                <th className="px-1 py-2.5 font-medium text-center w-[9%]">Sortie</th>
                <th className="px-1 py-2.5 font-medium text-center w-[8%]">Présence</th>
                <th className="px-1.5 py-2.5 font-medium text-center w-[13%]">Statut</th>
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-xs text-muted-foreground">
                    Chargement des pointages et calcul des affectations horaires...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-xs text-muted-foreground">
                    Aucun pointage trouvé pour les critères sélectionnés.
                  </td>
                </tr>
              ) : (
                paginatedRows.map((r, idx) => {
                  const styleStatut = STATUT_STYLES[r.statut] || STATUT_STYLES["Horaire non défini"];

                  return (
                    <tr
                      key={`${r.empCode}_${r.dateService}_${idx}`}
                      onClick={() => handleOpenTimeline(r)}
                      className="border-t border-border hover:bg-muted/50 cursor-pointer transition-colors group"
                      title="Cliquez pour afficher la fiche détaillée"
                    >
                      {/* Matricule */}
                      <td className="px-1.5 py-2 text-center font-mono text-xs text-muted-foreground">
                        {r.empCode}
                      </td>

                      {/* Nom employé */}
                      <td className="px-2 py-2 font-semibold text-foreground truncate" title={r.nomComplet}>
                        <span className="truncate group-hover:text-primary transition-colors block">
                          {r.nomComplet}
                        </span>
                      </td>

                      {/* Département */}
                      <td className="px-2 py-2 text-muted-foreground truncate" title={r.deptName}>
                        <span className="truncate block">{r.deptName}</span>
                      </td>

                      {/* Date service */}
                      <td className="px-1 py-2 text-center tabular-nums whitespace-nowrap text-xs">
                        {formatDateFr(r.dateService)}
                      </td>

                      {/* Horaire affecté automatiquement */}
                      <td className="px-1.5 py-2">
                        {r.horaire?.code && r.horaire.code !== "NON_DEFINI" ? (
                          <div
                            className="inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[11px] font-semibold border max-w-full truncate"
                            style={{
                              backgroundColor: r.horaire.code === "H003" ? "rgba(99, 102, 241, 0.12)" : "rgba(15, 107, 79, 0.08)",
                              borderColor: r.horaire.code === "H003" ? "rgba(99, 102, 241, 0.3)" : "rgba(15, 107, 79, 0.25)",
                              color: r.horaire.code === "H003" ? "#4f46e5" : "#0f6b4f",
                            }}
                            title={`${r.horaire.libelle} (${r.horaire.heureDebut} - ${r.horaire.heureFin})`}
                          >
                            {r.horaire.estNuit ? (
                              <Moon className="size-3 shrink-0" />
                            ) : (
                              <Sun className="size-3 shrink-0" />
                            )}
                            <span className="truncate">{r.horaire.libelle}</span>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground italic">
                            Non défini
                          </span>
                        )}
                      </td>

                      {/* Heure d'entrée */}
                      <td className="px-1 py-2 text-center font-mono tabular-nums text-xs">
                        {r.heureEntree || <span className="text-muted-foreground">-</span>}
                      </td>

                      {/* Heure de sortie */}
                      <td className="px-1 py-2 text-center font-mono tabular-nums text-xs">
                        {r.heureSortie ? (
                          <div className="inline-flex items-center justify-center gap-1">
                            <span>{r.heureSortie}</span>
                            {r.isNightShift && (
                              <span
                                className="rounded px-1 py-0.2 text-[9px] font-bold bg-indigo-500/20 text-indigo-700 dark:text-indigo-300"
                                title="Sortie enregistrée le lendemain matin (+1 jour)"
                              >
                                +1j
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>

                      {/* Durée */}
                      <td className="px-1 py-2 text-center tabular-nums font-medium text-xs whitespace-nowrap">
                        {formatDurationLong(r.dureeMinutes)}
                      </td>

                      {/* Statut */}
                      <td className="px-1.5 py-2 text-center">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium border max-w-full truncate",
                            styleStatut.bg,
                            styleStatut.text
                          )}
                        >
                          <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full", styleStatut.dot)} />
                          <span className="truncate">{r.statut}</span>
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-border p-3 text-xs">
            <span className="text-muted-foreground">
              Page {page} sur {totalPages} ({rows.length} lignes)
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="h-7 px-2"
              >
                <ChevronLeft className="size-3.5" />
              </Button>
              <Button
                variant="outline"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="h-7 px-2"
              >
                <ChevronRight className="size-3.5" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Modale complète de détails et historique des pointages */}
      {selectedRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <Card className="w-full max-w-2xl p-0 overflow-hidden shadow-2xl border-border bg-surface rounded-xl">
            {/* En-tête modal */}
            <div className="p-4 border-b border-border flex items-center justify-between bg-muted/30">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary font-bold text-sm">
                  {(selectedRow.nomComplet || "E").slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-foreground">{selectedRow.nomComplet}</h3>
                    <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border">
                      Matricule #{selectedRow.empCode}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                    <span className="flex items-center gap-1">
                      <Building className="size-3" />
                      {selectedRow.deptName}
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1 font-medium text-foreground">
                      <CalendarClock className="size-3 text-primary" />
                      Service du {formatDateFr(selectedRow.dateService)}
                    </span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRow(null)}
                className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer transition-colors"
                aria-label="Fermer"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* 4 Cartes synthétiques */}
            <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-2.5 bg-muted/10 border-b border-border">
              <div className="p-2.5 rounded-lg bg-surface border border-border">
                <span className="text-[11px] text-muted-foreground font-semibold flex items-center gap-1">
                  <Clock className="size-3 text-primary" /> Horaire affecté
                </span>
                <p className="font-bold text-xs text-primary mt-1">
                  {selectedRow.horaire?.libelle || "Non défini"}
                </p>
                {selectedRow.horaire?.heureDebut && (
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Prévu : {selectedRow.horaire.heureDebut} - {selectedRow.horaire.heureFin}
                  </p>
                )}
              </div>

              <div className="p-2.5 rounded-lg bg-surface border border-border">
                <span className="text-[11px] text-muted-foreground font-semibold flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                  <LogIn className="size-3" /> Entrée réelle
                </span>
                <p className="font-bold text-xs text-foreground mt-1 font-mono">
                  {selectedRow.heureEntree || "-"}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {formatDateFr(selectedRow.dateEntree)}
                </p>
              </div>

              <div className="p-2.5 rounded-lg bg-surface border border-border">
                <span className="text-[11px] text-muted-foreground font-semibold flex items-center gap-1 text-red-600 dark:text-red-400">
                  <LogOut className="size-3" /> Sortie réelle
                </span>
                <p className="font-bold text-xs text-foreground mt-1 font-mono">
                  {selectedRow.heureSortie || "-"}
                  {selectedRow.isNightShift && (
                    <span className="ml-1 text-[10px] text-indigo-600 font-bold bg-indigo-500/10 px-1 py-0.2 rounded">
                      +1j
                    </span>
                  )}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {formatDateFr(selectedRow.dateSortie)}
                </p>
              </div>

              <div className="p-2.5 rounded-lg bg-surface border border-border">
                <span className="text-[11px] text-muted-foreground font-semibold flex items-center gap-1">
                  <History className="size-3 text-foreground" /> Durée & Statut
                </span>
                <p className="font-bold text-xs text-foreground mt-1 tabular-nums">
                  {formatDurationLong(selectedRow.dureeMinutes)}
                </p>
                <div className="mt-0.5">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded px-1.5 py-0.2 text-[10px] font-semibold border",
                      (STATUT_STYLES[selectedRow.statut] || STATUT_STYLES["Horaire non défini"]).bg,
                      (STATUT_STYLES[selectedRow.statut] || STATUT_STYLES["Horaire non défini"]).text
                    )}
                  >
                    {selectedRow.statut}
                  </span>
                </div>
              </div>
            </div>

            {/* Historique des pointages sur badgeuses */}
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <History className="size-3.5 text-primary" />
                  Passages enregistrés sur badgeuses ({selectedRow.nbPointages || 0})
                </h4>
                {selectedRow.isNightShift && (
                  <span className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Moon className="size-2.5" /> Poste de nuit traversant minuit
                  </span>
                )}
              </div>

              {loadingTimeline ? (
                <div className="py-8 text-center text-xs text-muted-foreground space-y-2">
                  <RotateCcw className="size-4 animate-spin mx-auto text-primary" />
                  <p>Interrogation des badgeuses et synchronisation des pointages...</p>
                </div>
              ) : timelineEvents.length > 0 ? (
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {(timelineEvents as Array<{
                    id?: string;
                    heure?: string;
                    jour?: string;
                    label?: string;
                    type?: string;
                    color?: string;
                    lieu?: string;
                    appareil?: string;
                  }>).map((ev, i) => (
                    <div
                      key={ev.id || i}
                      className="flex items-center justify-between p-2.5 rounded-lg bg-muted/20 border border-border hover:bg-muted/40 transition-colors"
                    >
                      <div className="flex items-center gap-2.5">
                        <div
                          className={cn(
                            "flex size-7 items-center justify-center rounded-md text-xs font-bold shrink-0",
                            ev.type === "entree"
                              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                              : ev.type === "sortie"
                              ? "bg-red-500/15 text-red-700 dark:text-red-400"
                              : "bg-indigo-500/15 text-indigo-700 dark:text-indigo-400"
                          )}
                        >
                          {ev.type === "entree" ? (
                            <LogIn className="size-3.5" />
                          ) : (
                            <LogOut className="size-3.5" />
                          )}
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-foreground">{ev.label}</p>
                          <p className="text-[11px] text-muted-foreground flex items-center gap-2 mt-0.5">
                            <span className="flex items-center gap-1">
                              <Tablet className="size-3" /> {ev.appareil || "Badgeuse principale"}
                            </span>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                              <MapPin className="size-3" /> {ev.lieu || "Site OCP"}
                            </span>
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="font-mono font-bold text-sm text-foreground tabular-nums">
                          {ev.heure ? ev.heure.slice(0, 5) : "-"}
                        </span>
                        {ev.jour && (
                          <p className="text-[10px] text-muted-foreground tabular-nums">
                            {formatDateFr(ev.jour)}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : selectedRow.heureEntree || selectedRow.heureSortie ? (
                <div className="space-y-2 max-h-56 overflow-y-auto">
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                    <div className="flex items-center gap-2.5">
                      <div className="flex size-7 items-center justify-center rounded-md bg-emerald-500/15 text-emerald-600">
                        <LogIn className="size-3.5" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-foreground">Entrée de service enregistrée</p>
                        <p className="text-[11px] text-muted-foreground">{formatDateFr(selectedRow.dateEntree)}</p>
                      </div>
                    </div>
                    <span className="font-mono font-bold text-sm tabular-nums text-foreground">
                      {selectedRow.heureEntree || "-"}
                    </span>
                  </div>
                  {selectedRow.heureSortie && (
                    <div className="flex items-center justify-between p-2.5 rounded-lg bg-red-500/5 border border-red-500/20">
                      <div className="flex items-center gap-2.5">
                        <div className="flex size-7 items-center justify-center rounded-md bg-red-500/15 text-red-600">
                          <LogOut className="size-3.5" />
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-foreground">Sortie de service enregistrée</p>
                          <p className="text-[11px] text-muted-foreground">
                            {formatDateFr(selectedRow.dateSortie)}
                            {selectedRow.isNightShift && " (+1 jour)"}
                          </p>
                        </div>
                      </div>
                      <span className="font-mono font-bold text-sm tabular-nums text-foreground">
                        {selectedRow.heureSortie}
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-4 rounded-lg bg-muted/20 border border-border text-center text-xs text-muted-foreground">
                  <AlertTriangle className="size-5 mx-auto mb-1 text-amber-500" />
                  Aucun pointage physique n'a été enregistré pour cet agent sur cette journée.
                </div>
              )}
            </div>

            {/* Pied de modal */}
            <div className="p-3 border-t border-border flex items-center justify-between bg-muted/20">
              <span className="text-[11px] text-muted-foreground">
                Données synchronisées en temps réel depuis ZKBio CVAccess.
              </span>
              <Button variant="outline" onClick={() => setSelectedRow(null)} className="h-8 text-xs font-semibold">
                Fermer
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
