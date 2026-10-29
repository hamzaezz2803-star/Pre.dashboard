import { NextResponse } from 'next/server';
import { targetPool } from '@/lib/db';
import { exigerRole } from '@/lib/auth';

/**
 * Route GET /api/admin/departements
 * Liste de tous les départements (auth_department) avec leur parent, pour le sélecteur
 * d'affectation de périmètre d'un admin. Réservée strictement au super_admin.
 */
export async function GET() {
  const auth = await exigerRole('super_admin');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { rows } = await targetPool.query(
      `SELECT id, code, name, parent_id
       FROM auth_department
       ORDER BY name ASC;`
    );
    return NextResponse.json({ departements: rows });
  } catch (error) {
    console.error('[API Admin Départements] Erreur :', error?.message);
    return NextResponse.json(
      { error: 'Erreur lors du chargement des départements.', departements: [] },
      { status: 500 }
    );
  }
}
