import { NextResponse } from 'next/server';
import { targetPool } from '@/lib/db';
import { employePinAutorise, exigerRoleAvecPerimetre } from '@/lib/perimetre';
import { lireEmploye, lireHoraire, lirePointages, lireValeursCompteurs } from '@/lib/compteurs/detail-jour';
import { reponseErreur } from '@/lib/compteurs/reponses';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const PIN = /^[A-Za-z0-9_-]{1,50}$/;

function dateValide(iso) {
  if (!ISO_DATE.test(iso)) return false;
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
}

/**
 * Route GET /api/employes/[pin]/detail-jour?date=YYYY-MM-DD
 * Écran « Détail jour » : identité, horaire affecté, pointages de la journée
 * de service et valeurs des compteurs (jour, semaine, mois).
 * admin : uniquement les employés de son périmètre (403 sinon).
 */
export async function GET(request, context) {
  const auth = await exigerRoleAvecPerimetre('admin', 'super_admin');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { pin } = await context.params;
  const date = new URL(request.url).searchParams.get('date') || '';
  if (!PIN.test(pin || '')) {
    return NextResponse.json({ error: 'Matricule invalide.' }, { status: 400 });
  }
  if (!dateValide(date)) {
    return NextResponse.json({ error: 'Date invalide (format attendu AAAA-MM-JJ).' }, { status: 400 });
  }

  try {
    if (!(await employePinAutorise(auth.perimetre, pin))) {
      return NextResponse.json({ error: 'Accès refusé à cet employé.' }, { status: 403 });
    }

    const employe = await lireEmploye(targetPool, pin);
    if (!employe) {
      return NextResponse.json({ error: 'Employé introuvable.' }, { status: 404 });
    }

    const [horaire, pointages, compteurs] = await Promise.all([
      lireHoraire(targetPool, pin, date),
      lirePointages(targetPool, pin, date),
      lireValeursCompteurs(targetPool, pin, date),
    ]);

    return NextResponse.json({ date, employe, horaire, pointages, ...compteurs });
  } catch (e) {
    return reponseErreur(e, 'détail jour');
  }
}
