import { NextResponse } from 'next/server';
import { targetPool } from '@/lib/db';
import { conditionPerimetreDepartementId, exigerRoleAvecPerimetre } from '@/lib/perimetre';

/**
 * Route GET /api/employes?q=
 * Recherche d'employés dans pers_person (y compris ceux sans pointage) par
 * matricule, nom ou prénom. 15 résultats au maximum.
 * admin : limité aux départements de son périmètre.
 */
export async function GET(request) {
  const auth = await exigerRoleAvecPerimetre('admin', 'super_admin');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const q = (new URL(request.url).searchParams.get('q') || '').trim().slice(0, 100);
    if (!q) return NextResponse.json({ employes: [] });

    // Recherche littérale : caractères spéciaux de LIKE échappés
    const params = [`%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`];
    const conditions = [
      `(p.pin::text ILIKE $1 OR p.name ILIKE $1 OR p.last_name ILIKE $1
        OR (p.name || ' ' || p.last_name) ILIKE $1 OR (p.last_name || ' ' || p.name) ILIKE $1)`,
    ];
    const cond = conditionPerimetreDepartementId(auth.perimetre, params, 'p.auth_dept_id');
    if (cond) conditions.push(cond);

    const { rows } = await targetPool.query(
      `SELECT DISTINCT p.pin::text AS pin, p.name AS prenom, p.last_name AS nom
       FROM pers_person p
       WHERE p.pin IS NOT NULL AND ${conditions.join(' AND ')}
       ORDER BY p.last_name, p.name, 1
       LIMIT 15`,
      params
    );
    return NextResponse.json({ employes: rows });
  } catch (err) {
    console.error('[API Employés] Erreur recherche :', err?.message);
    return NextResponse.json({ error: 'Recherche impossible.' }, { status: 500 });
  }
}
