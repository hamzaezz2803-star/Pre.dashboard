import { NextResponse } from 'next/server';
import { exigerRole } from '@/lib/auth';
import { getArbreDepartements } from '@/lib/departements';

/**
 * Route GET /api/admin/departements
 * Retourne la hiérarchie des départements pour le sélecteur d'attribution :
 * les départements parents de niveau 1 avec leurs sous-départements récursifs.
 * Réservée strictement au super_admin.
 */
export async function GET() {
  const auth = await exigerRole('super_admin');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const parents = await getArbreDepartements();
    // Conserve également le format à plat "departements" pour compatibilité tout en fournissant l'arbre
    return NextResponse.json({
      parents,
      departements: parents.map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        nb_sous_departements: p.nb_sous_departements,
      })),
    });
  } catch (error) {
    console.error('[API Admin Départements] Erreur :', error?.message);
    return NextResponse.json(
      { error: 'Erreur lors du chargement des départements.', parents: [], departements: [] },
      { status: 500 }
    );
  }
}
