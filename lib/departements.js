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
 * Détecte dynamiquement le nœud racine de l'arborescence auth_department.
 * Ne met aucun code ou nom en dur : cherche le nœud sans parent qui est parent d'autres départements.
 *
 * @param {import('pg').ClientBase|null} client - Client optionnel (si dans transaction)
 * @returns {Promise<{id: string, code: string, name: string}|null>}
 */
export async function detecterRacine(client = null) {
  const db = client || targetPool;
  const { rows } = await db.query(`
    SELECT id, code, name, parent_id
    FROM auth_department
    WHERE (parent_id IS NULL OR parent_id = '' OR parent_id = id)
      AND (
        id IN (
          SELECT DISTINCT parent_id 
          FROM auth_department 
          WHERE parent_id IS NOT NULL AND parent_id <> '' AND parent_id <> id
        )
        OR code = '1'
        OR name ILIKE 'Department Name'
        OR name ILIKE 'OCP PLAGE%'
      )
    ORDER BY 
      -- Priorité aux départements ayant des enfants réels
      (id IN (SELECT DISTINCT parent_id FROM auth_department WHERE parent_id IS NOT NULL AND parent_id <> '' AND parent_id <> id)) DESC,
      (code = '1') DESC,
      (name ILIKE 'Department Name') DESC
    LIMIT 1;
  `);

  return rows[0] || null;
}

/**
 * Retourne la liste des départements PARENTS (Niveau 1).
 * Ce sont les enfants directs de la racine, ou les départements de premier niveau (en excluant la racine).
 *
 * @returns {Promise<{id: string, code: string, name: string, parent_id: string|null, nb_sous_departements: number}[]>}
 */
export async function getDepartementsParents() {
  const racine = await detecterRacine();
  const racineId = racine ? racine.id : null;

  // Requête :
  // Si une racine existe, les parents de niveau 1 sont :
  //   1) Les enfants directs de la racine (parent_id = racine.id)
  //   2) Les départements sans parent (parent_id IS NULL ou vide) différents de la racine elle-même
  // On exclut formellement la racine et la ligne d'exemple "Department Name"
  const { rows } = await targetPool.query(
    `
    WITH parents_candidats AS (
      SELECT d.id, d.code, d.name, d.parent_id
      FROM auth_department d
      WHERE (
        -- Enfant direct de la racine
        ($1::text IS NOT NULL AND d.parent_id = $1::text)
        -- Ou département sans parent qui n'est pas la racine
        OR (($1::text IS NULL OR d.id <> $1::text) AND (d.parent_id IS NULL OR d.parent_id = '' OR d.parent_id = d.id))
      )
      AND ($1::text IS NULL OR d.id <> $1::text)
      AND d.name NOT ILIKE 'Department Name'
    ),
    compte_enfants AS (
      SELECT parent_id, COUNT(*) AS nb
      FROM auth_department
      WHERE parent_id IS NOT NULL AND parent_id <> '' AND parent_id <> id
      GROUP BY parent_id
    )
    SELECT 
      pc.id,
      COALESCE(pc.code, '') AS code,
      pc.name,
      pc.parent_id,
      COALESCE(ce.nb, 0)::int AS nb_sous_departements
    FROM parents_candidats pc
    LEFT JOIN compte_enfants ce ON ce.parent_id = pc.id
    ORDER BY pc.name ASC;
    `,
    [racineId]
  );

  return rows;
}

/**
 * Retourne tous les sous-départements (descendants récursifs) d'un département parent donné,
 * avec leur niveau de profondeur (1 = enfant direct, 2 = petit-enfant...), leur chemin et leur parent direct.
 *
 * @param {string} parentId - Identifiant du département parent
 * @returns {Promise<{id: string, code: string, name: string, parent_id: string, niveau: number, chemin: string}[]>}
 */
export async function getSousDepartements(parentId) {
  if (!parentId) return [];

  const { rows } = await targetPool.query(
    `
    WITH RECURSIVE arbre AS (
      -- Niveau 1 par rapport au parent : ses enfants directs
      SELECT 
        d.id,
        COALESCE(d.code, '') AS code,
        d.name,
        d.parent_id,
        1 AS niveau,
        d.name::text AS chemin
      FROM auth_department d
      WHERE d.parent_id = $1::text AND d.id <> $1::text

      UNION ALL

      -- Niveaux suivants : descendants
      SELECT 
        enfant.id,
        COALESCE(enfant.code, '') AS code,
        enfant.name,
        enfant.parent_id,
        a.niveau + 1 AS niveau,
        (a.chemin || ' > ' || enfant.name)::text AS chemin
      FROM auth_department enfant
      JOIN arbre a ON enfant.parent_id = a.id
      WHERE enfant.id <> a.id
    )
    SELECT id, code, name, parent_id, niveau, chemin
    FROM arbre
    ORDER BY niveau ASC, code ASC, name ASC;
    `,
    [String(parentId)]
  );

  return rows;
}

/**
 * Retourne l'arbre complet des départements pour l'interface d'administration :
 * Chaque département parent de niveau 1 contient la liste plate hiérarchisée de tous ses sous-départements.
 *
 * @returns {Promise<{id: string, code: string, name: string, sous_departements: Array}[]>}
 */
export async function getArbreDepartements() {
  const parents = await getDepartementsParents();
  if (parents.length === 0) return [];

  const parentIds = parents.map((p) => String(p.id));

  // Requête récursive globale pour tous les parents en une seule exécution
  const { rows: sousDepts } = await targetPool.query(
    `
    WITH RECURSIVE arbre AS (
      -- Enfants directs des parents de niveau 1
      SELECT 
        d.id,
        COALESCE(d.code, '') AS code,
        d.name,
        d.parent_id,
        d.parent_id AS racine_parent_id,
        1 AS niveau,
        d.name::text AS chemin
      FROM auth_department d
      WHERE d.parent_id = ANY($1::text[]) AND d.id <> d.parent_id

      UNION ALL

      -- Descendants
      SELECT 
        enfant.id,
        COALESCE(enfant.code, '') AS code,
        enfant.name,
        enfant.parent_id,
        a.racine_parent_id,
        a.niveau + 1 AS niveau,
        (a.chemin || ' > ' || enfant.name)::text AS chemin
      FROM auth_department enfant
      JOIN arbre a ON enfant.parent_id = a.id
      WHERE enfant.id <> a.id
    )
    SELECT id, code, name, parent_id, racine_parent_id, niveau, chemin
    FROM arbre
    ORDER BY racine_parent_id, niveau ASC, code ASC, name ASC;
    `,
    [parentIds]
  );

  // Regroupement par parent de niveau 1
  const mapSousDepts = new Map();
  for (const sd of sousDepts) {
    const list = mapSousDepts.get(sd.racine_parent_id) || [];
    list.push({
      id: String(sd.id),
      code: sd.code,
      name: sd.name,
      parent_id: String(sd.parent_id),
      niveau: Number(sd.niveau),
      chemin: sd.chemin,
    });
    mapSousDepts.set(sd.racine_parent_id, list);
  }

  return parents.map((p) => {
    const enfants = mapSousDepts.get(String(p.id)) || [];
    return {
      id: String(p.id),
      code: p.code,
      name: p.name,
      nb_sous_departements: enfants.length,
      sous_departements: enfants,
    };
  });
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
      -- Trouver l'ID ou les IDs correspondant au nom sélectionné
      SELECT id, name
      FROM auth_department
      WHERE name = $1

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

