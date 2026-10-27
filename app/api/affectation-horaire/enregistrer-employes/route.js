import { NextResponse } from 'next/server';
import { targetPool } from '@/lib/db';
import { exigerRole } from '@/lib/auth';

/**
 * POST /api/affectation-horaire/enregistrer-employes
 * Enregistre les sélections d'affectation dynamique des employés dans la table
 * PostgreSQL ocp_pointage.public.employes_affectation_dynamique via une opération UPSERT.
 *
 * Utilise cvaccess_person_id = pers_person.id (et non pers_person.pin).
 */
export async function POST(request) {
  const auth = await exigerRole('admin', 'super_admin');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const client = await targetPool.connect();

  try {
    const body = await request.json();
    const { activeIds, updates } = body;

    await client.query('BEGIN');

    // Cas 1 : Des mises à jour précises par employé sont fournies
    if (Array.isArray(updates) && updates.length > 0) {
      for (const item of updates) {
        const personId = item.cvaccess_person_id || item.id;
        const estActif = Boolean(item.actif);
        if (!personId) continue;

        await client.query(
          `
          INSERT INTO employes_affectation_dynamique (cvaccess_person_id, actif, updated_at)
          VALUES ($1, $2, NOW())
          ON CONFLICT (cvaccess_person_id) DO UPDATE SET
            actif = EXCLUDED.actif,
            updated_at = NOW();
        `,
          [personId, estActif]
        );
      }
    }
    // Cas 2 : La liste complète des identifiants actifs est fournie
    else if (Array.isArray(activeIds)) {
      // Récupérer tous les employés de pers_person pour synchroniser leur statut
      const { rows: allPersons } = await client.query('SELECT id FROM pers_person');
      const activeSet = new Set(activeIds);

      for (const person of allPersons) {
        const estActif = activeSet.has(person.id);
        await client.query(
          `
          INSERT INTO employes_affectation_dynamique (cvaccess_person_id, actif, updated_at)
          VALUES ($1, $2, NOW())
          ON CONFLICT (cvaccess_person_id) DO UPDATE SET
            actif = EXCLUDED.actif,
            updated_at = NOW();
        `,
          [person.id, estActif]
        );
      }
    } else {
      await client.query('ROLLBACK');
      return NextResponse.json(
        { error: 'Données invalides : veuillez fournir activeIds ou updates.' },
        { status: 400 }
      );
    }

    await client.query('COMMIT');

    // Recharger depuis PostgreSQL pour vérifier la persistance réelle
    const { rows: activeRows } = await targetPool.query(
      'SELECT cvaccess_person_id FROM employes_affectation_dynamique WHERE actif = true'
    );
    const activeList = activeRows.map((r) => r.cvaccess_person_id);

    return NextResponse.json({
      success: true,
      message: `Enregistrement réussi dans PostgreSQL (${activeList.length} employé(s) activé(s)).`,
      activeIds: activeList,
      activeCount: activeList.length,
    });
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {}
    console.error('[API Enregistrer Employés PostgreSQL] Erreur :', err?.message);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : 'Erreur lors de l\'enregistrement dans PostgreSQL.',
      },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
