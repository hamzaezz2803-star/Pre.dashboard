import { targetPool } from '../lib/db.js';

async function check() {
  try {
    const db = await targetPool.query('SELECT current_database()');
    console.log('CURRENT DATABASE:', db.rows[0].current_database);

    const tables = await targetPool.query(`
      SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE '%employe%'
    `);
    console.log('TABLES MATCHING employe:', tables.rows);

    const cols = await targetPool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'employes_affectation_dynamique'
    `);
    console.log('COLUMNS employes_affectation_dynamique:', cols.rows);

    const rows = await targetPool.query('SELECT * FROM employes_affectation_dynamique');
    console.log('ROWS in employes_affectation_dynamique:', rows.rows);

    const people = await targetPool.query(`
      SELECT p.id, p.pin, p.last_name, p.name, e.actif
      FROM pers_person p
      LEFT JOIN employes_affectation_dynamique e ON e.cvaccess_person_id = p.id
    `);
    console.log('PEOPLE WITH DYNAMIC ASSIGNMENT:', people.rows);
  } catch (e) {
    console.error('Error:', e.message);
  }
  process.exit(0);
}
check();
