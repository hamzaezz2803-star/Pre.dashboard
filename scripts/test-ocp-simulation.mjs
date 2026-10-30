function resoudreArbreDepuisListe(all) {
  const idsExistants = new Set(all.map(d => String(d.id)));

  // 1 & 2. Niveau supérieur (hors 'Department Name' et sans nom)
  const niveauSuperieur = all.filter(d => {
    const name = (d.name || '').trim();
    if (!name || name.toLowerCase() === 'department name') return false;

    const pid = d.parent_id ? String(d.parent_id).trim() : null;
    const isTopLevel = !pid || pid === '0' || pid === String(d.id) || !idsExistants.has(pid);
    return isTopLevel;
  });

  let parents = [];

  // 3. Cas d'une racine unique ayant des enfants
  if (niveauSuperieur.length === 1) {
    const uniqueRacine = niveauSuperieur[0];
    const enfantsDirects = all.filter(d => {
      const pid = d.parent_id ? String(d.parent_id).trim() : null;
      return pid === String(uniqueRacine.id);
    });

    if (enfantsDirects.length > 0) {
      parents = enfantsDirects;
    } else {
      parents = [uniqueRacine];
    }
  } else {
    parents = niveauSuperieur;
  }

  // 4. Aucun département ayant un parent dans la liste ne peut être un parent
  const parentIdSet = new Set(parents.map(p => String(p.id)));
  parents = parents.filter(p => {
    const pid = p.parent_id ? String(p.parent_id).trim() : null;
    return !pid || !parentIdSet.has(pid);
  });

  parents.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'fr'));

  const mapParParentId = new Map();
  for (const d of all) {
    const pid = d.parent_id ? String(d.parent_id).trim() : null;
    if (pid) {
      const list = mapParParentId.get(pid) || [];
      list.push(d);
      mapParParentId.set(pid, list);
    }
  }

  function recupererDescendants(parentId, niveau = 1, cheminParent = '') {
    const enfants = mapParParentId.get(String(parentId)) || [];
    let result = [];
    enfants.sort((a, b) => (a.code || a.name || '').localeCompare(b.code || b.name || '', 'fr'));

    for (const enfant of enfants) {
      if (String(enfant.id) === String(parentId)) continue;
      const chemin = cheminParent ? `${cheminParent} > ${enfant.name}` : enfant.name;
      result.push({
        id: String(enfant.id),
        code: enfant.code || '',
        name: enfant.name,
        parent_id: String(parentId),
        niveau,
        chemin,
      });
      const sousDescendants = recupererDescendants(enfant.id, niveau + 1, chemin);
      result = result.concat(sousDescendants);
    }
    return result;
  }

  return parents.map(p => {
    const sousDepts = recupererDescendants(p.id, 1, p.name);
    return {
      id: String(p.id),
      code: p.code || '',
      name: p.name,
      parent_id: p.parent_id ? String(p.parent_id) : null,
      nb_sous_departements: sousDepts.length,
      sous_departements: sousDepts,
    };
  });
}

// Test avec le jeu de données OCP réel :
const testOCP = [
  { id: '1', code: '1', name: 'OCP PLAGE', parent_id: null },
  { id: '2', code: 'DIG', name: 'DIGITAL', parent_id: '1' },
  { id: '3', code: 'BEN', name: 'BENEFICIATION', parent_id: '1' },
  { id: '4', code: 'SUR', name: 'SURETE', parent_id: '1' },
  { id: '5', code: '5', name: 'WHARF', parent_id: '1' },
  { id: '6', code: 'MAN', name: 'MANUTENTION', parent_id: '1' },
  { id: '7', code: 'MG', name: 'MG', parent_id: '1' },
  // Sous-départements de WHARF :
  { id: '51', code: '51', name: 'PRESTATIONS DE SUPPORT', parent_id: '5' },
  { id: '511', code: '511', name: 'CONDUITE DES CHAF...', parent_id: '51' },
  { id: '52', code: '52', name: 'PRESTATIONS DE MAINTENANCE', parent_id: '5' },
  { id: '521', code: '521', name: 'ELECTRIQUE', parent_id: '52' },
  { id: '522', code: '522', name: 'MÉCANICIENS', parent_id: '52' },
];

const arbreOCP = resoudreArbreDepuisListe(testOCP);
console.log('--- TEST SUR JEU OCP PROD ---');
console.log('Nombre de parents :', arbreOCP.length);
for (const p of arbreOCP) {
  console.log(`- ${p.name} (${p.code}) : ${p.nb_sous_departements} sous-dép.`);
  for (const sd of p.sous_departements) {
    console.log(`    ↳ [niv ${sd.niveau}] ${sd.name} (${sd.code})`);
  }
}
