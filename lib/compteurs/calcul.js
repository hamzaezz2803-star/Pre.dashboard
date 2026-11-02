import { compilerFormule, evaluerFormule } from './formule.ts';
import {
  agregerContextes,
  construireContexteJour,
  periodeContenant,
  variablesPourPeriodicite,
} from './variables.ts';
import { PERIODICITES, COLONNES_PERIODICITE } from './validation.js';

/**
 * Calcul des compteurs et enregistrement dans historique_compteurs.
 *
 * Pour un employé et une date, chaque compteur actif est calculé sur chaque
 * périodicité cochée : le jour, la semaine (lundi → dimanche) et le mois
 * contenant la date. Une période est calculée sur ses jours écoulés
 * uniquement (jusqu'à aujourd'hui) ; une période future n'est pas calculée.
 *
 * Une seule valeur courante par (employé, compteur, périodicité, début de
 * période) : un recalcul remplace la valeur et sa version de formule.
 * Une erreur de calcul est enregistrée en statut ERREUR, jamais en 0.
 */

const VALEUR_MAX = 1e10; // NUMERIC(14,4)
const MESSAGE_MAX = 500;

/** Date du jour (YYYY-MM-DD) dans le fuseau du serveur. */
export function dateDuJour() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Compteurs actifs, éventuellement limités à une liste d'identifiants. */
export async function lireCompteursActifs(db, ids = null) {
  const params = [];
  let filtre = '';
  if (Array.isArray(ids)) {
    params.push(ids);
    filtre = 'AND id_compteur = ANY($1::text[])';
  }
  const { rows } = await db.query(
    `SELECT id_compteur, formule, journalier, hebdomadaire, mensuel, unite, version_formule
     FROM compteurs WHERE actif = TRUE ${filtre} ORDER BY id_compteur`,
    params
  );
  return rows;
}

/**
 * Périodes à calculer pour une date. Pur : aucun accès base.
 * @returns {{ compteur: object, periodicite: string, debut: string, fin: string, finEffective: string }[]}
 */
export function planifierPeriodes(compteurs, date, aujourdhui) {
  const plans = [];
  if (date > aujourdhui) return plans;
  for (const compteur of compteurs) {
    for (const periodicite of PERIODICITES) {
      if (!compteur[COLONNES_PERIODICITE[periodicite]]) continue;
      const { debut, fin } = periodeContenant(periodicite, date);
      if (debut > aujourdhui) continue;
      plans.push({ compteur, periodicite, debut, fin, finEffective: fin < aujourdhui ? fin : aujourdhui });
    }
  }
  return plans;
}

function evaluer(plan, jours, cache) {
  const { compteur, periodicite } = plan;
  const cle = `${compteur.id_compteur}|${compteur.version_formule}|${periodicite}`;
  let formule = cache.get(cle);
  if (!formule) {
    try {
      formule = compilerFormule(compteur.formule, variablesPourPeriodicite(periodicite));
    } catch (e) {
      formule = { erreur: e.message };
    }
    cache.set(cle, formule);
  }
  if (formule.erreur) return { ok: false, message: `Formule invalide : ${formule.erreur}` };

  const periode = jours.filter((j) => j.jour >= plan.debut && j.jour <= plan.finEffective);
  const contextes = periode.map(construireContexteJour);
  const contexte = periodicite === 'JOUR' ? contextes[0] : agregerContextes(contextes);
  if (!contexte) return { ok: false, message: 'Aucune donnée pour cette journée.' };

  const r = evaluerFormule(formule, contexte);
  if (!r.ok) return r;
  if (Math.abs(r.valeur) >= VALEUR_MAX) return { ok: false, message: 'Valeur hors limites.' };
  return { ok: true, valeur: Math.round(r.valeur * 10000) / 10000 };
}

async function enregistrer(db, pin, lignes) {
  if (lignes.length === 0) return;
  const params = [];
  const valeurs = lignes.map((l) => {
    params.push(pin, l.compteur.id_compteur, l.periodicite, l.debut, l.fin, l.valeur, l.compteur.unite,
      l.compteur.version_formule, l.statut, l.message);
    const n = params.length - 10;
    return `($${n + 1}, $${n + 2}, $${n + 3}, $${n + 4}::date, $${n + 5}::date, $${n + 6}::numeric, $${n + 7}, $${n + 8}::int, $${n + 9}, $${n + 10})`;
  });
  await db.query(
    `INSERT INTO historique_compteurs
       (id_employe, id_compteur, periodicite, periode_debut, periode_fin, valeur, unite, version_formule, statut_calcul, message_erreur)
     VALUES ${valeurs.join(', ')}
     ON CONFLICT (id_employe, id_compteur, periodicite, periode_debut) DO UPDATE SET
       periode_fin = EXCLUDED.periode_fin,
       valeur = EXCLUDED.valeur,
       unite = EXCLUDED.unite,
       version_formule = EXCLUDED.version_formule,
       statut_calcul = EXCLUDED.statut_calcul,
       message_erreur = EXCLUDED.message_erreur,
       calcule_le = NOW()`,
    params
  );
}

/**
 * Calcule et enregistre tous les compteurs fournis pour un employé et une date.
 *
 * @param {object} o
 * @param {{ query: Function }} o.db - client d'écriture (base cible)
 * @param {(pin: string, debut: string, fin: string) => Promise<object[]>} o.charger - chargement des journées
 * @param {string} o.pin
 * @param {string} o.date - YYYY-MM-DD
 * @param {object[]} o.compteurs - compteurs actifs (lireCompteursActifs)
 * @param {string} [o.aujourdhui]
 * @param {Map} [o.cache] - formules compilées, partagé entre employés
 * @returns {Promise<{ ok: number, erreurs: number }>}
 */
export async function calculerEmploye({ db, charger, pin, date, compteurs, aujourdhui = dateDuJour(), cache = new Map() }) {
  const plans = planifierPeriodes(compteurs, date, aujourdhui);
  if (plans.length === 0) return { ok: 0, erreurs: 0 };

  const debut = plans.reduce((m, p) => (p.debut < m ? p.debut : m), plans[0].debut);
  const fin = plans.reduce((m, p) => (p.finEffective > m ? p.finEffective : m), plans[0].finEffective);
  const jours = await charger(pin, debut, fin);

  const lignes = plans.map((plan) => {
    const r = evaluer(plan, jours, cache);
    return {
      ...plan,
      valeur: r.ok ? r.valeur : null,
      statut: r.ok ? 'OK' : 'ERREUR',
      message: r.ok ? null : String(r.message).slice(0, MESSAGE_MAX),
    };
  });

  await enregistrer(db, pin, lignes);
  return {
    ok: lignes.filter((l) => l.statut === 'OK').length,
    erreurs: lignes.filter((l) => l.statut === 'ERREUR').length,
  };
}

/**
 * Recalcule les compteurs actifs pour plusieurs employés à une date.
 * Chaque employé est traité indépendamment : l'échec du chargement de l'un
 * n'empêche pas le calcul des autres et il est signalé dans `echecs`.
 */
export async function recalculer({ db, charger, pins, date, compteurIds = null, aujourdhui = dateDuJour() }) {
  const compteurs = await lireCompteursActifs(db, compteurIds);
  const resume = { employes: 0, ok: 0, erreurs: 0, echecs: [], compteurs: compteurs.length };
  if (compteurs.length === 0) return resume;

  const cache = new Map();
  for (const pin of pins) {
    try {
      const r = await calculerEmploye({ db, charger, pin, date, compteurs, aujourdhui, cache });
      resume.employes++;
      resume.ok += r.ok;
      resume.erreurs += r.erreurs;
    } catch (e) {
      resume.echecs.push({ pin, message: e?.message ? String(e.message).slice(0, 200) : 'Erreur inconnue' });
    }
  }
  return resume;
}
