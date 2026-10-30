import { targetPool } from '../lib/db.js';

export async function resoudreParentsEtArbre() {
  const { rows: all } = await targetPool.query(`
    SELECT id, code, name, parent_id
    FROM auth_department
  `);

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

  // Tri par nom
  parents.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'fr'));

  // Pour chaque parent, calcul récursif de ses descendants
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
    // Trier les enfants par code/nom
    enfants.sort((a, b) => (a.code || a.name || '').localeCompare(b.code || b.name || '', 'fr'));

    for (const enfant of enfants) {
      if (String(enfant.id) === String(parentId)) continue; // cycle guard
      const chemin = cheminParent ? `${cheminParent} > ${enfant.name}` : enfant.name;
      result.push({
        id: String(enfant.id),
        code: enfant.code || '',
        name: enfant.name,
        parent_id: String(parentId),
        niveau,
        chemin,
      });
      // Récursion
      const sousDescendants = recupererDescendants(enfant.id, niveau + 1, chemin);
      result = result.concat(sousDescendants);
    }
    return result;
  }

  const arbre = parents.map(p => {
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

  return arbre;
}

async function run() {
  const arbre = await resoudreParentsEtArbre();
  console.log('Nombre de parents :', arbre.length);
  for (const p of arbre) {
    console.log(`- ${p.name} (${p.code}) : ${p.nb_sous_departements} sous-dép.`);
    for (const sd of p.sous_departements) {
      console.log(`    ↳ [niv ${sd.niveau}] ${sd.name} (${sd.code})`);
    }
  }
  process.exit(0);
}

run();
