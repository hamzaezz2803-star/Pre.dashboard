import { targetPool } from '../lib/db.js';

async function main() {
  const q = `
    SELECT id, code, name, parent_id
    FROM auth_department
    ORDER BY code ASC;
  `;
  const res = await targetPool.query(q);
  console.log('All departments:');
  console.table(res.rows);

  // Détection de la racine :
  // Le nœud racine est un département sans parent (NULL, vide, ou égal à son ID)
  // qui est parent d'autres départements, ou qui a le code '1' / name 'Department Name'
  const rootRes = await targetPool.query(`
    SELECT id, code, name, parent_id
    FROM auth_department
    WHERE (parent_id IS NULL OR parent_id = '' OR parent_id = id)
      AND (
        id IN (SELECT DISTINCT parent_id FROM auth_department WHERE parent_id IS NOT NULL AND parent_id <> '' AND parent_id <> id)
        OR code = '1'
        OR name ILIKE 'Department Name'
      )
    ORDER BY (code = '1') DESC, (name ILIKE 'Department Name') DESC
    LIMIT 1;
  `);
  console.log('Detected Root:', rootRes.rows[0]);

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
