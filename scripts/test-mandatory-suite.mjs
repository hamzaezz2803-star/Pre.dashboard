import { SignJWT } from 'jose';
import { targetPool } from '../lib/db.js';

async function runTests() {
  console.log('=== TEST 1: Vérification de la base PostgreSQL ===');
  const dbRes = await targetPool.query('SELECT current_database()');
  console.log('Base active :', dbRes.rows[0].current_database);
  if (dbRes.rows[0].current_database !== 'ocp_pointage') {
    throw new Error('La base active doit être ocp_pointage');
  }

  // Récupérer les employés 12, 13 et 14
  const people = await targetPool.query(`
    SELECT id, pin, last_name, name, auth_dept_id
    FROM pers_person
    WHERE pin IN ('12', '13', '14')
    ORDER BY pin ASC
  `);
  console.log('Employés trouvés dans pers_person :', people.rows);

  const emp12 = people.rows.find((p) => p.pin === '12');
  const emp13 = people.rows.find((p) => p.pin === '13');
  const emp14 = people.rows.find((p) => p.pin === '14');

  if (!emp12 || !emp13 || !emp14) {
    throw new Error('Les employés 12, 13 et 14 doivent exister dans pers_person');
  }

  // Préparer le token JWT superadmin
  const secretKey = new TextEncoder().encode(process.env.AUTH_SECRET);
  const token = await new SignJWT({ id: 1, username: 'superadmin', role: 'super_admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('8h')
    .sign(secretKey);

  const headers = {
    Cookie: `ocp_session=${token}`,
    'Content-Type': 'application/json',
  };

  console.log('\n=== TEST 2: Application des sélections exigées ===');
  console.log('- Employé 12 (id:', emp12.id, ') : activation');
  console.log('- Employé 13 (id:', emp13.id, ') : activation');
  console.log('- Employé 14 (id:', emp14.id, ') : désactivation');

  // Envoi des activeIds : [emp12.id, emp13.id] (donc emp14 désactivé)
  const saveRes = await fetch('http://localhost:3000/api/affectation-horaire/enregistrer-employes', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      activeIds: [emp12.id, emp13.id],
    }),
  });

  const saveJson = await saveRes.json();
  console.log('Réponse de sauvegarde HTTP :', saveRes.status, saveJson);

  console.log('\n=== TEST 3: Vérification directe dans PostgreSQL (employes_affectation_dynamique) ===');
  const pgRows = await targetPool.query(`
    SELECT p.pin, p.name, e.cvaccess_person_id, e.actif, e.updated_at
    FROM pers_person p
    JOIN employes_affectation_dynamique e ON e.cvaccess_person_id = p.id
    WHERE p.pin IN ('12', '13', '14')
    ORDER BY p.pin ASC
  `);
  console.log('Lignes réelles PostgreSQL :', pgRows.rows);

  const check12 = pgRows.rows.find((r) => r.pin === '12');
  const check13 = pgRows.rows.find((r) => r.pin === '13');
  const check14 = pgRows.rows.find((r) => r.pin === '14');

  console.log('Employé 12 actif =', check12?.actif, '->', check12?.actif === true ? 'SUCCÈS (activé)' : 'ÉCHEC');
  console.log('Employé 13 actif =', check13?.actif, '->', check13?.actif === true ? 'SUCCÈS (activé)' : 'ÉCHEC');
  console.log('Employé 14 actif =', check14?.actif, '->', check14?.actif === false ? 'SUCCÈS (désactivé)' : 'ÉCHEC');

  if (check12?.actif !== true || check13?.actif !== true || check14?.actif !== false) {
    throw new Error('Les états dans employes_affectation_dynamique ne correspondent pas aux exigences !');
  }

  console.log('\n=== TEST 4: Simulation actualisation de la page (GET /api/affectation-horaire/employes) ===');
  const reloadRes = await fetch('http://localhost:3000/api/affectation-horaire/employes', {
    method: 'GET',
    headers,
  });
  const reloadJson = await reloadRes.json();
  console.log('Total employés rechargés :', reloadJson.employes?.length);
  console.log('activeIds rechargés :', reloadJson.activeIds);

  const r12 = reloadJson.employes.find((e) => e.matricule === '12');
  const r13 = reloadJson.employes.find((e) => e.matricule === '13');
  const r14 = reloadJson.employes.find((e) => e.matricule === '14');

  console.log('Rechargement Employé 12 actif =', r12?.actif);
  console.log('Rechargement Employé 13 actif =', r13?.actif);
  console.log('Rechargement Employé 14 actif =', r14?.actif);

  if (r12?.actif !== true || r13?.actif !== true || r14?.actif !== false) {
    throw new Error('Erreur de persistance lors du rechargement de page !');
  }

  console.log('\n=== TEST 5: Changement de département (filtre deptId) ===');
  const deptRes = await fetch(
    `http://localhost:3000/api/affectation-horaire/employes?deptId=${emp12.auth_dept_id}`,
    {
      method: 'GET',
      headers,
    }
  );
  const deptJson = await deptRes.json();
  console.log('Employés filtrés par département :', deptJson.employes?.length);
  console.log('activeIds préservés au changement de département :', deptJson.activeIds);

  const d12 = deptJson.employes.find((e) => e.matricule === '12');
  const d13 = deptJson.employes.find((e) => e.matricule === '13');
  const d14 = deptJson.employes.find((e) => e.matricule === '14');

  console.log('Après filtre dept - Employé 12 actif =', d12?.actif);
  console.log('Après filtre dept - Employé 13 actif =', d13?.actif);
  console.log('Après filtre dept - Employé 14 actif =', d14?.actif);

  if (d12?.actif !== true || d13?.actif !== true || d14?.actif !== false) {
    throw new Error('Erreur de persistance lors du changement de département !');
  }

  console.log('\n>>> TOUS LES TESTS SONT PASSÉS AVEC SUCCÈS ! <<<');
  process.exit(0);
}

runTests().catch((err) => {
  console.error('Erreur test suite :', err);
  process.exit(1);
});
