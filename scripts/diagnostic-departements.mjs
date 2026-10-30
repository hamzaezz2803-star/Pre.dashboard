import { sourcePool, targetPool } from '../lib/db.js';

async function diagnostiquer() {
  console.log('=== DIAGNOSTIC SOURCE (biosecurity-boot) ===');
  try {
    const src = await sourcePool.query(`
      SELECT id, code, name, parent_id
      FROM auth_department
      ORDER BY name ASC;
    `);
    console.table(src.rows);
  } catch (e) {
    console.log('Erreur source :', e.message);
  }

  console.log('\n=== DIAGNOSTIC CIBLE (ocp_pointage) ===');
  try {
    const tgt = await targetPool.query(`
      SELECT id, code, name, parent_id
      FROM auth_department
      ORDER BY name ASC;
    `);
    console.table(tgt.rows);
  } catch (e) {
    console.log('Erreur cible :', e.message);
  }

  process.exit(0);
}

diagnostiquer();
