import { NextResponse } from 'next/server';
import { targetPool } from '@/lib/db';
import {
  estPerimetreRestreint,
  exigerRoleAvecPerimetre,
  personnesHorsPerimetre,
} from '@/lib/perimetre';

/**
 * POST /api/affectation-horaire/enregistrer-employes
 * Enregistre les sélections d'affectation dynamique des employés dans la table
 * PostgreSQL ocp_pointage.public.employes_affectation_dynamique via une opération UPSERT.
 *
 * Utilise cvaccess_person_id = pers_person.id (et non pers_person.pin).
 *
 * Cloisonnement : un admin ne peut modifier que les employés de son périmètre de départements.
 * - `updates` contenant un employé hors périmètre : refus global (403), rien n'est enregistré.
 * - `activeIds` : seule la sélection des employés du périmètre est appliquée ; les employés
 *   hors périmètre ne sont jamais modifiés (ils ne sont plus désactivés par erreur).
 */
export async function POST(request) {
  const auth = await exigerRoleAvecPerimetre('admin', 'super_admin');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { perimetre } = auth;

  const client = await targetPool.connect();

  try {
    const body = await request.json();
    const { activeIds, updates } = body;

    await client.query('BEGIN');

    // Cas 1 : Des mises à jour précises par employé sont fournies
    if (Array.isArray(updates) && updates.length > 0) {
      const idsDemandes = updates
        .map((item) => item.cvaccess_person_id || item.id)
        .filter(Boolean);

      const horsPerimetre = await personnesHorsPerimetre(perimetre, idsDemandes);
      if (horsPerimetre.length > 0) {
        await client.query('ROLLBACK');
        return NextResponse.json(
          { success: false, error: 'Accès refusé : au moins un employé est hors de votre périmètre de départements.' },
          { status: 403 }
        );
      }

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
      // Employés dont le statut peut être synchronisé : tous (super_admin) ou ceux du périmètre (admin)
      const { rows: allPersons } = estPerimetreRestreint(perimetre)
        ? await client.query('SELECT id FROM pers_person WHERE auth_dept_id = ANY($1::text[])', [perimetre])
        : await client.query('SELECT id FROM pers_person');
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

    // Recharger depuis PostgreSQL pour vérifier la persistance réelle (restreint au périmètre pour un admin)
    const { rows: activeRows } = estPerimetreRestreint(perimetre)
      ? await targetPool.query(
          `SELECT e.cvaccess_person_id
           FROM employes_affectation_dynamique e
           WHERE e.actif = true
             AND e.cvaccess_person_id IN (
               SELECT pp.id FROM pers_person pp WHERE pp.auth_dept_id = ANY($1::text[])
             )`,
          [perimetre]
        )
      : await targetPool.query(
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
