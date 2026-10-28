import { NextResponse } from 'next/server';
import { supprimerSession, SESSION_COOKIE, isCookieSecure } from '@/lib/auth';

/**
 * Route POST /api/auth/logout
 * Supprime le cookie de session httpOnly.
 */
export async function POST(request) {
  await supprimerSession();

  const res = NextResponse.json({
    success: true,
    message: 'Déconnexion réussie.',
  });

  const secure = isCookieSecure(request?.headers);
  res.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: 0,
  });

  return res;
}
