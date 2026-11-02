import { NextResponse } from 'next/server';
import { exigerRole } from '@/lib/auth';
import { FONCTIONS_FORMULE, LIMITES_FORMULE } from '@/lib/compteurs/formule';
import { VARIABLES_COMPTEURS } from '@/lib/compteurs/variables';
import { UNITES } from '@/lib/compteurs/validation';

/**
 * Route GET /api/compteurs/catalogue
 * Aide de l'éditeur de formules : variables disponibles (avec périodicités,
 * unité, source et règle), fonctions, unités et limites.
 * Consultation : admin et super_admin.
 */
export async function GET() {
  const auth = await exigerRole('admin', 'super_admin');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const fonctions = Object.entries(FONCTIONS_FORMULE).map(([nom, f]) => ({
    nom,
    syntaxe: f.syntaxe,
    description: f.description,
  }));

  return NextResponse.json({
    variables: VARIABLES_COMPTEURS,
    fonctions,
    operateurs: ['+', '-', '*', '/', '>', '<', '>=', '<=', '=', '!=', 'AND', 'OR', 'NOT'],
    unites: UNITES,
    limites: LIMITES_FORMULE,
  });
}
