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
 * Lit la vue v_pointages et retourne, par employé, le dernier horaire de pointage
 * (champ event_time) de la période, déjà converti dans le fuseau Africa/Casablanca
 * et formaté "JJ/MM/AAAA HH:mm".
 *
 * Hypothèse : v_pointages expose au minimum les colonnes id (identifiant employé,
 * identique à pointage_journalier.id) et event_time. Si la vue porte d'autres noms
 * de colonnes, ajuster uniquement cette requête.
 *
 * Cette lecture est indépendante du calcul de présence et d'absences.
 */
export async function getEventTimesByEmployee(
  filters: PointageFilters,
): Promise<Map<string, string>> {
  const conditions: string[] = [];
  const params: string[] = [];
  const localTime = `timezone('${POINTAGE_TIME_ZONE}', event_time)`;

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
        CAST(id AS TEXT) AS id,
        to_char(MAX(${localTime}), 'DD/MM/YYYY HH24:MI') AS horaire_pointage
      FROM v_pointages
      ${where}
      GROUP BY id
    `,
    params,
  );

  const out = new Map<string, string>();
  for (const r of rows as { id: string; horaire_pointage: string | null }[]) {
    if (r.horaire_pointage) out.set(r.id, r.horaire_pointage);
  }
  return out;
}
