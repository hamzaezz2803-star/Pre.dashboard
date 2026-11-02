import { NextResponse } from 'next/server';
import { targetPool } from '@/lib/db';
import {
  conditionPerimetreDepartementId,
  departementIdAutorise,
  exigerRoleAvecPerimetre,
} from '@/lib/perimetre';
import { resoudreIdsDescendants } from '@/lib/departements';

/**
 * Route GET /api/employes?q=&deptId=
 * Recherche d'employés dans pers_person (y compris ceux sans pointage) par
 * matricule, nom ou prénom, éventuellement filtrée par département (sous-départements inclus).
 * Sans texte, un deptId permet de lister les employés du département. 50 résultats au maximum.
 * admin : limité aux départements de son périmètre (deptId hors périmètre : 403).
 */
export async function GET(request) {
  const auth = await exigerRoleAvecPerimetre('admin', 'super_admin');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { searchParams } = new URL(request.url);
    const q = (searchParams.get('q') || '').trim().slice(0, 100);
    const deptId = (searchParams.get('deptId') || '').trim().slice(0, 50);
    const avecDept = Boolean(deptId) && deptId !== 'all';
    if (!q && !avecDept) return NextResponse.json({ employes: [] });

    const params = [];
    const conditions = [];

    if (q) {
      // Recherche littérale : caractères spéciaux de LIKE échappés
      params.push(`%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
      conditions.push(
        `(p.pin::text ILIKE $1 OR p.name ILIKE $1 OR p.last_name ILIKE $1
          OR (p.name || ' ' || p.last_name) ILIKE $1 OR (p.last_name || ' ' || p.name) ILIKE $1)`
      );
    }

    if (avecDept) {
      if (!departementIdAutorise(auth.perimetre, deptId)) {
        return NextResponse.json({ error: 'Accès refusé à ce département.', employes: [] }, { status: 403 });
      }
      const ids = await resoudreIdsDescendants(deptId);
      params.push(ids.length > 0 ? ids : [deptId]);
      conditions.push(`p.auth_dept_id = ANY($${params.length}::text[])`);
    }

    const cond = conditionPerimetreDepartementId(auth.perimetre, params, 'p.auth_dept_id');
    if (cond) conditions.push(cond);

    const { rows } = await targetPool.query(
      `SELECT DISTINCT p.pin::text AS pin, p.name AS prenom, p.last_name AS nom
       FROM pers_person p
       WHERE p.pin IS NOT NULL AND ${conditions.join(' AND ')}
       ORDER BY p.last_name, p.name, 1
       LIMIT 50`,
      params
    );
    return NextResponse.json({ employes: rows });
  } catch (err) {
    console.error('[API Employés] Erreur recherche :', err?.message);
    return NextResponse.json({ error: 'Recherche impossible.' }, { status: 500 });
  }
}
