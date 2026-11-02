import { NextResponse } from 'next/server';
import { ErreurCompteur, traduireErreurBase } from './service.js';

/**
 * Transforme une erreur en réponse JSON. Les erreurs métier exposent leur
 * message ; les autres sont journalisées côté serveur et renvoyées sous une
 * forme générique (aucun détail technique au client).
 */
export function reponseErreur(e, contexte) {
  const err = traduireErreurBase(e);
  if (err instanceof ErreurCompteur) {
    return NextResponse.json({ error: err.message, erreurs: err.erreurs ?? undefined }, { status: err.status });
  }
  console.error(`[Compteurs] ${contexte} :`, err?.message);
  return NextResponse.json({ error: 'Erreur lors du traitement des compteurs.' }, { status: 500 });
}

/** Lit le corps JSON d'une requête ou renvoie null s'il est invalide. */
export async function lireJson(request) {
  try {
    const corps = await request.json();
    return corps && typeof corps === 'object' && !Array.isArray(corps) ? corps : null;
  } catch {
    return null;
  }
}
