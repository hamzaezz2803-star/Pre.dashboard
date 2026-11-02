import { NextResponse } from 'next/server';
import { targetPool } from '@/lib/db';
import { employePinAutorise, exigerRoleAvecPerimetre, conditionPerimetreDepartementId } from '@/lib/perimetre';
import { chargerDonneesJours } from '@/lib/compteurs/donnees';
import { dateDuJour, recalculer } from '@/lib/compteurs/calcul';
import { normaliserIdCompteur } from '@/lib/compteurs/validation';
import { lireJson, reponseErreur } from '@/lib/compteurs/reponses';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const PIN = /^[A-Za-z0-9_-]{1,50}$/;
/** Nombre maximal d'employés recalculés par appel. */
const EMPLOYES_MAX = 500;

function dateValide(iso) {
  if (typeof iso !== 'string' || !ISO_DATE.test(iso)) return false;
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
}

/**
 * Route POST /api/compteurs/recalculer
 * Corps : { date: 'YYYY-MM-DD', pins?: string[], compteurs?: string[] }
 * Recalcule les compteurs actifs (tous ou ceux listés) pour le jour, la
 * semaine et le mois contenant la date, et enregistre les valeurs.
 * Sans `pins` : tous les employés du périmètre de l'utilisateur.
 * admin : limité à son périmètre de départements ; super_admin : tous.
 */
export async function POST(request) {
  const auth = await exigerRoleAvecPerimetre('admin', 'super_admin');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const corps = await lireJson(request);
  if (!corps) {
    return NextResponse.json({ error: 'Corps de requête JSON invalide.' }, { status: 400 });
  }

  const { date } = corps;
  if (!dateValide(date)) {
    return NextResponse.json({ error: 'Date invalide (format attendu AAAA-MM-JJ).' }, { status: 400 });
  }
  if (date > dateDuJour()) {
    return NextResponse.json({ error: 'Impossible de calculer une date future.' }, { status: 400 });
  }

  let compteurIds = null;
  if (corps.compteurs !== undefined) {
    if (!Array.isArray(corps.compteurs) || corps.compteurs.length === 0 || corps.compteurs.length > 100) {
      return NextResponse.json({ error: 'Liste de compteurs invalide.' }, { status: 400 });
    }
    compteurIds = corps.compteurs.map(normaliserIdCompteur);
    if (compteurIds.some((id) => !id)) {
      return NextResponse.json({ error: 'Identifiant de compteur invalide.' }, { status: 400 });
    }
  }

  try {
    let pins;
    if (corps.pins !== undefined) {
      if (!Array.isArray(corps.pins) || corps.pins.length === 0 || corps.pins.length > EMPLOYES_MAX) {
        return NextResponse.json({ error: 'Liste de matricules invalide.' }, { status: 400 });
      }
      pins = [...new Set(corps.pins.map(String))];
      if (pins.some((p) => !PIN.test(p))) {
        return NextResponse.json({ error: 'Matricule invalide.' }, { status: 400 });
      }
      for (const pin of pins) {
        if (!(await employePinAutorise(auth.perimetre, pin))) {
          return NextResponse.json({ error: 'Accès refusé à cet employé.' }, { status: 403 });
        }
      }
    } else {
      const params = [];
      const cond = conditionPerimetreDepartementId(auth.perimetre, params, 'auth_dept_id');
      params.push(EMPLOYES_MAX + 1);
      const { rows } = await targetPool.query(
        `SELECT DISTINCT pin::text AS pin FROM pers_person
         WHERE pin IS NOT NULL ${cond ? `AND ${cond}` : ''}
         ORDER BY 1 LIMIT $${params.length}`,
        params
      );
      if (rows.length > EMPLOYES_MAX) {
        return NextResponse.json(
          { error: `Plus de ${EMPLOYES_MAX} employés : précisez les matricules à recalculer.` },
          { status: 400 }
        );
      }
      pins = rows.map((r) => r.pin).filter((p) => PIN.test(p));
    }

    const resume = await recalculer({ db: targetPool, charger: chargerDonneesJours, pins, date, compteurIds });
    for (const e of resume.echecs) {
      console.error(`[Compteurs] Recalcul du ${date}, employé ${e.pin} :`, e.message);
    }
    console.info(
      `[Compteurs] Recalcul du ${date} par l'utilisateur ${auth.id} : ${resume.employes} employé(s), ` +
        `${resume.ok} valeur(s), ${resume.erreurs} erreur(s), ${resume.echecs.length} échec(s)`
    );
    // Détails techniques des échecs dans les logs serveur uniquement
    return NextResponse.json({ date, ...resume, echecs: resume.echecs.map((e) => e.pin) });
  } catch (e) {
    return reponseErreur(e, 'recalcul');
  }
}
