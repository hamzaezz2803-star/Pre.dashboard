/**
 * Vérifie lib/compteurs/calcul.js sur les vraies données sans rien modifier :
 * les compteurs de test et l'historique sont créés dans une transaction annulée
 * (ROLLBACK) à la fin. Les journées sont lues par le vrai chargeur
 * (lib/compteurs/donnees.js, connexion en lecture seule).
 *
 * Usage : node --env-file=.env --env-file=.env.local scripts/test-calcul-compteurs.mjs
 */
import assert from 'node:assert/strict';
import pg from 'pg';
import { chargerDonneesJours } from '../lib/compteurs/donnees.js';
import { getBiotimePool } from '../lib/biotime-db.js';
import { planifierPeriodes, recalculer } from '../lib/compteurs/calcul.js';

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

async function creer(id, formule, { j = true, h = false, m = false, actif = true } = {}) {
  await client.query(
    `INSERT INTO compteurs (id_compteur, libelle, formule, journalier, hebdomadaire, mensuel, unite, actif)
     VALUES ($1, $1, $2, $3, $4, $5, 'minutes', $6)`,
    [id, formule, j, h, m, actif]
  );
  await client.query(
    `INSERT INTO compteurs_versions (id_compteur, version_formule, formule, unite, journalier, hebdomadaire, mensuel)
     VALUES ($1, 1, $2, 'minutes', $3, $4, $5)`,
    [id, formule, j, h, m]
  );
}

const valeur = async (pin, id, periodicite, debut) => {
  const { rows } = await client.query(
    `SELECT valeur::float AS valeur, statut_calcul, message_erreur, periode_fin::text AS fin
     FROM historique_compteurs WHERE id_employe = $1 AND id_compteur = $2 AND periodicite = $3 AND periode_debut = $4`,
    [pin, id, periodicite, debut]
  );
  return rows[0];
};

const AUJOURDHUI = '2026-11-02';

console.log('Planification (pur)');
await (async () => {
  const c = { id_compteur: 'X', journalier: true, hebdomadaire: true, mensuel: true };
  const p = planifierPeriodes([c], '2026-10-27', AUJOURDHUI);
  assert.deepEqual(p.map((x) => [x.periodicite, x.debut, x.fin, x.finEffective]), [
    ['JOUR', '2026-10-27', '2026-10-27', '2026-10-27'],
    ['SEMAINE', '2026-10-26', '2026-11-01', '2026-11-01'],
    ['MOIS', '2026-10-01', '2026-10-31', '2026-10-31'],
  ]);
  // Mois en cours : calculé jusqu'à aujourd'hui seulement
  const enCours = planifierPeriodes([c], AUJOURDHUI, AUJOURDHUI);
  assert.deepEqual(enCours.find((x) => x.periodicite === 'MOIS').finEffective, AUJOURDHUI);
  assert.deepEqual(planifierPeriodes([c], '2026-11-09', AUJOURDHUI), []);
  console.log('  ok   jour / semaine / mois, période en cours, date future');
})().catch((e) => {
  echecs++;
  console.log(`  FAIL planification : ${e.message}`);
});

await client.connect();
try {
  await client.query('BEGIN');
  // Les compteurs existants ne participent pas au test
  await client.query('UPDATE compteurs SET actif = FALSE');

  await creer('T_SOLDE', 'DUREE_TRAVAILLEE_MIN - DUREE_PREVUE_MIN', { j: true, h: true, m: true });
  await creer('T_RETARD', 'IF(RETARD_MIN > 10, 1, 0)', { j: true });
  await creer('T_ABS', 'NB_ABSENCES', { j: false, h: true, m: true });
  await creer('T_DIV', 'DUREE_TRAVAILLEE_MIN / NB_POINTAGES', { j: true });
  await creer('T_INACTIF', '1', { actif: false });

  console.log('Calcul sur données réelles (1001 matin, 1003 nuit)');
  let resume;
  await cas('recalcul de deux employés le 2026-10-27', async () => {
    resume = await recalculer({ db: client, charger: chargerDonneesJours, pins: ['1001', '1003'], date: '2026-10-27', aujourdhui: AUJOURDHUI });
    assert.equal(resume.compteurs, 4, 'compteur inactif exclu');
    assert.equal(resume.employes, 2);
    assert.deepEqual(resume.echecs, []);
    // 2 employés × (T_SOLDE ×3 + T_RETARD + T_ABS ×2 + T_DIV) = 14
    assert.equal(resume.ok + resume.erreurs, 14);
  });

  await cas('journalier matin : 07:50 → 16:05 = 495 min, prévu 480', async () => {
    assert.deepEqual(await valeur('1001', 'T_SOLDE', 'JOUR', '2026-10-27'), { valeur: 15, statut_calcul: 'OK', message_erreur: null, fin: '2026-10-27' });
    assert.equal((await valeur('1001', 'T_RETARD', 'JOUR', '2026-10-27')).valeur, 0);
    assert.equal((await valeur('1001', 'T_DIV', 'JOUR', '2026-10-27')).valeur, 247.5);
  });

  await cas('poste de nuit 27 → 28 : 490 min rattachées au 27', async () => {
    assert.equal((await valeur('1003', 'T_SOLDE', 'JOUR', '2026-10-27')).valeur, 10);
  });

  await cas('hebdomadaire et mensuel séparés du journalier', async () => {
    const s = await valeur('1001', 'T_SOLDE', 'SEMAINE', '2026-10-26');
    assert.equal(s.fin, '2026-11-01');
    assert.equal(s.valeur, 30); // 26 : +15, 27 : +15
    assert.equal((await valeur('1001', 'T_SOLDE', 'MOIS', '2026-10-01')).valeur, 30);
    assert.equal((await valeur('1001', 'T_ABS', 'MOIS', '2026-10-01')).valeur, 0);
  });

  await cas('journée sans données : erreur explicite, aucune valeur', async () => {
    await recalculer({ db: client, charger: chargerDonneesJours, pins: ['1001'], date: '2026-10-28', aujourdhui: AUJOURDHUI });
    const solde = await valeur('1001', 'T_SOLDE', 'JOUR', '2026-10-28');
    assert.equal(solde.statut_calcul, 'ERREUR');
    assert.equal(solde.valeur, null);
    assert.match(solde.message_erreur, /Donnée manquante/);
    const div = await valeur('1001', 'T_DIV', 'JOUR', '2026-10-28');
    assert.equal(div.statut_calcul, 'ERREUR');
  });

  await cas('recalcul : la valeur est remplacée, une seule ligne par période', async () => {
    await client.query(`UPDATE compteurs SET formule = 'DUREE_TRAVAILLEE_MIN', version_formule = 2 WHERE id_compteur = 'T_SOLDE'`);
    await client.query(
      `INSERT INTO compteurs_versions (id_compteur, version_formule, formule, unite, journalier, hebdomadaire, mensuel)
       VALUES ('T_SOLDE', 2, 'DUREE_TRAVAILLEE_MIN', 'minutes', TRUE, TRUE, TRUE)`
    );
    await recalculer({ db: client, charger: chargerDonneesJours, pins: ['1001'], date: '2026-10-27', compteurIds: ['T_SOLDE'], aujourdhui: AUJOURDHUI });
    assert.equal((await valeur('1001', 'T_SOLDE', 'JOUR', '2026-10-27')).valeur, 495);
    const { rows } = await client.query(
      `SELECT count(*)::int AS n, max(version_formule) AS v FROM historique_compteurs
       WHERE id_employe = '1001' AND id_compteur = 'T_SOLDE' AND periodicite = 'JOUR' AND periode_debut = '2026-10-27'`
    );
    assert.deepEqual(rows[0], { n: 1, v: 2 });
  });

  await cas('employé introuvable : erreur par employé, les autres continuent', async () => {
    const r = await recalculer({
      db: client,
      charger: async (pin, d, f) => {
        if (pin === 'X') throw new Error('panne simulée');
        return chargerDonneesJours(pin, d, f);
      },
      pins: ['X', '1003'],
      date: '2026-10-27',
      compteurIds: ['T_RETARD'],
      aujourdhui: AUJOURDHUI,
    });
    assert.equal(r.employes, 1);
    assert.deepEqual(r.echecs.map((e) => e.pin), ['X']);
  });

  await cas('date future : rien n\'est calculé', async () => {
    const r = await recalculer({ db: client, charger: chargerDonneesJours, pins: ['1001'], date: '2026-12-01', aujourdhui: AUJOURDHUI });
    assert.equal(r.ok + r.erreurs, 0);
  });
} finally {
  await client.query('ROLLBACK');
  await client.end();
  await getBiotimePool().end();
}

console.log(echecs === 0 ? '\nTout est conforme (transaction annulée, base inchangée).' : `\n${echecs} échec(s).`);
process.exit(echecs === 0 ? 0 : 1);
