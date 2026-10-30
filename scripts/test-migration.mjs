import fs from 'fs';
import { targetPool } from '../lib/db.js';

async function runMigration() {
  const sql = fs.readFileSync('scripts/migration-hierarchie-departements.sql', 'utf8');
  console.log('Exécution de la migration scripts/migration-hierarchie-departements.sql...');
  await targetPool.query(sql);
  console.log('Migration exécutée avec succès !');

  // Vérifier la vue
  const { rows } = await targetPool.query(`SELECT * FROM public.user_departements LIMIT 5;`);
  console.log('Test vue user_departements (5 lignes) :', rows);

  process.exit(0);
}

runMigration().catch(err => {
  console.error('Erreur migration :', err);
  process.exit(1);
});
