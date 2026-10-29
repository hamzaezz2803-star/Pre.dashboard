import { targetPool } from './db.js';
import { exigerRole } from './auth.js';

/**
 * Cloisonnement des données par département.
 *
 * - super_admin : accès total, `obtenirPerimetreDepartements` renvoie `null` (aucune restriction).
 * - admin       : accès limité aux départements affectés dans `utilisateur_departements`,
 *                 sous-départements inclus (requête récursive sur auth_department.parent_id).
 *
 * Le périmètre est relu en base à chaque requête (jamais stocké dans le JWT) afin qu'une
 * modification des affectations par le super_admin soit prise en compte immédiatement.
 * Tout cas douteux (rôle inconnu, session absente) renvoie un périmètre VIDE : on refuse par défaut.
 */

/** Message d'aide lorsque la migration SQL n'a pas encore été exécutée (table absente). */
export const MESSAGE_MIGRATION_DEPARTEMENTS =
  "La table utilisateur_departements est absente : exécutez scripts/migration-departements-admin.sql sur la base ocp_pointage.";

/**
 * Retourne le périmètre de départements d'une session.
 *
 * @param {{id: number, role: string}|null|undefined} session
 * @returns {Promise<string[]|null>} `null` = tous les départements (super_admin) ;
 *   sinon la liste des identifiants auth_department autorisés (éventuellement vide).
 */
export async function obtenirPerimetreDepartements(session) {
  if (!session) return [];
  if (session.role === 'super_admin') return null;
  if (session.role !== 'admin') return [];

  const userId = Number(session.id);
  if (!Number.isInteger(userId)) return [];

  // UNION (et non UNION ALL) : déduplique et garantit la fin de la récursion même si la
  // hiérarchie contient un cycle. Les identifiants qui n'existent plus dans auth_department
  // (supprimés à la source) sont écartés par la jointure initiale.
  const { rows } = await targetPool.query(
    `
    WITH RECURSIVE perimetre AS (
      SELECT d.id
      FROM auth_department d
      WHERE d.id IN (
        SELECT ud.departement_id
        FROM utilisateur_departements ud
        WHERE ud.utilisateur_id = $1
      )
      UNION
      SELECT enfant.id
      FROM auth_department enfant
      JOIN perimetre p ON enfant.parent_id = p.id
    )
    SELECT id FROM perimetre
    `,
    [userId],
  );
  return rows.map((r) => String(r.id));
}

/**
 * Exige un rôle puis calcule le périmètre de départements de l'utilisateur.
 * Même contrat que `exigerRole`, enrichi de `perimetre` (null = tous).
 *
 * @param {...string} roles - Rôles autorisés
 */
export async function exigerRoleAvecPerimetre(...roles) {
  const auth = await exigerRole(...roles);
  if (auth.error) return auth;
  const perimetre = await obtenirPerimetreDepartements(auth);
  return { ...auth, perimetre };
}

/** Vrai si le périmètre est restreint (admin), faux pour le super_admin. */
export function estPerimetreRestreint(perimetre) {
  return Array.isArray(perimetre);
}

/**
 * Liste les départements visibles par le périmètre (tous pour le super_admin).
 *
 * @param {string[]|null} perimetre
 * @returns {Promise<{id: string, code: string|null, name: string}[]>}
 */
export async function listerDepartementsAutorises(perimetre) {
  if (Array.isArray(perimetre)) {
    if (perimetre.length === 0) return [];
    const { rows } = await targetPool.query(
      `SELECT id, code, name FROM auth_department WHERE id = ANY($1::text[]) ORDER BY name ASC`,
      [perimetre],
    );
    return rows;
  }
  const { rows } = await targetPool.query(
    `SELECT id, code, name FROM auth_department ORDER BY name ASC`,
  );
  return rows;
}

/**
 * Indique si un département (désigné par son nom, tel qu'affiché dans les filtres) est dans le périmètre.
 * Toujours vrai pour le super_admin.
 *
 * @param {string[]|null} perimetre
 * @param {string} nom
 */
export async function departementNomAutorise(perimetre, nom) {
  if (!Array.isArray(perimetre)) return true;
  if (perimetre.length === 0) return false;
  const { rows } = await targetPool.query(
    `SELECT 1 FROM auth_department WHERE name = $1 AND id = ANY($2::text[]) LIMIT 1`,
    [nom, perimetre],
  );
  return rows.length > 0;
}

/**
 * Indique si un département (désigné par son identifiant) est dans le périmètre.
 *
 * @param {string[]|null} perimetre
 * @param {string} id
 */
export function departementIdAutorise(perimetre, id) {
  if (!Array.isArray(perimetre)) return true;
  return perimetre.includes(String(id));
}

/**
 * Construit la condition SQL restreignant un identifiant d'employé (matricule / pin) au périmètre.
 * Ajoute le tableau d'identifiants dans `params` (requête paramétrée, aucune concaténation de valeurs).
 *
 * @param {string[]|null} perimetre
 * @param {unknown[]} params - Tableau de paramètres de la requête, modifié en place
 * @param {string} exprPin - Expression SQL du matricule (ex: "emp_code", "pj.id")
 * @returns {string|null} Condition à ajouter au WHERE, ou `null` si aucune restriction
 */
export function conditionPerimetrePersonnel(perimetre, params, exprPin) {
  if (!Array.isArray(perimetre)) return null;
  params.push(perimetre);
  const idx = `$${params.length}`;
  return (
    `${exprPin}::text IN (` +
    `SELECT pp.pin::text FROM pers_person pp WHERE pp.auth_dept_id = ANY(${idx}::text[]))`
  );
}

/**
 * Condition SQL restreignant une colonne identifiant de département (ex: p.auth_dept_id) au périmètre.
 *
 * @param {string[]|null} perimetre
 * @param {unknown[]} params
 * @param {string} exprDeptId
 * @returns {string|null}
 */
export function conditionPerimetreDepartementId(perimetre, params, exprDeptId) {
  if (!Array.isArray(perimetre)) return null;
  params.push(perimetre);
  return `${exprDeptId} = ANY($${params.length}::text[])`;
}

/**
 * Vérifie qu'un employé, désigné par son matricule (pin), appartient au périmètre.
 *
 * @param {string[]|null} perimetre
 * @param {string} pin
 */
export async function employePinAutorise(perimetre, pin) {
  if (!Array.isArray(perimetre)) return true;
  if (perimetre.length === 0) return false;
  const { rows } = await targetPool.query(
    `SELECT 1 FROM pers_person WHERE pin::text = $1 AND auth_dept_id = ANY($2::text[]) LIMIT 1`,
    [String(pin), perimetre],
  );
  return rows.length > 0;
}

/**
 * Retourne, parmi les identifiants pers_person fournis, ceux qui sont HORS périmètre.
 * Renvoie toujours un tableau vide pour le super_admin.
 *
 * @param {string[]|null} perimetre
 * @param {string[]} personIds
 * @returns {Promise<string[]>}
 */
export async function personnesHorsPerimetre(perimetre, personIds) {
  if (!Array.isArray(perimetre)) return [];
  const ids = [...new Set(personIds.map(String))];
  if (ids.length === 0) return [];
  if (perimetre.length === 0) return ids;
  const { rows } = await targetPool.query(
    `SELECT id FROM pers_person WHERE id = ANY($1::text[]) AND auth_dept_id = ANY($2::text[])`,
    [ids, perimetre],
  );
  const autorises = new Set(rows.map((r) => String(r.id)));
  return ids.filter((id) => !autorises.has(id));
}

/**
 * Lit les départements directement affectés à un ou plusieurs utilisateurs (sans les sous-départements).
 *
 * @param {number[]} userIds
 * @returns {Promise<Map<number, {id: string, name: string}[]>>}
 */
export async function lireAffectationsDepartements(userIds) {
  const out = new Map();
  if (!Array.isArray(userIds) || userIds.length === 0) return out;
  const { rows } = await targetPool.query(
    `
    SELECT ud.utilisateur_id, ud.departement_id AS id, COALESCE(d.name, ud.departement_id) AS name
    FROM utilisateur_departements ud
    LEFT JOIN LATERAL (
      SELECT name FROM auth_department WHERE id = ud.departement_id LIMIT 1
    ) d ON TRUE
    WHERE ud.utilisateur_id = ANY($1::int[])
    ORDER BY name ASC
    `,
    [userIds],
  );
  for (const r of rows) {
    const list = out.get(r.utilisateur_id) ?? [];
    list.push({ id: String(r.id), name: r.name });
    out.set(r.utilisateur_id, list);
  }
  return out;
}

/**
 * Remplace l'ensemble des départements affectés à un utilisateur (dans la transaction du client fourni).
 * Seuls les identifiants existant dans auth_department sont retenus.
 *
 * @param {import('pg').ClientBase} client
 * @param {number} userId
 * @param {string[]} departementIds
 * @returns {Promise<string[]>} Identifiants réellement enregistrés
 */
export async function remplacerAffectationsDepartements(client, userId, departementIds) {
  const demandes = [...new Set((departementIds || []).map((d) => String(d).trim()).filter(Boolean))];

  let valides = [];
  if (demandes.length > 0) {
    const { rows } = await client.query(
      `SELECT DISTINCT id FROM auth_department WHERE id = ANY($1::text[])`,
      [demandes],
    );
    valides = rows.map((r) => String(r.id));
  }

  await client.query('DELETE FROM utilisateur_departements WHERE utilisateur_id = $1', [userId]);
  if (valides.length > 0) {
    await client.query(
      `INSERT INTO utilisateur_departements (utilisateur_id, departement_id)
       SELECT $1, UNNEST($2::text[])
       ON CONFLICT DO NOTHING`,
      [userId, valides],
    );
  }
  return valides;
}
