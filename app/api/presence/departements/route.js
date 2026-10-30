import { NextResponse } from 'next/server';
import { exigerRoleAvecPerimetre } from '@/lib/perimetre';
import { listerDepartementsFiltreArbre } from '@/lib/departements';

/**
 * Route GET /api/presence/departements
 * Retourne la liste des départements proposés dans les filtres,
 * ordonnée selon la hiérarchie en arbre (parent > sous-départements).
 * - super_admin : tous les départements (hors racine).
 * - admin       : uniquement les départements de son périmètre.
 *
 * Retourne des objets { id, name, code, niveau, label } où `label` est indenté
 * avec des flèches '↳' pour un affichage hiérarchique direct dans les <select>.
 */
export async function GET() {
  const auth = await exigerRoleAvecPerimetre('admin', 'super_admin');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const arbreFiltre = await listerDepartementsFiltreArbre(auth.perimetre);
    return NextResponse.json(arbreFiltre);
  } catch (err) {
    console.error('[API Presence Départements] Erreur :', err?.message);
    return NextResponse.json([]);
  }
}
