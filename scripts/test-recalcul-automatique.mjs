/**
 * Vérifie lib/compteurs/automatique.js sur les vraies données sans rien modifier :
 * tout s'exécute dans une transaction annulée (ROLLBACK) à la fin.
 *
 * Usage : node --env-file=.env --env-file=.env.local scripts/test-recalcul-automatique.mjs
 */
import assert from 'node:assert/strict';
import pg from 'pg';
import { getBiotimePool } from '../lib/biotime-db.js';
import { targetPool } from '../lib/db.js';
import { chargerDonneesJours } from '../lib/compteurs/donnees.js';
import {
  employesActifs,
  fenetreDates,
  joursARecalculer,
  recalculerApresSynchronisation,
} from '../lib/compteurs/automatique.js';

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
let echecs = 0;

async function cas(nom, fn) {
  await client.query('SAVEPOINT s');
  try {
    await fn();
    await client.query('RELEASE SAVEPOINT s');
    console.log(`  ok   ${nom}`);
  } catch (e) {
    await client.query('ROLLBACK TO SAVEPOINT s');
    echecs++;
    console.log(`  FAIL ${nom} : ${e.message}`);
  }
}

console.log('Paramètres (pur)');
await (async () => {
  assert.equal(joursARecalculer(undefined), 2);
  assert.equal(joursARecalculer(''), 2);
  assert.equal(joursARecalculer('0'), 0);
  assert.equal(joursARecalculer('7'), 7);
  assert.equal(joursARecalculer('365'), 31);
  assert.equal(joursARecalculer('-1'), 2);
  assert.equal(joursARecalculer('abc'), 2);
  assert.deepEqual(fenetreDates('2026-11-01', 3), ['2026-10-30', '2026-10-31', '2026-11-01']);
  assert.deepEqual(fenetreDates('2026-03-01', 2), ['2026-02-28', '2026-03-01']);
  console.log('  ok   jours (défaut, 0, maximum, invalide) et fenêtre de dates');
})().catch((e) => {
  echecs++;
  console.log(`  FAIL paramètres : ${e.message}`);
});

await client.connect();
try {
  await client.query('BEGIN');

  await cas('employés actifs : pointages (veille incluse) et horaires', async () => {
    // 28/10 : 1003 a sa sortie de nuit le 28 ; 1001, 1002, 1003 pointent le 27 (veille)
    assert.deepEqual(await employesActifs(client, '2026-10-28', '2026-10-28'), ['1001', '1002', '1003']);
    // 1002 pointe le 29 (veille de la fenêtre), 1005 le 30
    assert.deepEqual(await employesActifs(client, '2026-10-30', '2026-10-31'), ['1002', '1005']);
    assert.deepEqual(await employesActifs(client, '2026-12-01', '2026-12-02'), []);
  });

  await cas('désactivé (0 jour) : rien n\'est lancé', async () => {
    assert.equal(await recalculerApresSynchronisation({ db: client, jours: 0, aujourdhui: '2026-10-28' }), null);
  });

  await cas('aucun compteur actif : rien n\'est lancé', async () => {
    await client.query('UPDATE compteurs SET actif = FALSE');
    assert.equal(await recalculerApresSynchronisation({ db: client, jours: 2, aujourdhui: '2026-10-28' }), null);
    await client.query('UPDATE compteurs SET actif = TRUE');
  });

  await cas('recalcul des 2 derniers jours au 28/10', async () => {
    await client.query("DELETE FROM historique_compteurs WHERE periode_debut >= '2026-10-01'");
    const bilan = await recalculerApresSynchronisation({
      db: client,
      charger: chargerDonneesJours,
      jours: 2,
      aujourdhui: '2026-10-28',
    });
    assert.deepEqual(bilan.dates, ['2026-10-27', '2026-10-28']);
    assert.equal(bilan.employes, 3);
    assert.equal(bilan.echecs, 0);
    const { rows } = await client.query(
      `SELECT id_employe, periodicite, periode_debut::text AS debut, statut_calcul, valeur::float AS valeur
       FROM historique_compteurs WHERE id_compteur = 'CPT001' AND periodicite = 'JOUR' AND periode_debut = '2026-10-27'
       ORDER BY 1`
    );
    assert.deepEqual(rows.map((r) => [r.id_employe, r.valeur]), [['1001', 15], ['1002', 50], ['1003', 10]]);
  });

  await cas('tables absentes : ignoré sans erreur', async () => {
    const faux = { query: async () => { throw Object.assign(new Error('relation absente'), { code: '42P01' }); } };
    assert.equal(await recalculerApresSynchronisation({ db: faux, jours: 2 }), null);
  });
} finally {
  await client.query('ROLLBACK');
  await client.end();
  await getBiotimePool().end();
  await targetPool.end();
}

console.log(echecs === 0 ? '\nTout est conforme (transaction annulée, base inchangée).' : `\n${echecs} échec(s).`);
process.exit(echecs === 0 ? 0 : 1);
