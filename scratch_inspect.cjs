const { Pool } = require('pg');

async function run() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const qTest = `
      WITH dyn_services AS (
        SELECT 
          p.pin::text AS emp_id,
          TRIM(CONCAT(p.last_name, ' ', p.name))::text AS nom_employe,
          a.heure_entree AS pointage_timestamp,
          a.date_service AS date_service,
          COALESCE(h.period_name, 'Horaire non défini')::text AS horaire_affecte,
          COALESCE(d.name, 'Sans département')::text AS departement
        FROM affectations_horaires_dynamiques a
        JOIN pers_person p ON p.id = a.cvaccess_person_id
        LEFT JOIN cvaccess_horaires h ON h.cvaccess_horaire_id = a.cvaccess_horaire_id
        LEFT JOIN auth_department d ON d.id = p.auth_dept_id
        WHERE a.heure_entree IS NOT NULL
      ),
      standard_services AS (
        SELECT 
          COALESCE(p.pin, pj.id)::text AS emp_id,
          TRIM(CONCAT(COALESCE(p.last_name, pj.nom), ' ', COALESCE(p.name, pj.prenom)))::text AS nom_employe,
          pj.premier_pointage AS pointage_timestamp,
          pj.date_pointage AS date_service,
          'Horaire non défini'::text AS horaire_affecte,
          COALESCE(d.name, pj.departement, 'Sans département')::text AS departement
        FROM pointage_journalier pj
        LEFT JOIN pers_person p ON p.pin = pj.id
        LEFT JOIN auth_department d ON d.id = p.auth_dept_id
        WHERE pj.premier_pointage IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM affectations_horaires_dynamiques a 
            WHERE a.cvaccess_person_id = p.id 
              AND (a.date_service = pj.date_pointage 
                   OR (a.date_service = pj.date_pointage - 1 AND a.heure_sortie = pj.premier_pointage))
          )
      ),
      unifie AS (
        SELECT * FROM dyn_services
        UNION ALL
        SELECT * FROM standard_services
      )
      SELECT 
        emp_id,
        nom_employe,
        TO_CHAR(pointage_timestamp, 'YYYY-MM-DD HH24:MI') AS heure_pointage,
        horaire_affecte,
        date_service::text,
        departement
      FROM unifie
      WHERE emp_id IN ('12', '13', '14')
      ORDER BY pointage_timestamp DESC;
    `;
    const r = await pool.query(qTest);
    console.log('--- TEST RAPPORT PRESENCES NEW QUERY ---');
    console.table(r.rows);

  } catch (e) {
    console.error('Error:', e);
  } finally {
    await pool.end();
  }
}

run();
