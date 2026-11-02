import { targetPool } from '../db.js';
import { chargerDonneesJours } from './donnees.js';
import { dateDuJour, recalculer } from './calcul.js';

/**
 * Recalcul automatique des compteurs après chaque synchronisation des pointages.
 *
 * Les N derniers jours (aujourd'hui compris) sont recalculés pour les employés
 * ayant un pointage ou un horaire affecté sur cette fenêtre ; la semaine et le
 * mois contenant chaque jour sont recalculés avec lui. Une correction de
 * pointage plus ancienne se recalcule avec le bouton « Recalculer ».
 *
 * Variable d'environnement COMPTEURS_JOURS_RECALCUL (défaut 2, 0 = désactivé,
 * maximum 31). Ne bloque jamais la synchronisation : toute erreur est journalisée.
 */

const JOURS_DEFAUT = 2;
const JOURS_MAX = 31;

let enCours = false;

export function joursARecalculer(valeur = process.env.COMPTEURS_JOURS_RECALCUL) {
  if (valeur === undefined || valeur === '') return JOURS_DEFAUT;
  const n = Number.parseInt(String(valeur), 10);
  if (!Number.isFinite(n) || n < 0) return JOURS_DEFAUT;
  return Math.min(n, JOURS_MAX);
}

/** Dates (YYYY-MM-DD) des `n` derniers jours, de la plus ancienne à aujourd'hui. */
export function fenetreDates(aujourdhui, n) {
  const dates = [];
  const base = new Date(`${aujourdhui}T00:00:00Z`);
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(base);
    d.setUTCDate(base.getUTCDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

/** Employés ayant un pointage ou un horaire affecté sur la fenêtre (veille incluse pour les postes de nuit). */
export async function employesActifs(db, debut, fin) {
  const { rows } = await db.query(
    `SELECT pin FROM (
       SELECT t.pers_person_pin::text AS pin
       FROM att_transaction t
       WHERE t.att_datetime >= $1::date - 1 AND t.att_datetime < $2::date + 1
       UNION
       SELECT p.pin::text
       FROM affectations_horaires_dynamiques a
       JOIN pers_person p ON p.id = a.cvaccess_person_id
       WHERE a.date_service BETWEEN $1::date AND $2::date
     ) e
     WHERE pin IS NOT NULL AND pin ~ '^[A-Za-z0-9_-]{1,50}$'
     ORDER BY pin`,
    [debut, fin]
  );
  return rows.map((r) => r.pin);
}

/**
 * @returns {Promise<null | { dates: string[], employes: number, ok: number, erreurs: number, echecs: number, dureeMs: number }>}
 *   null si rien n'a été lancé (désactivé, déjà en cours, aucun compteur actif, tables absentes).
 */
export async function recalculerApresSynchronisation({
  db = targetPool,
  charger = chargerDonneesJours,
  aujourdhui = dateDuJour(),
  jours = joursARecalculer(),
} = {}) {
  if (jours === 0 || enCours) return null;
  enCours = true;
  const debutMs = Date.now();

  try {
    const { rows } = await db.query('SELECT count(*)::int AS n FROM compteurs WHERE actif = TRUE');
    if (rows[0].n === 0) return null;

    const dates = fenetreDates(aujourdhui, jours);
    const pins = await employesActifs(db, dates[0], dates[dates.length - 1]);
    const bilan = { dates, employes: pins.length, ok: 0, erreurs: 0, echecs: 0, dureeMs: 0 };

    if (pins.length > 0) {
      for (const date of dates) {
        const r = await recalculer({ db, charger, pins, date, aujourdhui });
        bilan.ok += r.ok;
        bilan.erreurs += r.erreurs;
        bilan.echecs += r.echecs.length;
        for (const e of r.echecs) {
          console.error(`[Compteurs] Recalcul automatique du ${date}, employé ${e.pin} :`, e.message);
        }
      }
    }

    bilan.dureeMs = Date.now() - debutMs;
    console.info(
      `[Compteurs] Recalcul automatique (${dates[0]} → ${dates[dates.length - 1]}) : ${bilan.employes} employé(s), ` +
        `${bilan.ok} valeur(s), ${bilan.erreurs} non calculable(s), ${bilan.echecs} échec(s) en ${bilan.dureeMs} ms`
    );
    return bilan;
  } catch (e) {
    if (e?.code === '42P01') return null; // migration des compteurs non appliquée
    console.error('[Compteurs] Recalcul automatique impossible :', e?.message);
    return null;
  } finally {
    enCours = false;
  }
}
