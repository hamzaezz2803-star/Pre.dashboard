import { NextResponse } from 'next/server';
import { targetPool } from '@/lib/db';
import { exigerRole } from '@/lib/auth';
import { avecTransaction, lireCompteur, modifierCompteur } from '@/lib/compteurs/service';
import { lireJson, reponseErreur } from '@/lib/compteurs/reponses';

/**
 * Route GET /api/compteurs/[id]
 * Détail d'un compteur avec l'historique de ses versions de formule.
 * Consultation : admin et super_admin.
 */
export async function GET(_request, context) {
  const auth = await exigerRole('admin', 'super_admin');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { id } = await context.params;
    const compteur = await lireCompteur(targetPool, id);
    return NextResponse.json({ compteur });
  } catch (e) {
    return reponseErreur(e, 'lecture');
  }
}

/**
 * Route PATCH /api/compteurs/[id]
 * Modifie, active ou désactive un compteur. Réservé au super_admin.
 * Pas de suppression : un compteur se désactive (actif = false) et garde son historique.
 */
export async function PATCH(request, context) {
  const auth = await exigerRole('super_admin');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const corps = await lireJson(request);
  if (!corps) {
    return NextResponse.json({ error: 'Corps de requête JSON invalide.' }, { status: 400 });
  }

  try {
    const { id } = await context.params;
    const resultat = await avecTransaction(targetPool, (db) => modifierCompteur(db, id, corps, auth.id));
    const c = resultat.compteur;
    console.info(
      `[Compteurs] Modification ${c.id_compteur} (version ${c.version_formule}, actif=${c.actif}) par l'utilisateur ${auth.id}`
    );
    return NextResponse.json(resultat);
  } catch (e) {
    return reponseErreur(e, 'modification');
  }
}
