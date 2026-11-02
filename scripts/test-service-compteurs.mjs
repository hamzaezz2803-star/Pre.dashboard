/**
 * Vérifie lib/compteurs/service.js sur la vraie base sans rien modifier :
 * la migration et tous les appels s'exécutent dans une transaction annulée
 * (ROLLBACK) à la fin.
 *
 * Usage : node --env-file=.env scripts/test-service-compteurs.mjs
 */
import fs from 'fs';
import assert from 'node:assert/strict';
import pg from 'pg';
import {
  ErreurCompteur,
  creerCompteur,
  lireCompteur,
  listerCompteurs,
  modifierCompteur,
} from '../lib/compteurs/service.js';

const migration = fs
  .readFileSync('scripts/migration-compteurs.sql', 'utf8')
  .replace(/^\s*(BEGIN|COMMIT);\s*$/gim, '')
  .replace(/^\s*ANALYZE .*$/gim, '');

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

async function refuse(fn, status) {
  await client.query('SAVEPOINT r');
  try {
    await fn();
  } catch (e) {
    await client.query('ROLLBACK TO SAVEPOINT r');
    assert.ok(e instanceof ErreurCompteur, `erreur inattendue : ${e.message}`);
    assert.equal(e.status, status, e.message);
    return e;
  }
  throw new Error('accepté alors qu\'il devait être refusé');
}

const BASE = {
  id_compteur: 'cpt001',
  libelle: 'Débit / Crédit',
  formule: 'DUREE_TRAVAILLEE_MIN - DUREE_PREVUE_MIN',
  journalier: true,
  hebdomadaire: false,
  mensuel: false,
};

await client.connect();
try {
  await client.query('BEGIN');

  await cas('table absente → 503 lisible', async () => {
    await refuse(() => listerCompteurs(client), 503);
  });

  await client.query(migration);
  const { rows: users } = await client.query('SELECT id FROM users ORDER BY id LIMIT 1');
  const userId = users[0]?.id ?? null;

  await cas('création + version 1', async () => {
    const c = await creerCompteur(client, BASE, userId);
    assert.equal(c.id_compteur, 'CPT001');
    assert.equal(c.version_formule, 1);
    const lu = await lireCompteur(client, 'cpt001');
    assert.equal(lu.versions.length, 1);
    assert.equal(lu.versions[0].formule, BASE.formule);
  });

  await cas('identifiant déjà utilisé → 409', async () => {
    const e = await refuse(() => creerCompteur(client, { ...BASE, libelle: 'Autre' }, userId), 409);
    assert.equal(e.erreurs[0].champ, 'id_compteur');
  });

  await cas('libellé déjà utilisé (casse ignorée) → 409', async () => {
    const e = await refuse(() => creerCompteur(client, { ...BASE, id_compteur: 'CPT002', libelle: 'DÉBIT / CRÉDIT' }, userId), 409);
    assert.equal(e.erreurs[0].champ, 'libelle');
    await refuse(() => creerCompteur(client, { ...BASE, id_compteur: 'CPT002', libelle: 'debit / credit' }, userId), 409);
  });

  await cas('formule invalide → 400 avec détail', async () => {
    const e = await refuse(() => creerCompteur(client, { ...BASE, id_compteur: 'CPT002', libelle: 'B', formule: 'SALAIRE' }, userId), 400);
    assert.equal(e.erreurs[0].code, 'VARIABLE_INCONNUE');
  });

  await cas('modification du libellé : pas de nouvelle version', async () => {
    const r = await modifierCompteur(client, 'CPT001', { libelle: 'Solde journalier' }, userId);
    assert.equal(r.nouvelleVersion, false);
    assert.equal(r.compteur.version_formule, 1);
    assert.equal(r.compteur.libelle, 'Solde journalier');
  });

  await cas('modification de la formule : version 2 archivée', async () => {
    const r = await modifierCompteur(client, 'CPT001', { formule: 'MAX(0, DUREE_TRAVAILLEE_MIN - DUREE_PREVUE_MIN)', hebdomadaire: true }, userId);
    assert.equal(r.nouvelleVersion, true);
    assert.equal(r.compteur.version_formule, 2);
    const lu = await lireCompteur(client, 'CPT001');
    assert.deepEqual(lu.versions.map((v) => v.version_formule), [2, 1]);
    assert.equal(lu.versions[0].hebdomadaire, true);
  });

  await cas('aucun changement réel : rien n\'est écrit', async () => {
    const r = await modifierCompteur(client, 'CPT001', { libelle: 'Solde journalier' }, userId);
    assert.equal(r.nouvelleVersion, false);
    assert.equal(r.compteur.version_formule, 2);
  });

  await cas('activer le mensuel avec une variable journalière → 400', async () => {
    await creerCompteur(client, { ...BASE, id_compteur: 'PRES', libelle: 'Présence', formule: 'PRESENT' }, userId);
    await refuse(() => modifierCompteur(client, 'PRES', { mensuel: true }, userId), 400);
  });

  await cas('désactivation conserve le compteur', async () => {
    const r = await modifierCompteur(client, 'PRES', { actif: false }, userId);
    assert.equal(r.compteur.actif, false);
    assert.equal(r.nouvelleVersion, false);
  });

  await cas('identifiant non modifiable, compteur inconnu, identifiant invalide', async () => {
    await refuse(() => modifierCompteur(client, 'CPT001', { id_compteur: 'X' }, userId), 400);
    await refuse(() => modifierCompteur(client, 'INCONNU', { actif: false }, userId), 404);
    await refuse(() => lireCompteur(client, '../etc'), 400);
  });

  await cas('liste et filtres', async () => {
    assert.deepEqual((await listerCompteurs(client)).map((c) => c.id_compteur), ['CPT001', 'PRES']);
    assert.deepEqual((await listerCompteurs(client, { statut: 'actif' })).map((c) => c.id_compteur), ['CPT001']);
    assert.deepEqual((await listerCompteurs(client, { statut: 'inactif' })).map((c) => c.id_compteur), ['PRES']);
    assert.deepEqual((await listerCompteurs(client, { periodicite: 'SEMAINE' })).map((c) => c.id_compteur), ['CPT001']);
    assert.deepEqual((await listerCompteurs(client, { recherche: 'prés' })).map((c) => c.id_compteur), ['PRES']);
    assert.deepEqual((await listerCompteurs(client, { recherche: 'PRÉSENCE' })).map((c) => c.id_compteur), ['PRES']);
    assert.deepEqual((await listerCompteurs(client, { recherche: 'presence' })).map((c) => c.id_compteur), ['PRES']);
    assert.deepEqual((await listerCompteurs(client, { recherche: 'cpt0' })).map((c) => c.id_compteur), ['CPT001']);
    // Caractères spéciaux traités littéralement (pas de joker LIKE)
    assert.deepEqual(await listerCompteurs(client, { recherche: '%' }), []);
    assert.deepEqual(await listerCompteurs(client, { recherche: "'; DROP TABLE compteurs; --" }), []);
  });
} finally {
  await client.query('ROLLBACK');
  await client.end();
}

console.log(echecs === 0 ? '\nTout est conforme (transaction annulée, base inchangée).' : `\n${echecs} échec(s).`);
process.exit(echecs === 0 ? 0 : 1);
