import { NextResponse } from 'next/server';
import { targetPool } from '@/lib/db';
import { exigerRole } from '@/lib/auth';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /api/rapport-presences?debut=YYYY-MM-DD&fin=YYYY-MM-DD&q=...
 * Retourne les lignes du rapport des présences associées aux horaires affectés.
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
    const q = searchParams.get('q')?.trim() || '';

    if ((debut && !ISO_DATE.test(debut)) || (fin && !ISO_DATE.test(fin))) {
      return NextResponse.json({ error: 'Format de date invalide (YYYY-MM-DD attendu).' }, { status: 400 });
    }

    const conditions = ['pointage_timestamp IS NOT NULL'];
    const params = [];

    if (debut) {
      params.push(debut);
      conditions.push(`date_service >= $${params.length}`);
    }

    if (fin) {
      params.push(fin);
      conditions.push(`date_service <= $${params.length}`);
    }

    if (q) {
      params.push(`%${q}%`);
      const pIdx = `$${params.length}`;
      conditions.push(`(
        emp_id ILIKE ${pIdx} OR 
        nom_employe ILIKE ${pIdx}
      )`);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const query = `
      WITH dyn_services AS (
        SELECT 
          p.pin::text AS emp_id,
          TRIM(CONCAT(p.last_name, ' ', p.name))::text AS nom_employe,
          a.heure_entree AS pointage_timestamp,
          a.date_service AS date_service,
          COALESCE(h.period_name, 'Horaire non défini')::text AS horaire_affecte,
          COALESCE(d.name, 'Sans département')::text AS departement
        FROM affectations_horaires_dynamiques a
        JOIN pers_person p ON p.id = a.cvaccess_person_id
        LEFT JOIN cvaccess_horaires h ON h.cvaccess_horaire_id = a.cvaccess_horaire_id
        LEFT JOIN auth_department d ON d.id = p.auth_dept_id
        WHERE a.heure_entree IS NOT NULL
      ),
      standard_services AS (
        SELECT 
          COALESCE(p.pin, pj.id)::text AS emp_id,
          TRIM(CONCAT(COALESCE(p.last_name, pj.nom), ' ', COALESCE(p.name, pj.prenom)))::text AS nom_employe,
          pj.premier_pointage AS pointage_timestamp,
          pj.date_pointage AS date_service,
          'Horaire non défini'::text AS horaire_affecte,
          COALESCE(d.name, pj.departement, 'Sans département')::text AS departement
        FROM pointage_journalier pj
        LEFT JOIN pers_person p ON p.pin = pj.id
        LEFT JOIN auth_department d ON d.id = p.auth_dept_id
        WHERE pj.premier_pointage IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM affectations_horaires_dynamiques a 
            WHERE a.cvaccess_person_id = p.id 
              AND (
                a.date_service = pj.date_pointage 
                OR (
                  a.date_service = pj.date_pointage - 1 
                  AND a.fin_prevue::date = pj.date_pointage
                  AND a.heure_sortie = pj.premier_pointage
                )
              )
          )
      ),
      combined AS (
        SELECT * FROM dyn_services
        UNION ALL
        SELECT * FROM standard_services
      )
      SELECT 
        emp_id,
        nom_employe,
        TO_CHAR(pointage_timestamp, 'YYYY-MM-DD HH24:MI') AS heure_pointage,
        horaire_affecte,
        date_service::text,
        departement
      FROM combined
      ${whereClause}
      ORDER BY pointage_timestamp DESC;
    `;

    const { rows } = await targetPool.query(query, params);

    // Calcul des statistiques rapides
    let totalReconnus = 0;
    let totalNonDefinis = 0;

    for (const r of rows) {
      if (r.horaire_affecte === 'Horaire non défini') {
        totalNonDefinis++;
      } else {
        totalReconnus++;
      }
    }

    return NextResponse.json({
      rows,
      stats: {
        total: rows.length,
        reconnus: totalReconnus,
        nonDefinis: totalNonDefinis,
      },
    });
  } catch (err) {
    console.error('[API Rapport Présences] Erreur :', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erreur lors de la génération du rapport.' },
      { status: 500 }
    );
  }
}
