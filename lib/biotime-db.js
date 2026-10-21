import { Pool } from 'pg';

/**
 * Connexion en LECTURE SEULE à la base ocp_pointage (vue v_presence_jour).
 * Module réservé au serveur (routes API) : l'URL provient exclusivement de
 * la variable d'environnement BIOTIME_DATABASE_URL (fichier .env.local).
 *
 * La lecture seule est imposée au niveau de la session PostgreSQL
 * (default_transaction_read_only) en plus de n'exécuter que des SELECT.
 */
const globalForDb = globalThis;

export function getBiotimePool() {
  const url = process.env.BIOTIME_DATABASE_URL;
  if (!url) {
    throw new Error('La variable BIOTIME_DATABASE_URL est absente (fichier .env.local).');
  }

  if (!globalForDb.biotimePool || globalForDb._biotimeDbUrl !== url) {
    if (globalForDb.biotimePool) {
      globalForDb.biotimePool.end().catch(() => {});
    }
    globalForDb.biotimePool = new Pool({
      connectionString: url,
      options: '-c default_transaction_read_only=on',
    });
    globalForDb._biotimeDbUrl = url;
  }
  return globalForDb.biotimePool;
}
