import { NextResponse } from 'next/server';
import { targetPool } from '@/lib/db';
import {
  conditionPerimetreDepartementId,
  departementIdAutorise,
  estPerimetreRestreint,
  exigerRoleAvecPerimetre,
} from '@/lib/perimetre';
import { resoudreIdsDescendants } from '@/lib/departements';

/**
 * GET /api/affectation-horaire/employes?deptId=...&q=...
 * Recherche et liste les employés de pers_person avec leur département (auth_department)
 * et leur statut d'affectation dynamique réel depuis employes_affectation_dynamique.
 *
 * Cloisonnement : un admin ne reçoit que les employés de son périmètre de départements ;
 * un deptId hors périmètre est refusé (403).
 */
export async function GET(request) {
  const auth = await exigerRoleAvecPerimetre('admin', 'super_admin');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { perimetre } = auth;

  try {
    const { searchParams } = new URL(request.url);
    const deptId = searchParams.get('deptId')?.trim() || '';
    const q = searchParams.get('q')?.trim() || '';

    const conditions = [];
    const params = [];

    if (deptId && deptId !== 'all') {
      if (!departementIdAutorise(perimetre, deptId)) {
        return NextResponse.json(
          { error: 'Accès refusé à ce département.', employes: [], activeIds: [] },
          { status: 403 }
        );
      }
      const idsInclus = await resoudreIdsDescendants(deptId);
      const liste = idsInclus.length > 0 ? idsInclus : [deptId];
      params.push(liste);
      conditions.push(`p.auth_dept_id = ANY($${params.length}::text[])`);
    }

    // Cloisonnement obligatoire côté serveur
    const condPerimetre = conditionPerimetreDepartementId(perimetre, params, 'p.auth_dept_id');
    if (condPerimetre) conditions.push(condPerimetre);

    if (q) {
      params.push(`%${q}%`);
      const pIdx = `$${params.length}`;
      conditions.push(`(
        p.id ILIKE ${pIdx} OR 
        p.pin ILIKE ${pIdx} OR 
        p.last_name ILIKE ${pIdx} OR 
        p.name ILIKE ${pIdx} OR
        (p.name || ' ' || p.last_name) ILIKE ${pIdx} OR
        (p.last_name || ' ' || p.name) ILIKE ${pIdx}
      )`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const query = `
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
      ${whereClause}
      ORDER BY p.last_name ASC, p.name ASC
      LIMIT 200;
    `;

    const { rows } = await targetPool.query(query, params);

    // Identifiants actifs (sélection globale) : restreints au périmètre pour un admin
    const activeParams = [];
    let activeQuery = `
      SELECT e.cvaccess_person_id
      FROM employes_affectation_dynamique e
      WHERE e.actif = true
    `;
    if (estPerimetreRestreint(perimetre)) {
      activeParams.push(perimetre);
      activeQuery += `
        AND e.cvaccess_person_id IN (
          SELECT pp.id FROM pers_person pp WHERE pp.auth_dept_id = ANY($1::text[])
        )
      `;
    }
    const { rows: allActive } = await targetPool.query(activeQuery, activeParams);

    return NextResponse.json({
      employes: rows,
      activeIds: allActive.map((r) => r.cvaccess_person_id),
    });
  } catch (err) {
    console.error('[API Affectation Employes] Erreur :', err?.message);
    return NextResponse.json(
      { error: 'Erreur lors du chargement des employés.', employes: [], activeIds: [] },
      { status: 500 }
    );
  }
}
