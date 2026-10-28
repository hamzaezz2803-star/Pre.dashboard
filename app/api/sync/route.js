import { NextResponse } from 'next/server';
import { isSyncInProgress, runSync, syncState } from '@/lib/sync';
import { exigerRole } from '@/lib/auth';

/**
 * Route POST /api/sync
 * Déclenche manuellement la synchronisation de la source vers la cible.
 * - Réservée au rôle super_admin uniquement.
 * - Restreinte aux requêtes locales (localhost).
 * - Empêche les exécutions concurrentes en renvoyant 202 si déjà en cours.
 */
export async function POST(request) {
  // 1. Contrôle d'accès : rôle super_admin obligatoire
  const auth = await exigerRole('super_admin');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  // 2. Vérification que l'appel provient de localhost ou du réseau local (LAN)
  const host = request.headers.get('host') || '';
  const forwardedFor = request.headers.get('x-forwarded-for') || '';
  const hostname = request.nextUrl.hostname;
  const cleanHost = host.split(':')[0].toLowerCase();

  const isPrivateIp = (ip) =>
    ip === 'localhost' ||
    ip === '127.0.0.1' ||
    ip === '::1' ||
    /^192\.168\.\d{1,3}\.\d{1,3}$/.test(ip) ||
    /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip) ||
    /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(ip);

  const isLocalOrLan =
    isPrivateIp(hostname) ||
    isPrivateIp(cleanHost) ||
    forwardedFor.includes('127.0.0.1') ||
    forwardedFor.includes('::1');

  if (!isLocalOrLan) {
    return NextResponse.json(
      { error: 'Accès refusé : la synchronisation manuelle est réservée au réseau local.' },
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
