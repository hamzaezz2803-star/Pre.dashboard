import { compilerFormule, testerFormule, LIMITES_FORMULE } from './formule.ts';
import { variablesPourPeriodicite } from './variables.ts';

/**
 * Validation côté serveur des données des compteurs (création, modification,
 * validation et test de formule). Module pur : aucun accès base.
 * Chaque fonction renvoie `{ ok: true, ... }` ou `{ ok: false, erreurs }`
 * avec des messages lisibles par l'utilisateur.
 */

export const UNITES = ['minutes', 'heures', 'jours', 'nombre', 'pourcentage'];
export const PERIODICITES = ['JOUR', 'SEMAINE', 'MOIS'];

const ID_COMPTEUR = /^[A-Z0-9][A-Z0-9_-]{0,29}$/;
const LIBELLE_MAX = 100;
const DESCRIPTION_MAX = 500;
const VALEURS_TEST_MAX = 50;

/** Correspondance colonnes booléennes ↔ périodicités. */
export const COLONNES_PERIODICITE = { JOUR: 'journalier', SEMAINE: 'hebdomadaire', MOIS: 'mensuel' };

/** Normalise un identifiant saisi (`cpt001` → `CPT001`) ou renvoie null s'il est invalide. */
export function normaliserIdCompteur(id) {
  if (typeof id !== 'string') return null;
  const v = id.trim().toUpperCase();
  return ID_COMPTEUR.test(v) ? v : null;
}

function periodicitesDe(c) {
  return PERIODICITES.filter((p) => c[COLONNES_PERIODICITE[p]] === true);
}

/**
 * Vérifie une formule pour chaque périodicité demandée : syntaxe, fonctions,
 * variables disponibles pour cette périodicité et types.
 *
 * @param {unknown} formule
 * @param {unknown} periodicites
 * @returns {{ ok: true, variables: string[] } | { ok: false, erreurs: Array<{ champ: string | null, message: string, periodicite?: string, code?: string, position?: number | null }> }}
 */
export function validerFormule(formule, periodicites) {
  if (typeof formule !== 'string') {
    return { ok: false, erreurs: [{ champ: 'formule', message: 'La formule est obligatoire.' }] };
  }
  const liste = Array.isArray(periodicites) ? periodicites.filter((p) => PERIODICITES.includes(p)) : [];
  if (liste.length === 0) {
    return { ok: false, erreurs: [{ champ: 'periodicites', message: 'Choisissez au moins une périodicité.' }] };
  }

  const erreurs = [];
  const variables = new Set();
  for (const p of liste) {
    try {
      compilerFormule(formule, variablesPourPeriodicite(p)).variables.forEach((v) => variables.add(v));
    } catch (e) {
      if (!e?.code) throw e;
      erreurs.push({ champ: 'formule', periodicite: p, code: e.code, message: e.message, position: e.position ?? null });
    }
  }

  if (erreurs.length > 0) {
    // Même erreur pour toutes les périodicités (ex. syntaxe) : un seul message
    const uniques = erreurs.filter((e, i) => erreurs.findIndex((x) => x.message === e.message) === i);
    const memeErreur = uniques.length === 1 && erreurs.length > 1;
    return { ok: false, erreurs: memeErreur ? [{ ...uniques[0], periodicite: undefined }] : erreurs };
  }
  return { ok: true, variables: [...variables].sort() };
}

/**
 * Valide le corps d'une création (`partiel = false`) ou d'une modification
 * (`partiel = true`, seuls les champs présents sont contrôlés).
 * Pour une modification, `existant` fournit les valeurs actuelles afin de
 * valider la formule avec les périodicités finales.
 */
export function validerCompteur(corps, { partiel = false, existant = null } = {}) {
  if (!corps || typeof corps !== 'object' || Array.isArray(corps)) {
    return { ok: false, erreurs: [{ champ: null, message: 'Données invalides.' }] };
  }

  const erreurs = [];
  const valeurs = {};
  const present = (k) => corps[k] !== undefined;
  const exige = (k) => !partiel || present(k);

  if (!partiel) {
    const id = normaliserIdCompteur(corps.id_compteur);
    if (!id) {
      erreurs.push({
        champ: 'id_compteur',
        message: "L'identifiant doit contenir 1 à 30 lettres, chiffres, « _ » ou « - » (ex. CPT001).",
      });
    } else {
      valeurs.id_compteur = id;
    }
  } else if (present('id_compteur')) {
    erreurs.push({ champ: 'id_compteur', message: "L'identifiant d'un compteur ne peut pas être modifié." });
  }

  if (exige('libelle')) {
    const v = typeof corps.libelle === 'string' ? corps.libelle.trim() : '';
    if (!v || v.length > LIBELLE_MAX) {
      erreurs.push({ champ: 'libelle', message: `Le libellé est obligatoire (${LIBELLE_MAX} caractères maximum).` });
    } else {
      valeurs.libelle = v;
    }
  }

  for (const col of Object.values(COLONNES_PERIODICITE)) {
    if (exige(col)) {
      if (present(col) && typeof corps[col] !== 'boolean') {
        erreurs.push({ champ: col, message: `Le champ ${col} doit être vrai ou faux.` });
      } else {
        valeurs[col] = corps[col] === true;
      }
    }
  }

  if (exige('unite') || !partiel) {
    const v = corps.unite ?? (partiel ? undefined : 'minutes');
    if (!UNITES.includes(v)) {
      erreurs.push({ champ: 'unite', message: `Unité invalide. Valeurs possibles : ${UNITES.join(', ')}.` });
    } else {
      valeurs.unite = v;
    }
  }

  if (present('description')) {
    const d = corps.description;
    if (d !== null && typeof d !== 'string') {
      erreurs.push({ champ: 'description', message: 'Description invalide.' });
    } else if (typeof d === 'string' && d.trim().length > DESCRIPTION_MAX) {
      erreurs.push({ champ: 'description', message: `La description dépasse ${DESCRIPTION_MAX} caractères.` });
    } else {
      valeurs.description = typeof d === 'string' && d.trim() ? d.trim() : null;
    }
  }

  if (present('actif')) {
    if (typeof corps.actif !== 'boolean') {
      erreurs.push({ champ: 'actif', message: 'Le champ actif doit être vrai ou faux.' });
    } else {
      valeurs.actif = corps.actif;
    }
  }

  if (exige('formule')) {
    if (typeof corps.formule !== 'string' || !corps.formule.trim()) {
      erreurs.push({ champ: 'formule', message: 'La formule est obligatoire.' });
    } else if (corps.formule.length > LIMITES_FORMULE.longueurMax) {
      erreurs.push({ champ: 'formule', message: `La formule dépasse ${LIMITES_FORMULE.longueurMax} caractères.` });
    } else {
      valeurs.formule = corps.formule.trim();
    }
  }

  if (erreurs.length > 0) return { ok: false, erreurs };

  // Contrôles croisés sur l'état final (périodicités + formule)
  const final = { ...(existant || {}), ...valeurs };
  const periodicites = periodicitesDe(final);
  if (periodicites.length === 0) {
    return { ok: false, erreurs: [{ champ: 'periodicites', message: 'Choisissez au moins une périodicité.' }] };
  }
  const touchePeriodes = Object.values(COLONNES_PERIODICITE).some((c) => c in valeurs);
  if (!partiel || 'formule' in valeurs || touchePeriodes) {
    const v = validerFormule(final.formule, periodicites);
    if (!v.ok) return v;
  }

  return { ok: true, valeurs };
}

/**
 * Valide une demande de test de formule : `{ formule, periodicite, valeurs }`
 * où `valeurs` associe un nom de variable à un nombre ou à null (donnée manquante).
 */
export function validerDemandeTest(corps) {
  if (!corps || typeof corps !== 'object') {
    return { ok: false, erreurs: [{ champ: null, message: 'Données invalides.' }] };
  }
  const { formule, periodicite } = corps;
  if (typeof formule !== 'string' || formule.length > LIMITES_FORMULE.longueurMax) {
    return { ok: false, erreurs: [{ champ: 'formule', message: 'Formule invalide.' }] };
  }
  if (!PERIODICITES.includes(periodicite)) {
    return { ok: false, erreurs: [{ champ: 'periodicite', message: 'Périodicité invalide.' }] };
  }

  const brutes = corps.valeurs ?? {};
  if (typeof brutes !== 'object' || Array.isArray(brutes) || Object.keys(brutes).length > VALEURS_TEST_MAX) {
    return { ok: false, erreurs: [{ champ: 'valeurs', message: 'Valeurs de test invalides.' }] };
  }

  const autorisees = new Set(variablesPourPeriodicite(periodicite));
  const contexte = new Map();
  for (const [nom, v] of Object.entries(brutes)) {
    const cle = nom.toUpperCase();
    if (!autorisees.has(cle)) {
      return { ok: false, erreurs: [{ champ: 'valeurs', message: `Variable inconnue pour cette périodicité : ${nom}.` }] };
    }
    if (v !== null && (typeof v !== 'number' || !Number.isFinite(v))) {
      return { ok: false, erreurs: [{ champ: 'valeurs', message: `Valeur invalide pour ${nom}.` }] };
    }
    contexte.set(cle, v);
  }

  return { ok: true, formule, periodicite, contexte, autorisees };
}

/** Exécute un test de formule déjà validé. */
export function executerTest({ formule, contexte, autorisees }) {
  return testerFormule(formule, autorisees, contexte);
}
