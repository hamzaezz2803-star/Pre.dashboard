const { Pool } = require('pg');

async function run() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const q = `
      SELECT
         id,
         pers_person_pin AS pin,
         pers_person_name AS prenom,
         pers_person_last_name AS nom,
         auth_dept_name AS departement,
         to_char(att_datetime, 'HH24:MI:SS') AS heure,
         to_char(att_datetime, 'YYYY-MM-DD') AS jour,
         att_datetime,
         att_state,
         COALESCE(att_place, 'Badgeuse principale') AS lieu,
         COALESCE(device_name, 'Terminal pointage') AS appareil
       FROM att_transaction
       WHERE pers_person_pin::text = '14' 
         AND att_datetime >= '2026-10-25'::date 
         AND att_datetime < ('2026-10-26'::date + INTERVAL '1 day')
       ORDER BY att_datetime ASC;
    `;
    const r = await pool.query(q);
    console.log('Timeline for 14 over 2026-10-25 -> 2026-10-26:');
    console.table(r.rows);
  } catch (e) {
    console.error('Error:', e);
  } finally {
    await pool.end();
  }
}

run();
