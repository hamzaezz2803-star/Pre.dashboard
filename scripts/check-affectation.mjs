import { targetPool } from '../lib/db.js';

async function check() {
  const trigs = await targetPool.query(`
    SELECT trigger_name, event_manipulation, event_object_table, action_statement
    FROM information_schema.triggers
  `);
  console.log('ALL TRIGGERS:', trigs.rows);

  const t2 = await targetPool.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'affectations_horaires_dynamiques'
  `);
  console.log('affectations_horaires_dynamiques COLS:', t2.rows);

  process.exit(0);
}
check();
