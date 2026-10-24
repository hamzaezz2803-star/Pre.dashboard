/**
 * Diagnostic des connexions aux bases de données.
 * Lit .env puis .env.local (comme l'application) et teste chaque URL.
 *
 * Usage : node scripts/diagnostic-db.mjs
 */
import fs from 'node:fs';
import pg from 'pg';

function chargerEnv(fichier) {
  if (!fs.existsSync(fichier)) {
    console.log(`(absent) ${fichier}`);
    return;
  }
  for (const ligne of fs.readFileSync(fichier, 'utf8').split(/\r?\n/)) {
    const m = ligne.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

chargerEnv('.env');
chargerEnv('.env.local');

/** Affiche l'URL sans le mot de passe. */
function masquer(url) {
  return url ? url.replace(/:([^:@/]*)@/, ':****@') : '(vide)';
}

async function tester(nom, url, requetes) {
  console.log(`\n=== ${nom} ===`);
  console.log('URL :', masquer(url));
  if (!url) {
    console.log('ERREUR : variable absente');
    return;
  }
  const pool = new pg.Pool({ connectionString: url, connectionTimeoutMillis: 5000 });
  try {
    for (const t of requetes) {
      try {
        const r = await pool.query(`SELECT count(*) FROM "${t}"`);
        console.log(`  ${t}: ${r.rows[0].count}`);
      } catch (e) {
        console.log(`  ${t}: ERREUR ${e.code ?? ''} ${e.message}`);
      }
    }
  } catch (e) {
    console.log('ERREUR de connexion :', e.code ?? '', e.message);
  } finally {
    await pool.end().catch(() => {});
  }
}

const tables = [
  'pers_person',
  'pers_position',
  'auth_department',
  'att_record',
  'att_transaction',
  'acc_transaction',
];

await tester('SOURCE (biosecurity-boot)', process.env.SOURCE_DATABASE_URL, tables);
await tester('CIBLE (ocp_pointage)', process.env.DATABASE_URL, [
  ...tables,
  'pointage_journalier',
]);
await tester('LECTURE (BIOTIME_DATABASE_URL)', process.env.BIOTIME_DATABASE_URL, [
  'v_presence_jour',
  'att_transaction',
]);
