import React from "react";
import { Clock, Moon, Sun, Sunrise } from "lucide-react";

export type TypeHoraire = "matin" | "apres_midi" | "nuit" | "journee" | "standard";

export interface HoraireStyleConfig {
  type: TypeHoraire;
  badgeClass: string;
  isNight: boolean;
  Icon: React.ComponentType<{ className?: string }>;
}

/**
 * Analyse le nom de l'horaire pour déterminer son type et lui attribuer
 * des indices de couleurs distincts et professionnels :
 * - Nuit : Indigo / Violet avec icône Lune
 * - Après-midi / Soir : Ambre / Orange chaud avec icône Soleil
 * - Matin : Émeraude / Vert énergique avec icône Matin/Soleil
 * - Journée standard : Bleu ciel / Azur avec icône Horloge
 */
export function getHoraireConfig(horaireName?: string | null): HoraireStyleConfig {
  if (!horaireName || horaireName === "Horaire non défini") {
    return {
      type: "standard",
      badgeClass: "bg-muted text-muted-foreground border-border",
      isNight: false,
      Icon: Clock,
    };
  }

  const h = horaireName.toUpperCase();

  // 1. Horaires de nuit
  if (
    h.includes("NUIT") ||
    h.includes("NIGHT") ||
    h.includes("GARDE") ||
    h.includes("H003") ||
    h.includes("_C_")
  ) {
    return {
      type: "nuit",
      badgeClass: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/30",
      isNight: true,
      Icon: Moon,
    };
  }

  // 2. Horaires d'après-midi / soir
  if (
    h.includes("APRES_MIDI") ||
    h.includes("APRES-MIDI") ||
    h.includes("APRESMIDI") ||
    h.includes("MIDI") ||
    h.includes("SOIR") ||
    h.includes("AFTERNOON") ||
    h.includes("H002") ||
    h.includes("_B_")
  ) {
    return {
      type: "apres_midi",
      badgeClass: "bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/30",
      isNight: false,
      Icon: Sun,
    };
  }

  // 3. Horaires du matin
  if (
    h.includes("MATIN") ||
    h.includes("MORNING") ||
    h.includes("H001") ||
    h.includes("_A_")
  ) {
    return {
      type: "matin",
      badgeClass: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border-emerald-500/30",
      isNight: false,
      Icon: Sunrise,
    };
  }

  // 4. Horaires de journée
  if (
    h.includes("JOURNEE") ||
    h.includes("JOUR") ||
    h.includes("8H-17H") ||
    h.includes("9H-17H")
  ) {
    return {
      type: "journee",
      badgeClass: "bg-sky-500/15 text-sky-800 dark:text-sky-300 border-sky-500/30",
      isNight: false,
      Icon: Clock,
    };
  }

  // 5. Par défaut
  return {
    type: "standard",
    badgeClass: "bg-primary/10 text-primary border-primary/25",
    isNight: false,
    Icon: Clock,
  };
}

/**
 * Détermine si le pointage de sortie s'est effectué le lendemain (+1 jour).
 * Cas :
 * 1. Heure de sortie < Heure d'entrée (ex : entrée 21:55, sortie 06:05).
 * 2. Horaire de nuit avec sortie le matin (< 12:00).
 */
export function isSortieLendemain(
  premierPointage?: string | null,
  dernierPointage?: string | null,
  horaireName?: string | null
): boolean {
  if (!dernierPointage) return false;

  const [h2, m2] = dernierPointage.slice(0, 5).split(":").map(Number);
  const minSortie = (h2 || 0) * 60 + (m2 || 0);

  if (premierPointage) {
    const [h1, m1] = premierPointage.slice(0, 5).split(":").map(Number);
    const minEntree = (h1 || 0) * 60 + (m1 || 0);
    if (minSortie < minEntree) return true;
  }

  if (horaireName) {
    const cfg = getHoraireConfig(horaireName);
    if (cfg.isNight && (h2 || 0) <= 12) {
      return true;
    }
  }

  return false;
}

/**
 * Calcule la date du lendemain formatée en "DD/MM".
 * Ex : "2026-10-27" -> "28/10"
 */
export function getDateLendemain(dateStr?: string | null): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "";
    d.setDate(d.getDate() + 1);
    return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
  } catch {
    return "";
  }
}
