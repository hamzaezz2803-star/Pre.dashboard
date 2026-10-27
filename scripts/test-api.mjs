import { SignJWT } from 'jose';

async function test() {
  const secretKey = new TextEncoder().encode(process.env.AUTH_SECRET);
  const token = await new SignJWT({ id: 1, username: 'superadmin', role: 'super_admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('8h')
    .sign(secretKey);

  const headers = { Cookie: `ocp_session=${token}` };

  console.log('--- 1. Testing Departements ---');
  const deptsRes = await fetch('http://localhost:3000/api/affectation-horaire/departements', { headers });
  const depts = await deptsRes.json();
  console.log('DEPARTEMENTS:', JSON.stringify(depts));

  console.log('--- 2. Testing Employes ---');
  const empRes = await fetch('http://localhost:3000/api/affectation-horaire/employes', { headers });
  const emp = await empRes.json();
  console.log('EMPLOYES count:', emp.employes?.length);
  console.log('EMPLOYES sample:', JSON.stringify(emp.employes?.[0]));

  console.log('--- 3. Testing CVAccess Horaires ---');
  const horRes = await fetch('http://localhost:3000/api/affectation-horaire/cvaccess-horaires', { headers });
  const hor = await horRes.json();
  console.log('CVACCESS HORAIRES:', JSON.stringify(hor.horaires?.map(h => ({ name: h.period_name, work: `${h.to_work_time_clean}-${h.off_work_time_clean}`, night: h.is_night }))));

  console.log('--- 4. Testing Regles Horaires (table horaires) ---');
  const regRes = await fetch('http://localhost:3000/api/affectation-horaire/regles', { headers });
  const reg = await regRes.json();
  console.log('REGLES HORAIRES count:', reg.regles?.length);

  console.log('--- 5. Testing Enregistrer Employes ---');
  const saveRes = await fetch('http://localhost:3000/api/affectation-horaire/enregistrer-employes', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ employesIds: ['8a818048a16e7e6101a178898d550024'] }),
  });
  const save = await saveRes.json();
  console.log('SAVE EMPLOYES RESPONSE:', JSON.stringify(save));
}

test();
