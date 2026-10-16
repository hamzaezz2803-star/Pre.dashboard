import { NextResponse } from 'next/server';
import { targetPool } from '@/lib/db';

/**
 * Route GET /api/departements
 * Retourne la liste ordonnée des départements réels présents dans la base de données.
 */
export async function GET() {
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
