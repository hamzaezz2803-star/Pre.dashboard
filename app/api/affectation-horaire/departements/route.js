import { NextResponse } from 'next/server';
import { targetPool } from '@/lib/db';
import { exigerRole } from '@/lib/auth';

/**
 * GET /api/affectation-horaire/departements
 * Retourne la liste des départements depuis la table auth_department.
 */
export async function GET() {
  const auth = await exigerRole('admin', 'super_admin');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { rows } = await targetPool.query(`
      SELECT id, code, name
      FROM auth_department
      ORDER BY name ASC
    `);
    return NextResponse.json({ departements: rows });
  } catch (err) {
    console.error('[API Affectation Départements] Erreur :', err?.message);
    return NextResponse.json(
      { error: 'Erreur lors du chargement des départements.', departements: [] },
      { status: 500 }
    );
  }
}
