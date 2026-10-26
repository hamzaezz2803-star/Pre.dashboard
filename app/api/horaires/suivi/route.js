import { NextResponse } from 'next/server';
import { getBiotimePool } from '@/lib/biotime-db';
import { exigerRole } from '@/lib/auth';
import { obtenirHoraires, determinerHoraireDynamique } from '@/lib/horaires';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Route GET /api/horaires/suivi
 * Récupère les présences avec affectation dynamique des horaires et détection visuelle des postes de nuit.
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
    const filterHoraire = searchParams.get('horaire')?.trim() || 'all';
    const filterStatut = searchParams.get('statut')?.trim() || 'all';

    if ((debut && !ISO_DATE.test(debut)) || (fin && !ISO_DATE.test(fin))) {
      return NextResponse.json({ error: 'Format de date invalide.' }, { status: 400 });
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
          ` OR (first_name || ' ' || last_name) ILIKE ${p} OR (last_name || ' ' || first_name) ILIKE ${p})`
      );
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const { rows: rawRows } = await getBiotimePool().query(
      `
      WITH t AS (
        SELECT
          pers_person_pin::text AS pin,
          att_datetime AS dt
        FROM att_transaction
      ),
      t_agg AS (
        SELECT
          pin,
          dt::date AS j,
          COUNT(*) AS nb,
          MIN(dt)::time(0)::text AS min_time,
          MAX(dt)::time(0)::text AS max_time,
          ROUND(EXTRACT(EPOCH FROM (MAX(dt) - MIN(dt))) / 60)::int AS delta_min
        FROM t
        GROUP BY pin, dt::date
      )
      SELECT
        v.emp_code,
        COALESCE(v.last_name, n.last_name) AS last_name,
        COALESCE(v.first_name, n.first_name) AS first_name,
        COALESCE(v.dept_name, n.dept_name) AS dept_name,
        TO_CHAR(v.jour, 'YYYY-MM-DD') AS jour,
        COALESCE(v.premier_pointage, t_agg.min_time) AS premier_pointage,
        COALESCE(v.dernier_pointage, t_agg.max_time) AS dernier_pointage,
        COALESCE(v.nb_pointages, t_agg.nb, 0) AS nb_pointages,
        COALESCE(v.temps_presence_min, CASE WHEN t_agg.nb > 1 THEN t_agg.delta_min ELSE 0 END) AS temps_presence_min,
        v.statut_presence
      FROM v_presence_jour v
      LEFT JOIN t_agg ON t_agg.pin = v.emp_code::text AND t_agg.j = v.jour
      LEFT JOIN LATERAL (
        SELECT last_name, first_name, dept_name
        FROM v_presence_jour x
        WHERE x.emp_code = v.emp_code AND (x.last_name IS NOT NULL OR x.dept_name IS NOT NULL)
        ORDER BY x.jour DESC
        LIMIT 1
      ) n ON TRUE
      ${where}
      ORDER BY v.jour DESC, v.emp_code ASC
      LIMIT 1000;
      `,
      params
    );

    // Récupération des horaires configurés
    const listeHoraires = await obtenirHoraires();

    // Map pour détection et regroupement visuel des services de nuit (J -> J+1)
    // On repère pour un employé si une entrée tardive (>= 20:00) a une sortie le lendemain matin (<= 10:00)
    const rowKey = (emp, jour) => `${emp}_${jour}`;
    const rowsByEmpDate = new Map();
    for (const r of rawRows) {
      rowsByEmpDate.set(rowKey(r.emp_code, r.jour), r);
    }

    // Passe 1 : identifier les couples de service de nuit (J entrée tardive + J+1 sortie matin)
    const nightShiftMap = new Map();
    const treatedAsNightCheckout = new Set();

    for (const r of rawRows) {
      const p1 = r.premier_pointage ? r.premier_pointage.slice(0, 5) : null;
      if (!p1) continue;
      const h = parseInt(p1.split(':')[0], 10);
      if (h >= 20) {
        const currentDay = new Date(r.jour + 'T00:00:00Z');
        const nextDay = new Date(currentDay);
        nextDay.setUTCDate(nextDay.getUTCDate() + 1);
        const nextDayStr = nextDay.toISOString().split('T')[0];
        const nextDayRow = rowsByEmpDate.get(rowKey(r.emp_code, nextDayStr));
        if (nextDayRow && nextDayRow.premier_pointage) {
          const hNext = parseInt(nextDayRow.premier_pointage.slice(0, 5).split(':')[0], 10);
          if (hNext <= 10 && Number(nextDayRow.nb_pointages || 1) <= 2) {
            nightShiftMap.set(rowKey(r.emp_code, r.jour), { nextDayStr, nextDayRow });
            treatedAsNightCheckout.add(rowKey(r.emp_code, nextDayStr));
          }
        }
      }
    }

    const processedRows = [];

    for (let i = 0; i < rawRows.length; i++) {
      const r = rawRows[i];

      // Si ce pointage est la sortie matinale d'un service de nuit commencé la veille,
      // il a été unifié sur la date de service initiale
      if (treatedAsNightCheckout.has(rowKey(r.emp_code, r.jour))) {
        continue;
      }

      const p1 = r.premier_pointage ? r.premier_pointage.slice(0, 5) : null;
      const p2 = r.dernier_pointage ? r.dernier_pointage.slice(0, 5) : null;

      let horaire = determinerHoraireDynamique(p1, p2, listeHoraires);
      let dateEntree = r.jour;
      let heureEntree = p1;
      let dateSortie = r.jour;
      let heureSortie = p2;
      let dureeMinutes = r.temps_presence_min || 0;
      let isNightShift = false;
      let nightShiftBadge = null;

      const nightData = nightShiftMap.get(rowKey(r.emp_code, r.jour));
      if (nightData) {
        // Regroupement visuel sur la journée de service de début
        isNightShift = true;
        dateSortie = nightData.nextDayStr;
        heureSortie = (nightData.nextDayRow.dernier_pointage || nightData.nextDayRow.premier_pointage).slice(0, 5);
        horaire = {
          code: 'H003',
          nom: 'Nuit',
          libelle: 'H003 Nuit',
          heureDebut: '22:00',
          heureFin: '06:00',
          estNuit: true,
          conforme: true,
        };

        // Calcul durée traversant minuit
        const [hE, mE] = (heureEntree || '22:00').split(':').map(Number);
        const [hS, mS] = (heureSortie || '06:00').split(':').map(Number);
        const diffMinutes = (24 * 60 - (hE * 60 + mE)) + (hS * 60 + mS);
        dureeMinutes = diffMinutes > 0 ? diffMinutes : (r.temps_presence_min || 480);
        nightShiftBadge = 'Nuit (J+1)';
      } else if (horaire.estNuit) {
        isNightShift = true;
        nightShiftBadge = 'Nuit';
      }

      // Détermination du statut dynamique
      let statut = 'Présent';
      if (!p1 && !p2) {
        statut = 'Absent';
      } else if (r.statut_presence && r.statut_presence.toLowerCase().includes('absent') && (!r.temps_presence_min || Number(r.temps_presence_min) === 0)) {
        statut = 'Absent';
      } else if (p1 && (!p2 || p1 === p2) && !isNightShift) {
        statut = 'Pointage incomplet';
      } else if (horaire.code === 'NON_DEFINI') {
        statut = 'Horaire non défini';
      } else if (horaire.heureDebut && p1) {
        // Vérification du retard (ex: > 15 min après heureDebut)
        const [hDeb, mDeb] = horaire.heureDebut.split(':').map(Number);
        const [hP1, mP1] = p1.split(':').map(Number);
        const retardMinutes = (hP1 * 60 + mP1) - (hDeb * 60 + mDeb);
        if (retardMinutes > 15 && (!isNightShift || hP1 >= 20)) {
          statut = 'Retard';
        }
      }

      // Filtre sur l'horaire si demandé
      if (filterHoraire !== 'all') {
        if (filterHoraire === 'NON_DEFINI' && horaire.code !== 'NON_DEFINI') continue;
        if (filterHoraire !== 'NON_DEFINI' && horaire.code !== filterHoraire) continue;
      }

      // Filtre sur le statut si demandé
      if (filterStatut !== 'all' && statut.toLowerCase() !== filterStatut.toLowerCase()) {
        continue;
      }

      processedRows.push({
        empCode: r.emp_code,
        nomComplet: `${r.last_name || ''} ${r.first_name || ''}`.trim() || `Employé ${r.emp_code}`,
        lastName: r.last_name,
        firstName: r.first_name,
        deptName: r.dept_name || 'Non affecté',
        dateService: r.jour,
        horaire,
        dateEntree,
        heureEntree,
        dateSortie,
        heureSortie,
        dureeMinutes,
        statut,
        isNightShift,
        nightShiftBadge,
        nbPointages: r.nb_pointages,
      });
    }

    return NextResponse.json({
      rows: processedRows,
      horaires: listeHoraires,
      total: processedRows.length,
    });
  } catch (error) {
    console.error('[API Suivi Horaires] Erreur:', error);
    return NextResponse.json({ error: 'Erreur lors du traitement du suivi des présences.' }, { status: 500 });
  }
}
