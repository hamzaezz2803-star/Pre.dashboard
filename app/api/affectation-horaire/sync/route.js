import { NextResponse } from 'next/server';
import { sourcePool, targetPool } from '@/lib/db';
import { exigerRole } from '@/lib/auth';

/**
 * POST /api/affectation-horaire/sync
 * Synchronise les départements, employés et horaires depuis CVAccess (biosecurity-boot) vers ocp_pointage.
 * Permet à l'utilisateur de recevoir immédiatement tout nouveau département ou employé ajouté dans CVAccess.
 */
export async function POST() {
  const auth = await exigerRole('admin', 'super_admin');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let srcClient = null;
  let dstClient = null;

  try {
    srcClient = await sourcePool.connect();
    dstClient = await targetPool.connect();

    await dstClient.query('BEGIN');

    // 1. Synchronisation de auth_department
    const deptsSource = await srcClient.query('SELECT * FROM "auth_department"');
    if (deptsSource.rows && deptsSource.rows.length > 0) {
      await dstClient.query('TRUNCATE TABLE "auth_department" CASCADE');
      const cols = Object.keys(deptsSource.rows[0]);
      const quotedCols = cols.map((c) => `"${c}"`).join(', ');

      for (let i = 0; i < deptsSource.rows.length; i += 500) {
        const batch = deptsSource.rows.slice(i, i + 500);
        const values = [];
        const placeholders = [];
        let pIdx = 1;

        for (const row of batch) {
          const rowP = [];
          for (const col of cols) {
            rowP.push(`$${pIdx++}`);
            values.push(row[col]);
          }
          placeholders.push(`(${rowP.join(', ')})`);
        }

        await dstClient.query(
          `INSERT INTO "auth_department" (${quotedCols}) VALUES ${placeholders.join(', ')}`,
          values
        );
      }
    }

    // 2. Synchronisation de pers_position
    const posSource = await srcClient.query('SELECT * FROM "pers_position"');
    if (posSource.rows && posSource.rows.length > 0) {
      await dstClient.query('TRUNCATE TABLE "pers_position" CASCADE');
      const cols = Object.keys(posSource.rows[0]);
      const quotedCols = cols.map((c) => `"${c}"`).join(', ');

      for (let i = 0; i < posSource.rows.length; i += 500) {
        const batch = posSource.rows.slice(i, i + 500);
        const values = [];
        const placeholders = [];
        let pIdx = 1;

        for (const row of batch) {
          const rowP = [];
          for (const col of cols) {
            rowP.push(`$${pIdx++}`);
            values.push(row[col]);
          }
          placeholders.push(`(${rowP.join(', ')})`);
        }

        await dstClient.query(
          `INSERT INTO "pers_position" (${quotedCols}) VALUES ${placeholders.join(', ')}`,
          values
        );
      }
    }

    // 3. Synchronisation de pers_person
    const persSource = await srcClient.query('SELECT * FROM "pers_person"');
    if (persSource.rows && persSource.rows.length > 0) {
      await dstClient.query('TRUNCATE TABLE "pers_person" CASCADE');
      const cols = Object.keys(persSource.rows[0]);
      const quotedCols = cols.map((c) => `"${c}"`).join(', ');

      for (let i = 0; i < persSource.rows.length; i += 500) {
        const batch = persSource.rows.slice(i, i + 500);
        const values = [];
        const placeholders = [];
        let pIdx = 1;

        for (const row of batch) {
          const rowP = [];
          for (const col of cols) {
            rowP.push(`$${pIdx++}`);
            values.push(row[col]);
          }
          placeholders.push(`(${rowP.join(', ')})`);
        }

        await dstClient.query(
          `INSERT INTO "pers_person" (${quotedCols}) VALUES ${placeholders.join(', ')}`,
          values
        );
      }
    }

    // 4. Synchronisation des horaires CVAccess (att_timeslot -> cvaccess_horaires)
    const { rows: horairesSource } = await srcClient.query(`
      SELECT 
        id,
        period_name,
        to_work_time,
        off_work_time,
        working_hours,
        start_sign_in_time,
        end_sign_off_time,
        update_time
      FROM att_timeslot
    `);

    for (const h of horairesSource) {
      await dstClient.query(
        `
        INSERT INTO cvaccess_horaires (
          cvaccess_horaire_id,
          period_name,
          to_work_time,
          off_work_time,
          working_hours,
          start_sign_in_time,
          end_sign_off_time,
          source_update_time,
          synced_at
        )
        VALUES ($1, $2, $3::time, $4::time, $5, $6::time, $7::time, $8, NOW())
        ON CONFLICT (cvaccess_horaire_id) DO UPDATE SET
          period_name = EXCLUDED.period_name,
          to_work_time = EXCLUDED.to_work_time,
          off_work_time = EXCLUDED.off_work_time,
          working_hours = EXCLUDED.working_hours,
          start_sign_in_time = EXCLUDED.start_sign_in_time,
          end_sign_off_time = EXCLUDED.end_sign_off_time,
          source_update_time = EXCLUDED.source_update_time,
          synced_at = NOW();
      `,
        [
          h.id,
          h.period_name,
          h.to_work_time || null,
          h.off_work_time || null,
          h.working_hours || null,
          h.start_sign_in_time || null,
          h.end_sign_off_time || null,
          h.update_time || null,
        ]
      );
    }

    await dstClient.query('COMMIT');

    return NextResponse.json({
      success: true,
      message: `Synchronisation CVAccess réussie : ${deptsSource.rows.length} département(s), ${persSource.rows.length} employé(s) et ${horairesSource.length} horaire(s) à jour.`,
      counts: {
        departements: deptsSource.rows.length,
        employes: persSource.rows.length,
        horaires: horairesSource.length,
      },
    });
  } catch (error) {
    if (dstClient) {
      try {
        await dstClient.query('ROLLBACK');
      } catch {}
    }
    console.error('[API Sync CVAccess] Erreur :', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Erreur lors de la synchronisation.',
      },
      { status: 500 }
    );
  } finally {
    if (srcClient) {
      try {
        srcClient.release();
      } catch {}
    }
    if (dstClient) {
      try {
        dstClient.release();
      } catch {}
    }
  }
}
