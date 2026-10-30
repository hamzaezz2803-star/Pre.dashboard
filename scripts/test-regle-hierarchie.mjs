import { targetPool } from '../lib/db.js';

async function testRegle() {
  console.log('--- TEST RÈGLE HIÉRARCHIQUE SUR LOCAL ---');
  
  // 1. Tous les départements existants
  const { rows: all } = await targetPool.query(`
    SELECT id, code, name, parent_id
    FROM auth_department
  `);

  const idsExistants = new Set(all.map(d => String(d.id)));

  // 1 & 2. Départements de niveau supérieur (excluant 'Department Name' et sans nom)
  const niveauSuperieur = all.filter(d => {
    const name = (d.name || '').trim();
    if (!name || name.toLowerCase() === 'department name') return false;

    const pid = d.parent_id ? String(d.parent_id).trim() : null;
    const isTopLevel = !pid || pid === '0' || pid === String(d.id) || !idsExistants.has(pid);
    return isTopLevel;
  });

  console.log('Niveau supérieur count:', niveauSuperieur.length);
  console.log('Niveau supérieur names:', niveauSuperieur.map(d => d.name));

  let parentsFinaux = [];

  // 3. Cas d'une racine unique ayant des enfants
  if (niveauSuperieur.length === 1) {
    const uniqueRacine = niveauSuperieur[0];
    const enfantsDirects = all.filter(d => {
      const pid = d.parent_id ? String(d.parent_id).trim() : null;
      return pid === String(uniqueRacine.id);
    });

    if (enfantsDirects.length > 0) {
      console.log('Racine unique détectée:', uniqueRacine.name, 'avec', enfantsDirects.length, 'enfants directs');
      parentsFinaux = enfantsDirects;
    } else {
      parentsFinaux = [uniqueRacine];
    }
  } else {
    // Plusieurs départements de niveau supérieur : ce sont eux les parents
    parentsFinaux = niveauSuperieur;
  }

  // 4. Aucun département ayant un parent dans la liste ne peut être un parent
  const parentIdSet = new Set(parentsFinaux.map(p => String(p.id)));
  parentsFinaux = parentsFinaux.filter(p => {
    const pid = p.parent_id ? String(p.parent_id).trim() : null;
    return !pid || !parentIdSet.has(pid);
  });

  // Tri par nom
  parentsFinaux.sort((a, b) => a.name.localeCompare(b.name, 'fr'));

  console.log('\n--- RÉSULTAT OBTENU POUR LES PARENTS ---');
  console.table(parentsFinaux.map(p => ({ id: p.id, code: p.code, name: p.name })));

  // Test des enfants de chaque parent
  console.log('\n--- ENFANTS DE CHAQUE PARENT ---');
  for (const p of parentsFinaux) {
    const enfants = all.filter(d => String(d.parent_id) === String(p.id));
    console.log(`Parent: ${p.name} (${p.code}) -> ${enfants.length} enfant(s) :`, enfants.map(e => `${e.name} (${e.code})`));
  }

  process.exit(0);
}

testRegle();
