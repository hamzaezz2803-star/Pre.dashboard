"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Users,
  Clock,
  Search,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  RotateCcw,
  Sliders,
  Moon,
  Sun,
  Pencil,
  Trash2,
  Power,
  Info,
  Building2,
  CheckSquare,
  Square,
  Save,
  ChevronLeft,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// --- Types pour les employés et départements ---
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

// --- Types pour les horaires officiels CVAccess ---
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

// --- Types pour les règles de reconnaissance (table horaires) ---
export interface RegleHoraireItem {
  id: number;
  heure_debut: string;
  heure_fin: string;
  cvaccess_horaire_id: string;
  actif: boolean;
  date_creation?: string;
  period_name?: string;
  to_work_time?: string;
  off_work_time?: string;
  working_hours?: number;
  est_nuit?: boolean;
}

export function AffectationHoraireDynamique() {
  // -------------------------------------------------------------
  // SECTION 1 : ÉTATS SÉLECTION DES EMPLOYÉS
  // -------------------------------------------------------------
  const [departements, setDepartements] = useState<DepartementItem[]>([]);
  const [selectedDeptId, setSelectedDeptId] = useState<string>("all");
  const [rechercheEmploye, setRechercheEmploye] = useState("");
  const [employes, setEmployes] = useState<EmployeItem[]>([]);
  const [loadingEmployes, setLoadingEmployes] = useState(true);

  // Sélections persistantes (ID de l'employé = cvaccess_person_id) - ne s'efface pas au changement de filtre
  const [selectedEmployeIds, setSelectedEmployeIds] = useState<Set<string>>(new Set());
  const [selectionLoaded, setSelectionLoaded] = useState(false);
  const [savingSelection, setSavingSelection] = useState(false);
  const [selectionNotice, setSelectionNotice] = useState<string | null>(null);

  // Pagination pour le tableau des employés
  const [pageEmployes, setPageEmployes] = useState(1);
  const EMPLOYES_PAR_PAGE = 8;

  // -------------------------------------------------------------
  // SECTION 2 : ÉTATS FORMULAIRE HORAIRE DYNAMIQUE
  // -------------------------------------------------------------
  const [cvHoraires, setCvHoraires] = useState<CvAccessHoraireItem[]>([]);
  const [loadingCvHoraires, setLoadingCvHoraires] = useState(true);

  const [formHeureDebut, setFormHeureDebut] = useState("07:00");
  const [formHeureFin, setFormHeureFin] = useState("08:59");
  const [formSelectedHoraireId, setFormSelectedHoraireId] = useState("");
  const [editingRegleId, setEditingRegleId] = useState<number | null>(null);
  const [submittingRegle, setSubmittingRegle] = useState(false);

  // -------------------------------------------------------------
  // SECTION 3 : ÉTATS TABLEAU DES RÈGLES EXISTANTES
  // -------------------------------------------------------------
  const [regles, setRegles] = useState<RegleHoraireItem[]>([]);
  const [loadingRegles, setLoadingRegles] = useState(true);
  const [deletingRegle, setDeletingRegle] = useState<RegleHoraireItem | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  // Messages globaux
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [syncingCvAccess, setSyncingCvAccess] = useState(false);

  // -------------------------------------------------------------
  // CHARGEMENT INITIAL DES DONNÉES
  // -------------------------------------------------------------
  // 1. Charger les départements
  const chargerDepartements = useCallback(async () => {
    try {
      const res = await fetch("/api/affectation-horaire/departements");
      if (res.ok) {
        const data = await res.json();
        setDepartements(data.departements || []);
      }
    } catch (e) {
      console.error("Erreur chargement départements", e);
    }
  }, []);

  // 2. Charger les employés avec leur statut actif depuis PostgreSQL
  const chargerEmployes = useCallback(
    async (isRefresh = false) => {
      try {
        setLoadingEmployes(true);
        const params = new URLSearchParams();
        if (selectedDeptId && selectedDeptId !== "all") {
          params.append("deptId", selectedDeptId);
        }
        if (rechercheEmploye.trim()) {
          params.append("q", rechercheEmploye.trim());
        }

        const res = await fetch(`/api/affectation-horaire/employes?${params.toString()}`);
        if (res.ok) {
          const data = await res.json();
          setEmployes(data.employes || []);

          // Initialisation de la sélection depuis la table employes_affectation_dynamique
          // au tout premier chargement ou après enregistrement/synchronisation explicite
          if (!selectionLoaded || isRefresh) {
            if (Array.isArray(data.activeIds)) {
              setSelectedEmployeIds(new Set(data.activeIds));
            } else if (Array.isArray(data.employes)) {
              const fromList = data.employes
                .filter((emp: EmployeItem) => emp.actif)
                .map((emp: EmployeItem) => emp.id);
              setSelectedEmployeIds(new Set(fromList));
            }
            setSelectionLoaded(true);
          }
        }
      } catch (e) {
        console.error("Erreur chargement employés", e);
      } finally {
        setLoadingEmployes(false);
      }
    },
    [selectedDeptId, rechercheEmploye, selectionLoaded]
  );

  // 3. Charger les horaires officiels CVAccess (table cvaccess_horaires)
  const chargerCvHoraires = useCallback(async () => {
    try {
      setLoadingCvHoraires(true);
      const res = await fetch("/api/affectation-horaire/cvaccess-horaires");
      if (res.ok) {
        const data = await res.json();
        const list: CvAccessHoraireItem[] = data.horaires || [];
        setCvHoraires(list);
        if (list.length > 0 && !formSelectedHoraireId) {
          setFormSelectedHoraireId(list[0].cvaccess_horaire_id);
        }
      }
    } catch (e) {
      console.error("Erreur chargement horaires CVAccess", e);
    } finally {
      setLoadingCvHoraires(false);
    }
  }, [formSelectedHoraireId]);

  // 4. Charger les règles configurées (table horaires)
  const chargerRegles = useCallback(async () => {
    try {
      setLoadingRegles(true);
      const res = await fetch("/api/affectation-horaire/regles");
      if (res.ok) {
        const data = await res.json();
        setRegles(data.regles || []);
      }
    } catch (e) {
      console.error("Erreur chargement règles", e);
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

  // Déclenche la synchronisation depuis CVAccess (biosecurity-boot) vers ocp_pointage
  const handleSyncCvAccess = async () => {
    setSyncingCvAccess(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await fetch("/api/affectation-horaire/sync", {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok || data.success === false) {
        throw new Error(data.error || "Erreur lors de la synchronisation depuis CVAccess.");
      }
      setSuccessMsg(
        data.message ||
          "Synchronisation CVAccess réussie : départements, employés et horaires récents chargés."
      );
      // Rechargement immédiat de l'ensemble des données avec réinitialisation depuis PostgreSQL
      await Promise.all([
        chargerDepartements(),
        chargerEmployes(true),
        chargerCvHoraires(),
        chargerRegles(),
      ]);
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error ? err.message : "Erreur de synchronisation avec CVAccess."
      );
    } finally {
      setSyncingCvAccess(false);
    }
  };

  // -------------------------------------------------------------
  // GESTION SÉLECTION DES EMPLOYÉS (SECTION 1)
  // -------------------------------------------------------------
  const toggleEmploye = (id: string) => {
    setSelectedEmployeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Liste des employés affichés sur la page courante
  const totalPagesEmployes = Math.max(1, Math.ceil(employes.length / EMPLOYES_PAR_PAGE));
  const employesAffiches = useMemo(() => {
    const start = (pageEmployes - 1) * EMPLOYES_PAR_PAGE;
    return employes.slice(start, start + EMPLOYES_PAR_PAGE);
  }, [employes, pageEmployes]);

  // Vérifie si tous les employés actuellement affichés sont sélectionnés
  const tousAffichesSelectionnes = useMemo(() => {
    if (employesAffiches.length === 0) return false;
    return employesAffiches.every((emp) => selectedEmployeIds.has(emp.id));
  }, [employesAffiches, selectedEmployeIds]);

  const toggleSelectAllAffiches = () => {
    setSelectedEmployeIds((prev) => {
      const next = new Set(prev);
      if (tousAffichesSelectionnes) {
        employesAffiches.forEach((emp) => next.delete(emp.id));
      } else {
        employesAffiches.forEach((emp) => next.add(emp.id));
      }
      return next;
    });
  };

  const handleEnregistrerSelectionEmployes = async () => {
    setSavingSelection(true);
    setSelectionNotice(null);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const activeList = Array.from(selectedEmployeIds);
      const res = await fetch("/api/affectation-horaire/enregistrer-employes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activeIds: activeList,
        }),
      });

      const data = await res.json();
      if (!res.ok || data.success === false) {
        throw new Error(data.error || "Erreur lors de l'enregistrement dans PostgreSQL.");
      }

      // Confirmation de succès réel dans PostgreSQL
      setSuccessMsg(data.message || "Sélection enregistrée avec succès dans PostgreSQL.");
      setSelectionNotice(null);

      // Recharger immédiatement depuis PostgreSQL pour confirmer la persistance réelle
      await chargerEmployes(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erreur inattendue lors de l'enregistrement.";
      setErrorMsg(`Échec de l'enregistrement PostgreSQL : ${msg}`);
      setSelectionNotice(`Échec de l'enregistrement PostgreSQL : ${msg}`);
    } finally {
      setSavingSelection(false);
    }
  };

  // -------------------------------------------------------------
  // DÉTAILS DE L'HORAIRE SÉLECTIONNÉ DANS LE FORMULAIRE (SECTION 2 & 4)
  // -------------------------------------------------------------
  const selectedCvHoraire = useMemo(() => {
    return cvHoraires.find((h) => h.cvaccess_horaire_id === formSelectedHoraireId) || null;
  }, [cvHoraires, formSelectedHoraireId]);

  // Détection d'horaire de nuit traversant minuit
  const estNuitTravail = useMemo(() => {
    if (!selectedCvHoraire) return false;
    const d = selectedCvHoraire.to_work_time_clean || (selectedCvHoraire.to_work_time || "").slice(0, 5);
    const f = selectedCvHoraire.off_work_time_clean || (selectedCvHoraire.off_work_time || "").slice(0, 5);
    if (!d || !f) return false;
    const [hD, mD] = d.split(":").map(Number);
    const [hF, mF] = f.split(":").map(Number);
    return hF * 60 + mF <= hD * 60 + mD;
  }, [selectedCvHoraire]);

  // Détection si la plage de pointage saisie traverse minuit
  const estNuitPlagePtg = useMemo(() => {
    if (!formHeureDebut || !formHeureFin) return false;
    const [hD, mD] = formHeureDebut.split(":").map(Number);
    const [hF, mF] = formHeureFin.split(":").map(Number);
    return hF * 60 + mF <= hD * 60 + mD;
  }, [formHeureDebut, formHeureFin]);

  // -------------------------------------------------------------
  // SOUMISSION DU FORMULAIRE DE RÈGLE (SECTION 2)
  // -------------------------------------------------------------
  const handleSaveRegle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formHeureDebut || !formHeureFin || !formSelectedHoraireId) {
      setErrorMsg("Veuillez renseigner les heures de début et fin de pointage et choisir un horaire.");
      return;
    }

    setSubmittingRegle(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const isEditing = editingRegleId !== null;
      const method = isEditing ? "PUT" : "POST";
      const payload = {
        id: editingRegleId,
        heure_debut: formHeureDebut,
        heure_fin: formHeureFin,
        cvaccess_horaire_id: formSelectedHoraireId,
        actif: true,
      };

      const res = await fetch("/api/affectation-horaire/regles", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Erreur lors de l'enregistrement de la règle.");
      }

      setSuccessMsg(
        isEditing
          ? "Règle de reconnaissance horaire modifiée avec succès."
          : "Nouvelle règle de reconnaissance horaire enregistrée avec succès."
      );

      // Réinitialiser le formulaire
      setEditingRegleId(null);
      setFormHeureDebut("07:00");
      setFormHeureFin("08:59");
      chargerRegles();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Erreur inattendue.");
    } finally {
      setSubmittingRegle(false);
    }
  };

  // Édition d'une règle
  const handleEditRegle = (regle: RegleHoraireItem) => {
    setEditingRegleId(regle.id);
    setFormHeureDebut(regle.heure_debut);
    setFormHeureFin(regle.heure_fin);
    setFormSelectedHoraireId(regle.cvaccess_horaire_id);
    // Défiler vers la section formulaire
    const el = document.getElementById("formulaire-horaire-dynamique");
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    }
  };

  const handleCancelEdit = () => {
    setEditingRegleId(null);
    setFormHeureDebut("07:00");
    setFormHeureFin("08:59");
    if (cvHoraires.length > 0) {
      setFormSelectedHoraireId(cvHoraires[0].cvaccess_horaire_id);
    }
  };

  // Bascule du statut actif / inactif
  const handleToggleActif = async (regle: RegleHoraireItem) => {
    setTogglingId(regle.id);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/affectation-horaire/regles?id=${regle.id}`, {
        method: "PATCH",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur de changement de statut");
      chargerRegles();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Erreur lors du changement de statut");
    } finally {
      setTogglingId(null);
    }
  };

  // Suppression d'une règle
  const handleConfirmDelete = async () => {
    if (!deletingRegle) return;
    try {
      const res = await fetch(`/api/affectation-horaire/regles?id=${deletingRegle.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur lors de la suppression");
      setSuccessMsg("Règle horaire supprimée avec succès.");
      setDeletingRegle(null);
      if (editingRegleId === deletingRegle.id) handleCancelEdit();
      chargerRegles();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Erreur lors de la suppression");
    }
  };

  return (
    <div className="w-full space-y-6 px-3 py-5 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      {/* ========================================================= */}
      {/* EN-TÊTE PRINCIPAL */}
      {/* ========================================================= */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border pb-5">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
            <Sliders className="size-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                Affectation horaire dynamique
              </h1>
              <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold bg-primary/10 text-primary border border-primary/20">
                <Sparkles className="size-3" />
                OCP Pointage
              </span>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
              Sélection des employés et configuration des règles de reconnaissance horaire automatique.
            </p>
          </div>
        </div>

        {/* Bouton d'actualisation depuis CVAccess */}
        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            onClick={handleSyncCvAccess}
            disabled={syncingCvAccess || loadingEmployes || loadingRegles || loadingCvHoraires}
            className="h-9 text-xs self-start sm:self-auto font-semibold shadow-xs"
            title="Synchronise les nouveaux départements, employés et horaires depuis CVAccess"
          >
            <RotateCcw
              className={cn("size-3.5 mr-1.5", syncingCvAccess && "animate-spin")}
            />
            {syncingCvAccess ? "Synchronisation CVAccess..." : "Actualiser depuis CVAccess"}
          </Button>
        </div>
      </div>

      {/* Messages de succès ou d'erreur */}
      {successMsg && (
        <div className="flex items-center justify-between rounded-lg bg-emerald-500/10 p-4 text-xs sm:text-sm font-medium text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="size-4.5 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMsg(null)}
            className="text-xs underline hover:opacity-80"
          >
            Fermer
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="flex items-center justify-between rounded-lg bg-danger-soft p-4 text-xs sm:text-sm font-medium text-danger border border-danger/20">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="size-4.5 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="text-xs underline hover:opacity-80"
          >
            Fermer
          </button>
        </div>
      )}

      {/* ========================================================= */}
      {/* 1. PREMIÈRE SECTION : SÉLECTION DES EMPLOYÉS */}
      {/* ========================================================= */}
      <Card className="p-5 sm:p-6 border-border shadow-xs">
        {/* Titre de section */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4 mb-5">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Users className="size-4.5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-foreground">
                1. Sélection des employés
              </h2>
              <p className="text-xs text-muted-foreground">
                Définissez la liste des collaborateurs soumis à l&apos;affectation horaire dynamique.
              </p>
            </div>
          </div>

          {/* Compteur et boutons d'action */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted text-xs font-semibold text-foreground border border-border">
              <span className="size-2 rounded-full bg-primary" />
              <span>
                <strong>{selectedEmployeIds.size}</strong> employé
                {selectedEmployeIds.size > 1 ? "s" : ""} sélectionné
                {selectedEmployeIds.size > 1 ? "s" : ""}
              </span>
            </div>

            <Button
              type="button"
              variant="outline"
              onClick={handleSyncCvAccess}
              disabled={syncingCvAccess || loadingEmployes}
              className="h-9 text-xs"
              title="Synchronise immédiatement les nouveaux départements et employés créés dans CVAccess"
            >
              <RotateCcw className={cn("size-3.5 mr-1.5", syncingCvAccess && "animate-spin")} />
              {syncingCvAccess ? "Synchronisation CVAccess..." : "Actualiser depuis CVAccess"}
            </Button>

            <Button
              type="button"
              variant="primary"
              onClick={handleEnregistrerSelectionEmployes}
              disabled={savingSelection}
              className="h-9 text-xs"
            >
              <Save className="size-3.5 mr-1.5" />
              {savingSelection ? "Enregistrement..." : "Enregistrer la sélection"}
            </Button>
          </div>
        </div>

        {/* Message d'état de connexion backend pour la sélection */}
        {selectionNotice && (
          <div className="mb-4 flex items-start gap-2.5 rounded-lg bg-amber-500/10 p-3.5 text-xs font-medium text-amber-800 dark:text-amber-300 border border-amber-500/25">
            <Info className="size-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
            <div className="flex-1">
              <p className="font-semibold">Préparation PostgreSQL :</p>
              <p>{selectionNotice}</p>
            </div>
          </div>
        )}

        {/* Filtres : Recherche et Département */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
          {/* Champ de recherche */}
          <div className="relative">
            <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
            <input
              type="text"
              value={rechercheEmploye}
              onChange={(e) => setRechercheEmploye(e.target.value)}
              placeholder="Rechercher par ID, matricule, nom ou prénom..."
              className="w-full pl-9 pr-3 py-2 rounded-md border border-border bg-surface text-xs sm:text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Sélecteur de département (auth_department) */}
          <div className="relative">
            <Building2 className="absolute left-3 top-2.5 size-4 text-muted-foreground pointer-events-none" />
            <select
              value={selectedDeptId}
              onChange={(e) => setSelectedDeptId(e.target.value)}
              className="w-full pl-9 pr-8 py-2 rounded-md border border-border bg-surface text-xs sm:text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary appearance-none cursor-pointer"
            >
              <option value="all">Tous les départements ({departements.length})</option>
              {departements.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} {d.code ? `(${d.code})` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Option Sélectionner tous les employés affichés */}
          <div className="flex items-center sm:justify-end">
            <button
              type="button"
              onClick={toggleSelectAllAffiches}
              disabled={employesAffiches.length === 0}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-border bg-muted/60 hover:bg-muted text-xs font-semibold text-foreground transition-colors cursor-pointer disabled:opacity-50"
            >
              {tousAffichesSelectionnes ? (
                <CheckSquare className="size-4 text-primary" />
              ) : (
                <Square className="size-4 text-muted-foreground" />
              )}
              <span>Sélectionner tous les employés affichés</span>
            </button>
          </div>
        </div>

        {/* Tableau des employés (pers_person) */}
        <div className="w-full overflow-x-auto rounded-lg border border-border">
          <table className="w-full border-collapse text-left text-xs sm:text-sm">
            <thead className="bg-muted text-xs text-muted-foreground font-semibold">
              <tr>
                <th className="px-3 py-2.5 text-center w-12">
                  <span className="sr-only">Sélectionner</span>
                </th>
                <th className="px-3 py-2.5">Matricule</th>
                <th className="px-3 py-2.5">Nom</th>
                <th className="px-3 py-2.5">Prénom</th>
                <th className="px-3 py-2.5">Département</th>
                <th className="px-3 py-2.5 text-center">Affectation dynamique</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loadingEmployes ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-xs text-muted-foreground">
                    Chargement des collaborateurs depuis la table pers_person...
                  </td>
                </tr>
              ) : employesAffiches.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-xs text-muted-foreground">
                    Aucun employé trouvé pour les filtres sélectionnés.
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
                        "hover:bg-muted/50 transition-colors cursor-pointer",
                        isSelected && "bg-primary/5"
                      )}
                    >
                      {/* Checkbox */}
                      <td
                        className="px-3 py-2.5 text-center"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleEmploye(emp.id);
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleEmploye(emp.id)}
                          className="size-4 rounded border-border text-primary focus:ring-primary cursor-pointer"
                        />
                      </td>

                      {/* Matricule */}
                      <td className="px-3 py-2.5 font-mono font-bold text-xs text-foreground">
                        <span className="inline-flex rounded px-2 py-0.5 bg-muted font-mono">
                          {emp.matricule || emp.id.slice(0, 8)}
                        </span>
                      </td>

                      {/* Nom */}
                      <td className="px-3 py-2.5 font-semibold text-foreground uppercase">
                        {emp.nom || "-"}
                      </td>

                      {/* Prénom */}
                      <td className="px-3 py-2.5 text-foreground">{emp.prenom || "-"}</td>

                      {/* Département */}
                      <td className="px-3 py-2.5 text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5">
                          <Building2 className="size-3.5 text-muted-foreground/70" />
                          {emp.departement}
                        </span>
                      </td>

                      {/* Statut Affectation dynamique */}
                      <td className="px-3 py-2.5 text-center">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleEmploye(emp.id);
                          }}
                          className="inline-flex cursor-pointer transition-transform hover:scale-105"
                          title={
                            isSelected
                              ? "Cliquer pour désactiver l'affectation dynamique"
                              : "Cliquer pour activer l'affectation dynamique"
                          }
                        >
                          {isSelected ? (
                            <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/25">
                              <CheckCircle2 className="size-3" />
                              Activée
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium bg-muted text-muted-foreground border border-border">
                              Désactivée
                            </span>
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination des employés */}
        {employes.length > EMPLOYES_PAR_PAGE && (
          <div className="flex items-center justify-between pt-3 mt-2 border-t border-border text-xs text-muted-foreground flex-wrap gap-2">
            <span>
              Affichage de {(pageEmployes - 1) * EMPLOYES_PAR_PAGE + 1} à{" "}
              {Math.min(pageEmployes * EMPLOYES_PAR_PAGE, employes.length)} sur {employes.length}{" "}
              employés
            </span>

            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                onClick={() => setPageEmployes((p) => Math.max(1, p - 1))}
                disabled={pageEmployes === 1}
                className="h-8 px-2 text-xs"
              >
                <ChevronLeft className="size-3.5" />
                Précédent
              </Button>
              <span className="px-2 font-semibold text-foreground">
                {pageEmployes} / {totalPagesEmployes}
              </span>
              <Button
                variant="outline"
                onClick={() => setPageEmployes((p) => Math.min(totalPagesEmployes, p + 1))}
                disabled={pageEmployes === totalPagesEmployes}
                className="h-8 px-2 text-xs"
              >
                Suivant
                <ChevronRight className="size-3.5" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* ========================================================= */}
      {/* 2. DEUXIÈME SECTION : GESTION DES HORAIRES DYNAMIQUES */}
      {/* ========================================================= */}
      <Card id="formulaire-horaire-dynamique" className="p-5 sm:p-6 border-border shadow-xs">
        {/* Titre de section */}
        <div className="flex items-center justify-between border-b border-border pb-4 mb-5 flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Clock className="size-4.5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-foreground">
                2. Gestion des horaires dynamiques
              </h2>
              <p className="text-xs text-muted-foreground">
                Configurez la règle de reconnaissance basée sur la plage horaire du premier pointage.
              </p>
            </div>
          </div>

          {editingRegleId && (
            <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:text-amber-400 border border-amber-500/20">
              <Pencil className="size-3" />
              Mode modification (Règle #{editingRegleId})
            </span>
          )}
        </div>

        {/* Note informative sur les plages de pointage */}
        <div className="mb-5 flex items-start gap-2.5 rounded-lg bg-primary/5 p-3.5 text-xs text-foreground border border-primary/15">
          <Info className="size-4 shrink-0 mt-0.5 text-primary" />
          <div>
            <strong>Principe de fonctionnement :</strong> Les plages de pointage (ex : 07:00 – 08:59)
            servent à <em>reconnaître automatiquement un horaire</em> lors de l&apos;arrivée du
            salarié. Elles ne correspondent pas nécessairement aux heures réelles de travail.
          </div>
        </div>

        {/* Formulaire à 4 éléments comme sur le modèle */}
        <form onSubmit={handleSaveRegle} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* 1. Heure début de pointage */}
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">
                Heure début de pointage <span className="text-danger">*</span>
              </label>
              <div className="relative">
                <Clock className="absolute left-3 top-2.5 size-4 text-muted-foreground pointer-events-none" />
                <input
                  type="time"
                  required
                  value={formHeureDebut}
                  onChange={(e) => setFormHeureDebut(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-md border border-border bg-surface text-xs sm:text-sm font-mono text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <span className="text-[11px] text-muted-foreground mt-1 block">Format HH:mm</span>
            </div>

            {/* 2. Heure fin de pointage */}
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">
                Heure fin de pointage <span className="text-danger">*</span>
              </label>
              <div className="relative">
                <Clock className="absolute left-3 top-2.5 size-4 text-muted-foreground pointer-events-none" />
                <input
                  type="time"
                  required
                  value={formHeureFin}
                  onChange={(e) => setFormHeureFin(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-md border border-border bg-surface text-xs sm:text-sm font-mono text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <span className="text-[11px] text-muted-foreground mt-1 block">Format HH:mm</span>
            </div>

            {/* 3. Horaire à affecter (dynamique depuis cvaccess_horaires) */}
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">
                Horaire à affecter <span className="text-danger">*</span>
              </label>
              <select
                required
                value={formSelectedHoraireId}
                onChange={(e) => setFormSelectedHoraireId(e.target.value)}
                className="w-full px-3 py-2 rounded-md border border-border bg-surface text-xs sm:text-sm font-semibold text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
              >
                {cvHoraires.length === 0 ? (
                  <option value="">Chargement des horaires CVAccess...</option>
                ) : (
                  cvHoraires.map((h) => (
                    <option key={h.cvaccess_horaire_id} value={h.cvaccess_horaire_id}>
                      {h.period_name}
                    </option>
                  ))
                )}
              </select>
              <span className="text-[11px] text-muted-foreground mt-1 block">
                Synchronisé automatiquement depuis CVAccess ({cvHoraires.length} horaires disponibles)
              </span>
            </div>
          </div>

          {/* Détection et affichage informatif de l'horaire sélectionné (Section 4 : Gestion nuit) */}
          {selectedCvHoraire && (
            <div
              className={cn(
                "rounded-lg p-3.5 text-xs font-medium border flex items-center justify-between flex-wrap gap-2",
                estNuitTravail
                  ? "bg-indigo-500/10 border-indigo-500/25 text-indigo-900 dark:text-indigo-300"
                  : "bg-muted border-border text-foreground"
              )}
            >
              <div className="flex items-center gap-2">
                {estNuitTravail ? (
                  <Moon className="size-4 shrink-0 text-indigo-500" />
                ) : (
                  <Sun className="size-4 shrink-0 text-amber-500" />
                )}
                <span>
                  <strong>Heures réelles de travail :</strong>{" "}
                  {selectedCvHoraire.to_work_time_clean || (selectedCvHoraire.to_work_time || "").slice(0, 5)} –{" "}
                  {selectedCvHoraire.off_work_time_clean || (selectedCvHoraire.off_work_time || "").slice(0, 5)}
                  {selectedCvHoraire.working_hours
                    ? ` (${Math.round(selectedCvHoraire.working_hours / 60)}h effectives)`
                    : ""}
                </span>
              </div>

              {/* 4. GESTION DES HORAIRES DE NUIT */}
              {estNuitTravail && (
                <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold bg-indigo-500/20 text-indigo-800 dark:text-indigo-300 border border-indigo-500/30">
                  <Moon className="size-3" />
                  Sortie le lendemain (+1 jour)
                </span>
              )}
            </div>
          )}

          {/* Indicateur si la plage de pointage traverse minuit */}
          {estNuitPlagePtg && (
            <div className="flex items-center gap-2 rounded-lg bg-indigo-500/10 p-3 text-xs text-indigo-800 dark:text-indigo-300 border border-indigo-500/20">
              <Moon className="size-4 shrink-0 text-indigo-500" />
              <span>
                <strong>Plage de pointage nocturne :</strong> Cette plage commence à {formHeureDebut}{" "}
                et s&apos;achève le lendemain à {formHeureFin}.
              </span>
            </div>
          )}

          {/* Boutons d'action (4. Enregistrer : bouton bleu principal) */}
          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-border">
            {editingRegleId && (
              <Button
                type="button"
                variant="outline"
                onClick={handleCancelEdit}
                disabled={submittingRegle}
                className="h-9 text-xs"
              >
                Annuler la modification
              </Button>
            )}

            <Button
              type="submit"
              variant="primary"
              disabled={submittingRegle || cvHoraires.length === 0}
              className="h-9 px-5 text-xs font-semibold"
            >
              {editingRegleId ? (
                <>
                  <Pencil className="size-3.5 mr-1.5" />
                  {submittingRegle ? "Mise à jour..." : "Mettre à jour la règle"}
                </>
              ) : (
                <>
                  <Save className="size-3.5 mr-1.5" />
                  {submittingRegle ? "Enregistrement..." : "Enregistrer"}
                </>
              )}
            </Button>
          </div>
        </form>
      </Card>

      {/* ========================================================= */}
      {/* 3. TROISIÈME SECTION : PARAMÉTRAGES HORAIRES EXISTANTS */}
      {/* ========================================================= */}
      <Card className="border-border shadow-xs">
        <div className="flex items-center justify-between border-b border-border p-4 sm:p-5 flex-wrap gap-2">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-foreground">
              3. Paramétrages horaires existants
            </h2>
            <p className="text-xs text-muted-foreground">
              Tableau des plages de pointage configurées et horaires associés (table{" "}
              <code className="text-primary font-mono font-semibold">horaires</code>).
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground hidden sm:inline">
              {regles.length} règle{regles.length > 1 ? "s" : ""} active
              {regles.length > 1 ? "s" : ""}
            </span>
            <Button
              variant="outline"
              onClick={chargerRegles}
              disabled={loadingRegles}
              className="h-8 text-xs"
            >
              <RotateCcw className={cn("size-3 mr-1.5", loadingRegles && "animate-spin")} />
              Actualiser
            </Button>
          </div>
        </div>

        {/* Tableau professionnel des règles */}
        <div className="w-full overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs sm:text-sm">
            <thead className="bg-muted text-xs text-muted-foreground font-semibold">
              <tr>
                <th className="px-4 py-3 text-center">Début</th>
                <th className="px-4 py-3 text-center">Fin</th>
                <th className="px-4 py-3">Horaire affecté</th>
                <th className="px-4 py-3">Heures réelles de travail</th>
                <th className="px-4 py-3 text-center">Statut</th>
                <th className="px-4 py-3 text-center w-28">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loadingRegles ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-xs text-muted-foreground">
                    Chargement des règles configurées depuis la base ocp_pointage...
                  </td>
                </tr>
              ) : regles.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-xs text-muted-foreground">
                    Aucune règle horaire enregistrée. Utilisez le formulaire ci-dessus pour en ajouter
                    une.
                  </td>
                </tr>
              ) : (
                regles.map((r) => {
                  const isNight = r.est_nuit;
                  return (
                    <tr
                      key={r.id}
                      className={cn(
                        "hover:bg-muted/40 transition-colors",
                        editingRegleId === r.id && "bg-primary/5",
                        !r.actif && "opacity-60 bg-muted/20"
                      )}
                    >
                      {/* Heure début de pointage */}
                      <td className="px-4 py-3 text-center font-mono font-bold text-foreground">
                        <span className="inline-flex rounded px-2 py-0.5 bg-muted font-mono font-bold">
                          {r.heure_debut}
                        </span>
                      </td>

                      {/* Heure fin de pointage */}
                      <td className="px-4 py-3 text-center font-mono font-bold text-foreground">
                        <span className="inline-flex rounded px-2 py-0.5 bg-muted font-mono font-bold">
                          {r.heure_fin}
                        </span>
                      </td>

                      {/* Code ou nom de l'horaire affecté */}
                      <td className="px-4 py-3 font-semibold text-foreground">
                        <div className="flex items-center gap-1.5">
                          {isNight ? (
                            <Moon className="size-4 text-indigo-500 shrink-0" />
                          ) : (
                            <Clock className="size-4 text-primary shrink-0" />
                          )}
                          <span>{r.period_name || r.cvaccess_horaire_id}</span>
                        </div>
                      </td>

                      {/* Heures réelles de travail */}
                      <td className="px-4 py-3 text-xs text-foreground">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono">
                            {r.to_work_time || "--:--"} – {r.off_work_time || "--:--"}
                          </span>

                          {/* 4. Gestion visuelle nuit : Sortie le lendemain (+1 jour) */}
                          {isNight && (
                            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold bg-indigo-500/15 text-indigo-700 dark:text-indigo-400 border border-indigo-500/25">
                              <Moon className="size-2.5" />
                              Sortie le lendemain (+1 jour)
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Statut actif / inactif */}
                      <td className="px-4 py-3 text-center">
                        {r.actif ? (
                          <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                            <span className="size-1.5 rounded-full bg-emerald-500" />
                            Actif
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium bg-muted text-muted-foreground border border-border">
                            Inactif
                          </span>
                        )}
                      </td>

                      {/* Actions : Modifier et Désactiver/Activer */}
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* Modifier */}
                          <button
                            type="button"
                            onClick={() => handleEditRegle(r)}
                            className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-muted transition-colors cursor-pointer"
                            title="Modifier cette règle"
                          >
                            <Pencil className="size-4" />
                          </button>

                          {/* Activer / Désactiver */}
                          <button
                            type="button"
                            onClick={() => handleToggleActif(r)}
                            disabled={togglingId === r.id}
                            className={cn(
                              "p-1.5 rounded-md transition-colors cursor-pointer",
                              r.actif
                                ? "text-muted-foreground hover:text-amber-600 hover:bg-amber-500/10"
                                : "text-muted-foreground hover:text-emerald-600 hover:bg-emerald-500/10"
                            )}
                            title={r.actif ? "Désactiver cette règle" : "Activer cette règle"}
                          >
                            <Power className="size-4" />
                          </button>

                          {/* Supprimer */}
                          <button
                            type="button"
                            onClick={() => setDeletingRegle(r)}
                            className="p-1.5 rounded-md text-muted-foreground hover:text-danger hover:bg-danger-soft transition-colors cursor-pointer"
                            title="Supprimer cette règle"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ========================================================= */}
      {/* MODALE DE CONFIRMATION DE SUPPRESSION */}
      {/* ========================================================= */}
      {deletingRegle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <Card className="w-full max-w-md p-6 space-y-4 shadow-xl border-border bg-surface">
            <div className="flex items-center gap-3 text-danger">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-danger-soft">
                <AlertTriangle className="size-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-foreground">Confirmation de suppression</h3>
                <p className="text-xs text-muted-foreground">Cette action supprimera la règle horaire.</p>
              </div>
            </div>

            <p className="text-sm text-foreground">
              Êtes-vous sûr de vouloir supprimer la règle de reconnaissance{" "}
              <strong className="font-mono text-primary">
                {deletingRegle.heure_debut} – {deletingRegle.heure_fin}
              </strong>{" "}
              associée à l&apos;horaire <em>{deletingRegle.period_name}</em> ?
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDeletingRegle(null)}
              >
                Annuler
              </Button>
              <Button
                type="button"
                onClick={handleConfirmDelete}
                className="bg-danger text-white hover:bg-danger/90"
              >
                Confirmer la suppression
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
