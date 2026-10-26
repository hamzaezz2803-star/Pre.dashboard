import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { lireSession } from '@/lib/auth';
import { targetPool } from '@/lib/db';

/**
 * GET /api/auth/profile
 * Renvoie les informations de l'utilisateur connecté.
 */
export async function GET() {
  const session = await lireSession();
  if (!session) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  try {
    const { rows } = await targetPool.query(
      'SELECT id, username, full_name, role, active, created_at, updated_at FROM users WHERE id = $1',
      [session.id]
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 });
    }

    return NextResponse.json({ user: rows[0] });
  } catch (error) {
    console.error('[API Profile GET] Erreur:', error);
    return NextResponse.json({ error: 'Erreur serveur lors de la récupération du profil.' }, { status: 500 });
  }
}

/**
 * PUT /api/auth/profile
 * Permet à l'utilisateur connecté de modifier son nom complet ou son mot de passe.
 */
export async function PUT(request) {
  const session = await lireSession();
  if (!session) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { full_name, current_password, new_password } = body;

    const { rows } = await targetPool.query(
      'SELECT id, username, password_hash FROM users WHERE id = $1 AND active = true',
      [session.id]
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Utilisateur non trouvé ou inactif.' }, { status: 404 });
    }

    const currentUser = rows[0];
    const updates = [];
    const values = [];
    let paramIndex = 1;

    // Mise à jour du nom complet
    if (full_name !== undefined) {
      const sanitizedName = typeof full_name === 'string' ? full_name.trim() : null;
      updates.push(`full_name = $${paramIndex++}`);
      values.push(sanitizedName || null);
    }

    // Changement de mot de passe
    if (new_password) {
      if (!current_password) {
        return NextResponse.json(
          { error: 'Veuillez renseigner votre mot de passe actuel pour le modifier.' },
          { status: 400 }
        );
      }

      const isCurrentValid = await bcrypt.compare(current_password, currentUser.password_hash);
      if (!isCurrentValid) {
        return NextResponse.json(
          { error: 'Le mot de passe actuel est incorrect.' },
          { status: 400 }
        );
      }

      if (typeof new_password !== 'string' || new_password.length < 6) {
        return NextResponse.json(
          { error: 'Le nouveau mot de passe doit contenir au moins 6 caractères.' },
          { status: 400 }
        );
      }

      const hashedNew = await bcrypt.hash(new_password, 12);
      updates.push(`password_hash = $${paramIndex++}`);
      values.push(hashedNew);
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'Aucune modification transmise.' }, { status: 400 });
    }

    updates.push(`updated_at = NOW()`);
    values.push(session.id);

    const query = `
      UPDATE users
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING id, username, full_name, role, active, created_at, updated_at;
    `;

    const result = await targetPool.query(query, values);

    return NextResponse.json({
      message: 'Profil mis à jour avec succès.',
      user: result.rows[0],
    });
  } catch (error) {
    console.error('[API Profile PUT] Erreur:', error);
    return NextResponse.json({ error: 'Erreur lors de la mise à jour du profil.' }, { status: 500 });
  }
}
