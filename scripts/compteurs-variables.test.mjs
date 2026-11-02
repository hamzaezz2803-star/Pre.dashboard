import assert from "node:assert/strict";
import { test } from "node:test";
import {
  VARIABLES_COMPTEURS,
  agregerContextes,
  construireContexteJour,
  periodeContenant,
  variablesPourPeriodicite,
} from "../lib/compteurs/variables.ts";
import { compilerFormule, evaluerFormule } from "../lib/compteurs/formule.ts";

const jour = (surcharges = {}) => ({
  jour: "2026-10-26",
  horaireId: "H-MATIN",
  horaireNom: "EQUIPE_A_MATIN",
  dureePrevueMin: 480,
  ecartEntreeMin: -8,
  ecartSortieMin: 7,
  dureeReelleMin: 495,
  estNuit: false,
  nbPointages: 2,
  amplitudePointagesMin: 495,
  ...surcharges,
});

test("catalogue : noms uniques, en majuscules, documentés", () => {
  const noms = VARIABLES_COMPTEURS.map((v) => v.nom);
  assert.equal(new Set(noms).size, noms.length);
  for (const v of VARIABLES_COMPTEURS) {
    assert.match(v.nom, /^[A-Z][A-Z0-9_]*$/);
    assert.ok(v.libelle && v.source && v.regle && v.periodicites.length > 0, v.nom);
  }
  assert.ok(variablesPourPeriodicite("JOUR").includes("RETARD_MIN"));
  assert.ok(!variablesPourPeriodicite("JOUR").includes("NB_ABSENCES"));
  assert.ok(variablesPourPeriodicite("MOIS").includes("NB_ABSENCES"));
  assert.ok(!variablesPourPeriodicite("MOIS").includes("PRESENT"));
});

test("journée avec horaire affecté, arrivée en avance", () => {
  assert.deepEqual(construireContexteJour(jour()), {
    DUREE_PREVUE_MIN: 480,
    DUREE_TRAVAILLEE_MIN: 495,
    RETARD_MIN: 0,
    AVANCE_MIN: 8,
    DEPART_ANTICIPE_MIN: 0,
    DEPASSEMENT_MIN: 7,
    NB_POINTAGES: 2,
    A_HORAIRE: 1,
    EST_NUIT: 0,
    PRESENT: 1,
  });
});

test("retard et départ anticipé", () => {
  const c = construireContexteJour(jour({ ecartEntreeMin: 32, ecartSortieMin: -20 }));
  assert.equal(c.RETARD_MIN, 32);
  assert.equal(c.AVANCE_MIN, 0);
  assert.equal(c.DEPART_ANTICIPE_MIN, 20);
  assert.equal(c.DEPASSEMENT_MIN, 0);
});

test("poste de nuit traversant minuit", () => {
  const c = construireContexteJour(jour({ estNuit: true, dureeReelleMin: 490 }));
  assert.equal(c.EST_NUIT, 1);
  assert.equal(c.DUREE_TRAVAILLEE_MIN, 490);
});

test("poste en cours : sortie manquante, jamais 0 inventé", () => {
  const c = construireContexteJour(jour({ ecartSortieMin: null, dureeReelleMin: null, nbPointages: 1 }));
  assert.equal(c.DUREE_TRAVAILLEE_MIN, null);
  assert.equal(c.DEPART_ANTICIPE_MIN, null);
  assert.equal(c.PRESENT, 1);
  const r = evaluerFormule(compilerFormule("DUREE_TRAVAILLEE_MIN - DUREE_PREVUE_MIN", variablesPourPeriodicite("JOUR")), c);
  assert.equal(r.ok, false);
  assert.equal(r.code, "DONNEE_MANQUANTE");
});

test("sans horaire affecté : durée par amplitude des pointages", () => {
  const sans = { horaireId: null, horaireNom: null, dureePrevueMin: null, ecartEntreeMin: null, ecartSortieMin: null, dureeReelleMin: null, estNuit: null };
  const c = construireContexteJour(jour({ ...sans, nbPointages: 3, amplitudePointagesMin: 300 }));
  assert.equal(c.A_HORAIRE, 0);
  assert.equal(c.DUREE_PREVUE_MIN, null);
  assert.equal(c.RETARD_MIN, null);
  assert.equal(c.EST_NUIT, null);
  assert.equal(c.DUREE_TRAVAILLEE_MIN, 300);
  const unSeul = construireContexteJour(jour({ ...sans, nbPointages: 1, amplitudePointagesMin: 0 }));
  assert.equal(unSeul.DUREE_TRAVAILLEE_MIN, null);
  const aucun = construireContexteJour(jour({ ...sans, nbPointages: 0, amplitudePointagesMin: null }));
  assert.equal(aucun.PRESENT, 0);
});

test("agrégation hebdomadaire", () => {
  const sans = { horaireId: null, dureePrevueMin: null, ecartEntreeMin: null, ecartSortieMin: null, dureeReelleMin: null, estNuit: null };
  const jours = [
    construireContexteJour(jour({ ecartEntreeMin: 10 })),
    construireContexteJour(jour({ ecartEntreeMin: 5, dureeReelleMin: 470 })),
    construireContexteJour(jour({ nbPointages: 0, ecartEntreeMin: null, ecartSortieMin: null, dureeReelleMin: null })), // absent
    construireContexteJour(jour({ ecartSortieMin: null, dureeReelleMin: null, nbPointages: 1 })), // incomplet
    construireContexteJour(jour({ ...sans, nbPointages: 0, amplitudePointagesMin: null })), // repos
  ];
  const c = agregerContextes(jours);
  assert.equal(c.NB_JOURS, 5);
  assert.equal(c.NB_JOURS_PLANIFIES, 4);
  assert.equal(c.NB_JOURS_TRAVAILLES, 3);
  assert.equal(c.NB_ABSENCES, 1);
  assert.equal(c.NB_JOURS_INCOMPLETS, 1);
  assert.equal(c.DUREE_PREVUE_MIN, 1920);
  assert.equal(c.DUREE_TRAVAILLEE_MIN, 965);
  assert.equal(c.RETARD_MIN, 15);
  assert.equal(c.NB_POINTAGES, 5);
  assert.equal(c.PRESENT, undefined);

  // Aucune valeur connue → manquante, pas 0
  assert.equal(agregerContextes([]).DUREE_TRAVAILLEE_MIN, null);
  assert.equal(agregerContextes([]).NB_JOURS, 0);
});

test("formule mensuelle sur contexte agrégé", () => {
  const f = compilerFormule("IF(NB_ABSENCES > 0, NB_ABSENCES, 0) + ROUND(RETARD_MIN / 60, 1)", variablesPourPeriodicite("MOIS"));
  const c = agregerContextes([construireContexteJour(jour({ ecartEntreeMin: 90 })), construireContexteJour(jour({ nbPointages: 0, ecartEntreeMin: null }))]);
  assert.deepEqual(evaluerFormule(f, c), { ok: true, valeur: 2.5 });
});

test("périodes", () => {
  assert.deepEqual(periodeContenant("JOUR", "2026-11-02"), { debut: "2026-11-02", fin: "2026-11-02" });
  assert.deepEqual(periodeContenant("SEMAINE", "2026-11-02"), { debut: "2026-11-02", fin: "2026-11-08" }); // lundi
  assert.deepEqual(periodeContenant("SEMAINE", "2026-11-08"), { debut: "2026-11-02", fin: "2026-11-08" }); // dimanche
  assert.deepEqual(periodeContenant("SEMAINE", "2026-12-31"), { debut: "2026-12-28", fin: "2027-01-03" });
  assert.deepEqual(periodeContenant("MOIS", "2028-02-15"), { debut: "2028-02-01", fin: "2028-02-29" });
  assert.throws(() => periodeContenant("MOIS", "2026-02-30"));
  assert.throws(() => periodeContenant("JOUR", "02/11/2026"));
});
