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

    const conditions = ['pj.premier_pointage IS NOT NULL'];
    const params = [];

    if (debut) {
      params.push(debut);
      conditions.push(`COALESCE(a.date_service, pj.date_pointage) >= $${params.length}`);
    }

    if (fin) {
      params.push(fin);
      conditions.push(`COALESCE(a.date_service, pj.date_pointage) <= $${params.length}`);
    }

    if (q) {
      params.push(`%${q}%`);
      const pIdx = `$${params.length}`;
      conditions.push(`(
        p.pin ILIKE ${pIdx} OR 
        pj.id ILIKE ${pIdx} OR 
        p.last_name ILIKE ${pIdx} OR 
        p.name ILIKE ${pIdx} OR 
        pj.nom ILIKE ${pIdx} OR 
        pj.prenom ILIKE ${pIdx} OR
        (pj.nom || ' ' || pj.prenom) ILIKE ${pIdx}
      )`);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const query = `
      WITH combined AS (
        SELECT 
          COALESCE(p.pin, pj.id) AS emp_id,
          TRIM(CONCAT(COALESCE(p.last_name, pj.nom), ' ', COALESCE(p.name, pj.prenom))) AS nom_employe,
          COALESCE(a.heure_entree, pj.premier_pointage) AS pointage_timestamp,
          COALESCE(a.date_service, pj.date_pointage) AS date_service,
          COALESCE(h.period_name, 'Horaire non défini') AS horaire_affecte,
          COALESCE(d.name, pj.departement, 'Sans département') AS departement
        FROM pointage_journalier pj
        LEFT JOIN pers_person p ON p.pin = pj.id
        LEFT JOIN affectations_horaires_dynamiques a ON a.cvaccess_person_id = p.id AND a.date_service = pj.date_pointage
        LEFT JOIN cvaccess_horaires h ON h.cvaccess_horaire_id = a.cvaccess_horaire_id
        LEFT JOIN auth_department d ON d.id = p.auth_dept_id
        ${whereClause}
      )
      SELECT 
        emp_id,
        nom_employe,
        TO_CHAR(pointage_timestamp, 'YYYY-MM-DD HH24:MI') AS heure_pointage,
        horaire_affecte,
        date_service::text,
        departement
      FROM combined
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
