/**
 * Vérifie scripts/migration-compteurs.sql sans rien modifier :
 * la migration et tous les contrôles s'exécutent dans une transaction
 * annulée (ROLLBACK) à la fin.
 *
 * Usage : node --env-file=.env scripts/test-migration-compteurs.mjs
 */
import fs from 'fs';
import pg from 'pg';

const migration = fs
  .readFileSync('scripts/migration-compteurs.sql', 'utf8')
  // La transaction est gérée ici pour pouvoir tout annuler
  .replace(/^\s*(BEGIN|COMMIT);\s*$/gim, '')
  .replace(/^\s*ANALYZE .*$/gim, '');

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
let echecs = 0;

async function attendu(nom, sql, params = []) {
  await client.query('SAVEPOINT s');
  try {
    await client.query(sql, params);
    console.log(`  ok   ${nom}`);
  } catch (e) {
    echecs++;
    console.log(`  FAIL ${nom} : ${e.message}`);
  }
  await client.query('RELEASE SAVEPOINT s');
}

async function refuse(nom, sql, params = []) {
  await client.query('SAVEPOINT s');
  try {
    await client.query(sql, params);
    echecs++;
    console.log(`  FAIL ${nom} : accepté alors qu'il devait être refusé`);
  } catch (e) {
    console.log(`  ok   ${nom} (refusé : ${e.constraint || e.code})`);
  }
  await client.query('ROLLBACK TO SAVEPOINT s');
}

const COMPTEUR = `INSERT INTO compteurs (id_compteur, libelle, formule, journalier, hebdomadaire, mensuel, unite)
                  VALUES ($1, $2, $3, $4, $5, $6, $7)`;
const VERSION = `INSERT INTO compteurs_versions (id_compteur, version_formule, formule, unite, journalier, hebdomadaire, mensuel)
                 VALUES ($1, $2, 'X', 'minutes', TRUE, FALSE, FALSE)`;
const HISTO = `INSERT INTO historique_compteurs (id_employe, id_compteur, periodicite, periode_debut, periode_fin, valeur, unite, version_formule, statut_calcul, message_erreur)
               VALUES ($1, 'CPT001', $2, $3, $4, $5, 'minutes', $6, $7, $8)`;

await client.connect();
try {
  await client.query('BEGIN');
  console.log('Migration (2 fois pour vérifier l\'idempotence)');
  await client.query(migration);
  await client.query(migration);
  console.log('  ok   migration exécutée deux fois');

  console.log('Compteurs');
  await attendu('compteur valide', COMPTEUR, ['CPT001', 'Débit / Crédit', 'DUREE_TRAVAILLEE_MIN - DUREE_PREVUE_MIN', true, false, true, 'minutes']);
  await attendu('version 1', VERSION, ['CPT001', 1]);
  await refuse('identifiant en minuscules', COMPTEUR, ['cpt002', 'A', '1', true, false, false, 'minutes']);
  await refuse('identifiant avec espace', COMPTEUR, ['CPT 2', 'A', '1', true, false, false, 'minutes']);
  await refuse('libellé vide', COMPTEUR, ['CPT002', '  ', '1', true, false, false, 'minutes']);
  await refuse('libellé en double (casse ignorée)', COMPTEUR, ['CPT002', 'débit / crédit', '1', true, false, false, 'minutes']);
  await refuse('formule vide', COMPTEUR, ['CPT002', 'B', ' ', true, false, false, 'minutes']);
  await refuse('formule trop longue', COMPTEUR, ['CPT002', 'B', '1'.repeat(2001), true, false, false, 'minutes']);
  await refuse('aucune périodicité', COMPTEUR, ['CPT002', 'B', '1', false, false, false, 'minutes']);
  await refuse('unité inconnue', COMPTEUR, ['CPT002', 'B', '1', true, false, false, 'euros']);
  await refuse('version en double', VERSION, ['CPT001', 1]);

  console.log('Historique');
  await attendu('valeur OK', HISTO, ['1001', 'JOUR', '2026-10-26', '2026-10-26', 15, 1, 'OK', null]);
  await attendu('erreur avec message', HISTO, ['1001', 'JOUR', '2026-10-27', '2026-10-27', null, 1, 'ERREUR', 'Donnée manquante']);
  await attendu('mensuel distinct du journalier', HISTO, ['1001', 'MOIS', '2026-10-01', '2026-10-31', 120, 1, 'OK', null]);
  await attendu('à recalculer garde l\'ancienne valeur', HISTO, ['1002', 'JOUR', '2026-10-26', '2026-10-26', 4, 1, 'A_RECALCULER', null]);
  await refuse('même période en double', HISTO, ['1001', 'JOUR', '2026-10-26', '2026-10-26', 20, 1, 'OK', null]);
  await refuse('OK sans valeur (0 jamais inventé)', HISTO, ['1003', 'JOUR', '2026-10-26', '2026-10-26', null, 1, 'OK', null]);
  await refuse('ERREUR avec valeur', HISTO, ['1003', 'JOUR', '2026-10-26', '2026-10-26', 0, 1, 'ERREUR', 'x']);
  await refuse('ERREUR sans message', HISTO, ['1003', 'JOUR', '2026-10-26', '2026-10-26', null, 1, 'ERREUR', null]);
  await refuse('périodicité inconnue', HISTO, ['1003', 'ANNEE', '2026-01-01', '2026-12-31', 1, 1, 'OK', null]);
  await refuse('période inversée', HISTO, ['1003', 'MOIS', '2026-10-31', '2026-10-01', 1, 1, 'OK', null]);
  await refuse('version de formule inexistante', HISTO, ['1003', 'JOUR', '2026-10-26', '2026-10-26', 1, 9, 'OK', null]);
  await refuse('compteur inexistant', `INSERT INTO historique_compteurs (id_employe, id_compteur, periodicite, periode_debut, periode_fin, valeur, unite, version_formule, statut_calcul)
                                        VALUES ('1001', 'INCONNU', 'JOUR', '2026-10-26', '2026-10-26', 1, 'minutes', 1, 'OK')`);

  console.log('Suppression contrôlée');
  await refuse('suppression d\'un compteur avec historique', `DELETE FROM compteurs WHERE id_compteur = 'CPT001'`);
  await attendu('désactivation conserve l\'historique', `UPDATE compteurs SET actif = FALSE WHERE id_compteur = 'CPT001'`);
  const { rows } = await client.query(`SELECT count(*)::int AS n FROM historique_compteurs WHERE id_compteur = 'CPT001'`);
  if (rows[0].n !== 4) {
    echecs++;
    console.log(`  FAIL historique conservé : ${rows[0].n} lignes`);
  } else {
    console.log('  ok   historique conservé après désactivation');
  }
} finally {
  await client.query('ROLLBACK');
  await client.end();
}

console.log(echecs === 0 ? '\nTout est conforme (transaction annulée, base inchangée).' : `\n${echecs} échec(s).`);
process.exit(echecs === 0 ? 0 : 1);
