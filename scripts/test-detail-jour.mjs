/**
 * Vérifie lib/compteurs/detail-jour.js sur les vraies données, en lecture seule.
 *
 * Usage : node --env-file=.env scripts/test-detail-jour.mjs
 */
import assert from 'node:assert/strict';
import pg from 'pg';
import { lireEmploye, lireHoraire, lirePointages, lireValeursCompteurs } from '../lib/compteurs/detail-jour.js';

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  options: '-c default_transaction_read_only=on',
});
let echecs = 0;

async function cas(nom, fn) {
  try {
    await fn();
    console.log(`  ok   ${nom}`);
  } catch (e) {
    echecs++;
    console.log(`  FAIL ${nom} : ${e.message}`);
  }
}

await client.connect();
try {
  await cas('identité', async () => {
    const e = await lireEmploye(client, '1001');
    assert.equal(e.pin, '1001');
    assert.equal(e.nom, 'elamrani');
    assert.equal(await lireEmploye(client, 'INCONNU'), null);
  });

  await cas('horaire affecté lu dans les tables existantes', async () => {
    const h = await lireHoraire(client, '1001', '2026-10-27');
    assert.equal(h.nom, 'EQUIPE_A_MATIN');
    assert.equal(h.heure_debut, '08:00');
    assert.equal(h.heure_fin, '16:00');
    assert.equal(h.est_nuit, false);
    assert.equal(await lireHoraire(client, '1001', '2026-10-28'), null);
  });

  await cas('pointages chronologiques E/S', async () => {
    const p = await lirePointages(client, '1001', '2026-10-27');
    assert.deepEqual(p.map((x) => [x.horodatage, x.code]), [
      ['2026-10-27T07:50:00', 'E'],
      ['2026-10-27T16:05:00', 'S'],
    ]);
  });

  await cas('poste de nuit : sortie du lendemain rattachée au 27', async () => {
    const h = await lireHoraire(client, '1003', '2026-10-27');
    assert.equal(h.nom, 'EQUIPE_C_NUIT');
    assert.equal(h.est_nuit, true);
    assert.deepEqual((await lirePointages(client, '1003', '2026-10-27')).map((x) => x.horodatage), [
      '2026-10-27T21:55:00',
      '2026-10-28T06:05:00',
    ]);
    assert.deepEqual(await lirePointages(client, '1003', '2026-10-28'), []);
  });

  await cas('valeurs des compteurs jour / semaine / mois', async () => {
    const { periodes, valeurs } = await lireValeursCompteurs(client, '1001', '2026-10-27');
    assert.deepEqual(periodes.SEMAINE, { debut: '2026-10-26', fin: '2026-11-01' });
    const jour = valeurs.find((v) => v.id_compteur === 'CPT001' && v.periodicite === 'JOUR');
    assert.equal(jour.statut, 'OK');
    assert.equal(jour.valeur, 15);
    const mois = valeurs.find((v) => v.id_compteur === 'CPT001' && v.periodicite === 'MOIS');
    assert.equal(mois.valeur, 30);
    assert.equal(valeurs.some((v) => v.periodicite === 'SEMAINE'), false, 'CPT001 non hebdomadaire');
  });

  await cas('compteur actif sans valeur → NON_CALCULE', async () => {
    const { valeurs } = await lireValeursCompteurs(client, '1001', '2026-10-15');
    const jour = valeurs.find((v) => v.id_compteur === 'CPT001' && v.periodicite === 'JOUR');
    assert.equal(jour.statut, 'NON_CALCULE');
    assert.equal(jour.valeur, null);
  });
} finally {
  await client.end();
}

console.log(echecs === 0 ? '\nTout est conforme (lecture seule).' : `\n${echecs} échec(s).`);
process.exit(echecs === 0 ? 0 : 1);
