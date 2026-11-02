import { normaliserIdCompteur, validerCompteur, PERIODICITES, COLONNES_PERIODICITE } from './validation.js';

/**
 * Accès aux définitions des compteurs (tables de scripts/migration-compteurs.sql).
 * Chaque fonction reçoit un client `pg` (pool ou client de transaction) afin de
 * pouvoir être testée dans une transaction annulée. Requêtes paramétrées uniquement.
 *
 * Les erreurs métier sont levées en `ErreurCompteur` avec un code HTTP.
 */

export class ErreurCompteur extends Error {
  constructor(status, message, erreurs = null) {
    super(message);
    this.name = 'ErreurCompteur';
    this.status = status;
    this.erreurs = erreurs;
  }
}

const COLONNES = `id_compteur, libelle, formule, journalier, hebdomadaire, mensuel, unite,
  description, actif, version_formule, created_at, updated_at`;

/**
 * Clé de comparaison sans casse ni accents (base en LC_CTYPE 'C' : lower() seul
 * ignore les lettres accentuées). Identique à l'index uq_compteurs_libelle.
 */
const cleSql = (expr) => `lower(translate(${expr},
    'ÀÁÂÃÄÅàáâãäåÇçÈÉÊËèéêëÌÍÎÏìíîïÑñÒÓÔÕÖòóôõöÙÚÛÜùúûüÝýÿ',
    'AAAAAAaaaaaaCcEEEEeeeeIIIIiiiiNnOOOOOoooooUUUUuuuuYyy'))`;

/** Champs dont la modification crée une nouvelle version de formule. */
const CHAMPS_VERSIONNES = ['formule', 'unite', 'journalier', 'hebdomadaire', 'mensuel'];

/** Convertit les erreurs PostgreSQL connues en erreurs lisibles. */
export function traduireErreurBase(e) {
  if (e instanceof ErreurCompteur) return e;
  if (e?.code === '42P01') {
    return new ErreurCompteur(503, 'Les tables des compteurs sont absentes : appliquez scripts/migration-compteurs.sql.');
  }
  if (e?.code === '23505' && e.constraint === 'compteurs_pkey') {
    return new ErreurCompteur(409, 'Un compteur avec cet identifiant existe déjà.', [
      { champ: 'id_compteur', message: 'Identifiant déjà utilisé.' },
    ]);
  }
  if (e?.code === '23505' && e.constraint === 'uq_compteurs_libelle') {
    return new ErreurCompteur(409, 'Un compteur porte déjà ce libellé.', [
      { champ: 'libelle', message: 'Libellé déjà utilisé.' },
    ]);
  }
  if (e?.code === '23514') {
    return new ErreurCompteur(400, 'Données refusées par la base.');
  }
  return e;
}

/**
 * Liste les compteurs avec filtres facultatifs.
 * @param {{ recherche?: string, periodicite?: string, statut?: 'actif'|'inactif'|'tous' }} filtres
 */
export async function listerCompteurs(db, filtres = {}) {
  const conditions = [];
  const params = [];

  const recherche = typeof filtres.recherche === 'string' ? filtres.recherche.trim().slice(0, 100) : '';
  if (recherche) {
    // Les caractères spéciaux de LIKE sont échappés : recherche littérale, sans casse ni accents
    params.push(`%${recherche.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
    const p = cleSql(`$${params.length}::text`);
    conditions.push(`(${cleSql('id_compteur')} LIKE ${p} OR ${cleSql('libelle')} LIKE ${p})`);
  }
  if (PERIODICITES.includes(filtres.periodicite)) {
    conditions.push(`${COLONNES_PERIODICITE[filtres.periodicite]} = TRUE`);
  }
  if (filtres.statut === 'actif') conditions.push('actif = TRUE');
  if (filtres.statut === 'inactif') conditions.push('actif = FALSE');

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  try {
    const { rows } = await db.query(
      `SELECT ${COLONNES} FROM compteurs ${where} ORDER BY actif DESC, ${cleSql('libelle')} LIMIT 500`,
      params
    );
    return rows;
  } catch (e) {
    throw traduireErreurBase(e);
  }
}

/** Lit un compteur et l'historique de ses versions de formule. */
export async function lireCompteur(db, idBrut) {
  const id = normaliserIdCompteur(idBrut);
  if (!id) throw new ErreurCompteur(400, 'Identifiant de compteur invalide.');

  try {
    const { rows } = await db.query(`SELECT ${COLONNES} FROM compteurs WHERE id_compteur = $1`, [id]);
    if (rows.length === 0) throw new ErreurCompteur(404, 'Compteur introuvable.');

    const { rows: versions } = await db.query(
      `SELECT v.version_formule, v.formule, v.unite, v.journalier, v.hebdomadaire, v.mensuel,
              v.modifie_le, u.username AS modifie_par
       FROM compteurs_versions v
       LEFT JOIN users u ON u.id = v.modifie_par
       WHERE v.id_compteur = $1
       ORDER BY v.version_formule DESC`,
      [id]
    );
    return { ...rows[0], versions };
  } catch (e) {
    throw traduireErreurBase(e);
  }
}

async function enregistrerVersion(db, c, utilisateurId) {
  await db.query(
    `INSERT INTO compteurs_versions
       (id_compteur, version_formule, formule, unite, journalier, hebdomadaire, mensuel, modifie_par)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [c.id_compteur, c.version_formule, c.formule, c.unite, c.journalier, c.hebdomadaire, c.mensuel, utilisateurId]
  );
}

/**
 * Exécute `fn(client)` dans une transaction sur un client du pool.
 * Les fonctions d'écriture ci-dessous doivent être appelées via ce helper.
 */
export async function avecTransaction(pool, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const resultat = await fn(client);
    await client.query('COMMIT');
    return resultat;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw traduireErreurBase(e);
  } finally {
    client.release();
  }
}

/** Crée un compteur et sa version 1. À appeler dans une transaction. */
export async function creerCompteur(db, corps, utilisateurId) {
  const v = validerCompteur(corps);
  if (!v.ok) throw new ErreurCompteur(400, 'Compteur invalide.', v.erreurs);
  const d = v.valeurs;

  try {
    const { rows } = await db.query(
      `INSERT INTO compteurs
         (id_compteur, libelle, formule, journalier, hebdomadaire, mensuel, unite, description, actif, cree_par, modifie_par)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)
       RETURNING ${COLONNES}`,
      [d.id_compteur, d.libelle, d.formule, d.journalier, d.hebdomadaire, d.mensuel, d.unite,
        d.description ?? null, d.actif ?? true, utilisateurId]
    );
    await enregistrerVersion(db, rows[0], utilisateurId);
    return rows[0];
  } catch (e) {
    throw traduireErreurBase(e);
  }
}

/**
 * Modifie un compteur (champs partiels). Si la formule, l'unité ou les
 * périodicités changent, la version est incrémentée et archivée.
 * Les valeurs déjà calculées ne sont pas modifiées ici. À appeler dans une transaction.
 */
export async function modifierCompteur(db, idBrut, corps, utilisateurId) {
  const id = normaliserIdCompteur(idBrut);
  if (!id) throw new ErreurCompteur(400, 'Identifiant de compteur invalide.');

  try {
    const { rows } = await db.query(`SELECT ${COLONNES} FROM compteurs WHERE id_compteur = $1 FOR UPDATE`, [id]);
    if (rows.length === 0) throw new ErreurCompteur(404, 'Compteur introuvable.');
    const existant = rows[0];

    const v = validerCompteur(corps, { partiel: true, existant });
    if (!v.ok) throw new ErreurCompteur(400, 'Compteur invalide.', v.erreurs);

    const changements = Object.entries(v.valeurs).filter(([k, val]) => existant[k] !== val);
    if (changements.length === 0) {
      return { compteur: existant, nouvelleVersion: false };
    }

    const nouvelleVersion = changements.some(([k]) => CHAMPS_VERSIONNES.includes(k));
    const sets = changements.map(([k], i) => `${k} = $${i + 2}`);
    const params = [id, ...changements.map(([, val]) => val)];
    params.push(utilisateurId);
    sets.push(`modifie_par = $${params.length}`, 'updated_at = NOW()');
    if (nouvelleVersion) sets.push('version_formule = version_formule + 1');

    const { rows: maj } = await db.query(
      `UPDATE compteurs SET ${sets.join(', ')} WHERE id_compteur = $1 RETURNING ${COLONNES}`,
      params
    );
    if (nouvelleVersion) await enregistrerVersion(db, maj[0], utilisateurId);
    return { compteur: maj[0], nouvelleVersion };
  } catch (e) {
    throw traduireErreurBase(e);
  }
}
