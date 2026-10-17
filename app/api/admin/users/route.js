import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { targetPool } from '@/lib/db';
import { exigerRole } from '@/lib/auth';

/**
 * Route GET /api/admin/users
 * Retourne la liste de tous les utilisateurs (réservé au super_admin).
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
    return NextResponse.json(rows);
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

  const { username, full_name, role, password } = body;

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

  const cleanUsername = username.trim();
  const cleanFullName = full_name && typeof full_name === 'string' ? full_name.trim() : null;

  try {
    // Vérifier l'unicité de l'identifiant
    const checkRes = await targetPool.query(
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

    // Insertion en base
    const insertRes = await targetPool.query(
      `INSERT INTO users (username, full_name, password_hash, role, active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, true, NOW(), NOW())
       RETURNING id, username, full_name, role, active, created_at, updated_at;`,
      [cleanUsername, cleanFullName, password_hash, role]
    );

    return NextResponse.json(insertRes.rows[0], { status: 201 });
  } catch (error) {
    console.error('[API Admin Users] Erreur création utilisateur :', error?.message);
    if (error?.code === '23505') {
      return NextResponse.json(
        { error: "Cet identifiant est déjà pris." },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: 'Erreur lors de la création de l\'utilisateur.' },
      { status: 500 }
    );
  }
}
