"use client";

import { createContext, useContext } from "react";

/**
 * Périmètre de départements de l'utilisateur connecté, calculé côté serveur (layout)
 * et exposé aux composants clients (sidebar, en-têtes d'exports).
 * Affichage uniquement : la sécurité reste assurée par les routes API.
 */
export interface PerimetreInfo {
  /** true pour un admin cloisonné, false pour un super_admin (accès total). */
  restreint: boolean;
  /** Départements directement affectés par le super_admin. */
  departements: string[];
  /** Départements effectifs, sous-départements inclus. */
  effectifs: string[];
}

const PERIMETRE_PAR_DEFAUT: PerimetreInfo = { restreint: false, departements: [], effectifs: [] };

const PerimetreContext = createContext<PerimetreInfo>(PERIMETRE_PAR_DEFAUT);

export const PerimetreProvider = PerimetreContext.Provider;

export function usePerimetre(): PerimetreInfo {
  return useContext(PerimetreContext);
}
