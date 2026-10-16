import { NextResponse } from 'next/server';
import { targetPool } from '@/lib/db';

/**
 * Route GET /api/health
 * Vérifie la connectivité avec la base de données cible (targetPool) via `SELECT 1`.
 * Renvoie un statut propre sans jamais exposer de données sensibles.
 */
export async function GET() {
  try {
    // Exécution du test de connectivité sur la base cible
    await targetPool.query('SELECT 1');

    return NextResponse.json({ ok: true });
  } catch (err) {
    // Journalisation détaillée sur la console du serveur uniquement
    console.error('[API Health] Échec du test de connexion à la base cible :', {
      message: err instanceof Error ? err.message : String(err),
      code: err?.code,
    });

    // Message générique et compréhensible pour le client
    let message = 'Impossible de se connecter à la base de données cible.';
    if (err?.code === '28P01') {
      message = 'Échec de l\'authentification PostgreSQL (identifiant ou mot de passe incorrect).';
    } else if (err?.code === 'ECONNREFUSED') {
      message = 'Connexion refusée : vérifiez que le serveur PostgreSQL est démarré et écoute sur le port configuré.';
    } else if (err?.code === '3D000') {
      message = 'La base de données spécifiée est introuvable.';
    }

    return NextResponse.json(
      {
        ok: false,
        message,
      },
      { status: 503 }
    );
  }
}
