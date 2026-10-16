/**
 * Fichier d'instrumentation Next.js.
 * Permet d'exécuter du code au démarrage du serveur (runtime Node.js).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { runSync } = await import('./lib/sync.js');

    // Intervalle en minutes (valeur par défaut : 5 minutes)
    const intervalMinutes = parseInt(process.env.SYNC_INTERVAL_MIN || '5', 10) || 5;
    const intervalMs = intervalMinutes * 60 * 1000;

    // Exécution immédiate au démarrage
    runSync().catch((error) => {
      console.error('[Sync] Erreur lors de la synchronisation initiale :', error);
    });

    // Relance périodique toutes les SYNC_INTERVAL_MIN minutes
    setInterval(() => {
      runSync().catch((error) => {
        console.error('[Sync] Erreur lors de la synchronisation périodique :', error);
      });
    }, intervalMs);
  }
}
