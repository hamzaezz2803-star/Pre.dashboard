export type StatutTon = "absent" | "anomalie" | "sans-horaire" | "present";

const LABELS: Record<string, string> = {
  late: "Retard",
  absent: "Absent",
  noCheckIn: "Entrée manquante",
  noCheckOut: "Sortie manquante",
  noSch: "Pas d'horaire",
  normal: "Présent",
  actual: "Présent",
  en_cours: "En cours — sortie attendue",
  termine: "Terminé",
};

function splitCodes(statut: string | null | undefined): string[] {
  return (statut ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Libellé français d'un statut ("late,noCheckOut" devient "Retard · Sortie manquante").
 * `nbPointages` sert à distinguer « Présent » (valeur vide avec pointages) de « - » (aucun pointage).
 */
export function formatStatut(statut: string | null, nbPointages = 0): string {
  if (statut === "En cours — sortie attendue" || statut === "en_cours") {
    return "En cours — sortie attendue";
  }
  if (statut === "Terminé" || statut === "termine") {
    return "Terminé";
  }
  const codes = splitCodes(statut);
  if (codes.length === 0) return nbPointages > 0 ? LABELS.normal : "-";
  const labels = codes.map((c) => LABELS[c] ?? c);
  return Array.from(new Set(labels)).join(" · ");
}

/** Catégorie de couleur, par gravité décroissante : absent, anomalie, sans-horaire, present. */
export function getStatutTon(statut: string | null): StatutTon {
  if (
    statut === "En cours — sortie attendue" ||
    statut === "en_cours" ||
    statut === "Terminé" ||
    statut === "termine"
  ) {
    return "present";
  }
  const codes = splitCodes(statut);
  if (codes.includes("absent")) return "absent";
  if (codes.some((c) => c === "late" || c === "noCheckIn" || c === "noCheckOut")) return "anomalie";
  if (codes.includes("noSch")) return "sans-horaire";
  return "present";
}
