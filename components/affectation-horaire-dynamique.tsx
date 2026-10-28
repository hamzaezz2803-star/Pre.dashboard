"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
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
  FileSpreadsheet,
  HelpCircle,
  ArrowRight,
  Filter,
  Check,
  X,
  Play,
  Zap,
  LayoutGrid,
  CalendarCheck,
  CalendarDays,
  ShieldAlert,
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
  jours_semaine?: number[]; // 1 = Lundi ... 7 = Dimanche
  actif: boolean;
  date_creation?: string;
  period_name?: string;
  to_work_time?: string;
  off_work_time?: string;
  working_hours?: number;
  est_nuit?: boolean;
}

// Constante des 7 jours de la semaine (ISO: 1 = Lundi ... 7 = Dimanche)
const JOURS_SEMAINE_DEF = [
  { id: 1, nom: "Lundi", court: "Lun", lettre: "L" },
  { id: 2, nom: "Mardi", court: "Mar", lettre: "M" },
  { id: 3, nom: "Mercredi", court: "Mer", lettre: "M" },
  { id: 4, nom: "Jeudi", court: "Jeu", lettre: "J" },
  { id: 5, nom: "Vendredi", court: "Ven", lettre: "V" },
  { id: 6, nom: "Samedi", court: "Sam", lettre: "S" },
  { id: 7, nom: "Dimanche", court: "Dim", lettre: "D" },
];

// Convertit "HH:mm" en minutes depuis minuit
function timeStringToMinutes(t: string): number {
  if (!t) return 0;
  const [h, m] = t.slice(0, 5).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

// Vérifie si une heure "HH:mm" est dans une plage [debut, fin] (supporte franchissement minuit)
function isTimeInWindow(testTime: string, startTime: string, endTime: string): boolean {
  const t = timeStringToMinutes(testTime);
  const s = timeStringToMinutes(startTime);
  const e = timeStringToMinutes(endTime);
  if (s <= e) {
    return t >= s && t <= e;
  }
  // Plage traversant minuit (ex: 21:00 à 02:00)
  return t >= s || t <= e;
}

// Vérifie si deux plages horaires se chevauchent
function rangesOverlap(startA: string, endA: string, startB: string, endB: string): boolean {
  const sA = timeStringToMinutes(startA);
  const eA = timeStringToMinutes(endA);
  const sB = timeStringToMinutes(startB);
  const eB = timeStringToMinutes(endB);

  const intervalsA = eA >= sA ? [[sA, eA]] : [[sA, 1440], [0, eA]];
  const intervalsB = eB >= sB ? [[sB, eB]] : [[sB, 1440], [0, eB]];

  for (const [s1, e1] of intervalsA) {
    for (const [s2, e2] of intervalsB) {
      if (Math.max(s1, s2) < Math.min(e1, e2)) {
        return true;
      }
    }
  }
  return false;
}

// Vérifie si deux listes de jours ont au moins un jour en commun
function daysOverlap(daysA: number[], daysB?: number[]): boolean {
  const setA = new Set(daysA && daysA.length > 0 ? daysA : [1, 2, 3, 4, 5, 6, 7]);
  const setB = new Set(daysB && daysB.length > 0 ? daysB : [1, 2, 3, 4, 5, 6, 7]);
  for (const d of setA) {
    if (setB.has(d)) return true;
  }
  return false;
}

// Formate l'affichage des jours en badge lisible
function formatJoursAffichage(jours?: number[]): string {
  if (!jours || jours.length === 0 || jours.length === 7) {
    return "7j/7 (Tous les jours)";
  }
  const sorted = [...jours].sort((a, b) => a - b);
  const str = sorted.join(",");
  if (str === "1,2,3,4,5") return "Lun – Ven (Jours ouvrés)";
  if (str === "6,7") return "Sam – Dim (Week-end)";
  return sorted.map((id) => JOURS_SEMAINE_DEF.find((j) => j.id === id)?.court || `${id}`).join(", ");
}

export function AffectationHoraireDynamique() {
  // Navigation par onglets
  const [activeTab, setActiveTab] = useState<"collaborateurs" | "regles" | "simulateur" | "tout">("collaborateurs");
  const [showGuide, setShowGuide] = useState(false);

  // -------------------------------------------------------------
  // SECTION 1 : ÉTATS SÉLECTION DES EMPLOYÉS
  // -------------------------------------------------------------
  const [departements, setDepartements] = useState<DepartementItem[]>([]);
  const [selectedDeptId, setSelectedDeptId] = useState<string>("all");
  const [rechercheEmploye, setRechercheEmploye] = useState("");
  const [filterActifStatus, setFilterActifStatus] = useState<"all" | "active" | "inactive">("all");
  const [employes, setEmployes] = useState<EmployeItem[]>([]);
  const [loadingEmployes, setLoadingEmployes] = useState(true);

  // Sélections persistantes
  const [selectedEmployeIds, setSelectedEmployeIds] = useState<Set<string>>(new Set());
  const [savedEmployeIds, setSavedEmployeIds] = useState<Set<string>>(new Set());
  const [selectionLoaded, setSelectionLoaded] = useState(false);
  const [savingSelection, setSavingSelection] = useState(false);
  const [selectionNotice, setSelectionNotice] = useState<string | null>(null);

  // Pagination
  const [pageEmployes, setPageEmployes] = useState(1);
  const [employesPerPage, setEmployesPerPage] = useState(8);

  // -------------------------------------------------------------
  // SECTION 2 : ÉTATS FORMULAIRE HORAIRE DYNAMIQUE
  // -------------------------------------------------------------
  const [cvHoraires, setCvHoraires] = useState<CvAccessHoraireItem[]>([]);
  const [loadingCvHoraires, setLoadingCvHoraires] = useState(true);

  const [formHeureDebut, setFormHeureDebut] = useState("07:00");
  const [formHeureFin, setFormHeureFin] = useState("08:59");
  const [formSelectedHoraireId, setFormSelectedHoraireId] = useState("");
  // Sélection des jours d'application (par défaut tous les 7 jours)
  const [formJoursSemaine, setFormJoursSemaine] = useState<number[]>([1, 2, 3, 4, 5, 6, 7]);
  const [editingRegleId, setEditingRegleId] = useState<number | null>(null);
  const [submittingRegle, setSubmittingRegle] = useState(false);

  // -------------------------------------------------------------
  // SECTION 3 : ÉTATS TABLEAU DES RÈGLES EXISTANTES
  // -------------------------------------------------------------
  const [regles, setRegles] = useState<RegleHoraireItem[]>([]);
  const [loadingRegles, setLoadingRegles] = useState(true);
  const [deletingRegle, setDeletingRegle] = useState<RegleHoraireItem | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  // -------------------------------------------------------------
  // SECTION 4 : SIMULATEUR DE POINTAGE EN DIRECT
  // -------------------------------------------------------------
  const [simulatedTime, setSimulatedTime] = useState("07:45");
  // Jour simulé : 1 = Lundi ... 7 = Dimanche (par défaut jour actuel)
  const [simulatedDay, setSimulatedDay] = useState<number>(() => {
    const d = new Date().getDay();
    return d === 0 ? 7 : d;
  });

  // Messages globaux
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [syncingCvAccess, setSyncingCvAccess] = useState(false);

  // -------------------------------------------------------------
  // DÉTECTION DES MODIFICATIONS NON ENREGISTRÉES
  // -------------------------------------------------------------
  const hasUnsavedChanges = useMemo(() => {
    if (!selectionLoaded) return false;
    if (selectedEmployeIds.size !== savedEmployeIds.size) return true;
    for (const id of selectedEmployeIds) {
      if (!savedEmployeIds.has(id)) return true;
    }
    return false;
  }, [selectedEmployeIds, savedEmployeIds, selectionLoaded]);

  const diffCount = useMemo(() => {
    if (!selectionLoaded) return 0;
    let count = 0;
    for (const id of selectedEmployeIds) {
      if (!savedEmployeIds.has(id)) count++;
    }
    for (const id of savedEmployeIds) {
      if (!selectedEmployeIds.has(id)) count++;
    }
    return count;
  }, [selectedEmployeIds, savedEmployeIds, selectionLoaded]);

  // -------------------------------------------------------------
  // CHARGEMENT INITIAL DES DONNÉES
  // -------------------------------------------------------------
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

          if (!selectionLoaded || isRefresh) {
            let activeSet: Set<string>;
            if (Array.isArray(data.activeIds)) {
              activeSet = new Set(data.activeIds);
            } else if (Array.isArray(data.employes)) {
              const fromList = data.employes
                .filter((emp: EmployeItem) => emp.actif)
                .map((emp: EmployeItem) => emp.id);
              activeSet = new Set(fromList);
            } else {
              activeSet = new Set();
            }
            setSelectedEmployeIds(new Set(activeSet));
            setSavedEmployeIds(new Set(activeSet));
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

  // Synchronisation depuis CVAccess
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
          "Synchronisation CVAccess réussie : départements, collaborateurs et horaires récents chargés."
      );
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

  const handleResetSelection = () => {
    setSelectedEmployeIds(new Set(savedEmployeIds));
    setSuccessMsg("Modifications locales annulées. État initial restauré.");
  };

  const employesFiltres = useMemo(() => {
    return employes.filter((emp) => {
      const isSelected = selectedEmployeIds.has(emp.id);
      if (filterActifStatus === "active" && !isSelected) return false;
      if (filterActifStatus === "inactive" && isSelected) return false;
      return true;
    });
  }, [employes, selectedEmployeIds, filterActifStatus]);

  const totalPagesEmployes = Math.max(1, Math.ceil(employesFiltres.length / employesPerPage));
  const employesAffiches = useMemo(() => {
    const start = (pageEmployes - 1) * employesPerPage;
    return employesFiltres.slice(start, start + employesPerPage);
  }, [employesFiltres, pageEmployes, employesPerPage]);

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

  const handleToutActiverVisibles = () => {
    setSelectedEmployeIds((prev) => {
      const next = new Set(prev);
      employesFiltres.forEach((emp) => next.add(emp.id));
      return next;
    });
  };

  const handleToutDesactiverVisibles = () => {
    setSelectedEmployeIds((prev) => {
      const next = new Set(prev);
      employesFiltres.forEach((emp) => next.delete(emp.id));
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

      setSuccessMsg(
        data.message || `Sélection enregistrée avec succès : ${activeList.length} collaborateur(s) soumis à l'affectation dynamique.`
      );
      setSavedEmployeIds(new Set(selectedEmployeIds));
      await chargerEmployes(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erreur inattendue lors de l'enregistrement.";
      setErrorMsg(`Échec de l'enregistrement : ${msg}`);
      setSelectionNotice(`Échec de l'enregistrement PostgreSQL : ${msg}`);
    } finally {
      setSavingSelection(false);
    }
  };

  // -------------------------------------------------------------
  // GESTION DU FORMULAIRE ET DES JOURS (SECTION 2)
  // -------------------------------------------------------------
  const toggleJourSemaine = (jourId: number) => {
    setFormJoursSemaine((prev) => {
      if (prev.includes(jourId)) {
        // Empêcher d'avoir 0 jour
        if (prev.length <= 1) return prev;
        return prev.filter((id) => id !== jourId);
      } else {
        return [...prev, jourId].sort((a, b) => a - b);
      }
    });
  };

  const handleSelectAllJours = () => {
    setFormJoursSemaine([1, 2, 3, 4, 5, 6, 7]);
  };

  const handleSelectOuvres = () => {
    setFormJoursSemaine([1, 2, 3, 4, 5]);
  };

  const handleSelectWeekend = () => {
    setFormJoursSemaine([6, 7]);
  };

  const handleInvertJours = () => {
    setFormJoursSemaine((prev) => {
      const all = [1, 2, 3, 4, 5, 6, 7];
      const inv = all.filter((id) => !prev.includes(id));
      return inv.length > 0 ? inv : all;
    });
  };

  const selectedCvHoraire = useMemo(() => {
    return cvHoraires.find((h) => h.cvaccess_horaire_id === formSelectedHoraireId) || null;
  }, [cvHoraires, formSelectedHoraireId]);

  const estNuitTravail = useMemo(() => {
    if (!selectedCvHoraire) return false;
    const d = selectedCvHoraire.to_work_time_clean || (selectedCvHoraire.to_work_time || "").slice(0, 5);
    const f = selectedCvHoraire.off_work_time_clean || (selectedCvHoraire.off_work_time || "").slice(0, 5);
    if (!d || !f) return false;
    const [hD, mD] = d.split(":").map(Number);
    const [hF, mF] = f.split(":").map(Number);
    return hF * 60 + mF <= hD * 60 + mD;
  }, [selectedCvHoraire]);

  // Détection de conflit tenant compte à la fois des heures ET des jours d'application
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

  // Préréglages rapides en 1 clic
  const handleApplyPreset = (debut: string, fin: string, keywords: string[], jours?: number[]) => {
    setFormHeureDebut(debut);
    setFormHeureFin(fin);
    if (jours) {
      setFormJoursSemaine(jours);
    }
    const match = cvHoraires.find((h) =>
      keywords.some((kw) => (h.period_name || "").toLowerCase().includes(kw.toLowerCase()))
    );
    if (match) {
      setFormSelectedHoraireId(match.cvaccess_horaire_id);
    }
  };

  // -------------------------------------------------------------
  // SOUMISSION DU FORMULAIRE DE RÈGLE (SECTION 2)
  // -------------------------------------------------------------
  const handleSaveRegle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formHeureDebut || !formHeureFin || !formSelectedHoraireId) {
      setErrorMsg("Veuillez renseigner les heures de début et fin de pointage et choisir un horaire.");
      return;
    }

    if (formJoursSemaine.length === 0) {
      setErrorMsg("Veuillez sélectionner au moins un jour d'application pour cette plage horaire.");
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
        jours_semaine: formJoursSemaine,
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

      setEditingRegleId(null);
      setFormHeureDebut("07:00");
      setFormHeureFin("08:59");
      setFormJoursSemaine([1, 2, 3, 4, 5, 6, 7]);
      chargerRegles();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Erreur inattendue.");
    } finally {
      setSubmittingRegle(false);
    }
  };

  const handleEditRegle = (regle: RegleHoraireItem) => {
    setEditingRegleId(regle.id);
    setFormHeureDebut(regle.heure_debut);
    setFormHeureFin(regle.heure_fin);
    setFormSelectedHoraireId(regle.cvaccess_horaire_id);
    setFormJoursSemaine(
      regle.jours_semaine && regle.jours_semaine.length > 0
        ? regle.jours_semaine
        : [1, 2, 3, 4, 5, 6, 7]
    );
    setActiveTab("regles");
    const el = document.getElementById("formulaire-horaire-dynamique");
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    }
  };

  const handleCancelEdit = () => {
    setEditingRegleId(null);
    setFormHeureDebut("07:00");
    setFormHeureFin("08:59");
    setFormJoursSemaine([1, 2, 3, 4, 5, 6, 7]);
    if (cvHoraires.length > 0) {
      setFormSelectedHoraireId(cvHoraires[0].cvaccess_horaire_id);
    }
  };

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

  // -------------------------------------------------------------
  // SIMULATEUR DE POINTAGE EN TEMPS RÉEL (SECTION 4)
  // -------------------------------------------------------------
  const resultatSimulation = useMemo(() => {
    if (!simulatedTime) return null;

    // Cherche d'abord une règle qui correspond à la fois à l'heure ET au jour
    const matchedRule = regles.find(
      (r) =>
        r.actif &&
        isTimeInWindow(simulatedTime, r.heure_debut, r.heure_fin) &&
        (r.jours_semaine || [1, 2, 3, 4, 5, 6, 7]).includes(simulatedDay)
    );

    // Cherche si une règle correspondait à l'heure mais a été exclue à cause du jour
    const matchedTimeOnly = regles.find(
      (r) =>
        r.actif &&
        isTimeInWindow(simulatedTime, r.heure_debut, r.heure_fin) &&
        !(r.jours_semaine || [1, 2, 3, 4, 5, 6, 7]).includes(simulatedDay)
    );

    if (!matchedRule) {
      return {
        matched: false,
        rule: null,
        cvHoraire: null,
        isNight: false,
        dayExclusionNotice: matchedTimeOnly
          ? `Une règle (${matchedTimeOnly.period_name}) existe pour cette plage (${matchedTimeOnly.heure_debut} - ${matchedTimeOnly.heure_fin}) mais ne s'applique pas le ${JOURS_SEMAINE_DEF.find((j) => j.id === simulatedDay)?.nom}.`
          : null,
      };
    }

    const matchedCv = cvHoraires.find(
      (h) => h.cvaccess_horaire_id === matchedRule.cvaccess_horaire_id
    );

    return {
      matched: true,
      rule: matchedRule,
      cvHoraire: matchedCv,
      isNight: matchedRule.est_nuit,
      dayExclusionNotice: null,
    };
  }, [simulatedTime, simulatedDay, regles, cvHoraires]);

  const getInitials = (nom: string, prenom: string) => {
    const n = (nom || "").trim().charAt(0).toUpperCase();
    const p = (prenom || "").trim().charAt(0).toUpperCase();
    return `${n}${p}` || "OC";
  };

  return (
    <div className="w-full space-y-6 px-3 py-6 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      {/* ========================================================= */}
      {/* 1. EN-TÊTE PRINCIPAL ULTRA-PRO */}
      {/* ========================================================= */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-border pb-5">
        <div className="flex items-start sm:items-center gap-3.5">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20 shadow-xs">
            <Sliders className="size-6" />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-foreground">
                Affectation horaire dynamique
              </h1>
              <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold bg-primary/10 text-primary border border-primary/20">
                <Sparkles className="size-3" />
                OCP Pointage Intelligent
              </span>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
              Affectez automatiquement le shift (Matin, Soir, Nuit) selon l&apos;heure et le jour réel d&apos;arrivée.
            </p>
          </div>
        </div>

        {/* Boutons d'action rapides */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={() => setShowGuide((prev) => !prev)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-surface hover:bg-muted text-xs font-semibold text-foreground transition-colors cursor-pointer shadow-2xs"
            title="Consulter le guide explicatif pas-à-pas"
          >
            <HelpCircle className="size-3.5 text-primary" />
            <span>{showGuide ? "Masquer le guide" : "Comment ça marche ?"}</span>
          </button>

          <Link href="/rapport-presences">
            <Button
              variant="outline"
              className="h-9 text-xs font-semibold border-primary/30 text-primary hover:bg-primary/10 shadow-2xs"
              title="Consulter le rapport officiel des présences et exporter vers Excel / PDF"
            >
              <FileSpreadsheet className="size-3.5 mr-1.5 text-primary" />
              Rapport des présences
            </Button>
          </Link>

          <Button
            variant="primary"
            onClick={handleSyncCvAccess}
            disabled={syncingCvAccess || loadingEmployes || loadingRegles || loadingCvHoraires}
            className="h-9 text-xs font-semibold shadow-xs"
            title="Synchronise les collaborateurs, départements et horaires depuis la base CVAccess"
          >
            <RotateCcw className={cn("size-3.5 mr-1.5", syncingCvAccess && "animate-spin")} />
            {syncingCvAccess ? "Synchronisation en cours..." : "Actualiser depuis CVAccess"}
          </Button>
        </div>
      </div>

      {/* Guide interactif repliable "Comment ça marche ?" */}
      {showGuide && (
        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5 text-foreground space-y-4 animate-in fade-in duration-200 shadow-xs">
          <div className="flex items-center justify-between border-b border-primary/15 pb-3">
            <div className="flex items-center gap-2">
              <Zap className="size-5 text-primary" />
              <h3 className="text-sm font-bold text-foreground">
                Guide simple : Principe de fonctionnement de l&apos;affectation dynamique
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="text-xs text-muted-foreground hover:text-foreground underline cursor-pointer"
            >
              Fermer
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="p-3.5 rounded-xl bg-surface border border-border/80 space-y-1.5 shadow-2xs">
              <div className="flex items-center gap-2 font-bold text-primary">
                <span className="flex size-5 items-center justify-center rounded-full bg-primary/15 text-[11px]">1</span>
                <span>Sélection des équipes tournantes</span>
              </div>
              <p className="text-muted-foreground leading-relaxed">
                Cochez les collaborateurs soumis au roulement (ex: équipes 3x8 ou 2x8). Seuls les collaborateurs activés bénéficient de la reconnaissance horaire.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-surface border border-border/80 space-y-1.5 shadow-2xs">
              <div className="flex items-center gap-2 font-bold text-primary">
                <span className="flex size-5 items-center justify-center rounded-full bg-primary/15 text-[11px]">2</span>
                <span>Plages horaires & Jours d&apos;application</span>
              </div>
              <p className="text-muted-foreground leading-relaxed">
                Définissez la plage horaire ET les jours de la semaine (ex: <strong>Lun-Ven</strong> pour la semaine, ou <strong>Sam-Dim</strong> pour le week-end).
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-surface border border-border/80 space-y-1.5 shadow-2xs">
              <div className="flex items-center gap-2 font-bold text-primary">
                <span className="flex size-5 items-center justify-center rounded-full bg-primary/15 text-[11px]">3</span>
                <span>Calcul automatique des présences</span>
              </div>
              <p className="text-muted-foreground leading-relaxed">
                Le trigger PostgreSQL assigne l&apos;horaire selon l&apos;heure et le jour de pointage. Si le service est en cours, le statut affiche <em>« En cours — sortie attendue »</em>.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Messages d'alerte ou de confirmation */}
      {successMsg && (
        <div className="flex items-center justify-between rounded-xl bg-emerald-500/10 p-4 text-xs sm:text-sm font-medium text-emerald-800 dark:text-emerald-300 border border-emerald-500/20 shadow-xs">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="size-4.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>{successMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMsg(null)}
            className="text-xs font-semibold underline hover:opacity-80 cursor-pointer ml-3 shrink-0"
          >
            Fermer
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="flex items-center justify-between rounded-xl bg-danger-soft p-4 text-xs sm:text-sm font-medium text-danger border border-danger/20 shadow-xs">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="size-4.5 shrink-0 text-danger" />
            <span>{errorMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="text-xs font-semibold underline hover:opacity-80 cursor-pointer ml-3 shrink-0"
          >
            Fermer
          </button>
        </div>
      )}

      {/* ========================================================= */}
      {/* 2. TABLEAU DE BORD KPI (STATISTIQUES EN TEMPS RÉEL) */}
      {/* ========================================================= */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* KPI 1 : Collaborateurs sous roulement */}
        <div
          onClick={() => setActiveTab("collaborateurs")}
          className={cn(
            "p-4 rounded-xl border bg-surface transition-all cursor-pointer shadow-2xs hover:shadow-xs",
            activeTab === "collaborateurs"
              ? "ring-2 ring-primary border-primary/40 bg-primary/[0.02]"
              : "border-border hover:border-primary/40"
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] sm:text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Collaborateurs actifs
            </span>
            <div className="flex size-7 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
              <Users className="size-3.5" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-foreground">{selectedEmployeIds.size}</span>
            <span className="text-xs text-muted-foreground font-medium">/ {employes.length} total</span>
          </div>
          <div className="mt-2 w-full bg-muted rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-emerald-500 h-1.5 rounded-full transition-all duration-300"
              style={{
                width: `${Math.min(100, Math.round((selectedEmployeIds.size / (employes.length || 1)) * 100))}%`,
              }}
            />
          </div>
        </div>

        {/* KPI 2 : Règles de reconnaissance */}
        <div
          onClick={() => setActiveTab("regles")}
          className={cn(
            "p-4 rounded-xl border bg-surface transition-all cursor-pointer shadow-2xs hover:shadow-xs",
            activeTab === "regles"
              ? "ring-2 ring-primary border-primary/40 bg-primary/[0.02]"
              : "border-border hover:border-primary/40"
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] sm:text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Règles configurées
            </span>
            <div className="flex size-7 items-center justify-center rounded-lg bg-blue-500/15 text-blue-700 dark:text-blue-400">
              <Sliders className="size-3.5" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-foreground">
              {regles.filter((r) => r.actif).length}
            </span>
            <span className="text-xs text-muted-foreground font-medium">actives sur {regles.length}</span>
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Moon className="size-3 text-indigo-500" />
            <span>{regles.filter((r) => r.est_nuit).length} shift(s) de nuit (+1j)</span>
          </div>
        </div>

        {/* KPI 3 : Horaires CVAccess reliés */}
        <div
          onClick={() => setActiveTab("regles")}
          className="p-4 rounded-xl border border-border bg-surface shadow-2xs hover:border-primary/40 transition-colors"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] sm:text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Horaires CVAccess
            </span>
            <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Clock className="size-3.5" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-foreground">{cvHoraires.length}</span>
            <span className="text-xs text-muted-foreground font-medium">périodes synchronisées</span>
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
            <Check className="size-3" />
            <span>Table cvaccess_horaires liée</span>
          </div>
        </div>

        {/* KPI 4 : Simulateur interactif */}
        <div
          onClick={() => setActiveTab("simulateur")}
          className={cn(
            "p-4 rounded-xl border bg-surface transition-all cursor-pointer shadow-2xs hover:shadow-xs",
            activeTab === "simulateur"
              ? "ring-2 ring-primary border-primary/40 bg-primary/[0.02]"
              : "border-border hover:border-primary/40"
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] sm:text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Simulateur de pointage
            </span>
            <div className="flex size-7 items-center justify-center rounded-full bg-purple-500/15 text-purple-700 dark:text-purple-400">
              <Play className="size-3.5 ml-0.5" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-lg font-bold text-foreground">Test instantané</span>
          </div>
          <div className="mt-2 flex items-center gap-1 text-[11px] text-purple-700 dark:text-purple-400 font-semibold">
            <span>Tester heure & jour</span>
            <ArrowRight className="size-3" />
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 3. BARRE DE NAVIGATION SEGMENTÉE (ONGLETS ERGONOMIQUES) */}
      {/* ========================================================= */}
      <div className="flex items-center justify-between border-b border-border gap-2 overflow-x-auto pb-1">
        <div className="flex items-center gap-1 sm:gap-2">
          {/* Onglet 1 : Collaborateurs */}
          <button
            type="button"
            onClick={() => setActiveTab("collaborateurs")}
            className={cn(
              "flex items-center gap-2 px-3.5 py-2.5 rounded-lg text-xs sm:text-sm font-bold transition-all cursor-pointer border-b-2 -mb-1",
              activeTab === "collaborateurs"
                ? "border-primary text-primary bg-primary/5"
                : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
          >
            <Users className="size-4" />
            <span>1. Sélection des collaborateurs</span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-mono font-bold",
                activeTab === "collaborateurs"
                  ? "bg-primary text-white"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {selectedEmployeIds.size}
            </span>
          </button>

          {/* Onglet 2 : Règles & Horaires */}
          <button
            type="button"
            onClick={() => setActiveTab("regles")}
            className={cn(
              "flex items-center gap-2 px-3.5 py-2.5 rounded-lg text-xs sm:text-sm font-bold transition-all cursor-pointer border-b-2 -mb-1",
              activeTab === "regles"
                ? "border-primary text-primary bg-primary/5"
                : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
          >
            <Sliders className="size-4" />
            <span>2. Règles & Plages de pointage</span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-mono font-bold",
                activeTab === "regles"
                  ? "bg-primary text-white"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {regles.length}
            </span>
          </button>

          {/* Onglet 3 : Simulateur */}
          <button
            type="button"
            onClick={() => setActiveTab("simulateur")}
            className={cn(
              "flex items-center gap-2 px-3.5 py-2.5 rounded-lg text-xs sm:text-sm font-bold transition-all cursor-pointer border-b-2 -mb-1",
              activeTab === "simulateur"
                ? "border-primary text-primary bg-primary/5"
                : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
          >
            <Play className="size-4" />
            <span>3. Simulateur de pointage</span>
            <span className="rounded-full px-1.5 py-0.5 text-[9px] font-bold bg-purple-500/20 text-purple-800 dark:text-purple-300">
              Interactif
            </span>
          </button>
        </div>

        {/* Bouton pour afficher tout en un seul écran (Vue complète) */}
        <button
          type="button"
          onClick={() => setActiveTab((prev) => (prev === "tout" ? "collaborateurs" : "tout"))}
          className={cn(
            "hidden md:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer shrink-0",
            activeTab === "tout"
              ? "bg-primary/10 border-primary text-primary"
              : "bg-surface border-border text-muted-foreground hover:text-foreground"
          )}
          title="Afficher tous les blocs verticalement sur une seule page"
        >
          <LayoutGrid className="size-3.5" />
          <span>{activeTab === "tout" ? "Vue par onglets" : "Vue complète"}</span>
        </button>
      </div>

      {/* ========================================================= */}
      {/* BANNIÈRE FLOTTANTE DE MODIFICATIONS NON ENREGISTRÉES */}
      {/* ========================================================= */}
      {hasUnsavedChanges && (
        <div className="sticky top-4 z-40 flex items-center justify-between gap-3 p-3.5 rounded-xl bg-amber-500/15 border-2 border-amber-500/40 text-amber-950 dark:text-amber-200 shadow-md backdrop-blur-md animate-in slide-in-from-top duration-200">
          <div className="flex items-center gap-2.5">
            <span className="flex size-3 rounded-full bg-amber-500 animate-ping" />
            <span className="text-xs sm:text-sm font-bold">
              {diffCount} modification{diffCount > 1 ? "s" : ""} non enregistrée{diffCount > 1 ? "s" : ""}{" "}
              dans la sélection des collaborateurs.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleResetSelection}
              disabled={savingSelection}
              className="h-8 px-3 text-xs border-amber-600/30 hover:bg-amber-500/10 text-amber-900 dark:text-amber-200 font-semibold"
            >
              Annuler
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={handleEnregistrerSelectionEmployes}
              disabled={savingSelection}
              className="h-8 px-4 text-xs font-bold shadow-xs bg-amber-600 hover:bg-amber-700 text-white border-0"
            >
              <Save className="size-3.5 mr-1.5" />
              {savingSelection ? "Enregistrement..." : "Enregistrer dans PostgreSQL"}
            </Button>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* ONGLET 1 : SÉLECTION DES COLLABORATEURS */}
      {/* ========================================================= */}
      {(activeTab === "collaborateurs" || activeTab === "tout") && (
        <Card className="p-5 sm:p-6 border-border shadow-xs space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Users className="size-5" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-bold text-foreground">
                  1. Sélection des collaborateurs soumis au roulement
                </h2>
                <p className="text-xs text-muted-foreground">
                  Activez les employés qui travaillent selon des plages horaires dynamiques.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Button
                type="button"
                variant="outline"
                onClick={handleSyncCvAccess}
                disabled={syncingCvAccess || loadingEmployes}
                className="h-8.5 text-xs"
                title="Actualiser les collaborateurs depuis CVAccess"
              >
                <RotateCcw className={cn("size-3.5 mr-1.5", syncingCvAccess && "animate-spin")} />
                Actualiser
              </Button>

              <Button
                type="button"
                variant="primary"
                onClick={handleEnregistrerSelectionEmployes}
                disabled={savingSelection}
                className={cn(
                  "h-8.5 text-xs font-bold shadow-xs",
                  hasUnsavedChanges && "ring-2 ring-amber-500/60"
                )}
              >
                <Save className="size-3.5 mr-1.5" />
                {savingSelection ? "Enregistrement..." : "Enregistrer la sélection"}
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              <div className="relative lg:col-span-2">
                <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground pointer-events-none" />
                <input
                  type="text"
                  value={rechercheEmploye}
                  onChange={(e) => {
                    setRechercheEmploye(e.target.value);
                    setPageEmployes(1);
                  }}
                  placeholder="Rechercher par matricule, nom ou prénom..."
                  className="w-full pl-9 pr-8 py-2 rounded-lg border border-border bg-surface text-xs sm:text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary shadow-2xs"
                />
                {rechercheEmploye && (
                  <button
                    type="button"
                    onClick={() => {
                      setRechercheEmploye("");
                      setPageEmployes(1);
                    }}
                    className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>

              <div className="relative">
                <Building2 className="absolute left-3 top-2.5 size-4 text-muted-foreground pointer-events-none" />
                <select
                  value={selectedDeptId}
                  onChange={(e) => {
                    setSelectedDeptId(e.target.value);
                    setPageEmployes(1);
                  }}
                  className="w-full pl-9 pr-8 py-2 rounded-lg border border-border bg-surface text-xs sm:text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary appearance-none cursor-pointer shadow-2xs"
                >
                  <option value="all">Tous les départements ({departements.length})</option>
                  {departements.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} {d.code ? `(${d.code})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground shrink-0">Afficher :</span>
                <select
                  value={employesPerPage}
                  onChange={(e) => {
                    setEmployesPerPage(Number(e.target.value));
                    setPageEmployes(1);
                  }}
                  className="w-full px-2.5 py-2 rounded-lg border border-border bg-surface text-xs font-semibold text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer shadow-2xs"
                >
                  <option value={8}>8 par page</option>
                  <option value={15}>15 par page</option>
                  <option value={30}>30 par page</option>
                  <option value={100}>100 par page</option>
                </select>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-semibold text-muted-foreground mr-1 flex items-center gap-1">
                  <Filter className="size-3" /> Filtrer :
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setFilterActifStatus("all");
                    setPageEmployes(1);
                  }}
                  className={cn(
                    "px-2.5 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer border",
                    filterActifStatus === "all"
                      ? "bg-primary text-white border-primary shadow-2xs"
                      : "bg-surface text-muted-foreground border-border hover:bg-muted"
                  )}
                >
                  Tous ({employes.length})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFilterActifStatus("active");
                    setPageEmployes(1);
                  }}
                  className={cn(
                    "px-2.5 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer border flex items-center gap-1",
                    filterActifStatus === "active"
                      ? "bg-emerald-600 text-white border-emerald-600 shadow-2xs"
                      : "bg-surface text-emerald-700 dark:text-emerald-400 border-border hover:bg-emerald-500/10"
                  )}
                >
                  <span className="size-1.5 rounded-full bg-emerald-500" />
                  Activés ({selectedEmployeIds.size})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFilterActifStatus("inactive");
                    setPageEmployes(1);
                  }}
                  className={cn(
                    "px-2.5 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer border",
                    filterActifStatus === "inactive"
                      ? "bg-muted-foreground text-white border-muted-foreground shadow-2xs"
                      : "bg-surface text-muted-foreground border-border hover:bg-muted"
                  )}
                >
                  Désactivés ({Math.max(0, employes.length - selectedEmployeIds.size)})
                </button>
              </div>

              <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
                <button
                  type="button"
                  onClick={toggleSelectAllAffiches}
                  disabled={employesAffiches.length === 0}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-border bg-muted/60 hover:bg-muted text-xs font-semibold text-foreground transition-colors cursor-pointer disabled:opacity-50"
                >
                  {tousAffichesSelectionnes ? (
                    <CheckSquare className="size-3.5 text-primary" />
                  ) : (
                    <Square className="size-3.5 text-muted-foreground" />
                  )}
                  <span>Page entière</span>
                </button>

                <button
                  type="button"
                  onClick={handleToutActiverVisibles}
                  disabled={employesFiltres.length === 0}
                  className="px-2.5 py-1 rounded-md text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10 transition-colors cursor-pointer"
                  title="Activer tous les employés affichés"
                >
                  Tout activer
                </button>

                <button
                  type="button"
                  onClick={handleToutDesactiverVisibles}
                  disabled={employesFiltres.length === 0}
                  className="px-2.5 py-1 rounded-md text-xs font-semibold text-muted-foreground hover:bg-muted transition-colors cursor-pointer"
                  title="Désactiver tous les employés affichés"
                >
                  Tout désactiver
                </button>
              </div>
            </div>
          </div>

          <div className="w-full overflow-x-auto rounded-xl border border-border shadow-2xs">
            <table className="w-full border-collapse text-left text-xs sm:text-sm">
              <thead className="bg-muted/70 text-xs text-muted-foreground font-bold uppercase tracking-wider">
                <tr>
                  <th className="px-3.5 py-3 text-center w-12">
                    <span className="sr-only">Sélection</span>
                  </th>
                  <th className="px-3.5 py-3">Matricule</th>
                  <th className="px-3.5 py-3">Collaborateur</th>
                  <th className="px-3.5 py-3">Département</th>
                  <th className="px-3.5 py-3 text-center">Statut d&apos;affectation dynamique</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loadingEmployes ? (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-xs text-muted-foreground">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <RotateCcw className="size-5 animate-spin text-primary" />
                        <span>Chargement des collaborateurs depuis pers_person...</span>
                      </div>
                    </td>
                  </tr>
                ) : employesAffiches.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-xs text-muted-foreground">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Users className="size-6 text-muted-foreground/40" />
                        <span>Aucun collaborateur ne correspond aux critères de recherche.</span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  employesAffiches.map((emp) => {
                    const isSelected = selectedEmployeIds.has(emp.id);
                    const isLocallyModified = savedEmployeIds.has(emp.id) !== isSelected;
                    return (
                      <tr
                        key={emp.id}
                        onClick={() => toggleEmploye(emp.id)}
                        className={cn(
                          "hover:bg-muted/40 transition-colors cursor-pointer",
                          isSelected && "bg-primary/[0.03]",
                          isLocallyModified && "bg-amber-500/[0.05]"
                        )}
                      >
                        <td
                          className="px-3.5 py-3 text-center"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleEmploye(emp.id);
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleEmploye(emp.id)}
                            className="size-4 rounded border-border text-primary focus:ring-primary cursor-pointer accent-primary"
                          />
                        </td>

                        <td className="px-3.5 py-3 font-mono font-bold text-xs text-foreground">
                          <span className="inline-flex rounded-md px-2 py-0.5 bg-muted font-mono font-bold border border-border/80">
                            {emp.matricule || emp.id.slice(0, 8)}
                          </span>
                        </td>

                        <td className="px-3.5 py-3">
                          <div className="flex items-center gap-2.5">
                            <div
                              className={cn(
                                "flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-black ring-1",
                                isSelected
                                  ? "bg-primary/15 text-primary ring-primary/30"
                                  : "bg-muted text-muted-foreground ring-border"
                              )}
                            >
                              {getInitials(emp.nom, emp.prenom)}
                            </div>
                            <div>
                              <div className="font-bold text-foreground uppercase tracking-wide">
                                {emp.nom || "-"}
                              </div>
                              <div className="text-xs text-muted-foreground capitalize">
                                {emp.prenom || "-"}
                              </div>
                            </div>
                          </div>
                        </td>

                        <td className="px-3.5 py-3 text-muted-foreground">
                          <span className="inline-flex items-center gap-1.5 text-xs">
                            <Building2 className="size-3.5 text-muted-foreground/70" />
                            {emp.departement}
                          </span>
                        </td>

                        <td className="px-3.5 py-3 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleEmploye(emp.id);
                              }}
                              className={cn(
                                "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1",
                                isSelected ? "bg-emerald-500" : "bg-muted"
                              )}
                              role="switch"
                              aria-checked={isSelected}
                              title={
                                isSelected
                                  ? "Désactiver l'affectation dynamique"
                                  : "Activer l'affectation dynamique"
                              }
                            >
                              <span
                                className={cn(
                                  "pointer-events-none inline-block size-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out",
                                  isSelected ? "translate-x-5" : "translate-x-0"
                                )}
                              />
                            </button>

                            <span
                              className={cn(
                                "text-xs font-bold select-none min-w-[70px] text-left",
                                isSelected
                                  ? "text-emerald-700 dark:text-emerald-400"
                                  : "text-muted-foreground"
                              )}
                            >
                              {isSelected ? "Activée" : "Désactivée"}
                            </span>

                            {isLocallyModified && (
                              <span
                                className="size-2 rounded-full bg-amber-500 shrink-0"
                                title="Modification non enregistrée"
                              />
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {employesFiltres.length > 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-border text-xs text-muted-foreground">
              <span>
                Affichage de {(pageEmployes - 1) * employesPerPage + 1} à{" "}
                {Math.min(pageEmployes * employesPerPage, employesFiltres.length)} sur{" "}
                {employesFiltres.length} collaborateur(s) filtré(s)
              </span>

              <div className="flex items-center gap-1.5 self-center sm:self-auto">
                <Button
                  variant="outline"
                  onClick={() => setPageEmployes((p) => Math.max(1, p - 1))}
                  disabled={pageEmployes === 1}
                  className="h-8 px-2.5 text-xs"
                >
                  <ChevronLeft className="size-3.5 mr-1" />
                  Précédent
                </Button>
                <span className="px-2.5 font-bold text-foreground">
                  {pageEmployes} / {totalPagesEmployes}
                </span>
                <Button
                  variant="outline"
                  onClick={() => setPageEmployes((p) => Math.min(totalPagesEmployes, p + 1))}
                  disabled={pageEmployes === totalPagesEmployes}
                  className="h-8 px-2.5 text-xs"
                >
                  Suivant
                  <ChevronRight className="size-3.5 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* ========================================================= */}
      {/* ONGLET 2 : RÈGLES & PLAGES DE POINTAGE */}
      {/* ========================================================= */}
      {(activeTab === "regles" || activeTab === "tout") && (
        <div className="space-y-6">
          <Card id="formulaire-horaire-dynamique" className="p-5 sm:p-6 border-border shadow-xs space-y-5">
            <div className="flex items-center justify-between border-b border-border pb-4 flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Clock className="size-5" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-foreground">
                    2. Configuration des règles de reconnaissance horaire
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Définissez la plage horaire d&apos;arrivée, l&apos;horaire cible et les jours de la semaine applicables.
                  </p>
                </div>
              </div>

              {editingRegleId && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-3 py-1 text-xs font-bold text-amber-800 dark:text-amber-300 border border-amber-500/30">
                  <Pencil className="size-3" />
                  Modification en cours (Règle #{editingRegleId})
                </span>
              )}
            </div>

            {/* Préréglages rapides (Presets) en 1 clic */}
            <div className="p-3.5 rounded-xl bg-muted/40 border border-border space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-foreground flex items-center gap-1.5">
                  <Zap className="size-3.5 text-amber-500" />
                  Préréglages rapides (1 clic) :
                </span>
                <span className="text-[11px] text-muted-foreground">
                  Cliquez sur un modèle pour préremplir automatiquement
                </span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => handleApplyPreset("06:00", "08:59", ["matin", "journee", "h001"], [1, 2, 3, 4, 5, 6, 7])}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-surface hover:bg-muted text-xs font-semibold text-foreground transition-all cursor-pointer shadow-2xs hover:border-amber-400"
                >
                  <Sun className="size-3.5 text-amber-500" />
                  <span>Équipe Matin (06:00 – 08:59)</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyPreset("13:00", "15:59", ["apres", "midi", "h002", "soir"], [1, 2, 3, 4, 5, 6, 7])}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-surface hover:bg-muted text-xs font-semibold text-foreground transition-all cursor-pointer shadow-2xs hover:border-orange-400"
                >
                  <Sun className="size-3.5 text-orange-500" />
                  <span>Équipe Après-midi (13:00 – 15:59)</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyPreset("21:00", "23:59", ["nuit", "h003"], [1, 2, 3, 4, 5, 6, 7])}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-surface hover:bg-muted text-xs font-semibold text-foreground transition-all cursor-pointer shadow-2xs hover:border-indigo-400"
                >
                  <Moon className="size-3.5 text-indigo-500" />
                  <span>Équipe Nuit (21:00 – 23:59)</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyPreset("07:00", "09:00", ["journee", "h001"], [1, 2, 3, 4, 5])}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-surface hover:bg-muted text-xs font-semibold text-foreground transition-all cursor-pointer shadow-2xs hover:border-emerald-400"
                >
                  <CalendarCheck className="size-3.5 text-emerald-600" />
                  <span>Semaine ouvrée seule (Lun – Ven)</span>
                </button>
              </div>
            </div>

            {/* Formulaire des paramètres de la règle */}
            <form onSubmit={handleSaveRegle} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* 1. Heure début */}
                <div>
                  <label className="block text-xs font-bold text-foreground mb-1.5">
                    Heure début de pointage <span className="text-danger">*</span>
                  </label>
                  <div className="relative">
                    <Clock className="absolute left-3 top-2.5 size-4 text-muted-foreground pointer-events-none" />
                    <input
                      type="time"
                      required
                      value={formHeureDebut}
                      onChange={(e) => setFormHeureDebut(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-surface text-xs sm:text-sm font-mono font-bold text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary shadow-2xs"
                    />
                  </div>
                  <span className="text-[11px] text-muted-foreground mt-1 block">
                    Premier pointage accepté à partir de cette heure
                  </span>
                </div>

                {/* 2. Heure fin */}
                <div>
                  <label className="block text-xs font-bold text-foreground mb-1.5">
                    Heure fin de pointage <span className="text-danger">*</span>
                  </label>
                  <div className="relative">
                    <Clock className="absolute left-3 top-2.5 size-4 text-muted-foreground pointer-events-none" />
                    <input
                      type="time"
                      required
                      value={formHeureFin}
                      onChange={(e) => setFormHeureFin(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-surface text-xs sm:text-sm font-mono font-bold text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary shadow-2xs"
                    />
                  </div>
                  <span className="text-[11px] text-muted-foreground mt-1 block">
                    Fin de la plage de reconnaissance horaire
                  </span>
                </div>

                {/* 3. Horaire à affecter */}
                <div>
                  <label className="block text-xs font-bold text-foreground mb-1.5">
                    Horaire à affecter <span className="text-danger">*</span>
                  </label>
                  <select
                    required
                    value={formSelectedHoraireId}
                    onChange={(e) => setFormSelectedHoraireId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-xs sm:text-sm font-bold text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer shadow-2xs"
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
                    Synchronisé automatiquement ({cvHoraires.length} horaires CVAccess)
                  </span>
                </div>
              </div>

              {/* ========================================================= */}
              {/* NOUVELLE CARD DÉDIÉE : SÉLECTION DES JOURS D'APPLICATION */}
              {/* ========================================================= */}
              <Card className="p-4 sm:p-5 border-border bg-muted/20 rounded-xl space-y-3.5 shadow-2xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-border/80 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <CalendarDays className="size-4.5" />
                    </div>
                    <div>
                      <h3 className="text-xs sm:text-sm font-bold text-foreground">
                        Jours d&apos;application de la règle <span className="text-danger">*</span>
                      </h3>
                      <p className="text-[11px] text-muted-foreground">
                        Sélectionnez les jours de la semaine où cette plage horaire doit être prise en compte.
                      </p>
                    </div>
                  </div>

                  {/* Actions de sélection rapide des jours */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={handleSelectAllJours}
                      className={cn(
                        "px-2.5 py-1 rounded-md text-[11px] font-bold border transition-colors cursor-pointer",
                        formJoursSemaine.length === 7
                          ? "bg-primary text-white border-primary"
                          : "bg-surface text-muted-foreground border-border hover:bg-muted"
                      )}
                    >
                      Tous (7j/7)
                    </button>
                    <button
                      type="button"
                      onClick={handleSelectOuvres}
                      className={cn(
                        "px-2.5 py-1 rounded-md text-[11px] font-bold border transition-colors cursor-pointer",
                        formJoursSemaine.length === 5 && !formJoursSemaine.includes(6) && !formJoursSemaine.includes(7)
                          ? "bg-primary text-white border-primary"
                          : "bg-surface text-muted-foreground border-border hover:bg-muted"
                      )}
                    >
                      Lun – Ven (Ouvrés)
                    </button>
                    <button
                      type="button"
                      onClick={handleSelectWeekend}
                      className={cn(
                        "px-2.5 py-1 rounded-md text-[11px] font-bold border transition-colors cursor-pointer",
                        formJoursSemaine.length === 2 && formJoursSemaine.includes(6) && formJoursSemaine.includes(7)
                          ? "bg-primary text-white border-primary"
                          : "bg-surface text-muted-foreground border-border hover:bg-muted"
                      )}
                    >
                      Sam – Dim (Week-end)
                    </button>
                    <button
                      type="button"
                      onClick={handleInvertJours}
                      className="px-2 py-1 rounded-md text-[11px] font-semibold border border-border bg-surface text-muted-foreground hover:bg-muted transition-colors cursor-pointer"
                      title="Inverser la sélection des jours"
                    >
                      Inverser
                    </button>
                  </div>
                </div>

                {/* 7 Boutons interactifs des jours de la semaine */}
                <div className="grid grid-cols-7 gap-1.5 sm:gap-2.5">
                  {JOURS_SEMAINE_DEF.map((j) => {
                    const isSelected = formJoursSemaine.includes(j.id);
                    const isWeekend = j.id === 6 || j.id === 7;
                    return (
                      <button
                        key={j.id}
                        type="button"
                        onClick={() => toggleJourSemaine(j.id)}
                        className={cn(
                          "flex flex-col items-center justify-center p-2 sm:p-2.5 rounded-xl border transition-all cursor-pointer font-bold select-none text-center shadow-2xs",
                          isSelected
                            ? "bg-primary/10 border-primary text-primary ring-1 ring-primary/30"
                            : "bg-surface border-border text-muted-foreground hover:bg-muted hover:text-foreground opacity-60"
                        )}
                        title={`Cliquer pour ${isSelected ? "désactiver" : "activer"} le ${j.nom}`}
                      >
                        <span className="text-xs sm:text-sm font-black">{j.court}</span>
                        <span className="text-[10px] hidden sm:inline font-medium capitalize mt-0.5 opacity-80">
                          {j.nom}
                        </span>
                        <div className="mt-1">
                          {isSelected ? (
                            <span className="flex size-4 items-center justify-center rounded-full bg-primary text-white">
                              <Check className="size-2.5 stroke-[3]" />
                            </span>
                          ) : (
                            <span className="flex size-4 items-center justify-center rounded-full border border-border bg-muted/50" />
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Résumé textuel dynamique des jours choisis */}
                <div className="flex items-center justify-between text-xs pt-1 border-t border-border/60 flex-wrap gap-2">
                  <div className="flex items-center gap-1.5 text-foreground">
                    <span className="size-2 rounded-full bg-primary" />
                    <span>
                      Jours actifs : <strong>{formatJoursAffichage(formJoursSemaine)}</strong> ({formJoursSemaine.length} jour{formJoursSemaine.length > 1 ? "s" : ""})
                    </span>
                  </div>

                  {formJoursSemaine.length === 0 && (
                    <span className="text-danger font-semibold flex items-center gap-1">
                      <AlertCircle className="size-3.5" />
                      Sélectionnez au moins un jour
                    </span>
                  )}
                </div>
              </Card>

              {/* Aperçu interactif en direct */}
              {selectedCvHoraire && (
                <div
                  className={cn(
                    "rounded-xl p-4 border text-xs space-y-2 transition-all shadow-2xs",
                    estNuitTravail
                      ? "bg-indigo-500/10 border-indigo-500/30 text-indigo-950 dark:text-indigo-200"
                      : "bg-primary/5 border-primary/20 text-foreground"
                  )}
                >
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2 font-bold text-sm">
                      {estNuitTravail ? (
                        <Moon className="size-4.5 text-indigo-500 shrink-0" />
                      ) : (
                        <Sun className="size-4.5 text-amber-500 shrink-0" />
                      )}
                      <span>
                        Aperçu : Arrivée entre <strong className="font-mono">{formHeureDebut}</strong> et{" "}
                        <strong className="font-mono">{formHeureFin}</strong> ({formatJoursAffichage(formJoursSemaine)})
                      </span>
                    </div>

                    {estNuitTravail && (
                      <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold bg-indigo-500/20 text-indigo-900 dark:text-indigo-200 border border-indigo-500/30">
                        <Moon className="size-3" />
                        Service de nuit (Sortie le lendemain J+1)
                      </span>
                    )}
                  </div>

                  <p className="leading-relaxed">
                    👉 Tout collaborateur configuré qui badge pour la première fois dans ce créneau un{" "}
                    <strong>{formatJoursAffichage(formJoursSemaine)}</strong> se verra attribuer l&apos;horaire officiel{" "}
                    <strong>{selectedCvHoraire.period_name}</strong> (heures réelles prévues :{" "}
                    <span className="font-mono font-bold">
                      {selectedCvHoraire.to_work_time_clean || (selectedCvHoraire.to_work_time || "").slice(0, 5)} –{" "}
                      {selectedCvHoraire.off_work_time_clean || (selectedCvHoraire.off_work_time || "").slice(0, 5)}
                    </span>
                    {selectedCvHoraire.working_hours
                      ? `, durée : ${Math.round(selectedCvHoraire.working_hours / 60)}h`
                      : ""}
                    ).
                  </p>
                </div>
              )}

              {/* Alerte si conflit de plage sur les MÊMES jours */}
              {regleEnConflit && (
                <div className="flex items-center gap-2.5 rounded-xl bg-amber-500/15 p-3.5 text-xs text-amber-900 dark:text-amber-200 border border-amber-500/30">
                  <ShieldAlert className="size-4.5 shrink-0 text-amber-600 dark:text-amber-400" />
                  <div>
                    <strong>Attention (chevauchement détecté) :</strong> Cette plage horaire chevauche la règle existante{" "}
                    <em>{regleEnConflit.period_name}</em> (<span className="font-mono font-bold">{regleEnConflit.heure_debut} – {regleEnConflit.heure_fin}</span>) sur des jours communs ({formatJoursAffichage(regleEnConflit.jours_semaine)}).
                    Ajustez les heures ou séparez les jours d&apos;application pour garantir une reconnaissance sans ambiguïté.
                  </div>
                </div>
              )}

              {/* Boutons d'action */}
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
                  disabled={submittingRegle || cvHoraires.length === 0 || formJoursSemaine.length === 0}
                  className="h-9 px-5 text-xs font-bold shadow-xs"
                >
                  {editingRegleId ? (
                    <>
                      <Pencil className="size-3.5 mr-1.5" />
                      {submittingRegle ? "Mise à jour..." : "Mettre à jour la règle"}
                    </>
                  ) : (
                    <>
                      <Save className="size-3.5 mr-1.5" />
                      {submittingRegle ? "Enregistrement..." : "Enregistrer cette règle"}
                    </>
                  )}
                </Button>
              </div>
            </form>
          </Card>

          {/* Catalogue des règles configurées */}
          <Card className="border-border shadow-xs overflow-hidden">
            <div className="flex items-center justify-between border-b border-border p-4 sm:p-5 flex-wrap gap-2">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-foreground">
                  3. Catalogue des règles configurées
                </h2>
                <p className="text-xs text-muted-foreground">
                  Plages horaires et jours d&apos;application actuellement actifs en base de données.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={chargerRegles}
                  disabled={loadingRegles}
                  className="h-8 text-xs font-semibold"
                >
                  <RotateCcw className={cn("size-3 mr-1.5", loadingRegles && "animate-spin")} />
                  Actualiser
                </Button>
              </div>
            </div>

            <div className="w-full overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs sm:text-sm">
                <thead className="bg-muted/70 text-xs text-muted-foreground font-bold uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3 text-center">Plage d&apos;arrivée</th>
                    <th className="px-4 py-3">Horaire assigné</th>
                    <th className="px-4 py-3">Jours d&apos;application</th>
                    <th className="px-4 py-3">Heures réelles</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3 text-center">Statut</th>
                    <th className="px-4 py-3 text-center w-28">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {loadingRegles ? (
                    <tr>
                      <td colSpan={7} className="py-10 text-center text-xs text-muted-foreground">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <RotateCcw className="size-5 animate-spin text-primary" />
                          <span>Chargement des règles configurées...</span>
                        </div>
                      </td>
                    </tr>
                  ) : regles.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-10 text-center text-xs text-muted-foreground">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <Sliders className="size-6 text-muted-foreground/40" />
                          <span>Aucune règle horaire enregistrée. Utilisez le formulaire ci-dessus pour commencer.</span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    regles.map((r) => {
                      const isNight = r.est_nuit;
                      const activeJours = r.jours_semaine || [1, 2, 3, 4, 5, 6, 7];
                      return (
                        <tr
                          key={r.id}
                          className={cn(
                            "hover:bg-muted/40 transition-colors",
                            editingRegleId === r.id && "bg-primary/5 font-semibold",
                            !r.actif && "opacity-60 bg-muted/20"
                          )}
                        >
                          <td className="px-4 py-3 text-center">
                            <span className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 bg-muted font-mono font-bold text-foreground border border-border/80">
                              <Clock className="size-3 text-primary" />
                              {r.heure_debut} → {r.heure_fin}
                            </span>
                          </td>

                          <td className="px-4 py-3 font-bold text-foreground">
                            <div className="flex items-center gap-2">
                              {isNight ? (
                                <Moon className="size-4 text-indigo-500 shrink-0" />
                              ) : (
                                <Sun className="size-4 text-amber-500 shrink-0" />
                              )}
                              <span>{r.period_name || r.cvaccess_horaire_id}</span>
                            </div>
                          </td>

                          {/* Jours d'application avec badges micro-jours */}
                          <td className="px-4 py-3">
                            <div className="space-y-1">
                              <span className="text-xs font-semibold text-foreground block">
                                {formatJoursAffichage(r.jours_semaine)}
                              </span>
                              <div className="flex items-center gap-1">
                                {JOURS_SEMAINE_DEF.map((j) => {
                                  const isActive = activeJours.includes(j.id);
                                  return (
                                    <span
                                      key={j.id}
                                      className={cn(
                                        "inline-flex size-4 items-center justify-center rounded-xs text-[9px] font-bold select-none",
                                        isActive
                                          ? "bg-primary text-white"
                                          : "bg-muted text-muted-foreground/40"
                                      )}
                                      title={`${j.nom} : ${isActive ? "Actif" : "Inactif"}`}
                                    >
                                      {j.lettre}
                                    </span>
                                  );
                                })}
                              </div>
                            </div>
                          </td>

                          <td className="px-4 py-3 text-xs text-foreground font-mono">
                            {r.to_work_time || "--:--"} – {r.off_work_time || "--:--"}
                            {r.working_hours ? ` (${Math.round(r.working_hours / 60)}h)` : ""}
                          </td>

                          <td className="px-4 py-3">
                            {isNight ? (
                              <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold bg-indigo-500/15 text-indigo-800 dark:text-indigo-300 border border-indigo-500/30">
                                <Moon className="size-3" />
                                Nuit (+1j)
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/25">
                                <Sun className="size-3" />
                                Journée
                              </span>
                            )}
                          </td>

                          <td className="px-4 py-3 text-center">
                            <button
                              type="button"
                              onClick={() => handleToggleActif(r)}
                              disabled={togglingId === r.id}
                              className="inline-flex cursor-pointer transition-transform hover:scale-105"
                              title={r.actif ? "Désactiver cette règle" : "Activer cette règle"}
                            >
                              {r.actif ? (
                                <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30">
                                  <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                  Active
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium bg-muted text-muted-foreground border border-border">
                                  Inactive
                                </span>
                              )}
                            </button>
                          </td>

                          <td className="px-4 py-3 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleEditRegle(r)}
                                className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors cursor-pointer"
                                title="Modifier cette règle"
                              >
                                <Pencil className="size-4" />
                              </button>

                              <button
                                type="button"
                                onClick={() => handleToggleActif(r)}
                                disabled={togglingId === r.id}
                                className={cn(
                                  "p-1.5 rounded-lg transition-colors cursor-pointer",
                                  r.actif
                                    ? "text-muted-foreground hover:text-amber-600 hover:bg-amber-500/10"
                                    : "text-muted-foreground hover:text-emerald-600 hover:bg-emerald-500/10"
                                )}
                                title={r.actif ? "Désactiver" : "Activer"}
                              >
                                <Power className="size-4" />
                              </button>

                              <button
                                type="button"
                                onClick={() => setDeletingRegle(r)}
                                className="p-1.5 rounded-lg text-muted-foreground hover:text-danger hover:bg-danger-soft transition-colors cursor-pointer"
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
        </div>
      )}

      {/* ========================================================= */}
      {/* ONGLET 3 : SIMULATEUR DE POINTAGE (AVEC TEST DU JOUR) */}
      {/* ========================================================= */}
      {(activeTab === "simulateur" || activeTab === "tout") && (
        <Card className="p-5 sm:p-6 border-border shadow-xs space-y-5">
          <div className="flex items-center justify-between border-b border-border pb-4 flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-xl bg-purple-500/15 text-purple-700 dark:text-purple-400">
                <Play className="size-5 ml-0.5" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-bold text-foreground">
                  3. Simulateur de reconnaissance horaire
                </h2>
                <p className="text-xs text-muted-foreground">
                  Testez instantanément quelle règle s&apos;appliquera selon l&apos;heure ET le jour de la semaine.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Contrôles de simulation */}
            <div className="space-y-4">
              {/* Choix de l'heure */}
              <div>
                <label className="block text-xs font-bold text-foreground mb-1.5">
                  1. Heure du premier pointage :
                </label>
                <div className="relative">
                  <Clock className="absolute left-3 top-3 size-4 text-muted-foreground pointer-events-none" />
                  <input
                    type="time"
                    value={simulatedTime}
                    onChange={(e) => setSimulatedTime(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-border bg-surface text-base font-mono font-bold text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 shadow-2xs"
                  />
                </div>
              </div>

              {/* Choix du jour */}
              <div>
                <label className="block text-xs font-bold text-foreground mb-1.5">
                  2. Jour de la semaine testé :
                </label>
                <div className="grid grid-cols-7 gap-1">
                  {JOURS_SEMAINE_DEF.map((j) => (
                    <button
                      key={j.id}
                      type="button"
                      onClick={() => setSimulatedDay(j.id)}
                      className={cn(
                        "py-2 px-1 text-center rounded-lg text-xs font-bold border transition-all cursor-pointer shadow-2xs",
                        simulatedDay === j.id
                          ? "bg-purple-600 text-white border-purple-600 ring-2 ring-purple-300"
                          : "bg-surface text-foreground border-border hover:bg-muted"
                      )}
                    >
                      <span>{j.court}</span>
                    </button>
                  ))}
                </div>
                <span className="text-[11px] text-muted-foreground mt-1 block">
                  Jour sélectionné : <strong>{JOURS_SEMAINE_DEF.find((j) => j.id === simulatedDay)?.nom}</strong>
                </span>
              </div>

              {/* Exemples rapides */}
              <div>
                <span className="text-xs font-semibold text-muted-foreground block mb-2">
                  Exemples réels à tester :
                </span>
                <div className="flex items-center gap-2 flex-wrap">
                  {[
                    { label: "Matin Semaine (07:45 Lun)", heure: "07:45", jour: 1 },
                    { label: "Midi Semaine (13:03 Mar)", heure: "13:03", jour: 2 },
                    { label: "Nuit (22:00 Mer)", heure: "22:00", jour: 3 },
                    { label: "Samedi Matin (08:30)", heure: "08:30", jour: 6 },
                    { label: "Dimanche Soir (22:15)", heure: "22:15", jour: 7 },
                  ].map((ex) => (
                    <button
                      key={ex.label}
                      type="button"
                      onClick={() => {
                        setSimulatedTime(ex.heure);
                        setSimulatedDay(ex.jour);
                      }}
                      className={cn(
                        "px-2.5 py-1 rounded-lg text-xs font-medium border transition-all cursor-pointer shadow-2xs",
                        simulatedTime === ex.heure && simulatedDay === ex.jour
                          ? "bg-purple-600 text-white border-purple-600 font-bold"
                          : "bg-surface text-foreground border-border hover:bg-muted"
                      )}
                    >
                      {ex.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Résultat visuel du simulateur */}
            <div>
              {resultatSimulation?.matched && resultatSimulation.rule ? (
                <div
                  className={cn(
                    "rounded-2xl p-5 border space-y-3 shadow-xs transition-all",
                    resultatSimulation.isNight
                      ? "bg-indigo-500/10 border-indigo-500/30 text-indigo-950 dark:text-indigo-200"
                      : "bg-emerald-500/10 border-emerald-500/30 text-emerald-950 dark:text-emerald-200"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider">
                      <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
                      Règle reconnue avec succès
                    </span>
                    {resultatSimulation.isNight && (
                      <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold bg-indigo-500/20 text-indigo-900 dark:text-indigo-200 border border-indigo-500/30">
                        <Moon className="size-3" />
                        Service de nuit
                      </span>
                    )}
                  </div>

                  <div className="space-y-1">
                    <div className="text-xl font-black text-foreground">
                      {resultatSimulation.rule.period_name || resultatSimulation.rule.cvaccess_horaire_id}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Plage déclenchée :{" "}
                      <strong className="font-mono text-foreground">
                        {resultatSimulation.rule.heure_debut} → {resultatSimulation.rule.heure_fin}
                      </strong>{" "}
                      ({formatJoursAffichage(resultatSimulation.rule.jours_semaine)})
                    </div>
                  </div>

                  <div className="pt-2 border-t border-border/60 text-xs space-y-1">
                    <div>
                      <strong>Heures de travail prévues :</strong>{" "}
                      <span className="font-mono">
                        {resultatSimulation.rule.to_work_time || "--:--"} –{" "}
                        {resultatSimulation.rule.off_work_time || "--:--"}
                      </span>
                    </div>
                    <div>
                      <strong>Statut affiché lors du premier pointage :</strong>{" "}
                      <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 font-bold font-mono text-[11px]">
                        « En cours — sortie attendue »
                      </span>
                    </div>
                    {resultatSimulation.isNight && (
                      <div className="text-[11px] text-indigo-800 dark:text-indigo-300 mt-1">
                        🌙 Le pointage de sortie sera rattaché à cette même date de service sans division sur deux jours.
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl p-5 border border-dashed border-border bg-muted/30 text-center space-y-2">
                  <AlertCircle className="size-8 mx-auto text-muted-foreground/50" />
                  <div className="text-sm font-bold text-foreground">
                    Aucune règle active pour le {JOURS_SEMAINE_DEF.find((j) => j.id === simulatedDay)?.nom} à {simulatedTime}
                  </div>
                  {resultatSimulation?.dayExclusionNotice ? (
                    <p className="text-xs text-amber-700 dark:text-amber-400 max-w-sm mx-auto font-medium">
                      {resultatSimulation.dayExclusionNotice}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                      Si un collaborateur badge à cette heure ce jour-là, aucun horaire dynamique ne sera reconnu. Vous pouvez configurer une règle pour ce créneau et ce jour.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* ========================================================= */}
      {/* MODALE DE CONFIRMATION DE SUPPRESSION DE RÈGLE */}
      {/* ========================================================= */}
      {deletingRegle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <Card className="w-full max-w-md p-6 space-y-4 shadow-2xl border-border bg-surface">
            <div className="flex items-center gap-3 text-danger">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-danger-soft">
                <AlertTriangle className="size-6 text-danger" />
              </div>
              <div>
                <h3 className="text-base font-bold text-foreground">Confirmer la suppression</h3>
                <p className="text-xs text-muted-foreground">Cette action retirera la règle horaire de la base.</p>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-foreground leading-relaxed">
              Êtes-vous sûr de vouloir supprimer la règle pour la plage{" "}
              <strong className="font-mono text-primary font-bold">
                {deletingRegle.heure_debut} → {deletingRegle.heure_fin}
              </strong>{" "}
              ({formatJoursAffichage(deletingRegle.jours_semaine)}) associée à l&apos;horaire <em>{deletingRegle.period_name}</em> ?
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDeletingRegle(null)}
                className="h-9 text-xs"
              >
                Annuler
              </Button>
              <Button
                type="button"
                onClick={handleConfirmDelete}
                className="h-9 text-xs font-bold bg-danger hover:bg-danger/90 text-white border-0"
              >
                Supprimer définitivement
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
