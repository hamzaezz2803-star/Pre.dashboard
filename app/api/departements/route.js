import { NextResponse } from 'next/server';
import { targetPool } from '@/lib/db';
import { exigerRole } from '@/lib/auth';

/**
 * Route GET /api/departements
 * Retourne la liste ordonnée des départements réels présents dans la base de données.
 */
export async function GET() {
  const auth = await exigerRole('admin', 'super_admin');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  try {
    const { rows } = await targetPool.query(
      "SELECT DISTINCT departement FROM pointage_journalier WHERE departement IS NOT NULL AND departement != '' ORDER BY departement;"
    );
    return NextResponse.json(rows.map((r) => r.departement));
  } catch (err) {
    console.error('[API Departements] Erreur lecture départements :', err?.message);
    return NextResponse.json([]);
  }
}
