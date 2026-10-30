import { NextResponse } from 'next/server';
import { getBiotimePool } from '@/lib/biotime-db';
import {
  conditionPerimetrePersonnel,
  departementNomAutorise,
  exigerRoleAvecPerimetre,
} from '@/lib/perimetre';
import { resoudreNomsDescendants } from '@/lib/departements';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Route GET /api/presence?debut=&fin=&departement=&personnel=
 * Lecture seule de la vue v_presence_jour (une ligne par employé et par jour).
 */
export async function GET(request) {
  const auth = await exigerRoleAvecPerimetre('admin', 'super_admin');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { perimetre } = auth;

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
    // Filtres de dates réutilisés pour limiter tôt les CTE lourdes (performance)
    const preT = [];
    const preShift = [];

    if (debut) {
      params.push(debut);
      conditions.push(`jour >= $${params.length}`);
      preT.push(`att_datetime >= $${params.length}::date`);
      preShift.push(`AND a.date_service >= $${params.length}::date`);
    }
    if (fin) {
      params.push(fin);
      conditions.push(`jour <= $${params.length}`);
      preT.push(`att_datetime < ($${params.length}::date + 1)`);
      preShift.push(`AND a.date_service <= $${params.length}::date`);
    }
    const whereT = preT.length > 0 ? `WHERE ${preT.join(' AND ')}` : '';
    const andShift = preShift.join(' ');
    if (departement && departement !== 'all') {
      // Un département hors périmètre est refusé : jamais de données renvoyées
      if (!(await departementNomAutorise(perimetre, departement))) {
        return NextResponse.json({ error: 'Accès refusé à ce département.' }, { status: 403 });
      }
      const nomsInclus = await resoudreNomsDescendants(departement);
      const liste = nomsInclus.length > 0 ? nomsInclus : [departement];
      params.push(liste);
      conditions.push(`dept_name = ANY($${params.length}::text[])`);
    }
    // Cloisonnement obligatoire côté serveur : uniquement le personnel des départements autorisés
    const condPerimetre = conditionPerimetrePersonnel(perimetre, params, 'emp_code');
    if (condPerimetre) conditions.push(condPerimetre);
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
      WITH dynamic_shifts AS (
        SELECT
          p.pin::text AS emp_code,
          p.last_name::text AS last_name,
          p.name::text AS first_name,
          COALESCE(d.name, 'Sans département')::text AS dept_name,
          a.date_service AS jour,
          to_char(a.heure_entree, 'HH24:MI')::text AS premier_pointage,
          to_char(a.heure_sortie, 'HH24:MI')::text AS dernier_pointage,
          (CASE 
            WHEN a.heure_sortie IS NOT NULL THEN 2 
            WHEN a.heure_entree IS NOT NULL THEN 1 
            ELSE 0 
          END)::int AS nb_pointages,
          (CASE 
            WHEN a.heure_sortie IS NOT NULL AND a.heure_entree IS NOT NULL 
            THEN ROUND(EXTRACT(EPOCH FROM (a.heure_sortie - a.heure_entree)) / 60)::int
            ELSE 0 
          END)::int AS temps_presence_min,
          (CASE
            WHEN a.statut = 'en_cours' THEN 'En cours — sortie attendue'
            WHEN a.statut = 'termine' THEN 'Terminé'
            ELSE a.statut
          END)::text AS statut_presence,
          COALESCE(h.period_name, 'Horaire non défini')::text AS horaire
        FROM affectations_horaires_dynamiques a
        JOIN pers_person p ON p.id = a.cvaccess_person_id
        LEFT JOIN cvaccess_horaires h ON h.cvaccess_horaire_id = a.cvaccess_horaire_id
        LEFT JOIN auth_department d ON d.id = p.auth_dept_id
        WHERE a.heure_entree IS NOT NULL ${andShift}
      ),
      t AS (
        SELECT
          pers_person_pin::text AS pin,
          att_datetime,
          CAST(att_datetime AS DATE) AS jour,
          ROW_NUMBER() OVER (PARTITION BY pers_person_pin, CAST(att_datetime AS DATE) ORDER BY att_datetime) AS rn,
          LEAD(att_datetime) OVER (PARTITION BY pers_person_pin, CAST(att_datetime AS DATE) ORDER BY att_datetime) AS nxt
        FROM att_transaction
        ${whereT}
      ),
      calc AS (
        SELECT pin, jour,
               CAST(ROUND(SUM(EXTRACT(EPOCH FROM (nxt - att_datetime)) / 60)) AS INT) AS minutes
        FROM t
        WHERE rn % 2 = 1 AND nxt IS NOT NULL
        GROUP BY pin, jour
      ),
      standard_v AS (
        SELECT
          p.emp_code::text AS emp_code,
          COALESCE(p.last_name, MAX(p.last_name) OVER (PARTITION BY p.emp_code))::text AS last_name,
          COALESCE(p.first_name, MAX(p.first_name) OVER (PARTITION BY p.emp_code))::text AS first_name,
          COALESCE(p.dept_name, MAX(p.dept_name) OVER (PARTITION BY p.emp_code))::text AS dept_name,
          p.jour,
          p.premier_pointage::text AS premier_pointage,
          p.dernier_pointage::text AS dernier_pointage,
          p.nb_pointages::int AS nb_pointages,
          (CASE WHEN COALESCE(p.temps_presence_min, 0) > 0 THEN p.temps_presence_min
               ELSE COALESCE(c.minutes, 0) END)::int AS temps_presence_min,
          (CASE
            WHEN p.statut_presence IS NOT NULL AND p.statut_presence <> 'noSch' THEN p.statut_presence
            WHEN GREATEST(COALESCE(p.temps_presence_min, 0), COALESCE(c.minutes, 0)) > 0 THEN 'Présent'
            WHEN p.nb_pointages > 0 THEN 'Pointage incomplet'
            ELSE p.statut_presence
          END)::text AS statut_presence,
          COALESCE(p.profil_horaire, 'Horaire non défini')::text AS horaire
        FROM v_presence_jour p
        LEFT JOIN calc c ON c.pin = p.emp_code::text AND c.jour = p.jour
        WHERE NOT EXISTS (
          SELECT 1 
          FROM affectations_horaires_dynamiques a
          JOIN pers_person per ON per.id = a.cvaccess_person_id
          WHERE per.pin::text = p.emp_code::text
            AND (
              a.date_service = p.jour
              OR (
                a.date_service = p.jour - 1
                AND a.fin_prevue::date = p.jour
                AND to_char(a.heure_sortie, 'HH24:MI') = p.premier_pointage
              )
            )
        )
      ),
      unifie AS (
        SELECT * FROM dynamic_shifts
        UNION ALL
        SELECT * FROM standard_v
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
        statut_presence,
        horaire
      FROM unifie
      ${where}
      ORDER BY unifie.jour DESC, last_name, first_name
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
