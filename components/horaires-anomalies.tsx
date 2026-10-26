"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  AlertTriangle,
  Search,
  RotateCcw,
  FileSpreadsheet,
  FileText,
  CheckCircle2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  UserX,
  ClockAlert,
  HelpCircle as QuestionIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { currentMonthRange, formatDateFr } from "@/lib/dates";
import { cn } from "@/lib/utils";

interface RawSuiviRow {
  empCode: string | number;
  nomComplet: string;
  deptName: string;
  dateService: string;
  horaire?: { code?: string; libelle?: string; heureDebut?: string };
  heureEntree?: string | null;
  heureSortie?: string | null;
  statut: string;
}

interface AnomalieItem {
  id: string;
  empCode: string | number;
  nomComplet: string;
  deptName: string;
  dateService: string;
  horaire: string;
  heureEntree: string | null;
  heureSortie: string | null;
  typeAnomalie: "retard" | "sortie_manquante" | "absence" | "horaire_non_reconnu";
  libelleAnomalie: string;
  gravite: "haute" | "moyenne" | "faible";
  explication: string;
  actionRecommandee: string;
}

const GRAVITE_STYLES = {
  haute: {
    badge: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30",
    dot: "bg-red-500",
    label: "Critique",
  },
  moyenne: {
    badge: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
    dot: "bg-amber-500",
    label: "Moyenne",
  },
  faible: {
    badge: "bg-slate-500/15 text-slate-700 dark:text-slate-400 border-slate-500/30",
    dot: "bg-slate-400",
    label: "À vérifier",
  },
};

const PAGE_SIZE = 25;

export function HorairesAnomalies() {
  const defaults = currentMonthRange();
  const [debut, setDebut] = useState(defaults.from);
  const [fin, setFin] = useState(defaults.to);
  const [departement, setDepartement] = useState("all");
  const [recherche, setRecherche] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  const [departmentsList, setDepartmentsList] = useState<string[]>([]);
  const [anomalies, setAnomalies] = useState<AnomalieItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Pagination
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);

  // Chargement départements
  useEffect(() => {
    fetch("/api/presence/departements")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setDepartmentsList(data);
      })
      .catch(() => {});
  }, []);

  const analyserDonnees = useCallback((rows: RawSuiviRow[]) => {
    const anomaliesList: AnomalieItem[] = [];

    rows.forEach((r, idx) => {
      const id = `${r.empCode}_${r.dateService}_${idx}`;
      const horaireNom = r.horaire?.libelle || "Non défini";

      // 1. Absence
      if (r.statut === "Absent" || (!r.heureEntree && !r.heureSortie)) {
        anomaliesList.push({
          id: `${id}_abs`,
          empCode: r.empCode,
          nomComplet: r.nomComplet,
          deptName: r.deptName,
          dateService: r.dateService,
          horaire: horaireNom,
          heureEntree: null,
          heureSortie: null,
          typeAnomalie: "absence",
          libelleAnomalie: "Absence constatée",
          gravite: "haute",
          explication: "Aucun pointage détecté sur le créneau de service planifié.",
          actionRecommandee: "Justificatif d'absence ou régularisation RH requise",
        });
      }
      // 2. Retard
      else if (r.statut === "Retard") {
        anomaliesList.push({
          id: `${id}_ret`,
          empCode: r.empCode,
          nomComplet: r.nomComplet,
          deptName: r.deptName,
          dateService: r.dateService,
          horaire: horaireNom,
          heureEntree: r.heureEntree || null,
          heureSortie: r.heureSortie || null,
          typeAnomalie: "retard",
          libelleAnomalie: "Retard à la prise de poste",
          gravite: "moyenne",
          explication: `Entrée enregistrée à ${r.heureEntree} (horaire prévu : ${r.horaire?.heureDebut || "08:00"}).`,
          actionRecommandee: "Validation par le responsable d'exploitation",
        });
      }
      // 3. Sortie manquante ou pointage incomplet
      else if (r.statut === "Pointage incomplet" || (r.heureEntree && !r.heureSortie)) {
        anomaliesList.push({
          id: `${id}_sm`,
          empCode: r.empCode,
          nomComplet: r.nomComplet,
          deptName: r.deptName,
          dateService: r.dateService,
          horaire: horaireNom,
          heureEntree: r.heureEntree || null,
          heureSortie: null,
          typeAnomalie: "sortie_manquante",
          libelleAnomalie: "Sortie non enregistrée",
          gravite: "moyenne",
          explication: "L'employé a badgé à l'entrée mais aucune sortie n'a été saisie sur badgeuse.",
          actionRecommandee: "Vérifier badgeuse sortie ou déclaration manuelle",
        });
      }
      // 4. Horaire non reconnu / non défini
      else if (r.horaire?.code === "NON_DEFINI" || r.statut === "Horaire non défini") {
        anomaliesList.push({
          id: `${id}_hnr`,
          empCode: r.empCode,
          nomComplet: r.nomComplet,
          deptName: r.deptName,
          dateService: r.dateService,
          horaire: "Non défini",
          heureEntree: r.heureEntree || null,
          heureSortie: r.heureSortie || null,
          typeAnomalie: "horaire_non_reconnu",
          libelleAnomalie: "Horaire non reconnu",
          gravite: "faible",
          explication: `Pointages ${r.heureEntree} - ${r.heureSortie} hors des créneaux H001, H002, H003.`,
          actionRecommandee: "Paramétrer un nouvel horaire correspondant",
        });
      }
    });

    return anomaliesList;
  }, []);

  // Chargement des données brutes et détection des anomalies
  const chargerAnomalies = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (debut) qs.set("debut", debut);
      if (fin) qs.set("fin", fin);
      if (departement && departement !== "all") qs.set("departement", departement);
      if (recherche) qs.set("personnel", recherche);

      const res = await fetch(`/api/horaires/suivi?${qs.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur de chargement des données");

      const rows = data.rows || [];
      const anomaliesList = analyserDonnees(rows);

      setAnomalies(anomaliesList);
      setPage(1);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur inattendue");
    } finally {
      setLoading(false);
    }
  }, [debut, fin, departement, recherche, analyserDonnees]);

  useEffect(() => {
    let active = true;
    const qs = new URLSearchParams();
    if (debut) qs.set("debut", debut);
    if (fin) qs.set("fin", fin);
    if (departement && departement !== "all") qs.set("departement", departement);
    if (recherche) qs.set("personnel", recherche);

    fetch(`/api/horaires/suivi?${qs.toString()}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (active && data) {
          const list = analyserDonnees(data.rows || []);
          setAnomalies(list);
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
  }, [debut, fin, departement, recherche, analyserDonnees]);

  // Filtrage par type d'anomalie
  const filteredAnomalies = useMemo(() => {
    if (typeFilter === "all") return anomalies;
    return anomalies.filter((a) => a.typeAnomalie === typeFilter);
  }, [anomalies, typeFilter]);

  // Statistiques
  const stats = useMemo(() => {
    const total = anomalies.length;
    const retards = anomalies.filter((a) => a.typeAnomalie === "retard").length;
    const sortiesManquantes = anomalies.filter((a) => a.typeAnomalie === "sortie_manquante").length;
    const absences = anomalies.filter((a) => a.typeAnomalie === "absence").length;
    const horairesNonReconnus = anomalies.filter((a) => a.typeAnomalie === "horaire_non_reconnu").length;
    return { total, retards, sortiesManquantes, absences, horairesNonReconnus };
  }, [anomalies]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredAnomalies.length / PAGE_SIZE));
  const paginatedRows = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredAnomalies.slice(start, start + PAGE_SIZE);
  }, [filteredAnomalies, page]);

  // Export Excel
  const handleExportExcel = async () => {
    setExporting(true);
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Anomalies de pointage");

      ws.columns = [
        { header: "Matricule", key: "empCode", width: 12 },
        { header: "Nom et Prénom", key: "nomComplet", width: 25 },
        { header: "Département", key: "deptName", width: 22 },
        { header: "Date Service", key: "dateService", width: 14 },
        { header: "Type Anomalie", key: "anomalie", width: 24 },
        { header: "Criticité", key: "gravite", width: 14 },
        { header: "Explication", key: "explication", width: 35 },
        { header: "Action Recommandée", key: "action", width: 35 },
      ];

      ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
      ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFB42318" } };

      filteredAnomalies.forEach((a) => {
        ws.addRow({
          empCode: a.empCode,
          nomComplet: a.nomComplet,
          deptName: a.deptName,
          dateService: formatDateFr(a.dateService),
          anomalie: a.libelleAnomalie,
          gravite: a.gravite.toUpperCase(),
          explication: a.explication,
          action: a.actionRecommandee,
        });
      });

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `anomalies_pointages_${debut}_${fin}.xlsx`;
      link.click();
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
      doc.text("OCP Phosboucraâ - Rapport des anomalies de pointage", 14, 15);
      doc.setFontSize(9);
      doc.text(`Période : ${formatDateFr(debut)} au ${formatDateFr(fin)} | Total : ${filteredAnomalies.length} anomalies détectées`, 14, 21);

      const tableData = filteredAnomalies.map((a) => [
        String(a.empCode),
        a.nomComplet,
        a.deptName,
        formatDateFr(a.dateService),
        a.libelleAnomalie,
        a.gravite.toUpperCase(),
        a.explication,
        a.actionRecommandee,
      ]);

      autoTable(doc, {
        startY: 26,
        head: [["ID", "Personnel", "Département", "Date", "Anomalie", "Gravité", "Explication", "Action Recommandée"]],
        body: tableData,
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [180, 35, 24], textColor: [255, 255, 255], fontStyle: "bold" },
      });

      doc.save(`rapport_anomalies_${debut}_${fin}.pdf`);
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
          <div className="flex size-9 items-center justify-center rounded-lg bg-danger/10 text-danger">
            <AlertTriangle className="size-5" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              Anomalies de pointage et présences
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Détection et diagnostic des retards, sorties manquantes, absences et horaires non reconnus.
            </p>
          </div>
        </div>
      </div>

      {/* Cartes KPI d'anomalies */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Card className="p-3.5 border-border">
          <span className="text-xs text-muted-foreground">Total Anomalies</span>
          <p className="text-xl font-bold text-foreground mt-1 tabular-nums">{stats.total}</p>
        </Card>
        <Card className="p-3.5 border-border">
          <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">Retards</span>
          <p className="text-xl font-bold text-amber-600 dark:text-amber-400 mt-1 tabular-nums">{stats.retards}</p>
        </Card>
        <Card className="p-3.5 border-border">
          <span className="text-xs text-orange-600 dark:text-orange-400 font-medium">Sorties manquantes</span>
          <p className="text-xl font-bold text-orange-600 dark:text-orange-400 mt-1 tabular-nums">{stats.sortiesManquantes}</p>
        </Card>
        <Card className="p-3.5 border-border">
          <span className="text-xs text-red-600 dark:text-red-400 font-medium">Absences</span>
          <p className="text-xl font-bold text-red-600 dark:text-red-400 mt-1 tabular-nums">{stats.absences}</p>
        </Card>
        <Card className="p-3.5 border-border col-span-2 sm:col-span-1">
          <span className="text-xs text-slate-600 dark:text-slate-400 font-medium">Horaires non reconnus</span>
          <p className="text-xl font-bold text-slate-600 dark:text-slate-400 mt-1 tabular-nums">{stats.horairesNonReconnus}</p>
        </Card>
      </div>

      {/* Filtres */}
      <Card className="p-4 border-border space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
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

          {/* Type d'anomalie */}
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1">Type d&apos;anomalie</label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none"
            >
              <option value="all">Toutes les anomalies</option>
              <option value="retard">Retards uniquement</option>
              <option value="sortie_manquante">Sorties manquantes</option>
              <option value="absence">Absences constatées</option>
              <option value="horaire_non_reconnu">Horaires non reconnus</option>
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
          <Button
            variant="outline"
            onClick={chargerAnomalies}
            disabled={loading}
            className="h-8 text-xs gap-1.5"
          >
            <RotateCcw className={cn("size-3.5 text-primary", loading && "animate-spin")} />
            Actualiser
          </Button>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={handleExportExcel}
              disabled={exporting || filteredAnomalies.length === 0}
              className="h-8 text-xs gap-1.5"
            >
              <FileSpreadsheet className="size-3.5 text-emerald-600" />
              Excel (.xlsx)
            </Button>
            <Button
              variant="outline"
              onClick={handleExportPdf}
              disabled={exporting || filteredAnomalies.length === 0}
              className="h-8 text-xs gap-1.5"
            >
              <FileText className="size-3.5 text-red-600" />
              PDF (.pdf)
            </Button>
          </div>
        </div>
      </Card>

      {/* Tableau des anomalies */}
      <Card className="border-border">
        <div className="flex items-center justify-between border-b border-border p-3 text-xs text-muted-foreground">
          <span>
            {filteredAnomalies.length} {filteredAnomalies.length > 1 ? "anomalies détectées" : "anomalie détectée"}
          </span>
          {error && <span className="text-danger font-medium">{error}</span>}
        </div>

        <div className="overflow-x-auto w-full">
          <table className="w-full border-collapse text-left text-xs table-fixed">
            <thead className="bg-muted text-xs text-muted-foreground">
              <tr>
                <th className="px-2.5 py-2.5 font-medium w-[7%]">Matricule</th>
                <th className="px-2.5 py-2.5 font-medium w-[17%]">Personnel</th>
                <th className="px-2.5 py-2.5 font-medium w-[14%]">Département</th>
                <th className="px-2.5 py-2.5 font-medium w-[9%]">Date service</th>
                <th className="px-2.5 py-2.5 font-medium w-[15%]">Type d&apos;anomalie</th>
                <th className="px-2.5 py-2.5 font-medium text-center w-[8%]">Gravité</th>
                <th className="px-2.5 py-2.5 font-medium w-[18%]">Diagnostic / Explication</th>
                <th className="px-2.5 py-2.5 font-medium w-[12%]">Action recommandée</th>
              </tr>
            </thead>
            <tbody>
              {loading && anomalies.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-xs text-muted-foreground">
                    Analyse des pointages et détection des anomalies en cours...
                  </td>
                </tr>
              ) : filteredAnomalies.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-xs text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="size-6 mx-auto mb-2 opacity-80" />
                    Aucune anomalie constatée pour ces critères !
                  </td>
                </tr>
              ) : (
                paginatedRows.map((a) => {
                  const styleGravite = GRAVITE_STYLES[a.gravite];

                  return (
                    <tr
                      key={a.id}
                      className="border-t border-border hover:bg-muted/40 transition-colors"
                    >
                      {/* Matricule */}
                      <td className="px-2.5 py-2.5 font-mono text-xs text-muted-foreground">
                        {a.empCode}
                      </td>

                      {/* Personnel */}
                      <td className="px-2.5 py-2.5 font-semibold text-foreground truncate" title={a.nomComplet}>
                        {a.nomComplet}
                      </td>

                      {/* Département */}
                      <td className="px-2.5 py-2.5 text-muted-foreground truncate" title={a.deptName}>
                        {a.deptName}
                      </td>

                      {/* Date service */}
                      <td className="px-2.5 py-2.5 tabular-nums whitespace-nowrap">
                        {formatDateFr(a.dateService)}
                      </td>

                      {/* Type d'anomalie */}
                      <td className="px-2.5 py-2.5">
                        <div className="flex items-center gap-1.5 font-medium text-foreground">
                          {a.typeAnomalie === "retard" && (
                            <ClockAlert className="size-3.5 text-amber-500 shrink-0" />
                          )}
                          {a.typeAnomalie === "absence" && (
                            <UserX className="size-3.5 text-red-500 shrink-0" />
                          )}
                          {a.typeAnomalie === "sortie_manquante" && (
                            <AlertCircle className="size-3.5 text-orange-500 shrink-0" />
                          )}
                          {a.typeAnomalie === "horaire_non_reconnu" && (
                            <QuestionIcon className="size-3.5 text-slate-500 shrink-0" />
                          )}
                          <span className="truncate">{a.libelleAnomalie}</span>
                        </div>
                      </td>

                      {/* Gravité */}
                      <td className="px-2.5 py-2.5 text-center">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold border",
                            styleGravite.badge
                          )}
                        >
                          <span className={cn("size-1.5 rounded-full", styleGravite.dot)} />
                          <span>{styleGravite.label}</span>
                        </span>
                      </td>

                      {/* Diagnostic / Explication */}
                      <td className="px-2.5 py-2.5 text-xs text-muted-foreground truncate" title={a.explication}>
                        {a.explication}
                      </td>

                      {/* Action recommandée */}
                      <td className="px-2.5 py-2.5 text-xs font-medium text-foreground truncate" title={a.actionRecommandee}>
                        <span className="inline-flex items-center gap-1 text-[11px] text-primary">
                          <ArrowRight className="size-3 shrink-0" />
                          <span className="truncate">{a.actionRecommandee}</span>
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
              Page {page} sur {totalPages} ({filteredAnomalies.length} anomalies)
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
    </div>
  );
}
