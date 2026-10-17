import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

/**
 * Nom du cookie de session HTTP.
 */
const SESSION_COOKIE = 'ocp_session';

/**
 * Chemins d'accès publics ne nécessitant pas d'authentification.
 */
function isPublicPath(pathname) {
  if (pathname === '/login') return true;
  if (pathname.startsWith('/api/auth/')) return true;
  if (pathname === '/conditions' || pathname === '/confidentialite') return true;
  return false;
}

/**
 * Vérifie la validité du cookie de session avec jose.
 *
 * @param {string|undefined} token
 * @returns {Promise<boolean>}
 */
async function isTokenValid(token) {
  if (!token) return false;
  try {
    const secret = process.env.AUTH_SECRET;
    if (!secret) return false;
    const secretKey = new TextEncoder().encode(secret);
    const { payload } = await jwtVerify(token, secretKey, { algorithms: ['HS256'] });
    return Boolean(payload?.id);
  } catch {
    return false;
  }
}

/**
 * Middleware Next.js pour protéger les routes et rediriger vers /login
 * toute page consultée sans session valide.
 */
export async function middleware(request) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const hasValidSession = await isTokenValid(token);

  // Si l'utilisateur est déjà connecté et tente d'aller sur /login, on le redirige vers l'accueil
  if (hasValidSession && pathname === '/login') {
    return NextResponse.redirect(new URL('/', request.url));
  }

  // Si le chemin est public, on autorise l'accès
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // Pour toute autre route sans cookie valide :
  if (!hasValidSession) {
    // Si c'est une route API, renvoyer du JSON 401
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }
    // Si c'est une page, rediriger vers /login
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|assets/|favicon.ico).*)'],
};
