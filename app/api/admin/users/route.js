import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { targetPool } from '@/lib/db';
import { exigerRole } from '@/lib/auth';
import {
  MESSAGE_MIGRATION_DEPARTEMENTS,
  lireAffectationsDepartements,
  remplacerAffectationsDepartements,
} from '@/lib/perimetre';

/** Avertissement renvoyé lorsqu'un admin est enregistré sans aucun département (il ne verra aucune donnée). */
const AVERTISSEMENT_SANS_DEPARTEMENT =
  "Cet administrateur n'a aucun département affecté : il ne verra aucune donnée tant qu'un département ne lui sera pas attribué.";

/**
 * Route GET /api/admin/users
 * Retourne la liste de tous les utilisateurs (réservé au super_admin), avec les départements
 * directement affectés à chaque admin (champ `departements`).
 * Ne renvoie JAMAIS les mots de passe ou leurs empreintes (hash).
 */
export async function GET() {
  const auth = await exigerRole('super_admin');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { rows } = await targetPool.query(
      `SELECT id, username, full_name, role, active, created_at, updated_at
       FROM users
       ORDER BY id ASC;`
    );

    // Affectations de départements : si la migration n'est pas encore passée, on liste quand même les comptes
    let affectations = new Map();
    try {
      affectations = await lireAffectationsDepartements(rows.map((u) => u.id));
    } catch (error) {
      if (error?.code === '42P01') {
        console.warn('[API Admin Users] ' + MESSAGE_MIGRATION_DEPARTEMENTS);
      } else {
        throw error;
      }
    }

    return NextResponse.json(
      rows.map((u) => ({
        ...u,
        departements: u.role === 'admin' ? affectations.get(u.id) ?? [] : [],
      }))
    );
  } catch (error) {
    console.error('[API Admin Users] Erreur lecture des utilisateurs :', error?.message);
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des utilisateurs.' },
      { status: 500 }
    );
  }
}

/**
 * Route POST /api/admin/users
 * Crée un nouvel utilisateur avec mot de passe haché par bcrypt (12 tours).
 * Pour un admin, `departement_ids` (tableau d'identifiants auth_department) définit son périmètre.
 * Réservé au super_admin.
 */
export async function POST(request) {
  const auth = await exigerRole('super_admin');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Corps de requête JSON invalide.' }, { status: 400 });
  }

  const { username, full_name, role, password, departement_ids } = body;

  // Validation de l'identifiant
  if (!username || typeof username !== 'string' || username.trim() === '') {
    return NextResponse.json(
      { error: "L'identifiant est obligatoire." },
      { status: 400 }
    );
  }

  // Validation du rôle
  if (!role || !['admin', 'super_admin'].includes(role)) {
    return NextResponse.json(
      { error: 'Le rôle doit être "admin" ou "super_admin".' },
      { status: 400 }
    );
  }

  // Validation du mot de passe provisoire
  if (!password || typeof password !== 'string' || password.length < 6) {
    return NextResponse.json(
      { error: 'Le mot de passe provisoire doit contenir au moins 6 caractères.' },
      { status: 400 }
    );
  }

  // Validation des départements (uniquement pertinents pour un admin)
  if (departement_ids !== undefined && !Array.isArray(departement_ids)) {
    return NextResponse.json(
      { error: 'departement_ids doit être un tableau d\'identifiants de départements.' },
      { status: 400 }
    );
  }

  const cleanUsername = username.trim();
  const cleanFullName = full_name && typeof full_name === 'string' ? full_name.trim() : null;

  const client = await targetPool.connect();
  try {
    // Vérifier l'unicité de l'identifiant
    const checkRes = await client.query(
      'SELECT id FROM users WHERE LOWER(username) = LOWER($1);',
      [cleanUsername]
    );

    if (checkRes.rows.length > 0) {
      return NextResponse.json(
        { error: "Cet identifiant est déjà pris. Veuillez en choisir un autre." },
        { status: 409 }
      );
    }

    // Hachage sécurisé du mot de passe avec bcrypt (12 tours)
    const password_hash = await bcrypt.hash(password, 12);

    await client.query('BEGIN');

    // Insertion en base
    const insertRes = await client.query(
      `INSERT INTO users (username, full_name, password_hash, role, active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, true, NOW(), NOW())
       RETURNING id, username, full_name, role, active, created_at, updated_at;`,
      [cleanUsername, cleanFullName, password_hash, role]
    );
    const created = insertRes.rows[0];

    // Périmètre de départements : uniquement pour un admin (le super_admin a un accès total implicite)
    let departementsEnregistres = [];
    if (role === 'admin') {
      departementsEnregistres = await remplacerAffectationsDepartements(
        client,
        created.id,
        departement_ids || []
      );
    }

    await client.query('COMMIT');

    const reponse = { ...created, departements: [] };
    if (role === 'admin') {
      const affectations = await lireAffectationsDepartements([created.id]);
      reponse.departements = affectations.get(created.id) ?? [];
      if (departementsEnregistres.length === 0) {
        reponse.avertissement = AVERTISSEMENT_SANS_DEPARTEMENT;
      }
    }

    return NextResponse.json(reponse, { status: 201 });
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {}
    console.error('[API Admin Users] Erreur création utilisateur :', error?.message);
    if (error?.code === '23505') {
      return NextResponse.json(
        { error: "Cet identifiant est déjà pris." },
        { status: 409 }
      );
    }
    if (error?.code === '42P01') {
      return NextResponse.json({ error: MESSAGE_MIGRATION_DEPARTEMENTS }, { status: 500 });
    }
    return NextResponse.json(
      { error: 'Erreur lors de la création de l\'utilisateur.' },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
