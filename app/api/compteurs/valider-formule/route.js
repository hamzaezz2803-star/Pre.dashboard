import { NextResponse } from 'next/server';
import { exigerRole } from '@/lib/auth';
import { validerFormule } from '@/lib/compteurs/validation';
import { lireJson } from '@/lib/compteurs/reponses';

/**
 * Route POST /api/compteurs/valider-formule
 * Corps : { formule, periodicites: ['JOUR'|'SEMAINE'|'MOIS', ...] }
 * Vérifie syntaxe, fonctions, variables et types sans rien enregistrer.
 * Réservé au super_admin (gestionnaire des formules).
 */
export async function POST(request) {
  const auth = await exigerRole('super_admin');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const corps = await lireJson(request);
  if (!corps) {
    return NextResponse.json({ error: 'Corps de requête JSON invalide.' }, { status: 400 });
  }

  const resultat = validerFormule(corps.formule, corps.periodicites);
  return NextResponse.json(resultat, { status: resultat.ok ? 200 : 422 });
}
