import { NextResponse } from 'next/server';
import { getBiotimePool } from '@/lib/biotime-db';
import { exigerRole } from '@/lib/auth';

/** Route GET /api/presence/personnel?q= : suggestions (emp_code, nom, prénom). */
export async function GET(request) {
  const auth = await exigerRole('admin', 'super_admin');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  try {
    const q = new URL(request.url).searchParams.get('q')?.trim() || '';
    if (!q) return NextResponse.json([]);

    const { rows } = await getBiotimePool().query(
      `
      SELECT DISTINCT emp_code AS id, last_name AS nom, first_name AS prenom
      FROM v_presence_jour
      WHERE last_name IS NOT NULL AND (
            CAST(emp_code AS TEXT) ILIKE $1
         OR last_name ILIKE $1
         OR first_name ILIKE $1
         OR (first_name || ' ' || last_name) ILIKE $1
         OR (last_name || ' ' || first_name) ILIKE $1)
      ORDER BY last_name, first_name
      LIMIT 10
      `,
      [`%${q}%`],
    );
    return NextResponse.json(rows);
  } catch (err) {
    console.error('[API Presence] Erreur recherche personnel :', err?.message);
    return NextResponse.json([]);
  }
}
