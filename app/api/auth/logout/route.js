import { NextResponse } from 'next/server';
import { supprimerSession } from '@/lib/auth';

/**
 * Route POST /api/auth/logout
 * Supprime le cookie de session httpOnly.
 */
export async function POST() {
  await supprimerSession();
  return NextResponse.json({
    success: true,
    message: 'Déconnexion réussie.',
  });
}
