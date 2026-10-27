const { Pool } = require('pg');

async function run() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const totalPers = await pool.query(`SELECT COUNT(*) FROM pers_person`);
    console.log('Total pers_person:', totalPers.rows[0].count);

    const totalVPres = await pool.query(`SELECT COUNT(*) FROM v_presence_jour`);
    console.log('Total v_presence_jour:', totalVPres.rows[0].count);

    const pinsWithDyn = await pool.query(`
      SELECT DISTINCT p.pin, p.name, p.last_name
      FROM pers_person p
      JOIN affectations_horaires_dynamiques a ON a.cvaccess_person_id = p.id
    `);
    console.log('Pins with rows in affectations_horaires_dynamiques:');
    console.table(pinsWithDyn.rows);

    const sampleOtherEmployees = await pool.query(`
      SELECT p.pin, p.name, p.last_name, v.jour, v.premier_pointage, v.dernier_pointage, v.statut_presence
      FROM v_presence_jour v
      JOIN pers_person p ON p.pin = v.emp_code
      WHERE p.pin NOT IN ('12', '13', '14')
      ORDER BY v.jour DESC
      LIMIT 10
    `);
    console.log('Sample other employees in v_presence_jour:');
    console.table(sampleOtherEmployees.rows);

  } catch (e) {
    console.error('Error:', e);
  } finally {
    await pool.end();
  }
}

run();
