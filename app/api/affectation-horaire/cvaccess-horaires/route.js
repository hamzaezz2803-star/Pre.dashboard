import { NextResponse } from 'next/server';
import { targetPool } from '@/lib/db';
import { exigerRole } from '@/lib/auth';

/**
 * GET /api/affectation-horaire/cvaccess-horaires
 * Retourne la liste dynamique des horaires officiels synchronisés depuis CVAccess (table cvaccess_horaires).
 */
export async function GET() {
  const auth = await exigerRole('admin', 'super_admin');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { rows } = await targetPool.query(`
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
