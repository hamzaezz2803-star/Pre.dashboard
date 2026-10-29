import { NextResponse } from 'next/server';
import { targetPool } from '@/lib/db';
import { estPerimetreRestreint, exigerRoleAvecPerimetre, listerDepartementsAutorises } from '@/lib/perimetre';

/**
 * Route GET /api/departements
 * Retourne la liste ordonnée des départements réels présents dans la base de données.
 * Pour un admin : uniquement les départements de son périmètre.
 */
export async function GET() {
  const auth = await exigerRoleAvecPerimetre('admin', 'super_admin');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  try {
    if (estPerimetreRestreint(auth.perimetre)) {
      const autorises = await listerDepartementsAutorises(auth.perimetre);
      return NextResponse.json([...new Set(autorises.map((d) => d.name).filter(Boolean))]);
    }
    const { rows } = await targetPool.query(
      "SELECT DISTINCT departement FROM pointage_journalier WHERE departement IS NOT NULL AND departement != '' ORDER BY departement;"
    );
    return NextResponse.json(rows.map((r) => r.departement));
  } catch (err) {
    console.error('[API Departements] Erreur lecture départements :', err?.message);
    return NextResponse.json([]);
  }
}
