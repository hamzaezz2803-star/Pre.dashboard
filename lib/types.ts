export interface Employee {
  id: string;
  nom: string;
  prenom: string;
  prestation: string;
  departement: string;
}

/** Un pointage brut (une entrée ou une sortie, selon son rang dans la journée). */
export interface Punch {
  employeeId: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  zone: string;
}

export interface AttendanceRow {
  id: string;
  nom: string;
  prenom: string;
  prestation: string;
  /** "YYYY-MM-DDTHH:mm" ou null si aucun pointage sur la période */
  firstPunch: string | null;
  lastPunch: string | null;
  punchCount: number;
  zones: string[];
  /** Horaire de pointage (v_pointages.event_time, Africa/Casablanca), "JJ/MM/AAAA HH:mm" ou null */
  eventTime: string | null;
  presenceMinutes: number;
  absenceCount: number;
  absenceDates: string[];
}

export interface AttendanceQuery {
  from: string;
  to: string;
  /** undefined ou "all" : tous les départements */
  department?: string;
  /** Texte libre : identifiant, nom ou prénom */
  query?: string;
  /** Pour tester l'état d'erreur */
  simulateError?: boolean;
}

export interface EmployeeSuggestion {
  id: string;
  nom: string;
  prenom: string;
}

/** Une ligne de la vue v_presence_jour (un employe, un jour). */
export interface PresenceRow {
  empCode: string;
  lastName: string;
  firstName: string;
  deptName: string;
  /** YYYY-MM-DD */
  jour: string;
  premierPointage: string | null;
  dernierPointage: string | null;
  nbPointages: number;
  tempsPresenceMin: number;
  statutPresence: string;
  horaire?: string | null;
}
