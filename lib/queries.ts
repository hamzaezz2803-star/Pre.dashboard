import { targetPool } from "./db.js";

/** Fuseau horaire d'affichage des horaires de pointage. */
export const POINTAGE_TIME_ZONE = "Africa/Casablanca";

export interface PointageFilters {
  debut?: string | null;
  fin?: string | null;
  departement?: string | null;
  personnel?: string | null;
}

/**
 * Lit event_time dans acc_transaction (copie synchronisée de la source) et retourne,
 * par employé (pin), le dernier horaire de pointage de la période, formaté
 * "JJ/MM/AAAA HH:mm".
 *
 * event_time est un timestamp sans fuseau, déjà exprimé en heure locale
 * Africa/Casablanca : aucune conversion n'est appliquée.
 * La vue v_pointages n'existe pas dans les bases (cible et source).
 *
 * Cette lecture est indépendante du calcul de présence et d'absences.
 */
export async function getEventTimesByEmployee(
  filters: PointageFilters,
): Promise<Map<string, string>> {
  const conditions: string[] = [];
  const params: string[] = [];
  const localTime = "event_time";

  if (filters.debut && filters.debut.trim() !== "") {
    params.push(filters.debut.trim());
    conditions.push(`CAST(${localTime} AS DATE) >= $${params.length}`);
  }
  if (filters.fin && filters.fin.trim() !== "") {
    params.push(filters.fin.trim());
    conditions.push(`CAST(${localTime} AS DATE) <= $${params.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const { rows } = await targetPool.query(
    `
      SELECT
        CAST(pin AS TEXT) AS id,
        to_char(MAX(${localTime}), 'DD/MM/YYYY HH24:MI') AS horaire_pointage
      FROM acc_transaction
      ${where}
      GROUP BY pin
    `,
    params,
  );

  const out = new Map<string, string>();
  for (const r of rows as { id: string; horaire_pointage: string | null }[]) {
    if (r.horaire_pointage) out.set(r.id, r.horaire_pointage);
  }
  return out;
}
