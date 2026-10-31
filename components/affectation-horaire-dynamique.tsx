"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  Users,
  Clock,
  Search,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  Sliders,
  Moon,
  Pencil,
  Trash2,
  Power,
  FileSpreadsheet,
  Plus,
  Play,
  X,
  Check,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { getHoraireConfig } from "@/lib/horaire-style";

// --- Types ---
export interface DepartementItem {
  id: string;
  code: string | null;
  name: string;
}

export interface EmployeItem {
  id: string;
  matricule: string;
  nom: string;
  prenom: string;
  departement_id: string | null;
  departement: string;
  actif?: boolean;
}

export interface CvAccessHoraireItem {
  cvaccess_horaire_id: string;
  period_name: string;
  to_work_time: string | null;
  off_work_time: string | null;
  working_hours: number | null;
  start_sign_in_time: string | null;
  end_sign_off_time: string | null;
  to_work_time_clean?: string;
  off_work_time_clean?: string;
  is_night?: boolean;
}

export interface RegleHoraireItem {
  id: number;
  heure_debut: string;
  heure_fin: string;
  cvaccess_horaire_id: string;
  jours_semaine?: number[]; // 1 = Lundi ... 7 = Dimanche
  actif: boolean;
  date_creation?: string;
  period_name?: string;
  to_work_time?: string;
  off_work_time?: string;
  working_hours?: number;
  est_nuit?: boolean;
}

const JOURS_SEMAINE = [
  { id: 1, court: "Lun", lettre: "L", nom: "Lundi" },
  { id: 2, court: "Mar", lettre: "M", nom: "Mardi" },
  { id: 3, court: "Mer", lettre: "M", nom: "Mercredi" },
  { id: 4, court: "Jeu", lettre: "J", nom: "Jeudi" },
  { id: 5, court: "Ven", lettre: "V", nom: "Vendredi" },
  { id: 6, court: "Sam", lettre: "S", nom: "Samedi" },
  { id: 7, court: "Dim", lettre: "D", nom: "Dimanche" },
];

function timeToMinutes(t: string): number {
  if (!t) return 0;
  const [h, m] = t.slice(0, 5).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function isTimeInWindow(testTime: string, startTime: string, endTime: string): boolean {
  const t = timeToMinutes(testTime);
  const s = timeToMinutes(startTime);
  const e = timeToMinutes(endTime);
  if (s <= e) return t >= s && t <= e;
  return t >= s || t <= e; // traverse minuit
}

function rangesOverlap(startA: string, endA: string, startB: string, endB: string): boolean {
  const sA = timeToMinutes(startA);
  const eA = timeToMinutes(endA);
  const sB = timeToMinutes(startB);
  const eB = timeToMinutes(endB);
  const intA = eA >= sA ? [[sA, eA]] : [[sA, 1440], [0, eA]];
  const intB = eB >= sB ? [[sB, eB]] : [[sB, 1440], [0, eB]];
  for (const [s1, e1] of intA) {
    for (const [s2, e2] of intB) {
      if (Math.max(s1, s2) < Math.min(e1, e2)) return true;
    }
  }
  return false;
}

function daysOverlap(daysA: number[], daysB?: number[]): boolean {
  const setA = new Set(daysA && daysA.length > 0 ? daysA : [1, 2, 3, 4, 5, 6, 7]);
  const setB = new Set(daysB && daysB.length > 0 ? daysB : [1, 2, 3, 4, 5, 6, 7]);
  for (const d of setA) {
    if (setB.has(d)) return true;
  }
  return false;
}

function formatJours(jours?: number[]): string {
  if (!jours || jours.length === 0 || jours.length === 7) return "Tous les jours";
  const s = [...jours].sort((a, b) => a - b).join(",");
  if (s === "1,2,3,4,5") return "Lun – Ven";
  if (s === "6,7") return "Sam – Dim";
  return jours.map((id) => JOURS_SEMAINE.find((j) => j.id === id)?.court || id).join(", ");
}

export function AffectationHoraireDynamique() {
  // -------------------------------------------------------------
  // DONNÉES EMPLOYÉS
  // -------------------------------------------------------------
  const [departements, setDepartements] = useState<DepartementItem[]>([]);
  const [selectedDeptId, setSelectedDeptId] = useState<string>("all");
  const [rechercheEmploye, setRechercheEmploye] = useState("");
  const [employes, setEmployes] = useState<EmployeItem[]>([]);
  const [loadingEmployes, setLoadingEmployes] = useState(true);

  const [selectedEmployeIds, setSelectedEmployeIds] = useState<Set<string>>(new Set());
  const [savedEmployeIds, setSavedEmployeIds] = useState<Set<string>>(new Set());
  const [selectionLoaded, setSelectionLoaded] = useState(false);
  const [savingSelection, setSavingSelection] = useState(false);

  const [pageEmployes, setPageEmployes] = useState(1);
  const [togglingTous, setTogglingTous] = useState(false);
  const EMPLOYES_PAR_PAGE = 8;

  // -------------------------------------------------------------
  // DONNÉES RÈGLES HORAIRES
  // -------------------------------------------------------------
  const [cvHoraires, setCvHoraires] = useState<CvAccessHoraireItem[]>([]);
  const [regles, setRegles] = useState<RegleHoraireItem[]>([]);
  const [loadingRegles, setLoadingRegles] = useState(true);

  // Modal création / édition de règle
  const [modalRegleOuverte, setModalRegleOuverte] = useState(false);
  const [editingRegleId, setEditingRegleId] = useState<number | null>(null);
  const [formHeureDebut, setFormHeureDebut] = useState("07:00");
  const [formHeureFin, setFormHeureFin] = useState("08:59");
  const [formSelectedHoraireId, setFormSelectedHoraireId] = useState("");
  const [formJoursSemaine, setFormJoursSemaine] = useState<number[]>([1, 2, 3, 4, 5, 6, 7]);
  const [submittingRegle, setSubmittingRegle] = useState(false);

  // Modal suppression
  const [deletingRegle, setDeletingRegle] = useState<RegleHoraireItem | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  // Modal simulateur (« Tester une règle »)
  const [modalSimulateurOuverte, setModalSimulateurOuverte] = useState(false);
  const [simulatedTime, setSimulatedTime] = useState("07:45");
  const [simulatedDay, setSimulatedDay] = useState<number>(() => {
    const d = new Date().getDay();
    return d === 0 ? 7 : d;
  });

  // Notifications simples
  const [messageSucces, setMessageSucces] = useState<string | null>(null);
  const [messageErreur, setMessageErreur] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  // Détection des modifications non enregistrées pour les employés
  const hasUnsavedChanges = useMemo(() => {
    if (!selectionLoaded) return false;
    if (selectedEmployeIds.size !== savedEmployeIds.size) return true;
    for (const id of selectedEmployeIds) {
      if (!savedEmployeIds.has(id)) return true;
    }
    return false;
  }, [selectedEmployeIds, savedEmployeIds, selectionLoaded]);

  // -------------------------------------------------------------
  // CHARGEMENT
  // -------------------------------------------------------------
  const chargerDepartements = useCallback(async () => {
    try {
      const res = await fetch("/api/affectation-horaire/departements");
      if (res.ok) {
        const data = await res.json();
        setDepartements(data.departements || []);
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  const chargerEmployes = useCallback(
    async (isRefresh = false) => {
      try {
        setLoadingEmployes(true);
        const params = new URLSearchParams();
        if (selectedDeptId && selectedDeptId !== "all") params.append("deptId", selectedDeptId);
        if (rechercheEmploye.trim()) params.append("q", rechercheEmploye.trim());

        const res = await fetch(`/api/affectation-horaire/employes?${params.toString()}`);
        if (res.ok) {
          const data = await res.json();
          setEmployes(data.employes || []);

          if (!selectionLoaded || isRefresh) {
            let activeSet: Set<string>;
            if (Array.isArray(data.activeIds)) {
              activeSet = new Set(data.activeIds);
            } else if (Array.isArray(data.employes)) {
              activeSet = new Set(
                data.employes.filter((e: EmployeItem) => e.actif).map((e: EmployeItem) => e.id)
              );
            } else {
              activeSet = new Set();
            }
            setSelectedEmployeIds(new Set(activeSet));
            setSavedEmployeIds(new Set(activeSet));
            setSelectionLoaded(true);
          }
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingEmployes(false);
      }
    },
    [selectedDeptId, rechercheEmploye, selectionLoaded]
  );

  const chargerCvHoraires = useCallback(async () => {
    try {
      const res = await fetch("/api/affectation-horaire/cvaccess-horaires");
      if (res.ok) {
        const data = await res.json();
        const list = data.horaires || [];
        setCvHoraires(list);
        if (list.length > 0 && !formSelectedHoraireId) {
          setFormSelectedHoraireId(list[0].cvaccess_horaire_id);
        }
      }
    } catch (e) {
      console.error(e);
    }
  }, [formSelectedHoraireId]);

  const chargerRegles = useCallback(async () => {
    try {
      setLoadingRegles(true);
      const res = await fetch("/api/affectation-horaire/regles");
      if (res.ok) {
        const data = await res.json();
        setRegles(data.regles || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingRegles(false);
    }
  }, []);

  useEffect(() => {
    chargerDepartements();
    chargerCvHoraires();
    chargerRegles();
  }, [chargerDepartements, chargerCvHoraires, chargerRegles]);

  useEffect(() => {
    const timer = setTimeout(() => {
      chargerEmployes();
    }, 250);
    return () => clearTimeout(timer);
  }, [chargerEmployes]);

  // Synchronisation CVAccess
  const handleSync = async () => {
    setSyncing(true);
    setMessageErreur(null);
    setMessageSucces(null);
    try {
      const res = await fetch("/api/affectation-horaire/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok || data.success === false) {
        throw new Error(data.error || "Erreur de synchronisation.");
      }
      setMessageSucces("Synchronisation avec CVAccess réussie.");
      await Promise.all([chargerDepartements(), chargerEmployes(true), chargerCvHoraires(), chargerRegles()]);
    } catch (err: unknown) {
      setMessageErreur(err instanceof Error ? err.message : "Erreur de synchronisation.");
    } finally {
      setSyncing(false);
    }
  };

  // -------------------------------------------------------------
  // ACTIONS EMPLOYÉS
  // -------------------------------------------------------------
  const toggleEmploye = (id: string) => {
    setSelectedEmployeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const appliquerSelectionIds = (ids: string[], activer: boolean) => {
    setSelectedEmployeIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (activer) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  };

  const handleToggleTousDepartement = async () => {
    if (togglingTous) return;
    setTogglingTous(true);
    setMessageErreur(null);
    try {
      const params = new URLSearchParams({ idsOnly: "1" });
      if (selectedDeptId && selectedDeptId !== "all") params.append("deptId", selectedDeptId);

      const res = await fetch(`/api/affectation-horaire/employes?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Impossible de charger les employés du département.");
      }

      const ids: string[] = Array.isArray(data.ids) && data.ids.length > 0
        ? data.ids
        : employes.map((e) => e.id);

      if (ids.length === 0) return;

      const tousDejaActifs = ids.every((id) => selectedEmployeIds.has(id));
      appliquerSelectionIds(ids, !tousDejaActifs);
    } catch (err: unknown) {
      setMessageErreur(err instanceof Error ? err.message : "Échec de la sélection groupée.");
    } finally {
      setTogglingTous(false);
    }
  };

  const handleEnregistrerEmployes = async () => {
    setSavingSelection(true);
    setMessageErreur(null);
    setMessageSucces(null);
    try {
      const activeList = Array.from(selectedEmployeIds);
      const res = await fetch("/api/affectation-horaire/enregistrer-employes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activeIds: activeList }),
      });
      const data = await res.json();
      if (!res.ok || data.success === false) {
        throw new Error(data.error || "Erreur lors de l'enregistrement.");
      }
      setMessageSucces(`Sélection enregistrée (${activeList.length} employé(s) activé(s)).`);
      setSavedEmployeIds(new Set(selectedEmployeIds));
      await chargerEmployes(true);
    } catch (err: unknown) {
      setMessageErreur(err instanceof Error ? err.message : "Échec de l'enregistrement.");
    } finally {
      setSavingSelection(false);
    }
  };

  // Pagination employés
  const totalPagesEmployes = Math.max(1, Math.ceil(employes.length / EMPLOYES_PAR_PAGE));
  const employesAffiches = useMemo(() => {
    const start = (pageEmployes - 1) * EMPLOYES_PAR_PAGE;
    return employes.slice(start, start + EMPLOYES_PAR_PAGE);
  }, [employes, pageEmployes]);

  const nbActivesDansListe = useMemo(
    () => employes.reduce((n, e) => n + (selectedEmployeIds.has(e.id) ? 1 : 0), 0),
    [employes, selectedEmployeIds]
  );
  const tousActivesDansListe = employes.length > 0 && nbActivesDansListe === employes.length;
  const deptSelectionne = departements.find((d) => d.id === selectedDeptId);
  const libelleDeptSelectionne =
    selectedDeptId === "all"
      ? "tous les départements"
      : deptSelectionne?.name || "ce département";

  // -------------------------------------------------------------
  // GESTION DES RÈGLES
  // -------------------------------------------------------------
  const ouvrirAjoutRegle = () => {
    setEditingRegleId(null);
    setFormHeureDebut("07:00");
    setFormHeureFin("08:59");
    setFormJoursSemaine([1, 2, 3, 4, 5, 6, 7]);
    if (cvHoraires.length > 0) {
      setFormSelectedHoraireId(cvHoraires[0].cvaccess_horaire_id);
    }
    setModalRegleOuverte(true);
  };

  const ouvrirEditionRegle = (regle: RegleHoraireItem) => {
    setEditingRegleId(regle.id);
    setFormHeureDebut(regle.heure_debut);
    setFormHeureFin(regle.heure_fin);
    setFormSelectedHoraireId(regle.cvaccess_horaire_id);
    setFormJoursSemaine(regle.jours_semaine && regle.jours_semaine.length > 0 ? regle.jours_semaine : [1, 2, 3, 4, 5, 6, 7]);
    setModalRegleOuverte(true);
  };

  // Conflit direct sous les champs
  const regleEnConflit = useMemo(() => {
    if (!formHeureDebut || !formHeureFin) return null;
    return (
      regles.find(
        (r) =>
          r.id !== editingRegleId &&
          r.actif &&
          rangesOverlap(formHeureDebut, formHeureFin, r.heure_debut, r.heure_fin) &&
          daysOverlap(formJoursSemaine, r.jours_semaine)
      ) || null
    );
  }, [regles, editingRegleId, formHeureDebut, formHeureFin, formJoursSemaine]);

  const handleSaveRegle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formHeureDebut || !formHeureFin || !formSelectedHoraireId) {
      setMessageErreur("Veuillez renseigner les heures de début, de fin et choisir un horaire.");
      return;
    }
    if (formJoursSemaine.length === 0) {
      setMessageErreur("Veuillez sélectionner au moins un jour d'application.");
      return;
    }

    setSubmittingRegle(true);
    setMessageErreur(null);
    setMessageSucces(null);

    try {
      const isEditing = editingRegleId !== null;
      const res = await fetch("/api/affectation-horaire/regles", {
        method: isEditing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingRegleId,
          heure_debut: formHeureDebut,
          heure_fin: formHeureFin,
          cvaccess_horaire_id: formSelectedHoraireId,
          jours_semaine: formJoursSemaine,
          actif: true,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur d'enregistrement.");

      setMessageSucces(isEditing ? "Règle horaire modifiée." : "Règle horaire ajoutée.");
      setModalRegleOuverte(false);
      chargerRegles();
    } catch (err: unknown) {
      setMessageErreur(err instanceof Error ? err.message : "Erreur inattendue.");
    } finally {
      setSubmittingRegle(false);
    }
  };

  const handleToggleActif = async (regle: RegleHoraireItem) => {
    setTogglingId(regle.id);
    try {
      const res = await fetch(`/api/affectation-horaire/regles?id=${regle.id}`, { method: "PATCH" });
      if (!res.ok) throw new Error("Erreur de statut.");
      chargerRegles();
    } catch (err: unknown) {
      setMessageErreur(err instanceof Error ? err.message : "Erreur lors du changement de statut.");
    } finally {
      setTogglingId(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingRegle) return;
    try {
      const res = await fetch(`/api/affectation-horaire/regles?id=${deletingRegle.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Erreur de suppression.");
      setMessageSucces("Règle supprimée.");
      setDeletingRegle(null);
      chargerRegles();
    } catch (err: unknown) {
      setMessageErreur(err instanceof Error ? err.message : "Erreur lors de la suppression.");
    }
  };

  // -------------------------------------------------------------
  // SIMULATION
  // -------------------------------------------------------------
  const resultatSimulation = useMemo(() => {
    if (!simulatedTime) return null;
    const match = regles.find(
      (r) =>
        r.actif &&
        isTimeInWindow(simulatedTime, r.heure_debut, r.heure_fin) &&
        (r.jours_semaine || [1, 2, 3, 4, 5, 6, 7]).includes(simulatedDay)
    );
    return match || null;
  }, [simulatedTime, simulatedDay, regles]);

  return (
    <div className="w-full space-y-5 px-3 py-4 sm:px-6 max-w-6xl mx-auto">
      {/* ========================================================= */}
      {/* EN-TÊTE ÉPURÉ ET PROFESSIONNEL */}
      {/* ========================================================= */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-border pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">
            Affectation horaire dynamique
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Sélectionnez les employés et configurez les règles de reconnaissance automatique.
          </p>
        </div>

        {/* Actions principales simples */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            type="button"
            variant="outline"
            onClick={() => setModalSimulateurOuverte(true)}
            className="h-8.5 text-xs font-medium"
            title="Tester quelle règle s'appliquera pour une heure donnée"
          >
            <Play className="size-3.5 mr-1 text-primary" />
            Tester une règle
          </Button>

          <Link href="/rapport-presences">
            <Button
              variant="outline"
              className="h-8.5 text-xs font-medium text-foreground hover:bg-muted"
            >
              <FileSpreadsheet className="size-3.5 mr-1 text-muted-foreground" />
              Rapport des présences
            </Button>
          </Link>

          <Button
            variant="primary"
            onClick={handleSync}
            disabled={syncing || loadingEmployes || loadingRegles}
            className="h-8.5 text-xs font-semibold"
          >
            <RotateCcw className={cn("size-3.5 mr-1.5", syncing && "animate-spin")} />
            {syncing ? "Synchronisation..." : "Synchroniser"}
          </Button>
        </div>
      </div>

      {/* Messages de confirmation / erreur simples et discrets */}
      {messageSucces && (
        <div className="flex items-center justify-between rounded-lg bg-emerald-500/10 px-3.5 py-2.5 text-xs font-medium text-emerald-800 dark:text-emerald-300 border border-emerald-500/20">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
            <span>{messageSucces}</span>
          </div>
          <button
            type="button"
            onClick={() => setMessageSucces(null)}
            className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {messageErreur && (
        <div className="flex items-center justify-between rounded-lg bg-danger-soft px-3.5 py-2.5 text-xs font-medium text-danger border border-danger/20">
          <div className="flex items-center gap-2">
            <AlertCircle className="size-4 shrink-0" />
            <span>{messageErreur}</span>
          </div>
          <button
            type="button"
            onClick={() => setMessageErreur(null)}
            className="text-xs text-danger/80 hover:text-danger cursor-pointer"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {/* ========================================================= */}
      {/* SECTION 1 — EMPLOYÉS */}
      {/* ========================================================= */}
      <Card className="p-4 sm:p-5 border-border shadow-2xs space-y-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-border/80 pb-3">
          <div className="flex items-center gap-2">
            <Users className="size-4 text-primary" />
            <h2 className="text-sm sm:text-base font-bold text-foreground">
              1. Employés
            </h2>
            <span className="ml-1 text-xs text-muted-foreground">
              (<strong>{nbActivesDansListe}</strong> activé{nbActivesDansListe > 1 ? "s" : ""} sur {employes.length}
              {selectedEmployeIds.size !== nbActivesDansListe ? ` · ${selectedEmployeIds.size} au total` : ""})
            </span>
          </div>

          <Button
            type="button"
            variant="primary"
            onClick={handleEnregistrerEmployes}
            disabled={savingSelection}
            className={cn("h-8 px-3.5 text-xs font-bold", hasUnsavedChanges && "ring-2 ring-primary/40")}
          >
            {savingSelection ? "Enregistrement..." : "Enregistrer"}
          </Button>
        </div>

        {/* Filtres de recherche et département */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={rechercheEmploye}
              onChange={(e) => {
                setRechercheEmploye(e.target.value);
                setPageEmployes(1);
              }}
              placeholder="Rechercher par matricule ou nom..."
              className="w-full pl-8 pr-3 py-1.5 rounded-md border border-border bg-surface text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              value={selectedDeptId}
              onChange={(e) => {
                setSelectedDeptId(e.target.value);
                setPageEmployes(1);
              }}
              className="min-w-0 flex-1 px-2.5 py-1.5 rounded-md border border-border bg-surface text-xs text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
            >
              <option value="all">Tous les départements ({departements.length})</option>
              {departements.map((d: any) => (
                <option key={d.id} value={d.id}>
                  {d.label || `${d.name}${d.code ? ` (${d.code})` : ""}`}
                </option>
              ))}
            </select>
            <Button
              type="button"
              variant="outline"
              onClick={handleToggleTousDepartement}
              disabled={togglingTous || loadingEmployes || employes.length === 0}
              className="h-[30px] shrink-0 px-2.5 text-xs font-semibold"
              title={
                tousActivesDansListe
                  ? `Désactiver tous les employés de ${libelleDeptSelectionne}`
                  : `Activer tous les employés de ${libelleDeptSelectionne}`
              }
            >
              {togglingTous
                ? "..."
                : tousActivesDansListe
                  ? "Tout désactiver"
                  : "Tout activer"}
            </Button>
          </div>
        </div>

        {/* Tableau simple : Matricule | Nom | Département | Activer */}
        <div className="w-full overflow-x-auto rounded-md border border-border">
          <table className="w-full border-collapse text-left text-xs">
            <thead className="bg-muted/60 text-muted-foreground font-semibold">
              <tr>
                <th className="px-3 py-2 w-28">Matricule</th>
                <th className="px-3 py-2">Nom & Prénom</th>
                <th className="px-3 py-2">Département</th>
                <th className="px-3 py-2 text-center w-28">
                  <div className="flex items-center justify-center gap-1.5">
                    <span>Activer</span>
                    <button
                      type="button"
                      onClick={handleToggleTousDepartement}
                      disabled={togglingTous || loadingEmployes || employes.length === 0}
                      className={cn(
                        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-150 ease-in-out focus:outline-none disabled:opacity-40",
                        tousActivesDansListe ? "bg-primary" : "bg-muted"
                      )}
                      role="switch"
                      aria-checked={tousActivesDansListe}
                      title={
                        tousActivesDansListe
                          ? `Désactiver tous les employés de ${libelleDeptSelectionne}`
                          : `Activer tous les employés de ${libelleDeptSelectionne}`
                      }
                    >
                      <span
                        className={cn(
                          "pointer-events-none inline-block size-4 transform rounded-full bg-white shadow-xs transition duration-150 ease-in-out",
                          tousActivesDansListe ? "translate-x-4" : "translate-x-0"
                        )}
                      />
                    </button>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loadingEmployes ? (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-muted-foreground">
                    Chargement des employés...
                  </td>
                </tr>
              ) : employesAffiches.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-muted-foreground">
                    Aucun employé trouvé.
                  </td>
                </tr>
              ) : (
                employesAffiches.map((emp) => {
                  const isSelected = selectedEmployeIds.has(emp.id);
                  return (
                    <tr
                      key={emp.id}
                      onClick={() => toggleEmploye(emp.id)}
                      className={cn(
                        "hover:bg-muted/30 transition-colors cursor-pointer",
                        isSelected && "bg-primary/[0.03]"
                      )}
                    >
                      <td className="px-3 py-2 font-mono font-bold text-foreground">
                        {emp.matricule || emp.id.slice(0, 8)}
                      </td>
                      <td className="px-3 py-2 font-medium text-foreground">
                        <span className="font-semibold uppercase">{emp.nom}</span>{" "}
                        <span className="capitalize text-muted-foreground">{emp.prenom}</span>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{emp.departement}</td>
                      <td className="px-3 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                        {/* Interrupteur ON/OFF épuré */}
                        <button
                          type="button"
                          onClick={() => toggleEmploye(emp.id)}
                          className={cn(
                            "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-150 ease-in-out focus:outline-none",
                            isSelected ? "bg-primary" : "bg-muted"
                          )}
                          role="switch"
                          aria-checked={isSelected}
                          title={isSelected ? "Désactiver" : "Activer"}
                        >
                          <span
                            className={cn(
                              "pointer-events-none inline-block size-4 transform rounded-full bg-white shadow-xs transition duration-150 ease-in-out",
                              isSelected ? "translate-x-4" : "translate-x-0"
                            )}
                          />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination compacte */}
        {employes.length > EMPLOYES_PAR_PAGE && (
          <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
            <span>
              Page {pageEmployes} sur {totalPagesEmployes} ({employes.length} employés)
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                onClick={() => setPageEmployes((p) => Math.max(1, p - 1))}
                disabled={pageEmployes === 1}
                className="h-7 px-2 text-xs"
              >
                <ChevronLeft className="size-3" />
                Précédent
              </Button>
              <Button
                variant="outline"
                onClick={() => setPageEmployes((p) => Math.min(totalPagesEmployes, p + 1))}
                disabled={pageEmployes === totalPagesEmployes}
                className="h-7 px-2 text-xs"
              >
                Suivant
                <ChevronRight className="size-3" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* ========================================================= */}
      {/* SECTION 2 — HORAIRES DYNAMIQUES */}
      {/* ========================================================= */}
      <Card className="p-4 sm:p-5 border-border shadow-2xs space-y-3.5">
        <div className="flex items-center justify-between border-b border-border/80 pb-3">
          <div className="flex items-center gap-2">
            <Clock className="size-4 text-primary" />
            <h2 className="text-sm sm:text-base font-bold text-foreground">
              2. Horaires dynamiques
            </h2>
          </div>

          {/* Un seul bouton : + Ajouter une règle */}
          <Button
            type="button"
            variant="primary"
            onClick={ouvrirAjoutRegle}
            className="h-8 px-3 text-xs font-bold"
          >
            <Plus className="size-3.5 mr-1" />
            Ajouter une règle
          </Button>
        </div>

        {/* Tableau simple : Plage de pointage | Horaire attribué | Jours | Actions */}
        <div className="w-full overflow-x-auto rounded-md border border-border">
          <table className="w-full border-collapse text-left text-xs">
            <thead className="bg-muted/60 text-muted-foreground font-semibold">
              <tr>
                <th className="px-3 py-2">Plage de pointage</th>
                <th className="px-3 py-2">Horaire attribué</th>
                <th className="px-3 py-2">Jours</th>
                <th className="px-3 py-2 text-center w-20">Statut</th>
                <th className="px-3 py-2 text-center w-24">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loadingRegles ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-muted-foreground">
                    Chargement des règles...
                  </td>
                </tr>
              ) : regles.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-muted-foreground">
                    Aucune règle horaire enregistrée. Cliquez sur « + Ajouter une règle » pour commencer.
                  </td>
                </tr>
              ) : (
                regles.map((r) => (
                  <tr
                    key={r.id}
                    className={cn(
                      "hover:bg-muted/30 transition-colors",
                      !r.actif && "opacity-50"
                    )}
                  >
                    {/* Plage de pointage */}
                    <td className="px-3 py-2 font-mono font-bold text-foreground">
                      {r.heure_debut} – {r.heure_fin}
                    </td>

                    {/* Horaire attribué */}
                    <td className="px-3 py-2">
                      {(() => {
                        const horaireNom = r.period_name || r.cvaccess_horaire_id;
                        const cfg = getHoraireConfig(horaireNom);
                        const Icon = cfg.Icon;
                        return (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={cn("inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-semibold border", cfg.badgeClass)}>
                              <Icon className="size-3 shrink-0" />
                              <span>{horaireNom}</span>
                              {cfg.isNight && (
                                <span className="text-[10px] font-bold opacity-80">(J+1)</span>
                              )}
                            </span>
                            {r.to_work_time && (
                              <span className="font-normal text-muted-foreground font-mono text-[11px]">
                                ({r.to_work_time} – {r.off_work_time})
                              </span>
                            )}
                          </div>
                        );
                      })()}
                    </td>

                    {/* Jours (Carrés L M M J V S D : vert si sélectionné, gris sinon) */}
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        {JOURS_SEMAINE.map((j) => {
                          const activeDays = r.jours_semaine && r.jours_semaine.length > 0 ? r.jours_semaine : [1, 2, 3, 4, 5, 6, 7];
                          const isActif = activeDays.includes(j.id);
                          return (
                            <span
                              key={j.id}
                              className={cn(
                                "inline-flex size-5 items-center justify-center rounded text-[10px] font-bold select-none transition-colors",
                                isActif
                                  ? "bg-primary text-white shadow-2xs"
                                  : "bg-muted text-muted-foreground/35 border border-border/50"
                              )}
                              title={`${j.nom} : ${isActif ? "Actif" : "Inactif"}`}
                            >
                              {j.lettre}
                            </span>
                          );
                        })}
                      </div>
                    </td>

                    {/* Statut (Actif / Inactif) */}
                    <td className="px-3 py-2 text-center">
                      <button
                        type="button"
                        onClick={() => handleToggleActif(r)}
                        disabled={togglingId === r.id}
                        className="cursor-pointer"
                        title={r.actif ? "Désactiver cette règle" : "Activer cette règle"}
                      >
                        {r.actif ? (
                          <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-800 dark:text-emerald-400">
                            Actif
                          </span>
                        ) : (
                          <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium bg-muted text-muted-foreground">
                            Inactif
                          </span>
                        )}
                      </button>
                    </td>

                    {/* Actions : Modifier / Désactiver / Supprimer */}
                    <td className="px-3 py-2 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => ouvrirEditionRegle(r)}
                          className="p-1 rounded-md text-muted-foreground hover:text-primary hover:bg-muted cursor-pointer"
                          title="Modifier"
                        >
                          <Pencil className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleActif(r)}
                          disabled={togglingId === r.id}
                          className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"
                          title={r.actif ? "Désactiver" : "Activer"}
                        >
                          <Power className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingRegle(r)}
                          className="p-1 rounded-md text-muted-foreground hover:text-danger hover:bg-danger-soft cursor-pointer"
                          title="Supprimer"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ========================================================= */}
      {/* MODAL SIMPLE : AJOUTER OU MODIFIER UNE RÈGLE */}
      {/* ========================================================= */}
      {modalRegleOuverte && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-lg p-5 space-y-4 shadow-xl border-border bg-surface animate-in fade-in duration-100">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-sm font-bold text-foreground">
                {editingRegleId ? "Modifier la règle horaire" : "Ajouter une règle horaire"}
              </h3>
              <button
                type="button"
                onClick={() => setModalRegleOuverte(false)}
                className="text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="size-4" />
              </button>
            </div>

            <form onSubmit={handleSaveRegle} className="space-y-3.5">
              {/* Plages horaires de début et fin */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1">
                    Heure de début *
                  </label>
                  <input
                    type="time"
                    required
                    value={formHeureDebut}
                    onChange={(e) => setFormHeureDebut(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-md border border-border bg-surface text-xs font-mono text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1">
                    Heure de fin *
                  </label>
                  <input
                    type="time"
                    required
                    value={formHeureFin}
                    onChange={(e) => setFormHeureFin(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-md border border-border bg-surface text-xs font-mono text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>

              {/* Horaire CVAccess */}
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">
                  Horaire CVAccess *
                </label>
                <select
                  required
                  value={formSelectedHoraireId}
                  onChange={(e) => setFormSelectedHoraireId(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-md border border-border bg-surface text-xs text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                >
                  {cvHoraires.length === 0 ? (
                    <option value="" disabled>
                      Aucun horaire disponible (veuillez synchroniser avec CVAccess)
                    </option>
                  ) : (
                    cvHoraires.map((h) => (
                      <option key={h.cvaccess_horaire_id} value={h.cvaccess_horaire_id}>
                        {h.period_name} {h.to_work_time ? `(${h.to_work_time.slice(0, 5)} - ${h.off_work_time?.slice(0, 5)})` : ""}
                      </option>
                    ))
                  )}
                </select>
                {cvHoraires.length === 0 && (
                  <div className="mt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2 rounded bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-300 text-xs">
                    <span>⚠️ Les horaires de CVAccess ne sont pas encore chargés.</span>
                    <button
                      type="button"
                      onClick={handleSync}
                      disabled={syncing}
                      className="self-start sm:self-auto px-2.5 py-1 text-[11px] font-bold rounded bg-primary text-white hover:bg-primary/90 cursor-pointer disabled:opacity-50 transition-colors"
                    >
                      {syncing ? "Synchronisation en cours..." : "Synchroniser maintenant"}
                    </button>
                  </div>
                )}
              </div>

              {/* Jours d'application compacts avec raccourcis */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-foreground">
                    Jours d&apos;application *
                  </label>
                  <div className="flex items-center gap-2 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setFormJoursSemaine([1, 2, 3, 4, 5, 6, 7])}
                      className="text-primary hover:underline cursor-pointer"
                    >
                      Tous les jours
                    </button>
                    <span>·</span>
                    <button
                      type="button"
                      onClick={() => setFormJoursSemaine([1, 2, 3, 4, 5])}
                      className="text-primary hover:underline cursor-pointer"
                    >
                      Lundi–Vendredi
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-7 gap-1.5">
                  {JOURS_SEMAINE.map((j) => {
                    const isSelected = formJoursSemaine.includes(j.id);
                    return (
                      <button
                        key={j.id}
                        type="button"
                        onClick={() => {
                          setFormJoursSemaine((prev) => {
                            if (prev.includes(j.id)) {
                              if (prev.length <= 1) return prev;
                              return prev.filter((id) => id !== j.id);
                            }
                            return [...prev, j.id].sort((a, b) => a - b);
                          });
                        }}
                        className={cn(
                          "py-1.5 text-xs font-bold rounded-md border text-center transition-colors cursor-pointer",
                          isSelected
                            ? "bg-primary text-white border-primary"
                            : "bg-surface text-muted-foreground border-border hover:bg-muted"
                        )}
                      >
                        {j.court}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Message de chevauchement court DIRECTEMENT sous les champs */}
              {regleEnConflit && (
                <div className="p-2 rounded bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-300 text-xs flex items-start gap-1.5">
                  <AlertCircle className="size-3.5 shrink-0 mt-0.5" />
                  <span>
                    Attention : cette plage chevauche la règle « {regleEnConflit.period_name} » ({regleEnConflit.heure_debut}–{regleEnConflit.heure_fin}).
                  </span>
                </div>
              )}

              {/* Boutons d'action */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setModalRegleOuverte(false)}
                  className="h-8 px-3 text-xs"
                >
                  Annuler
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={submittingRegle}
                  className="h-8 px-4 text-xs font-bold"
                >
                  {submittingRegle ? "Enregistrement..." : "Enregistrer la règle"}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL SIMPLE : TESTER UNE RÈGLE (SIMULATEUR COMPACT) */}
      {/* ========================================================= */}
      {modalSimulateurOuverte && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-sm p-4 space-y-3.5 shadow-xl border-border bg-surface animate-in fade-in duration-100">
            <div className="flex items-center justify-between border-b border-border pb-2.5">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-1.5">
                <Play className="size-3.5 text-primary" />
                Tester la reconnaissance horaire
              </h3>
              <button
                type="button"
                onClick={() => setModalSimulateurOuverte(false)}
                className="text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-foreground mb-1">
                  Heure de pointage :
                </label>
                <input
                  type="time"
                  value={simulatedTime}
                  onChange={(e) => setSimulatedTime(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-md border border-border bg-surface text-xs font-mono font-bold text-foreground focus:border-primary focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-foreground mb-1">
                  Jour :
                </label>
                <div className="grid grid-cols-7 gap-1">
                  {JOURS_SEMAINE.map((j) => (
                    <button
                      key={j.id}
                      type="button"
                      onClick={() => setSimulatedDay(j.id)}
                      className={cn(
                        "py-1 text-[11px] font-bold rounded border transition-colors cursor-pointer",
                        simulatedDay === j.id
                          ? "bg-primary text-white border-primary"
                          : "bg-surface text-muted-foreground border-border hover:bg-muted"
                      )}
                    >
                      {j.court}
                    </button>
                  ))}
                </div>
              </div>

              {/* Résultat immédiat */}
              <div className="p-3 rounded-md border border-border bg-muted/40">
                {resultatSimulation ? (
                  <div className="space-y-1">
                    <div className="text-[11px] text-emerald-700 dark:text-emerald-400 font-bold flex items-center gap-1">
                      <Check className="size-3.5" /> Règle trouvée :
                    </div>
                    <div className="font-bold text-sm text-foreground">
                      {resultatSimulation.period_name}
                    </div>
                    <div className="text-[11px] text-muted-foreground font-mono">
                      Plage {resultatSimulation.heure_debut} – {resultatSimulation.heure_fin}
                      {resultatSimulation.to_work_time && ` (${resultatSimulation.to_work_time} – ${resultatSimulation.off_work_time})`}
                    </div>
                  </div>
                ) : (
                  <div className="text-[11px] text-muted-foreground">
                    Aucun horaire dynamique ne correspond à <strong>{simulatedTime}</strong> le{" "}
                    <strong>{JOURS_SEMAINE.find((j) => j.id === simulatedDay)?.nom}</strong>.
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-border">
              <Button
                type="button"
                variant="outline"
                onClick={() => setModalSimulateurOuverte(false)}
                className="h-7 px-3 text-xs"
              >
                Fermer
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL SIMPLE : CONFIRMATION SUPPRESSION */}
      {/* ========================================================= */}
      {deletingRegle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-sm p-4 space-y-3 shadow-xl border-border bg-surface">
            <h3 className="text-sm font-bold text-foreground">Supprimer cette règle ?</h3>
            <p className="text-xs text-muted-foreground">
              Voulez-vous supprimer la plage {deletingRegle.heure_debut}–{deletingRegle.heure_fin} (
              {deletingRegle.period_name}) ?
            </p>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDeletingRegle(null)}
                className="h-8 px-3 text-xs"
              >
                Annuler
              </Button>
              <Button
                type="button"
                onClick={handleConfirmDelete}
                className="h-8 px-3 text-xs bg-danger text-white hover:bg-danger/90 font-bold"
              >
                Supprimer
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
