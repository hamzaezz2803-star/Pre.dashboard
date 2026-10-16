import { Pool } from 'pg';

/**
 * Contrôle des variables d'environnement au démarrage.
 * Vérifie que DATABASE_URL est bien renseignée et n'utilise pas les valeurs d'exemple.
 */
const dbUrl = process.env.DATABASE_URL;

if (!dbUrl) {
  console.warn(
    '[Configuration] ATTENTION : La variable d\'environnement DATABASE_URL est absente. Veuillez la renseigner dans votre fichier .env.'
  );
} else if (dbUrl.includes('mot_de_passe') || dbUrl.includes('VOTRE_MOT_DE_PASSE')) {
  console.warn(
    '[Configuration] ATTENTION : La variable DATABASE_URL contient une valeur d\'exemple ("mot_de_passe" ou "VOTRE_MOT_DE_PASSE"). ' +
    'Veuillez indiquer vos véritables identifiants PostgreSQL dans le fichier .env.'
  );
}

/**
 * Gestion du cache global pour éviter de multiplier les instances de pools
 * lors des rechargements à chaud (HMR) en environnement de développement Next.js.
 * Si l'URL de connexion change (ex: modification du fichier .env), le pool est automatiquement recréé.
 */
const globalForDb = globalThis;

if (!globalForDb.sourcePool || globalForDb._sourceDbUrl !== process.env.SOURCE_DATABASE_URL) {
  if (globalForDb.sourcePool) {
    globalForDb.sourcePool.end().catch(() => {});
  }
  globalForDb.sourcePool = new Pool({
    connectionString: process.env.SOURCE_DATABASE_URL,
  });
  globalForDb._sourceDbUrl = process.env.SOURCE_DATABASE_URL;
}
export const sourcePool = globalForDb.sourcePool;

if (!globalForDb.targetPool || globalForDb._targetDbUrl !== process.env.DATABASE_URL) {
  if (globalForDb.targetPool) {
    globalForDb.targetPool.end().catch(() => {});
  }
  globalForDb.targetPool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });
  globalForDb._targetDbUrl = process.env.DATABASE_URL;
}
export const targetPool = globalForDb.targetPool;
