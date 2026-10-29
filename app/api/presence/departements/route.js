import { NextResponse } from 'next/server';
import { getBiotimePool } from '@/lib/biotime-db';
import { estPerimetreRestreint, exigerRoleAvecPerimetre, listerDepartementsAutorises } from '@/lib/perimetre';

/**
 * Route GET /api/presence/departements : liste des départements proposés dans les filtres.
 * - super_admin : tous les dept_name de v_presence_jour.
 * - admin       : uniquement les départements de son périmètre (sous-départements inclus).
 */
export async function GET() {
  const auth = await exigerRoleAvecPerimetre('admin', 'super_admin');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  try {
    if (estPerimetreRestreint(auth.perimetre)) {
      const autorises = await listerDepartementsAutorises(auth.perimetre);
      const noms = [...new Set(autorises.map((d) => d.name).filter((n) => n && n !== ''))];
      return NextResponse.json(noms);
    }
    const { rows } = await getBiotimePool().query(
      "SELECT DISTINCT dept_name FROM v_presence_jour WHERE dept_name IS NOT NULL AND dept_name <> '' ORDER BY dept_name",
    );
    return NextResponse.json(rows.map((r) => r.dept_name));
  } catch (err) {
    console.error('[API Presence] Erreur lecture départements :', err?.message);
    return NextResponse.json([]);
  }
}
