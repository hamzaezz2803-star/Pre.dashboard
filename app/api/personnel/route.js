import { NextResponse } from 'next/server';
import { targetPool } from '@/lib/db';
import { exigerRole } from '@/lib/auth';

/**
 * Route GET /api/personnel?q=...
 * Recherche les employés réels de la base par nom, prénom ou identifiant.
 */
export async function GET(request) {
  const auth = await exigerRole('admin', 'super_admin');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q')?.trim() || '';

    let query = `
      SELECT DISTINCT id, nom, prenom
      FROM pointage_journalier
    `;
    const params = [];

    if (q) {
      params.push(`%${q}%`);
      query += ` WHERE (CAST(id AS TEXT) ILIKE $1 OR nom ILIKE $1 OR prenom ILIKE $1)`;
    }

    query += ` ORDER BY nom, prenom LIMIT 10;`;

    const { rows } = await targetPool.query(query, params);
    return NextResponse.json(rows);
  } catch (err) {
    console.error('[API Personnel] Erreur :', err?.message);
    return NextResponse.json([]);
  }
}
