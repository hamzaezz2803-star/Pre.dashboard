import { NextResponse } from 'next/server';
import { exigerRole } from '@/lib/auth';
import { executerTest, validerDemandeTest } from '@/lib/compteurs/validation';
import { lireJson } from '@/lib/compteurs/reponses';

/**
 * Route POST /api/compteurs/tester-formule
 * Corps : { formule, periodicite, valeurs: { NOM_VARIABLE: nombre | null } }
 * Simule un calcul sur des valeurs d'exemple (une valeur null = donnée manquante).
 * Aucun accès aux données des employés. Réservé au super_admin.
 */
export async function POST(request) {
  const auth = await exigerRole('super_admin');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const demande = validerDemandeTest(await lireJson(request));
  if (!demande.ok) {
    return NextResponse.json({ error: demande.erreurs[0].message, erreurs: demande.erreurs }, { status: 400 });
  }

  return NextResponse.json({ resultat: executerTest(demande) });
}
