import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { targetPool } from '@/lib/db';
import { exigerRole } from '@/lib/auth';
import {
  MESSAGE_MIGRATION_DEPARTEMENTS,
  lireAffectationsDepartements,
  remplacerAffectationsDepartements,
} from '@/lib/perimetre';

/** Avertissement renvoyé lorsqu'un admin n'a aucun département (il ne verra aucune donnée). */
const AVERTISSEMENT_SANS_DEPARTEMENT =
  "Cet administrateur n'a aucun département affecté : il ne verra aucune donnée tant qu'un département ne lui sera pas attribué.";

/**
 * Route PATCH /api/admin/users/[id]
 * Modifie un utilisateur (nom complet, rôle, statut actif, départements) ou réinitialise son mot de passe.
 * Règles appliquées :
 * - Rôle super_admin obligatoire
 * - Un super_admin ne peut pas se désactiver ni se retirer son rôle
 * - Il doit toujours exister au moins un super_admin actif
 * - Mot de passe haché avec bcrypt (12 tours), jamais renvoyé
 * - `departement_ids` remplace le périmètre d'un admin ; un super_admin n'a jamais de périmètre
 *   (accès total implicite) : ses affectations éventuelles sont supprimées à la promotion.
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

  const client = await targetPool.connect();
  try {
    // Vérifier l'existence de l'utilisateur cible
    const targetRes = await client.query(
      'SELECT id, username, full_name, role, active FROM users WHERE id = $1;',
      [targetId]
    );

    if (targetRes.rows.length === 0) {
      return NextResponse.json({ error: 'Utilisateur introuvable.' }, { status: 404 });
    }

    const targetUser = targetRes.rows[0];
    const currentUserId = auth.id;

    const { full_name, role, active, password, departement_ids } = body;

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
      const countRes = await client.query(
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

    // Départements : tableau d'identifiants auth_department
    const veutAffecter = departement_ids !== undefined;
    if (veutAffecter && !Array.isArray(departement_ids)) {
      return NextResponse.json(
        { error: 'departement_ids doit être un tableau d\'identifiants de départements.' },
        { status: 400 }
      );
    }

    if (updates.length === 0 && !veutAffecter) {
      return NextResponse.json({ error: 'Aucun champ valide à mettre à jour.' }, { status: 400 });
    }

    const roleFinal = role !== undefined ? role : targetUser.role;

    await client.query('BEGIN');

    let utilisateur;
    if (updates.length > 0) {
      updates.push(`updated_at = NOW()`);
      values.push(targetId);

      const query = `
        UPDATE users
        SET ${updates.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING id, username, full_name, role, active, created_at, updated_at;
      `;
      const updateRes = await client.query(query, values);
      utilisateur = updateRes.rows[0];
    } else {
      const lecture = await client.query(
        'SELECT id, username, full_name, role, active, created_at, updated_at FROM users WHERE id = $1;',
        [targetId]
      );
      utilisateur = lecture.rows[0];
    }

    // Périmètre de départements
    if (roleFinal === 'super_admin') {
      // Accès total implicite : aucune affectation conservée
      if (targetUser.role !== 'super_admin') {
        await client.query('DELETE FROM utilisateur_departements WHERE utilisateur_id = $1', [targetId]);
      }
    } else if (veutAffecter) {
      await remplacerAffectationsDepartements(client, targetId, departement_ids);
    }

    await client.query('COMMIT');

    // Relecture des affectations pour la réponse
    const reponse = { ...utilisateur, departements: [] };
    if (utilisateur.role === 'admin') {
      const affectations = await lireAffectationsDepartements([targetId]);
      reponse.departements = affectations.get(targetId) ?? [];
      if (reponse.departements.length === 0) {
        reponse.avertissement = AVERTISSEMENT_SANS_DEPARTEMENT;
      }
    }

    return NextResponse.json(reponse);
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {}
    console.error('[API Admin Users PATCH] Erreur :', error?.message);
    if (error?.code === '42P01') {
      return NextResponse.json({ error: MESSAGE_MIGRATION_DEPARTEMENTS }, { status: 500 });
    }
    return NextResponse.json(
      { error: 'Erreur lors de la mise à jour de l\'utilisateur.' },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

/**
 * Route DELETE /api/admin/users/[id]
 * Supprime définitivement un utilisateur (ses affectations de départements sont supprimées en cascade).
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
