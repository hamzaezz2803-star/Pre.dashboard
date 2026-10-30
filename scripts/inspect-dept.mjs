import { targetPool, sourcePool } from '../lib/db.js';

async function main() {
  console.log('--- auth_department columns in ocp_pointage ---');
  const cols = await targetPool.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'auth_department'
    ORDER BY ordinal_position;
  `);
  console.table(cols.rows);

  console.log('--- auth_department rows in ocp_pointage ---');
  const rows = await targetPool.query(`
    SELECT id, code, name, parent_id 
    FROM auth_department;
  `);
  console.table(rows.rows);

  console.log('--- auth_department rows in biosecurity-boot ---');
  const sRows = await sourcePool.query(`
    SELECT id, code, name, parent_id 
    FROM auth_department;
  `);
  console.table(sRows.rows);

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
