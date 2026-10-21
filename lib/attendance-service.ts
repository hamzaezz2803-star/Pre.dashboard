/**
 * Couche d'accès aux données de pointage.
 *
 * C'EST ICI QU'IL FAUT BRANCHER LA BASE DE DONNÉES.
 * Les composants n'appellent que ces trois fonctions. Remplacez leur corps
 * (requêtes SQL, ORM ou API) en conservant les signatures et les types
 * retournés, le reste de l'interface n'aura pas à changer.
 */

import { listWorkdays, minutesBetween } from "./dates";
import {
  EMPLOYEES,
  getMockAbsences,
  getMockPunches,
  getMockWindow,
} from "./mock-data";
import type {
  AttendanceQuery,
  AttendanceRow,
  EmployeeSuggestion,
} from "./types";

const LATENCY_MS = 450;

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const normalize = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

export async function getDepartments(): Promise<string[]> {
  try {
    const res = await fetch("/api/departements");
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) return data;
    }
  } catch {
    // Échec de requête ignoré
  }
  return [];
}

export async function searchEmployees(
  query: string,
): Promise<EmployeeSuggestion[]> {
  const q = query.trim();
  if (q.length < 1) return [];
  try {
    const res = await fetch(`/api/personnel?q=${encodeURIComponent(q)}`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) return data;
    }
  } catch {
    // Échec de requête ignoré
  }
  return [];
}

export async function getAttendance(
  params: AttendanceQuery,
): Promise<AttendanceRow[]> {
  await wait(LATENCY_MS);
  if (params.simulateError) {
    throw new Error("Erreur simulée du service de pointage.");
  }

  const { from, to } = params;
  const department =
    params.department && params.department !== "all" ? params.department : null;
  const q = params.query ? normalize(params.query) : "";

  const now = new Date();
  const punches = getMockPunches(now);
  const absencesByEmployee = getMockAbsences(now);
  const win = getMockWindow(now);

  // Les absences ne sont calculées que là où des données existent.
  const absFrom = from > win.start ? from : win.start;
  const absTo = to < win.end ? to : win.end;
  const absenceDays = new Set(listWorkdays(absFrom, absTo));

  const employees = EMPLOYEES.filter((e) => {
    if (department && e.departement !== department) return false;
    if (!q) return true;
    return normalize(`${e.id} ${e.nom} ${e.prenom}`).includes(q) ||
      normalize(`${e.prenom} ${e.nom}`).includes(q);
  });

  return employees.map((e): AttendanceRow => {
    const mine = punches
      .filter((p) => p.employeeId === e.id && p.date >= from && p.date <= to)
      .sort((a, b) =>
        a.date === b.date
          ? a.time.localeCompare(b.time)
          : a.date.localeCompare(b.date),
      );

    // Temps de présence : somme des paires entrée/sortie de chaque jour.
    // Un pointage impair en fin de journée n'est pas apparié et n'est pas compté.
    const byDay = new Map<string, string[]>();
    for (const p of mine) {
      const list = byDay.get(p.date) ?? [];
      list.push(p.time);
      byDay.set(p.date, list);
    }
    let presenceMinutes = 0;
    for (const times of byDay.values()) {
      for (let i = 0; i + 1 < times.length; i += 2) {
        presenceMinutes += minutesBetween(times[i], times[i + 1]);
      }
    }

    const absent = absencesByEmployee.get(e.id) ?? new Set<string>();
    const absenceDates = [...absent].filter((d) => absenceDays.has(d)).sort();

    const first = mine[0];
    const last = mine[mine.length - 1];

    return {
      id: e.id,
      nom: e.nom,
      prenom: e.prenom,
      prestation: e.prestation,
      firstPunch: first ? `${first.date}T${first.time}` : null,
      lastPunch: last ? `${last.date}T${last.time}` : null,
      punchCount: mine.length,
      zones: [...new Set(mine.map((p) => p.zone))],
      eventTime: null,
      presenceMinutes,
      absenceCount: absenceDates.length,
      absenceDates,
    };
  });
}
