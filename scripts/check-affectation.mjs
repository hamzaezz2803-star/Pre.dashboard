import { targetPool } from '../lib/db.js';

async function check() {
  const trigs = await targetPool.query(`
    SELECT trigger_name, event_manipulation, action_statement, action_timing
    FROM information_schema.triggers
    WHERE event_object_table = 'employes_affectation_dynamique'
  `);
  console.log('TRIGGERS:', trigs.rows);

  const constr = await targetPool.query(`
    SELECT conname, contype, pg_get_constraintdef(oid)
    FROM pg_constraint
    WHERE conrelid = 'employes_affectation_dynamique'::regclass
  `);
  console.log('CONSTRAINTS:', constr.rows);
  process.exit(0);
}
check();
