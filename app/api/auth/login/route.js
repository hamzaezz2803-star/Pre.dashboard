import { NextResponse } from 'next/server';
import { creerSession, verifierMotDePasse } from '@/lib/auth';

/**
 * Route POST /api/auth/login
 * Reçoit username et password.
 * Pose le cookie HTTPOnly de session en cas de succès.
 * Renvoie 401 avec le message « Identifiants incorrects » en cas d'erreur.
 * Permet la ressaisie immédiate sans limitation ni blocage.
 */
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const { username, password } = body;

  const user = await verifierMotDePasse(username, password);

  if (!user) {
    return NextResponse.json(
      { error: 'Identifiants incorrects' },
      { status: 401 }
    );
  }

  // Création du JWT et écriture du cookie httpOnly
  await creerSession(user);

  return NextResponse.json({
    success: true,
    user: {
      id: user.id,
      username: user.username,
      full_name: user.full_name,
      role: user.role,
    },
  });
}
