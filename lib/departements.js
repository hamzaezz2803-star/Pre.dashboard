import { targetPool } from './db.js';

/**
 * Module de gestion hiérarchique des départements ZKBio (arbre).
 *
 * Structure de la table auth_department :
 * - id        : VARCHAR(50) (clé primaire logique ZKBio)
 * - code      : VARCHAR(50) (ex: '1', 'WHARF', '51', '511')
 * - name      : VARCHAR(100) (ex: 'OCP PLAGE', 'WHARF', 'Prestations de support')
 * - parent_id : VARCHAR(50) NULL (pointe vers l'id du département parent)
 *
 * Définition des niveaux :
 * - Niveau 0 (Racine) : le nœud entreprise / racine (ex: 'OCP PLAGE' ou 'Department Name').
 *   Détecté dynamiquement : sans parent (NULL, vide ou auto-référent) ET ancêtre des autres départements.
 * - Niveau 1 (Départements Parents) : enfants directs de la racine, ou départements de premier niveau.
 *   Ce sont EUX seuls qui sont attribués aux administrateurs.
 * - Niveaux 2+ (Sous-départements) : enfants et descendants récursifs des départements parents.
 */

/**
 * Règle universelle de résolution de la hiérarchie ZKBio (valable en test et en prod OCP) :
 * 1. Départements de niveau supérieur = parent_id IS NULL, 0, vide, égal à id, ou pointant vers un id inexistant.
 * 2. Exclure toujours 'Department Name' et lignes sans nom.
 * 3. Cas racine unique : s'il ne reste qu'UN seul département de niveau supérieur et qu'il a des enfants
 *    (cas prod OCP : OCP PLAGE -> DIGITAL, BENEFICIATION, SURETE, WHARF, MANUTENTION, MG),
 *    alors les parents sont ses enfants directs.
 * 4. Tout département qui a un parent dans la liste n'est jamais affiché comme parent.
 *
 * @param {import('pg').ClientBase|null} client - Client PostgreSQL optionnel
 * @returns {Promise<Array<{id: string, code: string, name: string, parent_id: string|null, nb_sous_departements: number, sous_departements: Array}>>}
 */
export async function getArbreDepartements(client = null) {
  const db = client || targetPool;
  const { rows: all } = await db.query(`
    SELECT id, code, name, parent_id
    FROM auth_department
  `);

  const idsExistants = new Set(all.map((d) => String(d.id)));

  // 1 & 2. Niveau supérieur (hors 'Department Name' et sans nom)
  const niveauSuperieur = all.filter((d) => {
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
    const enfantsDirects = all.filter((d) => {
      const pid = d.parent_id ? String(d.parent_id).trim() : null;
      return pid === String(uniqueRacine.id);
    });

    if (enfantsDirects.length > 0) {
      parents = enfantsDirects;
    } else {
      parents = [uniqueRacine];
    }
  } else {
    // Plusieurs départements de niveau supérieur
    parents = niveauSuperieur;
  }

  // 4. Aucun département ayant un parent dans la liste ne peut être un parent
  const parentIdSet = new Set(parents.map((p) => String(p.id)));
  parents = parents.filter((p) => {
    const pid = p.parent_id ? String(p.parent_id).trim() : null;
    return !pid || !parentIdSet.has(pid);
  });

  // Tri alphabétique par nom
  parents.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'fr'));

  // Indexation des enfants par parent_id
  const mapParParentId = new Map();
  for (const d of all) {
    const pid = d.parent_id ? String(d.parent_id).trim() : null;
    if (pid) {
      const list = mapParParentId.get(pid) || [];
      list.push(d);
      mapParParentId.set(pid, list);
    }
  }

  // Récupération récursive de tous les descendants
  function recupererDescendants(parentId, niveau = 1, cheminParent = '') {
    const enfants = mapParParentId.get(String(parentId)) || [];
    let result = [];
    enfants.sort((a, b) => (a.code || a.name || '').localeCompare(b.code || b.name || '', 'fr'));

    for (const enfant of enfants) {
      if (String(enfant.id) === String(parentId)) continue; // protection cycle
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

  return parents.map((p) => {
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

/**
 * Retourne la liste des départements PARENTS (Niveau 1) uniquement.
 *
 * @param {import('pg').ClientBase|null} client
 * @returns {Promise<Array<{id: string, code: string, name: string, parent_id: string|null, nb_sous_departements: number}>>}
 */
export async function getDepartementsParents(client = null) {
  const arbre = await getArbreDepartements(client);
  return arbre.map((p) => ({
    id: p.id,
    code: p.code,
    name: p.name,
    parent_id: p.parent_id,
    nb_sous_departements: p.nb_sous_departements,
  }));
}

/**
 * Retourne tous les sous-départements récursifs d'un département donné.
 *
 * @param {string} parentId
 * @returns {Promise<Array>}
 */
export async function getSousDepartements(parentId) {
  if (!parentId) return [];
  const arbre = await getArbreDepartements();
  const found = arbre.find((p) => String(p.id) === String(parentId));
  if (found) return found.sous_departements || [];

  for (const p of arbre) {
    const sub = (p.sous_departements || []).find((sd) => String(sd.id) === String(parentId));
    if (sub) {
      const idx = p.sous_departements.indexOf(sub);
      const descendants = [];
      for (let i = idx + 1; i < p.sous_departements.length; i++) {
        const item = p.sous_departements[i];
        if (item.niveau <= sub.niveau) break;
        descendants.push(item);
      }
      return descendants;
    }
  }
  return [];
}

/**
 * Calcule l'ensemble complet des identifiants de départements autorisés pour un utilisateur :
 * ses départements parents attribués + l'intégralité de leurs descendants récursifs.
 *
 * @param {number|{id: number, role: string}} userOrSession - ID utilisateur ou objet session
 * @returns {Promise<string[]|null>} null si super_admin (accès total), sinon string[] d'IDs
 */
export async function getPerimetreIds(userOrSession) {
  if (!userOrSession) return [];

  const role = typeof userOrSession === 'object' ? userOrSession.role : null;
  const userId = typeof userOrSession === 'object' ? Number(userOrSession.id) : Number(userOrSession);

  if (role === 'super_admin') return null;
  if (!Number.isInteger(userId)) return [];

  // UNION récursif pour résoudre les parents attribués et tous leurs descendants
  const { rows } = await targetPool.query(
    `
    WITH RECURSIVE perimetre AS (
      -- 1. Départements parents directement attribués
      SELECT d.id
      FROM auth_department d
      WHERE d.id IN (
        SELECT ud.departement_id
        FROM utilisateur_departements ud
        WHERE ud.utilisateur_id = $1
      )

      UNION

      -- 2. Tous leurs sous-départements récursifs
      SELECT enfant.id
      FROM auth_department enfant
      JOIN perimetre p ON enfant.parent_id = p.id
      WHERE enfant.id <> p.id
    )
    SELECT DISTINCT id FROM perimetre;
    `,
    [userId]
  );

  return rows.map((r) => String(r.id));
}

/**
 * Donné un nom ou identifiant de département sélectionné dans un filtre,
 * résout ce département ainsi que TOUS ses sous-départements descendants.
 * Permet qu'en sélectionnant "WHARF", toutes les données de 51, 52, 511... soient incluses.
 *
 * @param {string} departementNom - Nom du département sélectionné dans le filtre
 * @returns {Promise<string[]>} Liste des noms de départements inclus (le parent + tous ses enfants)
 */
export async function resoudreNomsDescendants(departementNom) {
  if (!departementNom || departementNom === 'all') return [];

  const { rows } = await targetPool.query(
    `
    WITH RECURSIVE cible AS (
      -- Trouver l'ID ou les IDs correspondant au nom ou code sélectionné
      SELECT id, name
      FROM auth_department
      WHERE name = $1 OR code = $1

      UNION

      -- Trouver tous les descendants
      SELECT enfant.id, enfant.name
      FROM auth_department enfant
      JOIN cible c ON enfant.parent_id = c.id
      WHERE enfant.id <> c.id
    )
    SELECT DISTINCT name FROM cible;
    `,
    [departementNom]
  );

  return rows.map((r) => r.name);
}

/**
 * Donné un identifiant de département (parent ou intermédiaire),
 * retourne son identifiant ainsi que TOUS les identifiants de ses sous-départements descendants.
 * Permet qu'en filtrant par ID de parent, tous les employés des sous-départements soient inclus.
 *
 * @param {string} deptId - Identifiant du département
 * @returns {Promise<string[]>} Liste des identifiants (le parent + tous ses descendants)
 */
export async function resoudreIdsDescendants(deptId) {
  if (!deptId || deptId === 'all') return [];

  const { rows } = await targetPool.query(
    `
    WITH RECURSIVE cible AS (
      SELECT id
      FROM auth_department
      WHERE id = $1::text

      UNION

      SELECT enfant.id
      FROM auth_department enfant
      JOIN cible c ON enfant.parent_id = c.id
      WHERE enfant.id <> c.id
    )
    SELECT DISTINCT id FROM cible;
    `,
    [String(deptId)]
  );

  return rows.map((r) => String(r.id));
}

/**
 * Migration / normalisation des affectations existantes :
 * Si un administrateur a actuellement des sous-départements (niveau 2+) affectés dans `utilisateur_departements`,
 * cette fonction remonte la hiérarchie pour trouver leur département parent de niveau 1 et réassigne ce parent,
 * garantissant que `utilisateur_departements` ne stocke QUE des départements parents de niveau 1.
 *
 * @param {import('pg').ClientBase|null} client - Client optionnel (dans transaction)
 * @returns {Promise<{modifications: number, details: Array}>}
 */
export async function normaliserAffectationsVersParents(client = null) {
  const db = client || targetPool;

  const parents = await getDepartementsParents();
  const parentIds = new Set(parents.map((p) => String(p.id)));

  // Récupérer toutes les affectations actuelles
  const { rows: affectations } = await db.query(
    `SELECT utilisateur_id, departement_id FROM utilisateur_departements;`
  );

  const aRemplacer = [];
  const details = [];

  for (const aff of affectations) {
    const deptId = String(aff.departement_id);
    if (!parentIds.has(deptId)) {
      // C'est un sous-département ou un ID inconnu : on remonte vers son parent de niveau 1
      const { rows: remontee } = await db.query(
        `
        WITH RECURSIVE ascendance AS (
          SELECT id, parent_id, 1 AS depth
          FROM auth_department
          WHERE id = $1

          UNION ALL

          SELECT parent.id, parent.parent_id, a.depth + 1
          FROM auth_department parent
          JOIN ascendance a ON parent.id = a.parent_id
          WHERE parent.id <> a.id AND a.depth < 10
        )
        SELECT id FROM ascendance WHERE id = ANY($2::text[]) LIMIT 1;
        `,
        [deptId, Array.from(parentIds)]
      );

      if (remontee.length > 0) {
        const parentIdNiveau1 = remontee[0].id;
        aRemplacer.push({
          utilisateur_id: aff.utilisateur_id,
          ancien_dept: deptId,
          nouveau_parent: parentIdNiveau1,
        });
        details.push({
          utilisateur_id: aff.utilisateur_id,
          ancien: deptId,
          nouveau: parentIdNiveau1,
        });
      }
    }
  }

  // Appliquer les remplacements
  let modifications = 0;
  for (const r of aRemplacer) {
    await db.query(
      `DELETE FROM utilisateur_departements 
       WHERE utilisateur_id = $1 AND departement_id = $2;`,
      [r.utilisateur_id, r.ancien_dept]
    );

    await db.query(
      `INSERT INTO utilisateur_departements (utilisateur_id, departement_id)
       VALUES ($1, $2)
       ON CONFLICT (utilisateur_id, departement_id) DO NOTHING;`,
      [r.utilisateur_id, r.nouveau_parent]
    );
    modifications++;
  }

  return { modifications, details };
}

/**
 * Retourne la liste des départements autorisés ordonnés en arbre hiérarchique pour les menus déroulants.
 * - Pour un super_admin (perimetre == null) : tous les départements (hors racine).
 * - Pour un admin (perimetre != null) : uniquement les départements de son périmètre.
 *
 * Chaque entrée inclut :
 * - id, code, name
 * - niveau (1 = parent, 2 = sous-département...)
 * - label : libellé indenté pour <select> (ex: "WHARF", "   ↳ 51 Support", "      ↳ 511 Conduite")
 *
 * @param {string[]|null} perimetre - Périmètre d'identifiants ou null si super_admin
 * @returns {Promise<{id: string, code: string, name: string, niveau: number, label: string}[]>}
 */
export async function listerDepartementsFiltreArbre(perimetre = null) {
  const racine = await detecterRacine();
  const racineId = racine ? racine.id : null;
  const isRestreint = Array.isArray(perimetre);

  if (isRestreint && perimetre.length === 0) return [];

  const { rows } = await targetPool.query(
    `
    WITH RECURSIVE arbre AS (
      -- Nœuds parents de premier niveau
      SELECT 
        d.id,
        COALESCE(d.code, '') AS code,
        d.name,
        d.parent_id,
        1 AS niveau,
        ARRAY[COALESCE(d.code, d.name)]::text[] AS path_tri
      FROM auth_department d
      WHERE (
        ($1::text IS NOT NULL AND d.parent_id = $1::text)
        OR (($1::text IS NULL OR d.id <> $1::text) AND (d.parent_id IS NULL OR d.parent_id = '' OR d.parent_id = d.id))
      )
      AND ($1::text IS NULL OR d.id <> $1::text)
      AND d.name NOT ILIKE 'Department Name'

      UNION ALL

      -- Descendants récursifs
      SELECT 
        enfant.id,
        COALESCE(enfant.code, '') AS code,
        enfant.name,
        enfant.parent_id,
        a.niveau + 1 AS niveau,
        a.path_tri || ARRAY[COALESCE(enfant.code, enfant.name)]::text[]
      FROM auth_department enfant
      JOIN arbre a ON enfant.parent_id = a.id
      WHERE enfant.id <> a.id
    )
    SELECT id, code, name, parent_id, niveau
    FROM arbre
    WHERE ($2::text[] IS NULL OR id = ANY($2::text[]))
    ORDER BY path_tri ASC;
    `,
    [racineId, isRestreint ? perimetre : null]
  );

  return rows.map((r) => {
    const niv = Number(r.niveau);
    let prefixe = '';
    if (niv === 2) prefixe = '\u00A0\u00A0↳ ';
    else if (niv >= 3) prefixe = '\u00A0\u00A0\u00A0\u00A0↳ ';

    return {
      id: String(r.id),
      code: r.code,
      name: r.name,
      niveau: niv,
      label: `${prefixe}${r.name}${r.code ? ` (${r.code})` : ''}`,
    };
  });
}

