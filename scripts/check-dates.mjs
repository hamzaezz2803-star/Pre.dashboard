import { targetPool } from '../lib/db.js';

async function main() {
  const tTables = await targetPool.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public'
    ORDER BY table_name;
  `);
  console.log('Tables in ocp_pointage:', tTables.rows.map(r => r.table_name));

  for (const t of tTables.rows) {
    try {
      const c = await targetPool.query(`SELECT count(*) FROM "${t.table_name}";`);
      if (parseInt(c.rows[0].count) > 0) {
        console.log(`  ${t.table_name}: ${c.rows[0].count} rows`);
      }
    } catch (e) {}
  }

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
