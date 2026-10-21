import { NextResponse } from 'next/server';
import { getBiotimePool } from '@/lib/biotime-db';
import { exigerRole } from '@/lib/auth';

/** Route GET /api/presence/departements : liste des dept_name de v_presence_jour. */
export async function GET() {
  const auth = await exigerRole('admin', 'super_admin');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  try {
    const { rows } = await getBiotimePool().query(
      "SELECT DISTINCT dept_name FROM v_presence_jour WHERE dept_name IS NOT NULL AND dept_name <> '' ORDER BY dept_name",
    );
    return NextResponse.json(rows.map((r) => r.dept_name));
  } catch (err) {
    console.error('[API Presence] Erreur lecture départements :', err?.message);
    return NextResponse.json([]);
  }
}
