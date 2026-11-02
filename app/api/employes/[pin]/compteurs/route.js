import { NextResponse } from 'next/server';
import { targetPool } from '@/lib/db';
import { employePinAutorise, exigerRoleAvecPerimetre } from '@/lib/perimetre';
import { lireHistoriqueJours } from '@/lib/compteurs/detail-jour';
import { reponseErreur } from '@/lib/compteurs/reponses';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const PIN = /^[A-Za-z0-9_-]{1,50}$/;
/** Période maximale renvoyée en une fois (jours). */
const JOURS_MAX = 62;

function dateValide(iso) {
  if (!ISO_DATE.test(iso)) return false;
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
}

/**
 * Route GET /api/employes/[pin]/compteurs?debut=YYYY-MM-DD&fin=YYYY-MM-DD
 * Historique des valeurs journalières des compteurs d'un employé (62 jours maximum).
 * admin : uniquement les employés de son périmètre (403 sinon).
 */
export async function GET(request, context) {
  const auth = await exigerRoleAvecPerimetre('admin', 'super_admin');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { pin } = await context.params;
  const { searchParams } = new URL(request.url);
  const debut = searchParams.get('debut') || '';
  const fin = searchParams.get('fin') || '';

  if (!PIN.test(pin || '')) {
    return NextResponse.json({ error: 'Matricule invalide.' }, { status: 400 });
  }
  if (!dateValide(debut) || !dateValide(fin) || debut > fin) {
    return NextResponse.json({ error: 'Période invalide (format attendu AAAA-MM-JJ).' }, { status: 400 });
  }
  const nbJours = (Date.parse(`${fin}T00:00:00Z`) - Date.parse(`${debut}T00:00:00Z`)) / 86400000 + 1;
  if (nbJours > JOURS_MAX) {
    return NextResponse.json({ error: `La période ne peut pas dépasser ${JOURS_MAX} jours.` }, { status: 400 });
  }

  try {
    if (!(await employePinAutorise(auth.perimetre, pin))) {
      return NextResponse.json({ error: 'Accès refusé à cet employé.' }, { status: 403 });
    }
    const valeurs = await lireHistoriqueJours(targetPool, pin, debut, fin);
    return NextResponse.json({ debut, fin, valeurs });
  } catch (e) {
    return reponseErreur(e, 'historique');
  }
}
