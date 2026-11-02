import { NextResponse } from 'next/server';
import { targetPool } from '@/lib/db';
import { exigerRole } from '@/lib/auth';
import { avecTransaction, creerCompteur, listerCompteurs } from '@/lib/compteurs/service';
import { lireJson, reponseErreur } from '@/lib/compteurs/reponses';

/**
 * Route GET /api/compteurs
 * Liste les compteurs. Filtres : ?recherche=, ?periodicite=JOUR|SEMAINE|MOIS, ?statut=actif|inactif|tous.
 * Consultation : admin et super_admin.
 */
export async function GET(request) {
  const auth = await exigerRole('admin', 'super_admin');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { searchParams } = new URL(request.url);
    const compteurs = await listerCompteurs(targetPool, {
      recherche: searchParams.get('recherche') || '',
      periodicite: searchParams.get('periodicite') || '',
      statut: searchParams.get('statut') || 'tous',
    });
    return NextResponse.json({ compteurs });
  } catch (e) {
    return reponseErreur(e, 'liste');
  }
}

/**
 * Route POST /api/compteurs
 * Crée un compteur et sa première version de formule. Réservé au super_admin.
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

  try {
    const compteur = await avecTransaction(targetPool, (db) => creerCompteur(db, corps, auth.id));
    console.info(`[Compteurs] Création ${compteur.id_compteur} par l'utilisateur ${auth.id}`);
    return NextResponse.json({ compteur }, { status: 201 });
  } catch (e) {
    return reponseErreur(e, 'création');
  }
}
