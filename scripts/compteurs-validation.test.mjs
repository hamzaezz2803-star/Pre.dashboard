import assert from "node:assert/strict";
import { test } from "node:test";
import {
  executerTest,
  normaliserIdCompteur,
  validerCompteur,
  validerDemandeTest,
  validerFormule,
} from "../lib/compteurs/validation.js";

const VALIDE = {
  id_compteur: "cpt001",
  libelle: "  Débit / Crédit ",
  formule: "DUREE_TRAVAILLEE_MIN - DUREE_PREVUE_MIN",
  journalier: true,
  hebdomadaire: false,
  mensuel: true,
  unite: "minutes",
};

const champs = (r) => r.erreurs.map((e) => e.champ);

test("identifiant normalisé ou refusé", () => {
  assert.equal(normaliserIdCompteur(" cpt-001 "), "CPT-001");
  for (const id of ["", "-A", "A B", "A".repeat(31), "é", null, 12, "../x"]) {
    assert.equal(normaliserIdCompteur(id), null, String(id));
  }
});

test("création valide : valeurs normalisées", () => {
  const r = validerCompteur(VALIDE);
  assert.equal(r.ok, true);
  assert.equal(r.valeurs.id_compteur, "CPT001");
  assert.equal(r.valeurs.libelle, "Débit / Crédit");
  assert.equal(r.valeurs.hebdomadaire, false);
  assert.equal(validerCompteur({ ...VALIDE, unite: undefined }).valeurs.unite, "minutes");
});

test("création : champs obligatoires et types", () => {
  assert.deepEqual(champs(validerCompteur({})).sort(), ["formule", "id_compteur", "libelle"]);
  assert.deepEqual(champs(validerCompteur({ ...VALIDE, journalier: "oui" })), ["journalier"]);
  assert.deepEqual(champs(validerCompteur({ ...VALIDE, unite: "euros" })), ["unite"]);
  assert.deepEqual(champs(validerCompteur({ ...VALIDE, libelle: "x".repeat(101) })), ["libelle"]);
  assert.deepEqual(champs(validerCompteur({ ...VALIDE, description: "x".repeat(501) })), ["description"]);
  assert.deepEqual(champs(validerCompteur({ ...VALIDE, journalier: false, mensuel: false })), ["periodicites"]);
  assert.equal(validerCompteur(null).ok, false);
  assert.equal(validerCompteur([]).ok, false);
});

test("création : formule contrôlée pour chaque périodicité", () => {
  const syntaxe = validerCompteur({ ...VALIDE, formule: "1 +" });
  assert.equal(syntaxe.erreurs.length, 1, "même erreur fusionnée");
  assert.equal(syntaxe.erreurs[0].periodicite, undefined);

  // PRESENT n'existe qu'au jour : refusé pour le mensuel uniquement
  const r = validerCompteur({ ...VALIDE, formule: "PRESENT * 2" });
  assert.equal(r.ok, false);
  assert.deepEqual(r.erreurs.map((e) => [e.periodicite, e.code]), [["MOIS", "VARIABLE_INCONNUE"]]);
  assert.equal(validerCompteur({ ...VALIDE, formule: "PRESENT * 2", mensuel: false }).ok, true);
});

test("modification partielle", () => {
  const existant = { ...validerCompteur(VALIDE).valeurs, actif: true };
  assert.deepEqual(validerCompteur({ actif: false }, { partiel: true, existant }).valeurs, { actif: false });
  assert.deepEqual(champs(validerCompteur({ id_compteur: "X" }, { partiel: true, existant })), ["id_compteur"]);
  assert.deepEqual(champs(validerCompteur({ journalier: false, mensuel: false }, { partiel: true, existant })), ["periodicites"]);
  // Activer le mensuel revalide la formule existante avec les variables mensuelles
  const jourSeul = { ...existant, formule: "PRESENT", mensuel: false };
  assert.equal(validerCompteur({ mensuel: true }, { partiel: true, existant: jourSeul }).ok, false);
  assert.equal(validerCompteur({ description: null }, { partiel: true, existant }).valeurs.description, null);
});

test("valider-formule", () => {
  assert.deepEqual(validerFormule("RETARD_MIN + NB_ABSENCES", ["MOIS"]), { ok: true, variables: ["NB_ABSENCES", "RETARD_MIN"] });
  assert.equal(validerFormule("RETARD_MIN", []).ok, false);
  assert.equal(validerFormule("RETARD_MIN", ["ANNEE"]).ok, false);
  assert.equal(validerFormule(42, ["JOUR"]).ok, false);
});

test("tester-formule : valeurs d'exemple contrôlées", () => {
  const d = validerDemandeTest({ formule: "IF(retard_min > 10, RETARD_MIN, 0)", periodicite: "JOUR", valeurs: { retard_min: 15 } });
  assert.equal(d.ok, true);
  assert.deepEqual(executerTest(d), { ok: true, valeur: 15 });

  const manquante = validerDemandeTest({ formule: "RETARD_MIN", periodicite: "JOUR", valeurs: { RETARD_MIN: null } });
  assert.equal(executerTest(manquante).code, "DONNEE_MANQUANTE");

  const invalide = validerDemandeTest({ formule: "1 +", periodicite: "JOUR" });
  assert.equal(executerTest(invalide).code, "SYNTAXE");

  assert.equal(validerDemandeTest({ formule: "1", periodicite: "JOUR", valeurs: { SALAIRE: 1 } }).ok, false);
  assert.equal(validerDemandeTest({ formule: "1", periodicite: "MOIS", valeurs: { PRESENT: 1 } }).ok, false);
  assert.equal(validerDemandeTest({ formule: "1", periodicite: "JOUR", valeurs: { RETARD_MIN: "5" } }).ok, false);
  assert.equal(validerDemandeTest({ formule: "1", periodicite: "JOUR", valeurs: { __proto__: 1 } }).ok, true);
  assert.equal(validerDemandeTest({ formule: "1", periodicite: "JOUR", valeurs: JSON.parse('{"__proto__": 1}') }).ok, false);
  assert.equal(validerDemandeTest({ formule: "1", periodicite: "SIECLE" }).ok, false);
  assert.equal(validerDemandeTest(null).ok, false);
});
