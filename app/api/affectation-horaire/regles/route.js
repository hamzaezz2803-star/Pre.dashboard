import { NextResponse } from 'next/server';
import { targetPool } from '@/lib/db';
import { exigerRole } from '@/lib/auth';

/**
 * Fonction de conversion d'une heure "HH:mm" en minutes depuis 00:00.
 */
function timeToMinutes(t) {
  if (!t) return 0;
  const [h, m] = t.slice(0, 5).split(':').map(Number);
  return h * 60 + (m || 0);
}

/**
 * Vérifie si deux plages de pointage se chevauchent.
 * Gère les plages standard (ex: 07:00 à 08:59) et celles qui traversent minuit (ex: 21:00 à 02:00).
 */
function chevauchementPlages(debutA, finA, debutB, finB) {
  const minDebA = timeToMinutes(debutA);
  const minFinA = timeToMinutes(finA);
  const minDebB = timeToMinutes(debutB);
  const minFinB = timeToMinutes(finB);

  // Intervalle A
  const intervallesA = minFinA >= minDebA
    ? [[minDebA, minFinA]]
    : [[minDebA, 1440], [0, minFinA]];

  // Intervalle B
  const intervallesB = minFinB >= minDebB
    ? [[minDebB, minFinB]]
    : [[minDebB, 1440], [0, minFinB]];

  for (const [startA, endA] of intervallesA) {
    for (const [startB, endB] of intervallesB) {
      if (Math.max(startA, startB) < Math.min(endA, endB)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * GET /api/affectation-horaire/regles
 * Retourne la liste des règles de reconnaissance horaire depuis la table horaires,
 * associées aux informations officielles de cvaccess_horaires.
 */
export async function GET() {
  const auth = await exigerRole('admin', 'super_admin');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const query = `
      SELECT 
        h.id,
        h.heure_debut::text,
        h.heure_fin::text,
        h.cvaccess_horaire_id,
        h.actif,
        h.date_creation,
        c.period_name,
        c.to_work_time::text,
        c.off_work_time::text,
        c.working_hours
      FROM horaires h
      LEFT JOIN cvaccess_horaires c ON c.cvaccess_horaire_id = h.cvaccess_horaire_id
      ORDER BY h.heure_debut ASC;
    `;

    const { rows } = await targetPool.query(query);

    const reglesFormatees = rows.map((r) => {
      const debutPtg = (r.heure_debut || '').slice(0, 5);
      const finPtg = (r.heure_fin || '').slice(0, 5);
      const travailDebut = (r.to_work_time || '').slice(0, 5);
      const travailFin = (r.off_work_time || '').slice(0, 5);

      let estNuitTravail = false;
      if (travailDebut && travailFin) {
        const [hD, mD] = travailDebut.split(':').map(Number);
        const [hF, mF] = travailFin.split(':').map(Number);
        estNuitTravail = hF * 60 + mF <= hD * 60 + mD;
      }

      return {
        id: Number(r.id),
        heure_debut: debutPtg,
        heure_fin: finPtg,
        cvaccess_horaire_id: r.cvaccess_horaire_id,
        actif: Boolean(r.actif),
        date_creation: r.date_creation,
        period_name: r.period_name || 'Horaire non spécifié',
        to_work_time: travailDebut,
        off_work_time: travailFin,
        working_hours: r.working_hours,
        est_nuit: estNuitTravail,
      };
    });

    return NextResponse.json({ regles: reglesFormatees });
  } catch (err) {
    console.error('[API Règles Horaires GET] Erreur :', err?.message);
    return NextResponse.json(
      { error: 'Erreur lors du chargement des règles horaires.', regles: [] },
      { status: 500 }
    );
  }
}

/**
 * POST /api/affectation-horaire/regles
 * Crée une nouvelle règle de reconnaissance horaire dans la table horaires.
 */
export async function POST(request) {
  const auth = await exigerRole('admin', 'super_admin');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json();
    const { heure_debut, heure_fin, cvaccess_horaire_id } = body;

    if (!heure_debut || !heure_fin || !cvaccess_horaire_id) {
      return NextResponse.json(
        { error: 'Veuillez renseigner l\'heure de début, l\'heure de fin et sélectionner un horaire.' },
        { status: 400 }
      );
    }

    // Contrôle d'existence de l'horaire CVAccess
    const checkHoraire = await targetPool.query(
      'SELECT cvaccess_horaire_id, period_name FROM cvaccess_horaires WHERE cvaccess_horaire_id = $1',
      [cvaccess_horaire_id]
    );

    if (checkHoraire.rows.length === 0) {
      return NextResponse.json(
        { error: 'L\'horaire sélectionné est introuvable dans la table cvaccess_horaires.' },
        { status: 400 }
      );
    }

    // Récupérer les règles existantes pour détecter les doublons et chevauchements
    const existingRules = await targetPool.query(
      'SELECT id, heure_debut::text, heure_fin::text, cvaccess_horaire_id, actif FROM horaires WHERE actif = true'
    );

    // Vérification des doublons exacts
    const doublon = existingRules.rows.find(
      (r) =>
        r.heure_debut.slice(0, 5) === heure_debut.slice(0, 5) &&
        r.heure_fin.slice(0, 5) === heure_fin.slice(0, 5)
    );
    if (doublon) {
      return NextResponse.json(
        { error: 'Une règle active avec exactement la même plage horaire existe déjà.' },
        { status: 409 }
      );
    }

    // Vérification des chevauchements (avertissement ou blocage)
    const chevauchement = existingRules.rows.find((r) =>
      chevauchementPlages(heure_debut, heure_fin, r.heure_debut, r.heure_fin)
    );
    if (chevauchement) {
      return NextResponse.json(
        {
          error: `Attention, cette plage (${heure_debut} - ${heure_fin}) chevauche une règle existante active (${chevauchement.heure_debut.slice(0, 5)} - ${chevauchement.heure_fin.slice(0, 5)}). Veuillez ajuster les créneaux.`,
        },
        { status: 409 }
      );
    }

    const insertQuery = `
      INSERT INTO horaires (heure_debut, heure_fin, cvaccess_horaire_id, actif, date_creation)
      VALUES ($1, $2, $3, true, NOW())
      RETURNING id, heure_debut::text, heure_fin::text, cvaccess_horaire_id, actif, date_creation;
    `;

    const res = await targetPool.query(insertQuery, [heure_debut, heure_fin, cvaccess_horaire_id]);

    return NextResponse.json(
      {
        message: 'Règle horaire enregistrée avec succès.',
        regle: res.rows[0],
      },
      { status: 201 }
    );
  } catch (err) {
    console.error('[API Règles Horaires POST] Erreur :', err?.message);
    return NextResponse.json(
      { error: err?.message || 'Erreur lors de l\'enregistrement de la règle horaire.' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/affectation-horaire/regles
 * Modifie une règle existante dans la table horaires.
 */
export async function PUT(request) {
  const auth = await exigerRole('admin', 'super_admin');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json();
    const { id, heure_debut, heure_fin, cvaccess_horaire_id, actif } = body;

    if (!id || !heure_debut || !heure_fin || !cvaccess_horaire_id) {
      return NextResponse.json(
        { error: 'Paramètres incomplets pour la modification de la règle.' },
        { status: 400 }
      );
    }

    // Vérifier les chevauchements avec d'autres règles actives (sauf elle-même)
    const existingRules = await targetPool.query(
      'SELECT id, heure_debut::text, heure_fin::text, cvaccess_horaire_id, actif FROM horaires WHERE actif = true AND id != $1',
      [id]
    );

    const chevauchement = existingRules.rows.find((r) =>
      chevauchementPlages(heure_debut, heure_fin, r.heure_debut, r.heure_fin)
    );
    if (chevauchement && actif !== false) {
      return NextResponse.json(
        {
          error: `Cette modification chevauche une règle existante active (${chevauchement.heure_debut.slice(0, 5)} - ${chevauchement.heure_fin.slice(0, 5)}).`,
        },
        { status: 409 }
      );
    }

    const updateQuery = `
      UPDATE horaires
      SET heure_debut = $1, heure_fin = $2, cvaccess_horaire_id = $3, actif = COALESCE($4, actif)
      WHERE id = $5
      RETURNING id, heure_debut::text, heure_fin::text, cvaccess_horaire_id, actif;
    `;

    const res = await targetPool.query(updateQuery, [
      heure_debut,
      heure_fin,
      cvaccess_horaire_id,
      actif,
      id,
    ]);

    if (res.rows.length === 0) {
      return NextResponse.json({ error: 'Règle horaire introuvable.' }, { status: 404 });
    }

    return NextResponse.json({
      message: 'Règle horaire modifiée avec succès.',
      regle: res.rows[0],
    });
  } catch (err) {
    console.error('[API Règles Horaires PUT] Erreur :', err?.message);
    return NextResponse.json(
      { error: err?.message || 'Erreur lors de la mise à jour de la règle horaire.' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/affectation-horaire/regles
 * Bascule le statut actif/inactif d'une règle.
 */
export async function PATCH(request) {
  const auth = await exigerRole('admin', 'super_admin');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Identifiant de la règle manquant.' }, { status: 400 });
    }

    const query = `
      UPDATE horaires
      SET actif = NOT actif
      WHERE id = $1
      RETURNING id, actif;
    `;

    const res = await targetPool.query(query, [id]);
    if (res.rows.length === 0) {
      return NextResponse.json({ error: 'Règle introuvable.' }, { status: 404 });
    }

    return NextResponse.json({
      message: `Règle horaire ${res.rows[0].actif ? 'activée' : 'désactivée'} avec succès.`,
      actif: res.rows[0].actif,
    });
  } catch (err) {
    console.error('[API Règles Horaires PATCH] Erreur :', err?.message);
    return NextResponse.json(
      { error: err?.message || 'Erreur lors du changement de statut.' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/affectation-horaire/regles?id=
 * Supprime une règle horaire.
 */
export async function DELETE(request) {
  const auth = await exigerRole('admin', 'super_admin');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Identifiant manquant.' }, { status: 400 });
    }

    const res = await targetPool.query('DELETE FROM horaires WHERE id = $1 RETURNING id', [id]);
    if (res.rows.length === 0) {
      return NextResponse.json({ error: 'Règle introuvable ou déjà supprimée.' }, { status: 404 });
    }

    return NextResponse.json({ message: 'Règle horaire supprimée avec succès.' });
  } catch (err) {
    console.error('[API Règles Horaires DELETE] Erreur :', err?.message);
    return NextResponse.json(
      { error: err?.message || 'Erreur lors de la suppression de la règle.' },
      { status: 500 }
    );
  }
}
