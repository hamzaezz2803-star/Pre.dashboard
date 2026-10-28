import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import { cookies, headers } from 'next/headers';
import { targetPool } from './db.js';

/**
 * Nom du cookie de session HTTP.
 */
export const SESSION_COOKIE = 'ocp_session';

/**
 * Détermine si le cookie de session doit comporter l'attribut `Secure`.
 *
 * Règles :
 * 1. Variable d'environnement explicite `SECURE_COOKIES` (recommandé pour configurer l'environnement) :
 *    - `SECURE_COOKIES=false` : désactive `Secure` pour autoriser les accès HTTP sur réseau local / Wi-Fi (ex: 192.168.x.x).
 *    - `SECURE_COOKIES=true`  : impose `Secure` pour la production avec HTTPS.
 * 2. Si `SECURE_COOKIES` n'est pas spécifié :
 *    - En développement local (`NODE_ENV !== 'production'`) : `false`.
 *    - En production (`NODE_ENV === 'production'`) :
 *      - Si la requête entrante est détectée en HTTP sur une adresse privée (LAN) ou localhost : `false`.
 *      - Si la requête est en HTTPS ou sur un nom d'hôte public de production : `true`.
 *
 * @param {Headers|null} [reqHeaders]
 * @returns {boolean}
 */
export function isCookieSecure(reqHeaders = null) {
  // 1. Configuration explicite prioritaire via variable d'environnement
  if (process.env.SECURE_COOKIES !== undefined) {
    const val = String(process.env.SECURE_COOKIES).trim().toLowerCase();
    return val === 'true' || val === '1' || val === 'yes';
  }

  // 2. Environnement de développement standard
  if (process.env.NODE_ENV !== 'production') {
    return false;
  }

  // 3. Détection automatique du contexte réseau en production
  if (reqHeaders) {
    const proto = reqHeaders.get('x-forwarded-proto') || '';
    if (proto === 'https') {
      return true;
    }

    const referer = reqHeaders.get('referer') || '';
    const host = (reqHeaders.get('x-forwarded-host') || reqHeaders.get('host') || '').split(':')[0].toLowerCase();

    const isLocalOrPrivateIp =
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      /^192\.168\.\d{1,3}\.\d{1,3}$/.test(host) ||
      /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host) ||
      /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(host);

    if (isLocalOrPrivateIp && (referer.startsWith('http://') || proto === 'http')) {
      return false;
    }
  }

  return true;
}

/**
 * Hash factice (bcrypt 12 tours) utilisé lorsque l'utilisateur n'existe pas,
 * afin que le temps de réponse soit rigoureusement identique (protection contre les attaques temporelles).
 */
const DUMMY_HASH = '$2a$12$e8uqN2rTjD3j7g5ZlR/j1uV94yK9lQvG8yZ1xS4c2kL0fB1qW3.8G';

/**
 * Obtient la clé secrète pour signer et vérifier les JWT.
 * AUTH_SECRET doit comporter au moins 32 caractères.
 */
function getSecretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('La variable d\'environnement AUTH_SECRET est manquante ou comporte moins de 32 caractères.');
  }
  return new TextEncoder().encode(secret);
}

/**
 * Vérifie les identifiants d'un utilisateur.
 * Cherche l'utilisateur actif et compare avec bcrypt.
 * Si l'utilisateur n'existe pas, compare quand même avec un hash factice pour un temps de réponse identique.
 * Ne révèle jamais si c'est le nom d'utilisateur ou le mot de passe qui est erroné.
 *
 * @param {string} username - Identifiant
 * @param {string} password - Mot de passe en clair
 * @returns {Promise<{id: number, username: string, full_name: string|null, role: string}|null>}
 */
export async function verifierMotDePasse(username, password) {
  if (!username || !password) {
    // Exécution du hash factice pour maintenir un temps de traitement constant
    await bcrypt.compare(password || '', DUMMY_HASH);
    return null;
  }

  try {
    const { rows } = await targetPool.query(
      'SELECT id, username, full_name, password_hash, role, active FROM users WHERE username = $1',
      [username.trim()]
    );

    const user = rows[0];

    if (!user || !user.active) {
      // Utilisateur inexistant ou inactif : comparaison factice
      await bcrypt.compare(password, DUMMY_HASH);
      return null;
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return null;
    }

    return {
      id: user.id,
      username: user.username,
      full_name: user.full_name,
      role: user.role,
    };
  } catch {
    console.error('[Auth] Erreur lors de la vérification du mot de passe');
    return null;
  }
}

/**
 * Crée un jeton JWT et le stocke dans un cookie HttpOnly.
 * Jeton signé avec jose (HS256, AUTH_SECRET), contenant id, username et role, valable 8 heures.
 *
 * @param {{id: number, username: string, role: string}} user
 * @returns {Promise<string>} Jeton JWT
 */
export async function creerSession(user) {
  const secretKey = getSecretKey();

  const token = await new SignJWT({
    id: user.id,
    username: user.username,
    role: user.role,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('8h')
    .sign(secretKey);

  let reqHeaders = null;
  try {
    reqHeaders = await headers();
  } catch {
    // Peut être invoqué hors contexte de requête HTTP
  }

  const secure = isCookieSecure(reqHeaders);

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: 8 * 60 * 60, // 8 heures
  });

  enregistrerActivite(user);

  return token;
}

const globalForSessions = globalThis;
if (!globalForSessions._activeSessions) {
  globalForSessions._activeSessions = new Map();
}

/** Enregistre ou met à jour la dernière activité d'une session en mémoire avec historique timeline. */
export function enregistrerActivite(user) {
  if (!user || !user.id) return;
  const id = Number(user.id);
  const now = new Date();
  const existing = globalForSessions._activeSessions.get(id);

  const loginTime = existing?.loginTime || now;

  globalForSessions._activeSessions.set(id, {
    id,
    username: user.username,
    full_name: user.full_name,
    role: user.role,
    loginTime,
    lastSeen: now,
    logoutTime: null,
    isOnline: true,
  });
}

/** Enregistre la sortie / déconnexion de l'utilisateur. */
export function retirerActivite(userId) {
  if (!globalForSessions._activeSessions || !userId) return;
  const id = Number(userId);
  const session = globalForSessions._activeSessions.get(id);
  if (session) {
    session.logoutTime = new Date();
    session.isOnline = false;
  }
}

/** Retourne la liste des sessions avec leurs détails temporels. */
export function obtenirUtilisateursConnectes() {
  const map = globalForSessions._activeSessions || new Map();
  const now = Date.now();
  const timeoutMs = 30 * 60 * 1000;
  const list = [];

  for (const [id, session] of map.entries()) {
    const isRecent = now - new Date(session.lastSeen).getTime() < timeoutMs;
    if (!isRecent && session.isOnline) {
      // Déconnexion automatique après inactivité
      session.isOnline = false;
      session.logoutTime = session.lastSeen;
    }
    list.push(session);
  }
  return list;
}

/**
 * Lit et vérifie le cookie de session en cours.
 * Recharge obligatoirement l'utilisateur en base à chaque appel pour refuser
 * immédiatement les comptes désactivés ou supprimés.
 *
 * @returns {Promise<{id: number, username: string, full_name: string|null, role: string}|null>}
 */
export async function lireSession() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE)?.value;
    if (!token) {
      return null;
    }

    const secretKey = getSecretKey();
    const { payload } = await jwtVerify(token, secretKey, { algorithms: ['HS256'] });

    if (!payload?.id) {
      return null;
    }

    // Recharge l'utilisateur en base pour vérifier son existence et son statut actif
    const { rows } = await targetPool.query(
      'SELECT id, username, full_name, role, active FROM users WHERE id = $1',
      [payload.id]
    );

    const user = rows[0];
    if (!user || !user.active) {
      return null;
    }

    const sessionUser = {
      id: user.id,
      username: user.username,
      full_name: user.full_name,
      role: user.role,
    };

    enregistrerActivite(sessionUser);

    return sessionUser;
  } catch {
    return null;
  }
}

/**
 * Supprime le cookie de session (déconnexion).
 */
export async function supprimerSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    try {
      const secretKey = getSecretKey();
      const { payload } = await jwtVerify(token, secretKey, { algorithms: ['HS256'] });
      if (payload?.id) {
        retirerActivite(payload.id);
      }
    } catch {}
  }

  let reqHeaders = null;
  try {
    reqHeaders = await headers();
  } catch {}

  const secure = isCookieSecure(reqHeaders);

  cookieStore.set(SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: 0,
  });
}

/**
 * Exige que la session appartienne à l'un des rôles autorisés.
 * Renvoie la session en cas de succès, ou un objet d'erreur avec code HTTP 401 ou 403.
 *
 * @param {...string} roles - Rôles autorisés (ex: 'admin', 'super_admin')
 * @returns {Promise<{session: object|null, error: string|null, status: number, id?: number, username?: string, full_name?: string|null, role?: string}>}
 */
export async function exigerRole(...roles) {
  const session = await lireSession();

  if (!session) {
    return {
      session: null,
      error: 'Non authentifié',
      status: 401,
    };
  }

  if (roles.length > 0 && !roles.includes(session.role)) {
    return {
      session: null,
      error: 'Accès refusé',
      status: 403,
    };
  }

  return {
    ...session,
    session,
    error: null,
    status: 200,
  };
}
