import { NextResponse } from 'next/server';
import { exigerRole, obtenirUtilisateursConnectes } from '@/lib/auth';
import { targetPool } from '@/lib/db';

/**
 * Route GET /api/admin/connected-users
 * Réservée strictement au super_admin.
 * Retourne la liste des utilisateurs du système avec leur statut de connexion (en ligne / hors-ligne).
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
       ORDER BY active DESC, id ASC;`
    );

    const connectedList = obtenirUtilisateursConnectes();
    const connectedMap = new Map(connectedList.map((u) => [u.id, u.lastSeen]));

    // L'utilisateur actuel qui fait la requête est toujours en ligne
    connectedMap.set(auth.id, new Date());

    const users = rows.map((u) => {
      const isCurrent = u.id === auth.id;
      const lastSeen = connectedMap.get(u.id);
      const isOnline = Boolean(lastSeen);

      return {
        id: u.id,
        username: u.username,
        full_name: u.full_name,
        role: u.role,
        active: Boolean(u.active),
        isOnline: u.active ? isOnline : false,
        isCurrent,
        lastSeen: lastSeen ? new Date(lastSeen).toISOString() : null,
      };
    });

    const connectedCount = users.filter((u) => u.isOnline).length;

    return NextResponse.json({
      connectedCount,
      totalUsers: users.length,
      users,
    });
  } catch (error) {
    console.error('[API Connected Users] Erreur lecture des utilisateurs connectés :', error?.message);
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des utilisateurs connectés.' },
      { status: 500 }
    );
  }
}
