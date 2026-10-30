import { NextResponse } from 'next/server';
import { exigerRole } from '@/lib/auth';
import { getArbreDepartements } from '@/lib/departements';

/**
 * Route GET /api/departements/arbre
 * Retourne la hiérarchie complète des départements :
 * - Liste des départements parents de niveau 1
 * - Avec pour chacun l'arbre complet de ses sous-départements (niveaux 2, 3...)
 *
 * Réservée strictement au super_admin (pour la modale d'attribution et d'aperçu).
 */
export async function GET() {
  const auth = await exigerRole('super_admin');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const arbre = await getArbreDepartements();
    return NextResponse.json({ parents: arbre });
  } catch (error) {
    console.error('[API Departements Arbre] Erreur :', error?.message);
    return NextResponse.json(
      { error: 'Erreur lors du chargement de l\'arbre des départements.', parents: [] },
      { status: 500 }
    );
  }
}
