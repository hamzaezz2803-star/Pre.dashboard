import { getBiotimePool } from '../biotime-db.js';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const PIN = /^[A-Za-z0-9_-]{1,50}$/;

/** Nombre maximal de jours chargés en une requête (un mois complet + marge). */
export const JOURS_MAX = 62;

/**
 * Charge, pour un employé (matricule/PIN) et une plage de dates incluses,
 * les données brutes de chaque journée de service (`DonneesJour` de
 * lib/compteurs/variables.ts). Une ligne par jour, même sans pointage.
 *
 * Lecture seule. Le contrôle du périmètre de l'utilisateur reste à la charge
 * de la route API appelante.
 *
 * Journée de service :
 *  - avec horaire affecté : pointages entre l'entrée et la sortie réelles
 *    (un poste de nuit est rattaché à son jour de début) ;
 *  - sans horaire : pointages du jour civil, hors ceux déjà rattachés au
 *    poste d'une autre journée (sortie d'un poste de nuit de la veille).
 *
 * @param {string} pin
 * @param {string} debut YYYY-MM-DD
 * @param {string} fin YYYY-MM-DD
 * @returns {Promise<import('./variables').DonneesJour[]>}
 */
export async function chargerDonneesJours(pin, debut, fin) {
  if (typeof pin !== 'string' || !PIN.test(pin)) {
    throw new Error('Matricule invalide.');
  }
  if (!ISO_DATE.test(debut) || !ISO_DATE.test(fin) || debut > fin) {
    throw new Error('Période invalide.');
  }
  const nbJours = (Date.parse(`${fin}T00:00:00Z`) - Date.parse(`${debut}T00:00:00Z`)) / 86400000 + 1;
  if (!Number.isFinite(nbJours) || nbJours > JOURS_MAX) {
    throw new Error(`La période ne peut pas dépasser ${JOURS_MAX} jours.`);
  }

  const { rows } = await getBiotimePool().query(
    `
    WITH jours AS (
      SELECT generate_series($2::date, $3::date, INTERVAL '1 day')::date AS jour
    ),
    aff AS (
      -- Une journée de plus de chaque côté pour exclure les pointages des postes voisins
      SELECT a.date_service, a.cvaccess_horaire_id, h.period_name,
             a.debut_prevu, a.fin_prevue, a.heure_entree, a.heure_sortie
      FROM affectations_horaires_dynamiques a
      JOIN pers_person p ON p.id = a.cvaccess_person_id
      LEFT JOIN cvaccess_horaires h ON h.cvaccess_horaire_id = a.cvaccess_horaire_id
      WHERE p.pin = $1
        AND a.date_service BETWEEN $2::date - 1 AND $3::date + 1
    )
    SELECT
      TO_CHAR(j.jour, 'YYYY-MM-DD') AS jour,
      aff.cvaccess_horaire_id AS horaire_id,
      aff.period_name AS horaire_nom,
      ROUND(EXTRACT(EPOCH FROM aff.fin_prevue - aff.debut_prevu) / 60)::int AS duree_prevue_min,
      ROUND(EXTRACT(EPOCH FROM aff.heure_entree - aff.debut_prevu) / 60)::int AS ecart_entree_min,
      ROUND(EXTRACT(EPOCH FROM aff.heure_sortie - aff.fin_prevue) / 60)::int AS ecart_sortie_min,
      ROUND(EXTRACT(EPOCH FROM aff.heure_sortie - aff.heure_entree) / 60)::int AS duree_reelle_min,
      (aff.fin_prevue::date > aff.debut_prevu::date) AS est_nuit,
      COALESCE(pt.nb, 0)::int AS nb_pointages,
      ROUND(EXTRACT(EPOCH FROM pt.dernier - pt.premier) / 60)::int AS amplitude_pointages_min
    FROM jours j
    LEFT JOIN aff ON aff.date_service = j.jour
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS nb, MIN(t.att_datetime) AS premier, MAX(t.att_datetime) AS dernier
      FROM att_transaction t
      WHERE t.pers_person_pin = $1
        AND CASE
          WHEN aff.heure_entree IS NOT NULL AND aff.heure_sortie IS NOT NULL
            THEN t.att_datetime BETWEEN aff.heure_entree AND aff.heure_sortie
          WHEN aff.heure_entree IS NOT NULL
            THEN t.att_datetime >= aff.heure_entree AND t.att_datetime < j.jour + 1
          ELSE t.att_datetime >= j.jour AND t.att_datetime < j.jour + 1
            AND NOT EXISTS (
              SELECT 1 FROM aff a2
              WHERE a2.date_service <> j.jour
                AND a2.heure_entree IS NOT NULL AND a2.heure_sortie IS NOT NULL
                AND t.att_datetime BETWEEN a2.heure_entree AND a2.heure_sortie
            )
        END
    ) pt ON TRUE
    ORDER BY j.jour
    `,
    [pin, debut, fin]
  );

  return rows.map((r) => ({
    jour: r.jour,
    horaireId: r.horaire_id ?? null,
    horaireNom: r.horaire_nom ?? null,
    dureePrevueMin: r.duree_prevue_min,
    ecartEntreeMin: r.ecart_entree_min,
    ecartSortieMin: r.ecart_sortie_min,
    dureeReelleMin: r.duree_reelle_min,
    estNuit: r.est_nuit,
    nbPointages: r.nb_pointages,
    amplitudePointagesMin: r.amplitude_pointages_min,
  }));
}
