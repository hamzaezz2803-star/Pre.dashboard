import { NextResponse } from 'next/server';
import { exigerRole } from '@/lib/auth';

/**
 * POST /api/affectation-horaire/enregistrer-employes
 * Endpoint préparé pour l'enregistrement futur des employés sélectionnés pour l'affectation dynamique.
 * Conformément aux spécifications, il informe clairement que la table backend dédiée est en attente
 * et ne simule pas une sauvegarde réussie fictive.
 */
export async function POST(request) {
  const auth = await exigerRole('admin', 'super_admin');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json();
    const { employesIds = [] } = body;

    return NextResponse.json({
      success: false,
      connected: false,
      enAttenteBackend: true,
      count: employesIds.length,
      message:
        "En attente de connexion PostgreSQL : La table d'affectation dynamique des employés n'est pas encore créée au backend. La sélection des employés a été conservée localement dans l'interface.",
    });
  } catch (err) {
    console.error('[API Enregistrer Employés] Erreur :', err?.message);
    return NextResponse.json(
      { error: 'Erreur lors du traitement de la requête.' },
      { status: 500 }
    );
  }
}
