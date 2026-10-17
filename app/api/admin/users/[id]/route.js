import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { targetPool } from '@/lib/db';
import { exigerRole } from '@/lib/auth';

/**
 * Route PATCH /api/admin/users/[id]
 * Modifie un utilisateur (nom complet, rôle, statut actif) ou réinitialise son mot de passe.
 * Règles appliquées :
 * - Rôle super_admin obligatoire
 * - Un super_admin ne peut pas se désactiver ni se retirer son rôle
 * - Il doit toujours exister au moins un super_admin actif
 * - Mot de passe haché avec bcrypt (12 tours), jamais renvoyé
 */
export async function PATCH(request, context) {
  const auth = await exigerRole('super_admin');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const params = await context.params;
  const targetId = parseInt(params.id, 10);
  if (isNaN(targetId)) {
    return NextResponse.json({ error: 'Identifiant invalide.' }, { status: 400 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Corps de requête JSON invalide.' }, { status: 400 });
  }

  try {
    // Vérifier l'existence de l'utilisateur cible
    const targetRes = await targetPool.query(
      'SELECT id, username, full_name, role, active FROM users WHERE id = $1;',
      [targetId]
    );

    if (targetRes.rows.length === 0) {
      return NextResponse.json({ error: 'Utilisateur introuvable.' }, { status: 404 });
    }

    const targetUser = targetRes.rows[0];
    const currentUserId = auth.id;

    const { full_name, role, active, password } = body;

    // Règle 1 : Un super_admin ne peut pas se désactiver ni se retirer son rôle
    if (targetId === currentUserId) {
      if (active === false) {
        return NextResponse.json(
          { error: 'Vous ne pouvez pas désactiver votre propre compte.' },
          { status: 400 }
        );
      }
      if (role !== undefined && role !== 'super_admin') {
        return NextResponse.json(
          { error: 'Vous ne pouvez pas vous retirer le rôle super_admin.' },
          { status: 400 }
        );
      }
    }

    // Règle 2 : Il doit toujours exister au moins un super_admin actif
    const isTargetActiveSuperAdmin = targetUser.role === 'super_admin' && targetUser.active;
    const willDeactivate = active === false;
    const willDemote = role !== undefined && role !== 'super_admin';

    if (isTargetActiveSuperAdmin && (willDeactivate || willDemote)) {
      const countRes = await targetPool.query(
        "SELECT COUNT(*) AS count FROM users WHERE role = 'super_admin' AND active = true;"
      );
      const activeSuperCount = parseInt(countRes.rows[0]?.count || '0', 10);
      if (activeSuperCount <= 1) {
        return NextResponse.json(
          {
            error:
              'Opération impossible : il doit toujours exister au moins un super_admin actif dans le système.',
          },
          { status: 400 }
        );
      }
    }

    // Préparation des champs à mettre à jour
    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (full_name !== undefined) {
      updates.push(`full_name = $${paramIndex++}`);
      values.push(typeof full_name === 'string' ? full_name.trim() : null);
    }

    if (role !== undefined) {
      if (!['admin', 'super_admin'].includes(role)) {
        return NextResponse.json(
          { error: 'Le rôle doit être "admin" ou "super_admin".' },
          { status: 400 }
        );
      }
      updates.push(`role = $${paramIndex++}`);
      values.push(role);
    }

    if (active !== undefined) {
      updates.push(`active = $${paramIndex++}`);
      values.push(Boolean(active));
    }

    if (password !== undefined) {
      if (typeof password !== 'string' || password.length < 6) {
        return NextResponse.json(
          { error: 'Le nouveau mot de passe doit contenir au moins 6 caractères.' },
          { status: 400 }
        );
      }
      // Hachage bcrypt 12 tours
      const password_hash = await bcrypt.hash(password, 12);
      updates.push(`password_hash = $${paramIndex++}`);
      values.push(password_hash);
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'Aucun champ valide à mettre à jour.' }, { status: 400 });
    }

    updates.push(`updated_at = NOW()`);
    values.push(targetId);

    const query = `
      UPDATE users
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING id, username, full_name, role, active, created_at, updated_at;
    `;

    const updateRes = await targetPool.query(query, values);
    return NextResponse.json(updateRes.rows[0]);
  } catch (error) {
    console.error('[API Admin Users PATCH] Erreur :', error?.message);
    return NextResponse.json(
      { error: 'Erreur lors de la mise à jour de l\'utilisateur.' },
      { status: 500 }
    );
  }
}

/**
 * Route DELETE /api/admin/users/[id]
 * Supprime définitivement un utilisateur.
 * Règles appliquées :
 * - Rôle super_admin obligatoire
 * - Un super_admin ne peut pas se supprimer lui-même
 * - Ne peut pas supprimer le dernier super_admin actif
 */
export async function DELETE(_request, context) {
  const auth = await exigerRole('super_admin');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const params = await context.params;
  const targetId = parseInt(params.id, 10);
  if (isNaN(targetId)) {
    return NextResponse.json({ error: 'Identifiant invalide.' }, { status: 400 });
  }

  try {
    const targetRes = await targetPool.query(
      'SELECT id, username, role, active FROM users WHERE id = $1;',
      [targetId]
    );

    if (targetRes.rows.length === 0) {
      return NextResponse.json({ error: 'Utilisateur introuvable.' }, { status: 404 });
    }

    const targetUser = targetRes.rows[0];
    const currentUserId = auth.id;

    // Règle 1 : Un super_admin ne peut pas se supprimer lui-même
    if (targetId === currentUserId) {
      return NextResponse.json(
        { error: 'Vous ne pouvez pas supprimer votre propre compte.' },
        { status: 400 }
      );
    }

    // Règle 2 : Il doit toujours exister au moins un super_admin actif
    if (targetUser.role === 'super_admin' && targetUser.active) {
      const countRes = await targetPool.query(
        "SELECT COUNT(*) AS count FROM users WHERE role = 'super_admin' AND active = true;"
      );
      const activeSuperCount = parseInt(countRes.rows[0]?.count || '0', 10);
      if (activeSuperCount <= 1) {
        return NextResponse.json(
          {
            error:
              'Opération impossible : vous ne pouvez pas supprimer le dernier super_admin actif.',
          },
          { status: 400 }
        );
      }
    }

    await targetPool.query('DELETE FROM users WHERE id = $1;', [targetId]);

    return NextResponse.json({
      success: true,
      message: 'Utilisateur supprimé avec succès.',
    });
  } catch (error) {
    console.error('[API Admin Users DELETE] Erreur :', error?.message);
    return NextResponse.json(
      { error: 'Erreur lors de la suppression de l\'utilisateur.' },
      { status: 500 }
    );
  }
}
