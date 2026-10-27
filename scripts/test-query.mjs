import { targetPool } from '../lib/db.js';

async function test() {
  const r = await targetPool.query(`
    SELECT 
      p.id, 
      p.pin AS matricule, 
      p.last_name AS nom, 
      p.name AS prenom, 
      p.auth_dept_id AS departement_id, 
      COALESCE(d.name, 'Sans département') AS departement,
      COALESCE(e.actif, false) AS actif
    FROM pers_person p
    LEFT JOIN auth_department d ON d.id = p.auth_dept_id
    LEFT JOIN employes_affectation_dynamique e ON e.cvaccess_person_id = p.id
    ORDER BY p.pin ASC
  `);
  console.log('EMPLOYEES WITH ACTIF:', r.rows);
  process.exit(0);
}
test();
