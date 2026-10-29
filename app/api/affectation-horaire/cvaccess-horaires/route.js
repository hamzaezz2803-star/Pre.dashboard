import { NextResponse } from 'next/server';
import { targetPool, sourcePool } from '@/lib/db';
import { exigerRole } from '@/lib/auth';

/**
 * GET /api/affectation-horaire/cvaccess-horaires
 * Retourne la liste dynamique des horaires officiels synchronisés depuis CVAccess (table cvaccess_horaires).
 * Si la table est encore vide, effectue une auto-synchronisation transparente depuis att_timeslot de la base source.
 */
export async function GET() {
  const auth = await exigerRole('admin', 'super_admin');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    let { rows } = await targetPool.query(`
      SELECT 
        cvaccess_horaire_id,
        period_name,
        to_work_time::text,
        off_work_time::text,
        working_hours,
        start_sign_in_time::text,
        end_sign_off_time::text
      FROM cvaccess_horaires
      ORDER BY period_name ASC
    `);

    // Si la table locale est vide, tenter de récupérer automatiquement les horaires réels depuis la base officielle ZKBio
    if ((!rows || rows.length === 0) && sourcePool) {
      try {
        const { rows: srcRows } = await sourcePool.query(`
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
          ORDER BY period_name ASC
        `);

        if (srcRows && srcRows.length > 0) {
          const cleanTime = (v) => (v && String(v).trim() !== '' ? String(v).trim() : null);

          for (const h of srcRows) {
            await targetPool.query(
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
                cleanTime(h.to_work_time),
                cleanTime(h.off_work_time),
                h.working_hours || null,
                cleanTime(h.start_sign_in_time),
                cleanTime(h.end_sign_off_time),
                h.update_time || null,
              ]
            );
          }

          const reloaded = await targetPool.query(`
            SELECT 
              cvaccess_horaire_id,
              period_name,
              to_work_time::text,
              off_work_time::text,
              working_hours,
              start_sign_in_time::text,
              end_sign_off_time::text
            FROM cvaccess_horaires
            ORDER BY period_name ASC
          `);
          rows = reloaded.rows;
        }
      } catch (autoSyncErr) {
        console.warn('[API CVAccess Horaires] Auto-synchronisation source impossible :', autoSyncErr?.message);
      }
    }

    // Calcul de la détection de nuit et du formatage
    const formatted = rows.map((h) => {
      let isNight = false;
      const debut = (h.to_work_time || '').slice(0, 5);
      const fin = (h.off_work_time || '').slice(0, 5);
      if (debut && fin) {
        const [hD, mD] = debut.split(':').map(Number);
        const [hF, mF] = fin.split(':').map(Number);
        isNight = hF * 60 + mF <= hD * 60 + mD;
      }

      return {
        ...h,
        to_work_time_clean: debut,
        off_work_time_clean: fin,
        is_night: isNight,
      };
    });

    return NextResponse.json({ horaires: formatted });
  } catch (err) {
    console.error('[API CVAccess Horaires] Erreur :', err?.message);
    return NextResponse.json(
      { error: 'Erreur lors du chargement des horaires CVAccess.', horaires: [] },
      { status: 500 }
    );
  }
}
