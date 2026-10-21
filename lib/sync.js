import { sourcePool, targetPool } from './db.js';

/**
 * Liste ordonnée des tables à synchroniser.
 */
const TABLES = [
  'pers_person',
  'pers_position',
  'auth_department',
  'att_record',
  'att_transaction',
  'acc_transaction',
];

/**
 * Taille maximale de chaque lot pour l'insertion (500 lignes).
 */
const BATCH_SIZE = 500;

/**
 * État en mémoire de la synchronisation.
 */
export const syncState = {
  lastRun: null,
  lastError: null,
  lastCounts: null,
};

/**
 * Verrou en mémoire pour empêcher les exécutions concurrentes.
 */
let isSyncing = false;

/**
 * Copie les tables spécifiées depuis la base source vers la base cible.
 *
 * Déroulement pour chaque table :
 * 1. Lecture de toutes les lignes source via `SELECT *`.
 * 2. Nettoyage de la table cible via `TRUNCATE`.
 * 3. Si la source n'est pas vide, insertion par lots de 500 lignes avec
 *    paramètres sécurisés ($1, $2...) et noms de colonnes entre guillemets doubles.
 *
 * Note : Aucun COMMIT n'est exécuté dans cette fonction afin de préserver
 * la gestion transactionnelle de l'appelant.
 *
 * @param {import('pg').ClientBase} srcClient - Client connecté à la base source
 * @param {import('pg').ClientBase} dstClient - Client connecté à la base cible
 * @returns {Promise<Record<string, number>>} Nombre de lignes copiées par table
 */
export async function copyTables(srcClient, dstClient) {
  const counts = {};

  for (const table of TABLES) {
    // 1. Lire toutes les lignes de la table source
    const { rows } = await srcClient.query(`SELECT * FROM "${table}"`);
    counts[table] = rows ? rows.length : 0;

    // 2. Vider la table cible avec TRUNCATE
    await dstClient.query(`TRUNCATE TABLE "${table}" CASCADE`);

    // Si la table source est vide, on s'arrête là pour cette table
    if (!rows || rows.length === 0) {
      continue;
    }

    // 3. Lecture dynamique des colonnes depuis la première ligne
    const columns = Object.keys(rows[0]);
    const quotedColumns = columns.map((col) => `"${col}"`).join(', ');

    // Insertion des données par lots de 500 lignes
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const values = [];
      const rowPlaceholders = [];
      let paramIndex = 1;

      for (const row of batch) {
        const placeholders = [];
        for (const col of columns) {
          placeholders.push(`$${paramIndex++}`);
          values.push(row[col]);
        }
        rowPlaceholders.push(`(${placeholders.join(', ')})`);
      }

      const insertQuery = `INSERT INTO "${table}" (${quotedColumns}) VALUES ${rowPlaceholders.join(', ')}`;
      await dstClient.query(insertQuery, values);
    }
  }

  return counts;
}

/**
 * Requête SQL de recalcul de la table pointage_journalier (exécutée telle quelle).
 */
const SQL_RECALCUL_POINTAGES = `
TRUNCATE TABLE pointage_journalier;

INSERT INTO pointage_journalier (
  id, nom, prenom, prestation, departement, date_pointage,
  premier_pointage, dernier_pointage, nb_pointages, zones,
  temps_presence_min, absence_min
)
WITH ordered AS (
  SELECT
    pers_person_pin AS pin,
    att_datetime    AS t,
    att_state       AS s,
    att_place       AS place,
    LEAD(att_datetime) OVER (
      PARTITION BY pers_person_pin, CAST(att_datetime AS DATE)
      ORDER BY att_datetime
    ) AS nxt
  FROM att_transaction
),
pt AS (
  SELECT
    pin,
    CAST(t AS DATE)                                    AS jour,
    MIN(t)                                             AS premier,
    MAX(t)                                             AS dernier,
    COUNT(*)                                           AS nb,
    STRING_AGG(DISTINCT NULLIF(place, ''), ', ')       AS zones,
    SUM(EXTRACT(EPOCH FROM (nxt - t)) / 60)
      FILTER (WHERE s IN ('0', '2') AND nxt IS NOT NULL) AS minutes
  FROM ordered
  GROUP BY pin, CAST(t AS DATE)
),
personne AS (
  SELECT DISTINCT ON (pin) * FROM pers_person ORDER BY pin, id
),
poste AS (
  SELECT DISTINCT ON (id) * FROM pers_position ORDER BY id
),
service AS (
  SELECT DISTINCT ON (id) * FROM auth_department ORDER BY id
),
jour_recap AS (
  SELECT
    pers_person_pin,
    CAST(att_date AS DATE) AS att_date,
    SUM(absent_minute)     AS absent_minute
  FROM att_record
  GROUP BY pers_person_pin, CAST(att_date AS DATE)
)
SELECT
  p.pin,
  p.last_name,
  p.name,
  pos.name,
  d.name,
  ar.att_date,
  pt.premier,
  pt.dernier,
  COALESCE(pt.nb, 0),
  pt.zones,
  CAST(pt.minutes AS INT),
  ar.absent_minute
FROM jour_recap ar
JOIN personne p     ON p.pin = ar.pers_person_pin
LEFT JOIN poste pos ON pos.id = p.position_id
LEFT JOIN service d ON d.id = p.auth_dept_id
LEFT JOIN pt        ON pt.pin = p.pin AND pt.jour = ar.att_date;
`;

/**
 * Recalcule la table pointage_journalier dans la base cible en exécutant
 * le script SQL de consolidation.
 *
 * @param {import('pg').ClientBase} dstClient - Client connecté à la base cible
 */
export async function recalculerPointages(dstClient) {
  await dstClient.query(SQL_RECALCUL_POINTAGES);
}

/**
 * Indique si une synchronisation est en cours.
 */
export function isSyncInProgress() {
  return isSyncing;
}

/**
 * Exécute la synchronisation complète de la source vers la cible :
 * 1. Ne fait rien si une synchronisation est déjà en cours (verrou en mémoire).
 * 2. Ouvre une connexion sur sourcePool et une sur targetPool.
 * 3. Démarre une transaction (BEGIN) sur la cible, copie les tables, recalcule pointage_journalier, puis valide (COMMIT).
 * 4. En cas d'erreur : annule la transaction (ROLLBACK) et enregistre le message dans syncState.lastError.
 * 5. Dans tous les cas : met à jour syncState.lastRun, puis libère les connexions.
 *
 * Ne modifie jamais la base source (lecture seule).
 */
export async function runSync() {
  // 1. Ne rien faire si une synchronisation est déjà en cours
  if (isSyncing) {
    return { inProgress: true, syncState };
  }

  isSyncing = true;
  let srcClient = null;
  let dstClient = null;

  try {
    // 2. Ouvrir une connexion sur sourcePool et targetPool
    srcClient = await sourcePool.connect();
    dstClient = await targetPool.connect();

    // 3. BEGIN sur la cible, copyTables, recalculerPointages, COMMIT
    await dstClient.query('BEGIN');
    const counts = await copyTables(srcClient, dstClient);
    await recalculerPointages(dstClient);

    const pjRes = await dstClient.query('SELECT COUNT(*) AS count FROM pointage_journalier');
    await dstClient.query('COMMIT');

    // Réinitialisation de l'erreur et mise à jour des comptages
    syncState.lastError = null;
    syncState.lastCounts = {
      ...counts,
      pointage_journalier: parseInt(pjRes.rows[0]?.count || '0', 10),
    };
  } catch (error) {
    // 4. En cas d'erreur : ROLLBACK et enregistrement du message d'erreur
    if (dstClient) {
      try {
        await dstClient.query('ROLLBACK');
      } catch {
        // Erreur lors du rollback ignorée
      }
    }
    syncState.lastError = error instanceof Error ? error.message : String(error);
  } finally {
    // 5. Dans tous les cas : mise à jour de lastRun et libération des connexions
    syncState.lastRun = new Date();

    if (srcClient) {
      try {
        srcClient.release();
      } catch {}
    }

    if (dstClient) {
      try {
        dstClient.release();
      } catch {}
    }

    isSyncing = false;
  }
}

export default copyTables;
