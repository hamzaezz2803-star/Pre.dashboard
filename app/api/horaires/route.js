import { NextResponse } from 'next/server';
import { exigerRole } from '@/lib/auth';
import { targetPool } from '@/lib/db';
import { obtenirHoraires, estHoraireNuit } from '@/lib/horaires';

/**
 * GET /api/horaires
 * Retourne la liste complète des horaires configurés.
 */
export async function GET() {
  const auth = await exigerRole('admin', 'super_admin');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const horaires = await obtenirHoraires();
    return NextResponse.json({ horaires });
  } catch (error) {
    console.error('[API Horaires GET] Erreur:', error);
    return NextResponse.json({ error: 'Erreur lors de la récupération des horaires.' }, { status: 500 });
  }
}

/**
 * POST /api/horaires
 * Ajoute un nouvel horaire de travail.
 */
export async function POST(request) {
  const auth = await exigerRole('admin', 'super_admin');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json();
    const { code, nom, heure_debut, heure_fin, description } = body;

    if (!code || !nom || !heure_debut || !heure_fin) {
      return NextResponse.json(
        { error: 'Veuillez renseigner le code, le libellé, l\'heure de début et l\'heure de fin.' },
        { status: 400 }
      );
    }

    const estNuit = estHoraireNuit(heure_debut, heure_fin);

    const query = `
      INSERT INTO horaires_config (code, nom, heure_debut, heure_fin, est_nuit, description)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *;
    `;
    const values = [code.trim().toUpperCase(), nom.trim(), heure_debut.trim(), heure_fin.trim(), estNuit, description?.trim() || null];

    const result = await targetPool.query(query, values);
    return NextResponse.json({ horaire: result.rows[0], message: 'Horaire ajouté avec succès.' }, { status: 201 });
  } catch (error) {
    console.error('[API Horaires POST] Erreur:', error);
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Ce code horaire existe déjà. Choisissez un code unique (ex: H004).' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Erreur lors de l\'enregistrement de l\'horaire.' }, { status: 500 });
  }
}

/**
 * PUT /api/horaires
 * Modifie un horaire existant.
 */
export async function PUT(request) {
  const auth = await exigerRole('admin', 'super_admin');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json();
    const { id, code, nom, heure_debut, heure_fin, description } = body;

    if (!id || !code || !nom || !heure_debut || !heure_fin) {
      return NextResponse.json(
        { error: 'Paramètres incomplets pour la modification de l\'horaire.' },
        { status: 400 }
      );
    }

    const estNuit = estHoraireNuit(heure_debut, heure_fin);

    const query = `
      UPDATE horaires_config
      SET code = $1, nom = $2, heure_debut = $3, heure_fin = $4, est_nuit = $5, description = $6, updated_at = NOW()
      WHERE id = $7
      RETURNING *;
    `;
    const values = [code.trim().toUpperCase(), nom.trim(), heure_debut.trim(), heure_fin.trim(), estNuit, description?.trim() || null, id];

    const result = await targetPool.query(query, values);
    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Horaire introuvable.' }, { status: 404 });
    }

    return NextResponse.json({ horaire: result.rows[0], message: 'Horaire modifié avec succès.' });
  } catch (error) {
    console.error('[API Horaires PUT] Erreur:', error);
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Ce code horaire est déjà utilisé par un autre créneau.' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Erreur lors de la mise à jour de l\'horaire.' }, { status: 500 });
  }
}

/**
 * DELETE /api/horaires?id=
 * Supprime un horaire après confirmation.
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
      return NextResponse.json({ error: 'Identifiant de l\'horaire manquant.' }, { status: 400 });
    }

    const result = await targetPool.query('DELETE FROM horaires_config WHERE id = $1 RETURNING id, code', [id]);
    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Horaire introuvable ou déjà supprimé.' }, { status: 404 });
    }

    return NextResponse.json({ message: 'Horaire supprimé avec succès.', deleted: result.rows[0] });
  } catch (error) {
    console.error('[API Horaires DELETE] Erreur:', error);
    return NextResponse.json({ error: 'Erreur lors de la suppression de l\'horaire.' }, { status: 500 });
  }
}
