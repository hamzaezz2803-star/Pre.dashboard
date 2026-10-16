import { NextResponse } from 'next/server';
import { isSyncInProgress, runSync, syncState } from '@/lib/sync';

/**
 * Route POST /api/sync
 * Déclenche manuellement la synchronisation de la source vers la cible.
 * - Restreinte aux requêtes locales (localhost).
 * - Empêche les exécutions concurrentes en renvoyant 202 si déjà en cours.
 */
export async function POST(request) {
  // 1. Vérification que l'appel provient de localhost
  const host = request.headers.get('host') || '';
  const forwardedFor = request.headers.get('x-forwarded-for') || '';
  const hostname = request.nextUrl.hostname;

  const isLocalhost =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    host.startsWith('localhost') ||
    host.startsWith('127.0.0.1') ||
    forwardedFor.includes('127.0.0.1') ||
    forwardedFor.includes('::1');

  if (!isLocalhost) {
    return NextResponse.json(
      { error: 'Accès refusé : la synchronisation manuelle est réservée à localhost.' },
      { status: 403 }
    );
  }

  // 2. Si une synchronisation est déjà en cours, renvoyer syncState avec le statut 202
  if (isSyncInProgress()) {
    return NextResponse.json(
      {
        message: 'Une synchronisation est déjà en cours d\'exécution.',
        syncState,
      },
      { status: 202 }
    );
  }

  try {
    const result = await runSync();

    // Cas où le verrou a été pris entre-temps
    if (result && result.inProgress) {
      return NextResponse.json(
        {
          message: 'Une synchronisation est déjà en cours d\'exécution.',
          syncState,
        },
        { status: 202 }
      );
    }

    if (syncState.lastError) {
      return NextResponse.json(
        {
          success: false,
          error: syncState.lastError,
          syncState,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Synchronisation terminée avec succès.',
      syncState,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

/**
 * Route GET /api/sync
 * Retourne l'état actuel de la synchronisation.
 */
export async function GET() {
  return NextResponse.json({
    syncState,
  });
}
