import assert from "node:assert/strict";
import { test } from "node:test";
import { compilerFormule, evaluerFormule, testerFormule, LIMITES_FORMULE } from "../lib/compteurs/formule.ts";

const VARS = ["DUREE_TRAVAILLEE_MIN", "DUREE_PREVUE_MIN", "RETARD_MIN", "NB_POINTAGES"];
const CTX = { DUREE_TRAVAILLEE_MIN: 500, DUREE_PREVUE_MIN: 480, RETARD_MIN: 15, NB_POINTAGES: 2 };

const ok = (formule, ctx = CTX) => {
  const r = testerFormule(formule, VARS, ctx);
  assert.equal(r.ok, true, r.ok ? "" : `${formule} → ${r.message}`);
  return r.valeur;
};
const ko = (formule, code, ctx = CTX) => {
  const r = testerFormule(formule, VARS, ctx);
  assert.equal(r.ok, false, `${formule} aurait dû échouer`);
  assert.equal(r.code, code, `${formule} → ${r.message}`);
  return r;
};

test("exemples de la spécification", () => {
  assert.equal(ok("DUREE_TRAVAILLEE_MIN - DUREE_PREVUE_MIN"), 20);
  assert.equal(ok("MAX(0, DUREE_TRAVAILLEE_MIN - DUREE_PREVUE_MIN)"), 20);
  assert.equal(ok("IF(RETARD_MIN > 10, RETARD_MIN, 0)"), 15);
  assert.equal(ok("IF(NB_POINTAGES = 0, 1, 0)"), 0);
  assert.equal(ok("ROUND((DUREE_TRAVAILLEE_MIN / DUREE_PREVUE_MIN) * 100, 2)"), 104.17);
});

test("priorités, parenthèses, signes et casse", () => {
  assert.equal(ok("2 + 3 * 4"), 14);
  assert.equal(ok("(2 + 3) * 4"), 20);
  assert.equal(ok("-2 * -3"), 6);
  assert.equal(ok("10 - 4 - 3"), 3);
  assert.equal(ok("12 / 4 / 3"), 1);
  assert.equal(ok("retard_min + 0.5"), 15.5);
  assert.equal(ok("if(retard_min >= 15 and not nb_pointages <> 2, 1, 0)"), 1);
  assert.equal(ok("IF(TRUE OR RETARD_MIN / 0 > 1, 7, 8)"), 7);
});

test("fonctions", () => {
  assert.equal(ok("MIN(3, 1, 2)"), 1);
  assert.equal(ok("ABS(-4)"), 4);
  assert.equal(ok("ROUND(2.5)"), 3);
  assert.equal(ok("ROUND(-2.5)"), -3);
  assert.equal(ok("ROUND(1.005, 2)"), 1.01);
  assert.equal(ok("FLOOR(2.7) + CEIL(2.1)"), 5);
  assert.equal(ok("COALESCE(RETARD_MIN, 0)", {}), 0);
});

test("donnée manquante : erreur explicite, jamais 0 inventé", () => {
  const r = ko("DUREE_TRAVAILLEE_MIN - DUREE_PREVUE_MIN", "DONNEE_MANQUANTE", { DUREE_PREVUE_MIN: 480 });
  assert.deepEqual(r.variablesManquantes, ["DUREE_TRAVAILLEE_MIN"]);
  ko("COALESCE(RETARD_MIN, NB_POINTAGES)", "DONNEE_MANQUANTE", {});
  // Branche non retenue : la donnée manquante n'est pas nécessaire
  assert.equal(ok("IF(NB_POINTAGES > 0, 1, RETARD_MIN)", { NB_POINTAGES: 2 }), 1);
});

test("division par zéro", () => {
  ko("DUREE_TRAVAILLEE_MIN / (NB_POINTAGES - 2)", "DIVISION_PAR_ZERO");
});

test("formules invalides refusées avec un message", () => {
  ko("", "FORMULE_VIDE");
  ko("1 +", "SYNTAXE");
  ko("(1 + 2", "SYNTAXE");
  ko("1 2", "SYNTAXE");
  ko("1..2", "SYNTAXE");
  ko("SALAIRE * 2", "VARIABLE_INCONNUE");
  ko("SQRT(4)", "FONCTION_INCONNUE");
  ko("IF(1, 2)", "NOMBRE_ARGUMENTS");
  ko("IF(RETARD_MIN, 1, 0)", "TYPE");
  ko("RETARD_MIN > 10", "TYPE");
  ko("TRUE + 1", "TYPE");
  ko("1 < 2 < 3", "TYPE");
  ko("ROUND(1.234, RETARD_MIN)", "VALEUR_INVALIDE");
  ko("x".repeat(LIMITES_FORMULE.longueurMax + 1), "FORMULE_TROP_LONGUE");
  ko("(".repeat(60) + "1" + ")".repeat(60), "FORMULE_TROP_COMPLEXE");
  ko(Array(400).fill("1").join("+"), "FORMULE_TROP_COMPLEXE");
});

test("tentatives d'injection refusées", () => {
  for (const f of [
    "process.exit(1)",
    "constructor.constructor('return 1')()",
    "require('fs')",
    "1; DROP TABLE users",
    "`ls`",
    "RETARD_MIN || 1",
    "__proto__",
    "eval(1)",
  ]) {
    const r = testerFormule(f, VARS, CTX);
    assert.equal(r.ok, false, `injection acceptée : ${f}`);
  }
  // Une clé héritée du prototype n'est jamais lue comme variable
  const r = testerFormule("CONSTRUCTOR", ["CONSTRUCTOR"], {});
  assert.equal(r.code, "DONNEE_MANQUANTE");
});

test("valeurs de contexte invalides", () => {
  ko("RETARD_MIN", "VALEUR_INVALIDE", { RETARD_MIN: Number.NaN });
  ko("RETARD_MIN", "VALEUR_INVALIDE", { RETARD_MIN: "15" });
});

test("compilation réutilisable et liste des variables", () => {
  const f = compilerFormule("IF(retard_min > 10, RETARD_MIN, 0) + NB_POINTAGES", VARS);
  assert.deepEqual(f.variables.sort(), ["NB_POINTAGES", "RETARD_MIN"]);
  assert.deepEqual(evaluerFormule(f, new Map([["RETARD_MIN", 5], ["NB_POINTAGES", 4]])), { ok: true, valeur: 4 });
  assert.deepEqual(evaluerFormule(f, { RETARD_MIN: 20, NB_POINTAGES: 0 }), { ok: true, valeur: 20 });
});
