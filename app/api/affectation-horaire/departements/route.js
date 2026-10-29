import { NextResponse } from 'next/server';
import { exigerRoleAvecPerimetre, listerDepartementsAutorises } from '@/lib/perimetre';

/**
 * GET /api/affectation-horaire/departements
 * Retourne la liste des départements depuis la table auth_department.
 * Pour un admin : uniquement les départements de son périmètre (sous-départements inclus).
 */
export async function GET() {
  const auth = await exigerRoleAvecPerimetre('admin', 'super_admin');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const departements = await listerDepartementsAutorises(auth.perimetre);
    return NextResponse.json({ departements });
  } catch (err) {
    console.error('[API Affectation Départements] Erreur :', err?.message);
    return NextResponse.json(
      { error: 'Erreur lors du chargement des départements.', departements: [] },
      { status: 500 }
    );
  }
}
