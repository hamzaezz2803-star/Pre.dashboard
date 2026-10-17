import { NextResponse } from 'next/server';
import { lireSession } from '@/lib/auth';

/**
 * Route GET /api/auth/me
 * Renvoie username, full_name et role de la session actuelle, ou 401 si non connecté.
 */
export async function GET() {
  const session = await lireSession();

  if (!session) {
    return NextResponse.json(
      { error: 'Non authentifié' },
      { status: 401 }
    );
  }

  return NextResponse.json({
    username: session.username,
    full_name: session.full_name,
    role: session.role,
  });
}
