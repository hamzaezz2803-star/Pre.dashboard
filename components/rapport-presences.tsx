"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  Search,
  FileSpreadsheet,
  FileText,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Sliders,
  Clock,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  exportRapportPresenceExcel,
  exportRapportPresencePdf,
  type RapportPresenceRow,
} from "@/lib/export-rapport-presences";
import { getHoraireConfig } from "@/lib/horaire-style";
import { usePerimetre, perimetreExport } from "@/components/perimetre-context";

export function RapportPresences() {
  // Dates par défaut : 30 derniers jours
  const aujourdhui = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const debutParDefaut = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  }, []);

  const [dateDebut, setDateDebut] = useState(debutParDefaut);
  const [dateFin, setDateFin] = useState(aujourdhui);
  const [rechercheTexte, setRechercheTexte] = useState("");
  const perimetreInfo = usePerimetre();
  const perimetre = perimetreExport(perimetreInfo);

  const [rows, setRows] = useState<RapportPresenceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  // Pagination
  const [page, setPage] = useState(1);
  const LIGNES_PAR_PAGE = 10;

  const chargerRapport = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (dateDebut) params.append("debut", dateDebut);
      if (dateFin) params.append("fin", dateFin);
      if (rechercheTexte.trim()) params.append("q", rechercheTexte.trim());

      const res = await fetch(`/api/rapport-presences?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setRows(data.rows || []);
      }
    } catch (e) {
      console.error("Erreur chargement rapport présences", e);
    } finally {
      setLoading(false);
    }
  }, [dateDebut, dateFin, rechercheTexte]);

  useEffect(() => {
    chargerRapport();
  }, [chargerRapport]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    chargerRapport();
  };

  const handleExportExcel = async () => {
    if (rows.length === 0) return;
    setExportingExcel(true);
    try {
      await exportRapportPresenceExcel(rows, dateDebut, dateFin, perimetre);
    } catch (e) {
      console.error("Erreur export Excel", e);
    } finally {
      setExportingExcel(false);
    }
  };

  const handleExportPdf = async () => {
    if (rows.length === 0) return;
    setExportingPdf(true);
    try {
      await exportRapportPresencePdf(rows, dateDebut, dateFin, perimetre);
    } catch (e) {
      console.error("Erreur export PDF", e);
    } finally {
      setExportingPdf(false);
    }
  };

  // Raccourcis de période rapides
  const appliquerPeriode = (mode: "mois" | "7jours" | "tout") => {
    const now = new Date();
    if (mode === "mois") {
      const premierJourMois = new Date(now.getFullYear(), now.getMonth(), 1)
        .toISOString()
        .slice(0, 10);
      setDateDebut(premierJourMois);
      setDateFin(now.toISOString().slice(0, 10));
    } else if (mode === "7jours") {
      const septJoursAvant = new Date();
      septJoursAvant.setDate(now.getDate() - 7);
      setDateDebut(septJoursAvant.toISOString().slice(0, 10));
      setDateFin(now.toISOString().slice(0, 10));
    } else if (mode === "tout") {
      setDateDebut("");
      setDateFin("");
    }
  };

  // Pagination
  const totalPages = Math.max(1, Math.ceil(rows.length / LIGNES_PAR_PAGE));
  const lignesAffichees = useMemo(() => {
    const start = (page - 1) * LIGNES_PAR_PAGE;
    return rows.slice(start, start + LIGNES_PAR_PAGE);
  }, [rows, page]);

  return (
    <div className="w-full space-y-6 px-3 py-5 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      {/* ========================================================= */}
      {/* EN-TÊTE PRINCIPAL HARMONISÉ AVEC LE THÈME DU PROJET OCP */}
      {/* ========================================================= */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border pb-5">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
            <FileSpreadsheet className="size-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                Rapport des présences
              </h1>
              <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold bg-primary/10 text-primary border border-primary/20">
                <Sparkles className="size-3" />
                OCP Pointage
              </span>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
              Suivi officiel des pointages et des horaires affectés aux collaborateurs.
            </p>
          </div>
        </div>

        {/* Bouton retour vers Affectation dynamique */}
        <div className="flex items-center gap-2 flex-wrap self-start sm:self-auto">
          <Link href="/affectation-horaire">
            <Button variant="outline" className="h-9 text-xs font-semibold">
              <Sliders className="size-3.5 mr-1.5" />
              Affectation dynamique
            </Button>
          </Link>
        </div>
      </div>

      {/* ========================================================= */}
      {/* BARRE DE FILTRES ET BOUTONS D'EXPORT */}
      {/* ========================================================= */}
      <Card className="p-4 sm:p-5 border-border shadow-xs bg-surface">
        <form onSubmit={handleSearchSubmit} className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-4">
            {/* Filtres de dates : Du ... Au ... [Rechercher] */}
            <div className="flex flex-wrap items-center gap-3 sm:gap-4">
              {/* Du */}
              <div className="flex items-center gap-2">
                <label className="text-xs sm:text-sm font-semibold text-foreground whitespace-nowrap">
                  Du :
                </label>
                <input
                  type="date"
                  value={dateDebut}
                  onChange={(e) => setDateDebut(e.target.value)}
                  className="h-9 px-3 py-1.5 rounded-md border border-border bg-surface text-xs sm:text-sm font-mono text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary shadow-2xs"
                />
              </div>

              {/* Au */}
              <div className="flex items-center gap-2">
                <label className="text-xs sm:text-sm font-semibold text-foreground whitespace-nowrap">
                  Au :
                </label>
                <input
                  type="date"
                  value={dateFin}
                  onChange={(e) => setDateFin(e.target.value)}
                  className="h-9 px-3 py-1.5 rounded-md border border-border bg-surface text-xs sm:text-sm font-mono text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary shadow-2xs"
                />
              </div>

              {/* Bouton Rechercher aux couleurs du projet */}
              <Button
                type="submit"
                variant="primary"
                disabled={loading}
                className="h-9 px-5 text-xs sm:text-sm font-semibold shadow-xs"
              >
                <Search className={cn("size-3.5 mr-1.5", loading && "animate-spin")} />
                Rechercher
              </Button>
            </div>

            {/* Boutons d'exportation vers Excel et PDF */}
            <div className="flex items-center gap-2 self-end sm:self-auto flex-wrap">
              {/* Exportation Excel */}
              <Button
                type="button"
                variant="outline"
                onClick={handleExportExcel}
                disabled={exportingExcel || rows.length === 0}
                className="h-9 text-xs border-emerald-600/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10 font-semibold shadow-2xs"
                title="Exporter les données affichées au format Excel (.xlsx)"
              >
                <FileSpreadsheet className="size-4 mr-1.5 text-emerald-600" />
                {exportingExcel ? "Génération Excel..." : "Export Excel"}
              </Button>

              {/* Exportation PDF */}
              <Button
                type="button"
                variant="outline"
                onClick={handleExportPdf}
                disabled={exportingPdf || rows.length === 0}
                className="h-9 text-xs border-rose-600/30 text-rose-700 dark:text-rose-400 hover:bg-rose-500/10 font-semibold shadow-2xs"
                title="Exporter le rapport au format PDF (.pdf)"
              >
                <FileText className="size-4 mr-1.5 text-rose-600" />
                {exportingPdf ? "Génération PDF..." : "Export PDF"}
              </Button>
            </div>
          </div>

          {/* Raccourcis temporels et recherche rapide */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/60 text-xs">
            <div className="flex items-center gap-1.5 text-muted-foreground flex-wrap">
              <span className="font-semibold text-foreground mr-1">Période rapide :</span>
              <button
                type="button"
                onClick={() => appliquerPeriode("mois")}
                className="px-2 py-0.5 rounded bg-muted hover:bg-primary/10 hover:text-primary transition-colors cursor-pointer"
              >
                Ce mois
              </button>
              <button
                type="button"
                onClick={() => appliquerPeriode("7jours")}
                className="px-2 py-0.5 rounded bg-muted hover:bg-primary/10 hover:text-primary transition-colors cursor-pointer"
              >
                7 derniers jours
              </button>
              <button
                type="button"
                onClick={() => appliquerPeriode("tout")}
                className="px-2 py-0.5 rounded bg-muted hover:bg-primary/10 hover:text-primary transition-colors cursor-pointer"
              >
                Tout afficher
              </button>
            </div>

            {/* Filtrage textuel instantané */}
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-2 size-3.5 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                value={rechercheTexte}
                onChange={(e) => setRechercheTexte(e.target.value)}
                placeholder="Filtrer par nom ou ID..."
                className="w-full pl-8 pr-3 py-1 rounded border border-border bg-surface text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>
        </form>
      </Card>

      {/* ========================================================= */}
      {/* TABLEAU DES PRÉSENCES (4 COLONNES : ID, Nom Employé, Heure de Pointage, Horaire Affecté) */}
      {/* ========================================================= */}
      <Card className="border-border shadow-xs overflow-hidden bg-surface">
        <div className="flex items-center justify-between border-b border-border px-4 py-3 bg-muted/30 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Clock className="size-4 text-primary" />
            <span className="text-xs sm:text-sm font-bold text-foreground">
              Données de pointage et affectations
            </span>
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
              {rows.length} ligne{rows.length > 1 ? "s" : ""}
            </span>
          </div>

          <Button
            variant="outline"
            onClick={chargerRapport}
            disabled={loading}
            className="h-8 text-xs px-2.5"
          >
            <RotateCcw className={cn("size-3 mr-1", loading && "animate-spin")} />
            Actualiser
          </Button>
        </div>

        {/* Tableau avec les 4 colonnes exactes */}
        <div className="w-full overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs sm:text-sm">
            <thead className="bg-muted/60 text-xs font-semibold text-muted-foreground border-b border-border">
              <tr>
                <th className="px-4 py-3 text-center w-24">ID</th>
                <th className="px-5 py-3">Nom Employé</th>
                <th className="px-5 py-3 text-center">Heure de Pointage</th>
                <th className="px-5 py-3">Horaire Affecté</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-xs text-muted-foreground">
                    Chargement des données du rapport de présences...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-xs text-muted-foreground">
                    Aucun pointage trouvé pour la période sélectionnée.
                  </td>
                </tr>
              ) : (
                lignesAffichees.map((item, idx) => {
                  const estNonDefini = item.horaire_affecte === "Horaire non défini";
                  const isEven = idx % 2 === 0;

                  return (
                    <tr
                      key={`${item.emp_id}-${item.heure_pointage}-${idx}`}
                      className={cn(
                        "transition-colors hover:bg-muted/40",
                        isEven ? "bg-surface" : "bg-muted/15"
                      )}
                    >
                      {/* ID */}
                      <td className="px-4 py-3 text-center font-mono font-bold text-foreground">
                        <span className="inline-flex rounded px-2.5 py-0.5 bg-muted font-mono text-xs">
                          {item.emp_id}
                        </span>
                      </td>

                      {/* Nom Employé */}
                      <td className="px-5 py-3 font-semibold text-foreground">
                        {item.nom_employe}
                      </td>

                      {/* Heure de Pointage */}
                      <td className="px-5 py-3 text-center font-mono text-xs text-foreground font-medium">
                        {item.heure_pointage || "--"}
                      </td>

                      {/* Horaire Affecté */}
                      <td className="px-5 py-3">
                        {estNonDefini ? (
                          <span className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20">
                            Horaire non défini
                          </span>
                        ) : (() => {
                          const cfg = getHoraireConfig(item.horaire_affecte);
                          const Icon = cfg.Icon;
                          return (
                            <span
                              className={cn(
                                "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold border",
                                cfg.badgeClass
                              )}
                              title={`Horaire : ${item.horaire_affecte}${cfg.isNight ? " (Service de nuit — sortie le lendemain J+1)" : ""}`}
                            >
                              <Icon className="size-3 shrink-0" />
                              <span>{item.horaire_affecte}</span>
                              {cfg.isNight && (
                                <span className="text-[10px] font-bold opacity-80">(J+1)</span>
                              )}
                            </span>
                          );
                        })()}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {rows.length > LIGNES_PAR_PAGE && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/20 text-xs text-muted-foreground flex-wrap gap-2">
            <span>
              Affichage de {(page - 1) * LIGNES_PAR_PAGE + 1} à{" "}
              {Math.min(page * LIGNES_PAR_PAGE, rows.length)} sur {rows.length} lignes
            </span>

            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="h-8 px-2 text-xs"
              >
                <ChevronLeft className="size-3.5" />
                Précédent
              </Button>
              <span className="px-2 font-semibold text-foreground">
                {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="h-8 px-2 text-xs"
              >
                Suivant
                <ChevronRight className="size-3.5" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
