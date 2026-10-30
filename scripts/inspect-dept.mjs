import { targetPool } from '../lib/db.js';

async function main() {
  const idx = await targetPool.query(`
    SELECT indexname, indexdef 
    FROM pg_indexes 
    WHERE tablename = 'auth_department';
  `);
  console.table(idx.rows);
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
