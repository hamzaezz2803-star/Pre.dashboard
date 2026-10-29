import { NextResponse } from 'next/server';
import { targetPool } from '@/lib/db';
import { conditionPerimetrePersonnel, exigerRoleAvecPerimetre } from '@/lib/perimetre';

/**
 * Route GET /api/personnel?q=...
 * Recherche les employés réels de la base par nom, prénom ou identifiant.
 * Pour un admin : uniquement les employés de ses départements.
 */
export async function GET(request) {
  const auth = await exigerRoleAvecPerimetre('admin', 'super_admin');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q')?.trim() || '';

    const conditions = [];
    const params = [];

    if (q) {
      params.push(`%${q}%`);
      conditions.push(`(CAST(id AS TEXT) ILIKE $1 OR nom ILIKE $1 OR prenom ILIKE $1)`);
    }

    const condPerimetre = conditionPerimetrePersonnel(auth.perimetre, params, 'id');
    if (condPerimetre) conditions.push(condPerimetre);

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const query = `
      SELECT DISTINCT id, nom, prenom
      FROM pointage_journalier
      ${where}
      ORDER BY nom, prenom LIMIT 10;
    `;

    const { rows } = await targetPool.query(query, params);
    return NextResponse.json(rows);
  } catch (err) {
    console.error('[API Personnel] Erreur :', err?.message);
    return NextResponse.json([]);
  }
}
