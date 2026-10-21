import assert from "node:assert/strict";
import { test } from "node:test";
import { formatStatut, getStatutTon } from "../lib/status.ts";

test("late,noCheckOut,absent", () => {
  const s = "late,noCheckOut,absent";
  assert.equal(formatStatut(s, 2), "Retard · Sortie manquante · Absent");
  assert.equal(getStatutTon(s), "absent");
});

test("noSch", () => {
  assert.equal(formatStatut("noSch", 0), "Pas d'horaire");
  assert.equal(getStatutTon("noSch"), "sans-horaire");
});

test("valeur vide avec pointages complets", () => {
  assert.equal(formatStatut("", 2), "Présent");
  assert.equal(getStatutTon(""), "present");
});

test("vide sans pointage, inconnus et doublons", () => {
  assert.equal(formatStatut("", 0), "-");
  assert.equal(formatStatut(null, 0), "-");
  assert.equal(formatStatut("late,late,foo"), "Retard · foo");
});
