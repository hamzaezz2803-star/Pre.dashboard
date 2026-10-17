import { NextResponse } from 'next/server';
import { targetPool } from '@/lib/db';
import { runSync, syncState } from '@/lib/sync';
import { exigerRole } from '@/lib/auth';

/**
 * Seuil en minutes avant déclenchement d'une nouvelle synchronisation automatique (défaut : 1).
 */
const SEUIL_SYNC_MIN = 1;
const SYNC_INTERVAL_MS = SEUIL_SYNC_MIN * 60 * 1000;

export async function GET(request) {
  // Contrôle d'accès : réservé aux rôles admin et super_admin
  const auth = await exigerRole('admin', 'super_admin');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  try {
    // 1. Tenter une synchronisation si nécessaire (sans bloquer la lecture si la source est indisponible)
    const isSyncNeeded =
      !syncState.lastRun ||
      Date.now() - new Date(syncState.lastRun).getTime() > SYNC_INTERVAL_MS;

    if (isSyncNeeded) {
      try {
        await runSync();
      } catch (syncErr) {
        console.error('[API Pointages] Échec de la synchronisation automatique en arrière-plan :', {
          message: syncErr instanceof Error ? syncErr.message : String(syncErr),
          code: syncErr?.code,
        });
      }
    }

    // 2. Récupération des paramètres de filtrage optionnels
    const { searchParams } = new URL(request.url);
    const debut = searchParams.get('debut');
    const fin = searchParams.get('fin');
    const departement = searchParams.get('departement');
    const personnel = searchParams.get('personnel');

    // 3. Construction sécurisée de la clause WHERE via tableaux de conditions et paramètres ($1, $2...)
    const conditions = [];
    const params = [];

    if (debut && debut.trim() !== '') {
      params.push(debut.trim());
      conditions.push(`date_pointage >= $${params.length}`);
    }

    if (fin && fin.trim() !== '') {
      params.push(fin.trim());
      conditions.push(`date_pointage <= $${params.length}`);
    }

    if (departement && departement.trim() !== '' && departement !== 'all') {
      params.push(departement.trim());
      conditions.push(`departement = $${params.length}`);
    }

    if (personnel && personnel.trim() !== '') {
      params.push(`%${personnel.trim()}%`);
      const paramIndex = `$${params.length}`;
      conditions.push(
        `(CAST(id AS TEXT) ILIKE ${paramIndex} OR nom ILIKE ${paramIndex} OR prenom ILIKE ${paramIndex})`
      );
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // 4. Requête exécutée exclusivement sur targetPool
    const query = `
      SELECT
        id,
        nom,
        prenom,
        prestation,
        departement,
        MIN(premier_pointage) AS pointage_min,
        MAX(dernier_pointage) AS pointage_max,
        COALESCE(SUM(nb_pointages), 0)::int AS nb_pointages,
        STRING_AGG(DISTINCT zones, ', ') AS zones,
        COALESCE(SUM(temps_presence_min), 0)::int AS temps_presence_min,
        COALESCE(SUM(absence_min), 0)::int AS absence_min
      FROM pointage_journalier
      ${whereClause}
      GROUP BY id, nom, prenom, prestation, departement
      ORDER BY nom, prenom;
    `;

    const { rows } = await targetPool.query(query, params);

    // 5. Réponse JSON formatée
    return NextResponse.json({
      syncedAt: syncState.lastRun,
      rows,
    });
  } catch (err) {
    // 1. Affiche l'erreur réelle dans la console serveur
    console.error('[API Pointages] Erreur lors de l\'accès à la base de données :', {
      message: err instanceof Error ? err.message : String(err),
      code: err?.code,
    });

    // Renvoie un message générique sans divulguer de données sensibles (mot de passe, URL, etc.)
    return NextResponse.json(
      {
        error: 'La base de données cible est actuellement indisponible.',
      },
      { status: 503 }
    );
  }
}
