/**
 * Registre des variables utilisables dans les formules des compteurs.
 *
 * Chaque variable est documentée (nom, type, unité, source, règle de calcul)
 * et calculée à partir des tables existantes :
 *   - affectations_horaires_dynamiques : horaire affecté par journée de service
 *     (début/fin prévus, entrée/sortie réelles, y compris postes de nuit J+1)
 *   - cvaccess_horaires : nom de l'horaire
 *   - att_transaction : pointages bruts
 *
 * Ce module est pur (aucun accès base) : le chargement est fait par
 * `lib/compteurs/donnees.js`, qui fournit des `DonneesJour`.
 */

export type Periodicite = "JOUR" | "SEMAINE" | "MOIS";

export interface DefinitionVariable {
  nom: string;
  libelle: string;
  unite: "minutes" | "nombre" | "booleen";
  /** Périodicités où la variable est disponible. */
  periodicites: readonly Periodicite[];
  source: string;
  regle: string;
}

const TOUTES: readonly Periodicite[] = ["JOUR", "SEMAINE", "MOIS"];
const AGREGEES: readonly Periodicite[] = ["SEMAINE", "MOIS"];

const SOMME_PERIODE = " Semaine/mois : somme des journées où la valeur est connue.";

/** Catalogue des variables, exposé pour l'aide de l'éditeur de formules. */
export const VARIABLES_COMPTEURS: readonly DefinitionVariable[] = [
  {
    nom: "DUREE_PREVUE_MIN",
    libelle: "Durée prévue",
    unite: "minutes",
    periodicites: TOUTES,
    source: "affectations_horaires_dynamiques",
    regle: "Fin prévue − début prévu de l'horaire affecté. Manquante sans horaire affecté." + SOMME_PERIODE,
  },
  {
    nom: "DUREE_TRAVAILLEE_MIN",
    libelle: "Durée travaillée",
    unite: "minutes",
    periodicites: TOUTES,
    source: "affectations_horaires_dynamiques, att_transaction",
    regle:
      "Sortie réelle − entrée réelle de la journée de service (poste de nuit inclus). " +
      "Sans horaire affecté : dernier − premier pointage du jour civil (au moins 2 pointages). " +
      "Manquante si la sortie n'est pas encore pointée." + SOMME_PERIODE,
  },
  {
    nom: "RETARD_MIN",
    libelle: "Retard",
    unite: "minutes",
    periodicites: TOUTES,
    source: "affectations_horaires_dynamiques",
    regle: "Entrée réelle − début prévu, 0 si arrivé à l'heure. Manquante sans horaire ou sans entrée." + SOMME_PERIODE,
  },
  {
    nom: "AVANCE_MIN",
    libelle: "Arrivée en avance",
    unite: "minutes",
    periodicites: TOUTES,
    source: "affectations_horaires_dynamiques",
    regle: "Début prévu − entrée réelle, 0 si arrivé en retard ou à l'heure. Manquante sans horaire ou sans entrée." + SOMME_PERIODE,
  },
  {
    nom: "DEPART_ANTICIPE_MIN",
    libelle: "Départ anticipé",
    unite: "minutes",
    periodicites: TOUTES,
    source: "affectations_horaires_dynamiques",
    regle: "Fin prévue − sortie réelle, 0 si parti à l'heure ou après. Manquante sans horaire ou sans sortie." + SOMME_PERIODE,
  },
  {
    nom: "DEPASSEMENT_MIN",
    libelle: "Dépassement en fin de poste",
    unite: "minutes",
    periodicites: TOUTES,
    source: "affectations_horaires_dynamiques",
    regle: "Sortie réelle − fin prévue, 0 si parti à l'heure ou avant. Manquante sans horaire ou sans sortie." + SOMME_PERIODE,
  },
  {
    nom: "NB_POINTAGES",
    libelle: "Nombre de pointages",
    unite: "nombre",
    periodicites: TOUTES,
    source: "att_transaction",
    regle:
      "Pointages de la journée de service (entre l'entrée et la sortie réelles pour un horaire affecté, " +
      "sinon du jour civil hors sortie d'un poste de nuit de la veille)." + SOMME_PERIODE,
  },
  {
    nom: "A_HORAIRE",
    libelle: "Horaire affecté",
    unite: "booleen",
    periodicites: ["JOUR"],
    source: "affectations_horaires_dynamiques",
    regle: "1 si un horaire est affecté ce jour, sinon 0.",
  },
  {
    nom: "EST_NUIT",
    libelle: "Poste de nuit",
    unite: "booleen",
    periodicites: ["JOUR"],
    source: "affectations_horaires_dynamiques",
    regle: "1 si la fin prévue est le lendemain du début prévu, 0 sinon. Manquante sans horaire affecté.",
  },
  {
    nom: "PRESENT",
    libelle: "Présent",
    unite: "booleen",
    periodicites: ["JOUR"],
    source: "att_transaction",
    regle: "1 si au moins un pointage dans la journée de service, sinon 0.",
  },
  {
    nom: "NB_JOURS",
    libelle: "Jours de la période",
    unite: "nombre",
    periodicites: AGREGEES,
    source: "calendrier",
    regle: "Nombre de jours calendaires de la période.",
  },
  {
    nom: "NB_JOURS_PLANIFIES",
    libelle: "Jours planifiés",
    unite: "nombre",
    periodicites: AGREGEES,
    source: "affectations_horaires_dynamiques",
    regle: "Nombre de jours avec un horaire affecté.",
  },
  {
    nom: "NB_JOURS_TRAVAILLES",
    libelle: "Jours travaillés",
    unite: "nombre",
    periodicites: AGREGEES,
    source: "att_transaction",
    regle: "Nombre de jours avec au moins un pointage.",
  },
  {
    nom: "NB_ABSENCES",
    libelle: "Absences",
    unite: "nombre",
    periodicites: AGREGEES,
    source: "affectations_horaires_dynamiques, att_transaction",
    regle: "Nombre de jours planifiés sans aucun pointage.",
  },
  {
    nom: "NB_JOURS_INCOMPLETS",
    libelle: "Jours incomplets",
    unite: "nombre",
    periodicites: AGREGEES,
    source: "affectations_horaires_dynamiques, att_transaction",
    regle: "Nombre de jours pointés dont la durée travaillée est inconnue (sortie manquante).",
  },
];

/** Noms des variables disponibles pour une périodicité (pour compilerFormule). */
export function variablesPourPeriodicite(periodicite: Periodicite): string[] {
  return VARIABLES_COMPTEURS.filter((v) => v.periodicites.includes(periodicite)).map((v) => v.nom);
}

// ─── Données brutes d'une journée de service ─────────────────────────────────

/**
 * Données d'un employé pour une journée de service, telles que chargées en base.
 * Les écarts sont signés et calculés en SQL (pas de conversion de fuseau horaire côté Node).
 */
export interface DonneesJour {
  /** Date de la journée de service (YYYY-MM-DD). */
  jour: string;
  horaireId: string | null;
  horaireNom: string | null;
  /** Fin prévue − début prévu (minutes), null sans horaire. */
  dureePrevueMin: number | null;
  /** Entrée réelle − début prévu (minutes, signé), null sans horaire ou sans entrée. */
  ecartEntreeMin: number | null;
  /** Sortie réelle − fin prévue (minutes, signé), null sans horaire ou sans sortie. */
  ecartSortieMin: number | null;
  /** Sortie réelle − entrée réelle (minutes), null si incomplet. */
  dureeReelleMin: number | null;
  /** La fin prévue tombe le lendemain du début prévu. */
  estNuit: boolean | null;
  nbPointages: number;
  /** Dernier − premier pointage du jour civil (minutes), utilisé sans horaire affecté. */
  amplitudePointagesMin: number | null;
}

export type ContexteVariables = Record<string, number | null>;

const positif = (x: number | null) => (x === null ? null : Math.max(0, x));
const negatifInverse = (x: number | null) => (x === null ? null : Math.max(0, -x));

/** Construit les variables d'une journée à partir de ses données brutes. */
export function construireContexteJour(d: DonneesJour): ContexteVariables {
  const aHoraire = d.horaireId !== null;

  let dureeTravaillee: number | null;
  if (aHoraire) {
    dureeTravaillee = d.dureeReelleMin;
  } else {
    dureeTravaillee = d.nbPointages >= 2 ? d.amplitudePointagesMin : null;
  }

  return {
    DUREE_PREVUE_MIN: aHoraire ? d.dureePrevueMin : null,
    DUREE_TRAVAILLEE_MIN: dureeTravaillee,
    RETARD_MIN: aHoraire ? positif(d.ecartEntreeMin) : null,
    AVANCE_MIN: aHoraire ? negatifInverse(d.ecartEntreeMin) : null,
    DEPART_ANTICIPE_MIN: aHoraire ? negatifInverse(d.ecartSortieMin) : null,
    DEPASSEMENT_MIN: aHoraire ? positif(d.ecartSortieMin) : null,
    NB_POINTAGES: d.nbPointages,
    A_HORAIRE: aHoraire ? 1 : 0,
    EST_NUIT: aHoraire && d.estNuit !== null ? (d.estNuit ? 1 : 0) : null,
    PRESENT: d.nbPointages > 0 ? 1 : 0,
  };
}

const VARIABLES_SOMMEES = [
  "DUREE_PREVUE_MIN",
  "DUREE_TRAVAILLEE_MIN",
  "RETARD_MIN",
  "AVANCE_MIN",
  "DEPART_ANTICIPE_MIN",
  "DEPASSEMENT_MIN",
  "NB_POINTAGES",
] as const;

/**
 * Agrège les journées d'une semaine ou d'un mois.
 * Les sommes ignorent les journées où la valeur est inconnue ; si aucune
 * journée n'est connue, la variable est manquante (jamais 0 inventé).
 * NB_JOURS_INCOMPLETS permet de détecter une somme partielle.
 */
export function agregerContextes(jours: readonly ContexteVariables[]): ContexteVariables {
  const ctx: ContexteVariables = {};

  for (const nom of VARIABLES_SOMMEES) {
    const connues = jours.map((j) => j[nom]).filter((v): v is number => v !== null && v !== undefined);
    ctx[nom] = connues.length > 0 ? connues.reduce((a, b) => a + b, 0) : null;
  }

  ctx.NB_JOURS = jours.length;
  ctx.NB_JOURS_PLANIFIES = jours.filter((j) => j.A_HORAIRE === 1).length;
  ctx.NB_JOURS_TRAVAILLES = jours.filter((j) => j.PRESENT === 1).length;
  ctx.NB_ABSENCES = jours.filter((j) => j.A_HORAIRE === 1 && j.PRESENT === 0).length;
  ctx.NB_JOURS_INCOMPLETS = jours.filter((j) => j.PRESENT === 1 && j.DUREE_TRAVAILLEE_MIN === null).length;

  return ctx;
}

// ─── Périodes ────────────────────────────────────────────────────────────────

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function versDate(iso: string): Date {
  if (!ISO_DATE.test(iso)) throw new Error(`Date invalide : ${iso}`);
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso) throw new Error(`Date invalide : ${iso}`);
  return d;
}

const versIso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Période (début et fin inclus) contenant une date.
 * Semaine : du lundi au dimanche (à confirmer avec le responsable).
 */
export function periodeContenant(periodicite: Periodicite, dateIso: string): { debut: string; fin: string } {
  const d = versDate(dateIso);
  if (periodicite === "JOUR") return { debut: dateIso, fin: dateIso };
  if (periodicite === "SEMAINE") {
    const decalage = (d.getUTCDay() + 6) % 7; // lundi = 0
    const debut = new Date(d);
    debut.setUTCDate(d.getUTCDate() - decalage);
    const fin = new Date(debut);
    fin.setUTCDate(debut.getUTCDate() + 6);
    return { debut: versIso(debut), fin: versIso(fin) };
  }
  const debut = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const fin = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
  return { debut: versIso(debut), fin: versIso(fin) };
}
