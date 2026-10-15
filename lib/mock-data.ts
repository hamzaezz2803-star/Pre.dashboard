import { addDays, listWorkdays, toISODate } from "./dates";
import type { Employee, Punch } from "./types";

/**
 * Données fictives. Aucune de ces personnes n'est réelle.
 * Remplacées par la base de données dans lib/attendance-service.ts.
 */

export const DEPARTMENTS = [
  "Production",
  "Maintenance",
  "Logistique",
  "Administration",
  "Qualité",
] as const;

export const ZONES = [
  "Entrée principale",
  "Atelier A",
  "Atelier B",
  "Bureaux",
  "Entrepôt",
  "Cantine",
] as const;

export const EMPLOYEES: Employee[] = [
  { id: "E001", nom: "Benali", prenom: "Youssef", prestation: "Opérateur de production", departement: "Production" },
  { id: "E002", nom: "El Amrani", prenom: "Fatima Zahra", prestation: "Technicienne qualité", departement: "Qualité" },
  { id: "E003", nom: "Alaoui", prenom: "Mehdi", prestation: "Chef d'équipe", departement: "Production" },
  { id: "E004", nom: "Bennani", prenom: "Salma", prestation: "Assistante administrative", departement: "Administration" },
  { id: "E005", nom: "Idrissi", prenom: "Karim", prestation: "Technicien de maintenance", departement: "Maintenance" },
  { id: "E006", nom: "Tazi", prenom: "Nadia", prestation: "Gestionnaire de stock", departement: "Logistique" },
  { id: "E007", nom: "Berrada", prenom: "Omar", prestation: "Conducteur d'engins", departement: "Logistique" },
  { id: "E008", nom: "Chraibi", prenom: "Imane", prestation: "Contrôleuse qualité", departement: "Qualité" },
  { id: "E009", nom: "Lahlou", prenom: "Rachid", prestation: "Électromécanicien", departement: "Maintenance" },
  { id: "E010", nom: "Fassi", prenom: "Khadija", prestation: "Comptable", departement: "Administration" },
  { id: "E011", nom: "Zniber", prenom: "Anas", prestation: "Opérateur de production", departement: "Production" },
  { id: "E012", nom: "Ouazzani", prenom: "Hajar", prestation: "Opératrice de production", departement: "Production" },
  { id: "E013", nom: "Kettani", prenom: "Hicham", prestation: "Magasinier", departement: "Logistique" },
  { id: "E014", nom: "Sebti", prenom: "Zineb", prestation: "Responsable qualité", departement: "Qualité" },
  { id: "E015", nom: "Mansouri", prenom: "Abdelilah", prestation: "Soudeur", departement: "Maintenance" },
  { id: "E016", nom: "Haddad", prenom: "Souad", prestation: "Secrétaire de direction", departement: "Administration" },
  { id: "E017", nom: "Naciri", prenom: "Tarik", prestation: "Opérateur de production", departement: "Production" },
  // Employé sans aucun pointage sur toute la période.
  { id: "E018", nom: "Rahmouni", prenom: "Larbi", prestation: "Agent d'entretien", departement: "Maintenance" },
];

export const NO_PUNCH_EMPLOYEE_ID = "E018";
/** Employé qui a souvent des pointages impairs (oubli de badger en sortie). */
const ODD_PUNCH_EMPLOYEES = new Set(["E003", "E007", "E011"]);

/** Nombre de jours d'historique générés avant aujourd'hui. */
export const HISTORY_DAYS = 56;

/** PRNG déterministe pour obtenir toujours les mêmes données. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const pad = (n: number): string => String(n).padStart(2, "0");
const clock = (minutes: number): string => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;

export interface MockWindow {
  /** Premier jour couvert par les données */
  start: string;
  /** Dernier jour couvert (hier) */
  end: string;
}

export function getMockWindow(now: Date = new Date()): MockWindow {
  const today = toISODate(now);
  return { start: addDays(today, -HISTORY_DAYS), end: addDays(today, -1) };
}

let cache: { key: string; punches: Punch[]; absences: Map<string, Set<string>> } | null = null;

function build(now: Date) {
  const win = getMockWindow(now);
  const key = `${win.start}_${win.end}`;
  if (cache && cache.key === key) return cache;

  const punches: Punch[] = [];
  const absences = new Map<string, Set<string>>();
  const workdays = listWorkdays(win.start, win.end);

  for (const emp of EMPLOYEES) {
    const absent = new Set<string>();
    absences.set(emp.id, absent);

    if (emp.id === NO_PUNCH_EMPLOYEE_ID) {
      workdays.forEach((d) => absent.add(d));
      continue;
    }

    const absenceRate = 0.05 + (hashString(emp.id) % 8) / 100;
    for (const date of workdays) {
      const rnd = mulberry32(hashString(`${emp.id}|${date}`));
      if (rnd() < absenceRate) {
        absent.add(date);
        continue;
      }

      const zone = ZONES[1 + Math.floor(rnd() * 5)];
      const workZone = emp.departement === "Administration" ? "Bureaux" : zone;
      const inMorning = 7 * 60 + 45 + Math.floor(rnd() * 40);
      const outNoon = 12 * 60 + 15 + Math.floor(rnd() * 30);
      const inAfternoon = outNoon + 45 + Math.floor(rnd() * 25);
      const outEvening = 17 * 60 + Math.floor(rnd() * 40) - 10;

      const day: Array<[number, string]> = [
        [inMorning, rnd() < 0.5 ? "Entrée principale" : workZone],
        [outNoon, "Cantine"],
        [inAfternoon, workZone],
        [outEvening, "Entrée principale"],
      ];
      let list = day;
      if (ODD_PUNCH_EMPLOYEES.has(emp.id) && rnd() < 0.3) {
        // Pointage impair : sortie du soir oubliée.
        list = day.slice(0, -1);
      } else if (rnd() < 0.03) {
        list = day.slice(0, -1);
      }

      for (const [minutes, z] of list) {
        punches.push({ employeeId: emp.id, date, time: clock(minutes), zone: z });
      }
    }
  }

  cache = { key, punches, absences };
  return cache;
}

export function getMockPunches(now: Date = new Date()): Punch[] {
  return build(now).punches;
}

export function getMockAbsences(now: Date = new Date()): Map<string, Set<string>> {
  return build(now).absences;
}
