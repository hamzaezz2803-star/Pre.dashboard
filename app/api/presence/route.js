import { NextResponse } from 'next/server';
import { getBiotimePool } from '@/lib/biotime-db';
import { exigerRole } from '@/lib/auth';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Route GET /api/presence?debut=&fin=&departement=&personnel=
 * Lecture seule de la vue v_presence_jour (une ligne par employé et par jour).
 */
export async function GET(request) {
  const auth = await exigerRole('admin', 'super_admin');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { searchParams } = new URL(request.url);
    const debut = searchParams.get('debut')?.trim() || '';
    const fin = searchParams.get('fin')?.trim() || '';
    const departement = searchParams.get('departement')?.trim() || '';
    const personnel = searchParams.get('personnel')?.trim() || '';

    if ((debut && !ISO_DATE.test(debut)) || (fin && !ISO_DATE.test(fin))) {
      return NextResponse.json({ error: 'Format de date invalide.' }, { status: 400 });
    }
    if (debut && fin && fin < debut) {
      return NextResponse.json(
        { error: 'La date de fin doit être postérieure ou égale à la date de début.' },
        { status: 400 },
      );
    }

    const conditions = [];
    const params = [];

    if (debut) {
      params.push(debut);
      conditions.push(`jour >= $${params.length}`);
    }
    if (fin) {
      params.push(fin);
      conditions.push(`jour <= $${params.length}`);
    }
    if (departement && departement !== 'all') {
      params.push(departement);
      conditions.push(`dept_name = $${params.length}`);
    }
    if (personnel) {
      params.push(`%${personnel}%`);
      const p = `$${params.length}`;
      conditions.push(
        `(CAST(emp_code AS TEXT) ILIKE ${p} OR last_name ILIKE ${p} OR first_name ILIKE ${p}` +
          ` OR (first_name || ' ' || last_name) ILIKE ${p} OR (last_name || ' ' || first_name) ILIKE ${p})`,
      );
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    // Les anciens jours n'ont parfois ni nom ni département dans la vue : on reprend ceux
    // renseignés sur un autre jour du même employé (lecture seule, la vue n'est pas modifiée).
    // Temps de présence : la vue le tire de att_record, vide pour les jours récents.
    // Dans ce cas on le calcule (lecture seule) en additionnant les paires de pointages
    // du jour (1er-2e, 3e-4e...). Un pointage impair en fin de journée n'est pas compté.
    // Statut : "noSch" (pas d'horaire planifié) ou vide devient "Présent" si une présence
    // est calculée, "Pointage incomplet" s'il n'y a qu'un pointage non apparié.
    const { rows } = await getBiotimePool().query(
      `
      WITH t AS (
        SELECT
          pers_person_pin::text AS pin,
          att_datetime,
          CAST(att_datetime AS DATE) AS jour,
          ROW_NUMBER() OVER (PARTITION BY pers_person_pin, CAST(att_datetime AS DATE) ORDER BY att_datetime) AS rn,
          LEAD(att_datetime) OVER (PARTITION BY pers_person_pin, CAST(att_datetime AS DATE) ORDER BY att_datetime) AS nxt
        FROM att_transaction
      ),
      calc AS (
        SELECT pin, jour,
               CAST(ROUND(SUM(EXTRACT(EPOCH FROM (nxt - att_datetime)) / 60)) AS INT) AS minutes
        FROM t
        WHERE rn % 2 = 1 AND nxt IS NOT NULL
        GROUP BY pin, jour
      ),
      v AS (
        SELECT
          p.emp_code,
          COALESCE(p.last_name, MAX(p.last_name) OVER (PARTITION BY p.emp_code)) AS last_name,
          COALESCE(p.first_name, MAX(p.first_name) OVER (PARTITION BY p.emp_code)) AS first_name,
          COALESCE(p.dept_name, MAX(p.dept_name) OVER (PARTITION BY p.emp_code)) AS dept_name,
          p.jour,
          p.premier_pointage,
          p.dernier_pointage,
          p.nb_pointages,
          CASE WHEN COALESCE(p.temps_presence_min, 0) > 0 THEN p.temps_presence_min
               ELSE COALESCE(c.minutes, 0) END AS temps_presence_min,
          CASE
            WHEN p.statut_presence IS NOT NULL AND p.statut_presence <> 'noSch' THEN p.statut_presence
            WHEN GREATEST(COALESCE(p.temps_presence_min, 0), COALESCE(c.minutes, 0)) > 0 THEN 'Présent'
            WHEN p.nb_pointages > 0 THEN 'Pointage incomplet'
            ELSE p.statut_presence
          END AS statut_presence
        FROM v_presence_jour p
        LEFT JOIN calc c ON c.pin = p.emp_code::text AND c.jour = p.jour
      )
      SELECT
        emp_code,
        last_name,
        first_name,
        dept_name,
        to_char(jour, 'YYYY-MM-DD') AS jour,
        premier_pointage,
        dernier_pointage,
        nb_pointages::int AS nb_pointages,
        temps_presence_min,
        statut_presence
      FROM v
      ${where}
      ORDER BY v.jour DESC, last_name, first_name
      `,
      params,
    );

    return NextResponse.json({ rows });
  } catch (err) {
    console.error('[API Presence] Erreur lors de la lecture de v_presence_jour :', {
      message: err instanceof Error ? err.message : String(err),
      code: err?.code,
    });
    return NextResponse.json(
      { error: 'La base de données de pointage est actuellement indisponible.' },
      { status: 503 },
    );
  }
}
