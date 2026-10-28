import { NextResponse } from 'next/server';
import { exigerRole } from '@/lib/auth';
import { targetPool } from '@/lib/db';

/**
 * Route GET /api/presence/timeline?pin=&date=
 * Retourne la chronologie exacte des pointages (Entrée, Sortie, Pauses) d'un employé pour un jour donné.
 */
export async function GET(request) {
  const auth = await exigerRole('admin', 'super_admin');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { searchParams } = new URL(request.url);
    const pin = searchParams.get('pin')?.trim();
    const date = searchParams.get('date')?.trim();
    let dateFin = searchParams.get('date_fin')?.trim() || searchParams.get('dateFin')?.trim() || date;

    if (!pin || !date) {
      return NextResponse.json(
        { error: 'Les paramètres pin et date sont requis.' },
        { status: 400 }
      );
    }

    // Si dateFin n'a pas été explicitement spécifié et qu'il s'agit d'un horaire de nuit
    if (dateFin === date) {
      try {
        const nightCheck = await targetPool.query(
          `SELECT a.fin_prevue::date AS date_fin
           FROM affectations_horaires_dynamiques a
           JOIN pers_person p ON p.id = a.cvaccess_person_id
           WHERE p.pin::text = $1 AND a.date_service = $2::date AND a.fin_prevue::date > a.date_service
           LIMIT 1`,
          [pin, date]
        );
        if (nightCheck.rows.length > 0 && nightCheck.rows[0].date_fin) {
          dateFin = nightCheck.rows[0].date_fin.toISOString().split('T')[0];
        }
      } catch (err) {
        console.warn('[API Presence Timeline] Impossible de vérifier les horaires de nuit :', err?.message);
      }
    }

    const { rows } = await targetPool.query(
      `SELECT
         id,
         pers_person_pin AS pin,
         pers_person_name AS prenom,
         pers_person_last_name AS nom,
         auth_dept_name AS departement,
         to_char(att_datetime, 'HH24:MI:SS') AS heure,
         to_char(att_datetime, 'YYYY-MM-DD') AS jour,
         to_char(att_datetime, 'DD/MM/YYYY') AS date_formatted,
         att_datetime,
         att_state,
         COALESCE(att_place, 'Badgeuse principale') AS lieu,
         COALESCE(device_name, 'Terminal pointage') AS appareil
       FROM att_transaction
       WHERE pers_person_pin::text = $1 
         AND att_datetime >= $2::date 
         AND att_datetime < ($3::date + INTERVAL '1 day')
       ORDER BY att_datetime ASC;`,
      [pin, date, dateFin]
    );

    const STATE_LABELS = {
      '0': { label: 'Pointage d\'Entrée', type: 'entree', color: 'emerald' },
      '1': { label: 'Pointage de Sortie', type: 'sortie', color: 'red' },
      '2': { label: 'Pause (Sortie)', type: 'pause_out', color: 'amber' },
      '3': { label: 'Reprise (Entrée)', type: 'pause_in', color: 'emerald' },
      '4': { label: 'Heures sup. Entrée', type: 'ot_in', color: 'indigo' },
      '5': { label: 'Heures sup. Sortie', type: 'ot_out', color: 'indigo' },
    };

    const timeline = rows.map((r, idx) => {
      const stateInfo = STATE_LABELS[String(r.att_state)] || {
        label: idx === 0 ? 'Pointage d\'Entrée' : 'Pointage de Sortie',
        type: idx === 0 ? 'entree' : 'sortie',
        color: idx === 0 ? 'emerald' : 'red',
      };

      return {
        id: r.id,
        heure: r.heure,
        jour: r.jour,
        dateFormatted: r.date_formatted,
        isLendemain: r.jour > date,
        attDatetime: r.att_datetime,
        type: stateInfo.type,
        label: stateInfo.label,
        color: stateInfo.color,
        lieu: r.lieu,
        appareil: r.appareil,
      };
    });

    return NextResponse.json({
      pin,
      date,
      count: timeline.length,
      timeline,
    });
  } catch (error) {
    console.error('[API Presence Timeline] Erreur :', error?.message);
    return NextResponse.json(
      { error: 'Erreur lors de la récupération de la timeline des pointages.' },
      { status: 500 }
    );
  }
}
