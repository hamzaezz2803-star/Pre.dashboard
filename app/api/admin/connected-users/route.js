import { NextResponse } from 'next/server';
import { exigerRole, obtenirUtilisateursConnectes } from '@/lib/auth';
import { targetPool } from '@/lib/db';

/**
 * Route GET /api/admin/connected-users
 * Réservée strictement au super_admin.
 * Retourne la liste des utilisateurs du système avec leur statut et la timeline détaillée des sessions (entrée/sortie).
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
    const sessionMap = new Map(connectedList.map((s) => [s.id, s]));

    // La session courante du super admin
    const now = new Date();
    if (!sessionMap.has(auth.id)) {
      sessionMap.set(auth.id, {
        id: auth.id,
        username: auth.username,
        full_name: auth.full_name,
        role: auth.role,
        loginTime: now,
        lastSeen: now,
        logoutTime: null,
        isOnline: true,
      });
    }

    const users = rows.map((u) => {
      const isCurrent = u.id === auth.id;
      const session = sessionMap.get(u.id);
      const isOnline = Boolean(u.active && (isCurrent || session?.isOnline));

      const loginTime = session?.loginTime ? new Date(session.loginTime) : isCurrent ? now : null;
      const logoutTime = session?.logoutTime ? new Date(session.logoutTime) : null;
      const lastSeen = session?.lastSeen ? new Date(session.lastSeen) : isCurrent ? now : null;

      // Calcul de durée active
      let durationMinutes = 0;
      if (loginTime) {
        const end = isOnline ? now : logoutTime || lastSeen || now;
        durationMinutes = Math.max(1, Math.round((end.getTime() - loginTime.getTime()) / 60000));
      }

      // Construction des événements de la timeline
      const timeline = [];
      if (loginTime) {
        timeline.push({
          type: 'entree',
          title: 'A entré (Connexion)',
          time: loginTime.toISOString(),
          timeFormatted: loginTime.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          detail: 'Authentification JWT réussie via navigateur web',
          state: 'success',
        });
      }

      if (lastSeen && (!loginTime || lastSeen.getTime() - loginTime.getTime() > 60000)) {
        timeline.push({
          type: 'activite',
          title: 'Dernière activité',
          time: lastSeen.toISOString(),
          timeFormatted: lastSeen.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          detail: isOnline ? 'Session active sur le tableau de bord' : 'Dernière requête enregistrée',
          state: 'info',
        });
      }

      if (logoutTime && !isOnline) {
        timeline.push({
          type: 'sortie',
          title: 'A sorti (Déconnexion)',
          time: logoutTime.toISOString(),
          timeFormatted: logoutTime.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          detail: 'Fermeture de session ou déconnexion volontaire',
          state: 'neutral',
        });
      } else if (isOnline) {
        timeline.push({
          type: 'en_cours',
          title: 'Session en cours',
          time: now.toISOString(),
          timeFormatted: 'En cours',
          detail: `Actif depuis ${durationMinutes} min`,
          state: 'active',
        });
      } else if (!loginTime) {
        timeline.push({
          type: 'hors_ligne',
          title: 'Aucune session récente',
          time: u.updated_at ? new Date(u.updated_at).toISOString() : new Date().toISOString(),
          timeFormatted: '-',
          detail: 'Ce compte n\'a pas ouvert de session récemment',
          state: 'neutral',
        });
      }

      return {
        id: u.id,
        username: u.username,
        full_name: u.full_name,
        role: u.role,
        active: Boolean(u.active),
        isOnline,
        isCurrent,
        loginTime: loginTime ? loginTime.toISOString() : null,
        logoutTime: logoutTime ? logoutTime.toISOString() : null,
        lastSeen: lastSeen ? lastSeen.toISOString() : null,
        durationMinutes,
        timeline,
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
