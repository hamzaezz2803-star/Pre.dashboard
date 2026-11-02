import { periodeContenant } from './variables.ts';

/**
 * Données de l'écran « Détail jour » pour un employé et une journée de service :
 * identité, horaire affecté (lu dans les tables existantes), pointages et
 * valeurs des compteurs (jour, semaine et mois contenant la date).
 *
 * Lecture seule. Le contrôle du périmètre est fait par la route appelante.
 */

/** Libellés des états de pointage ZKBio (att_transaction.att_state). */
const ETATS_POINTAGE = {
  0: { code: 'E', libelle: 'Entrée' },
  1: { code: 'S', libelle: 'Sortie' },
  2: { code: 'PS', libelle: 'Sortie pause' },
  3: { code: 'PE', libelle: 'Retour pause' },
  4: { code: 'HSE', libelle: 'Entrée heures sup.' },
  5: { code: 'HSS', libelle: 'Sortie heures sup.' },
};

export function libelleEtat(etat) {
  return ETATS_POINTAGE[etat] ?? { code: '?', libelle: 'Pointage' };
}

/** Identité de l'employé, ou null s'il n'existe pas. */
export async function lireEmploye(db, pin) {
  const { rows } = await db.query(
    `SELECT p.pin::text AS pin, p.name AS prenom, p.last_name AS nom,
            (SELECT d.name FROM auth_department d WHERE d.id = p.auth_dept_id LIMIT 1) AS departement
     FROM pers_person p WHERE p.pin::text = $1 LIMIT 1`,
    [pin]
  );
  return rows[0] ?? null;
}

/** Horaire affecté pour la journée de service (affectations_horaires_dynamiques + cvaccess_horaires). */
export async function lireHoraire(db, pin, date) {
  const { rows } = await db.query(
    `SELECT a.cvaccess_horaire_id AS id, h.period_name AS nom,
            TO_CHAR(h.to_work_time, 'HH24:MI') AS heure_debut,
            TO_CHAR(h.off_work_time, 'HH24:MI') AS heure_fin,
            TO_CHAR(a.debut_prevu, 'YYYY-MM-DD"T"HH24:MI') AS debut_prevu,
            TO_CHAR(a.fin_prevue, 'YYYY-MM-DD"T"HH24:MI') AS fin_prevue,
            TO_CHAR(a.heure_entree, 'YYYY-MM-DD"T"HH24:MI') AS heure_entree,
            TO_CHAR(a.heure_sortie, 'YYYY-MM-DD"T"HH24:MI') AS heure_sortie,
            (a.fin_prevue::date > a.debut_prevu::date) AS est_nuit,
            a.statut
     FROM affectations_horaires_dynamiques a
     JOIN pers_person p ON p.id = a.cvaccess_person_id
     LEFT JOIN cvaccess_horaires h ON h.cvaccess_horaire_id = a.cvaccess_horaire_id
     WHERE p.pin::text = $1 AND a.date_service = $2::date
     LIMIT 1`,
    [pin, date]
  );
  return rows[0] ?? null;
}

/**
 * Pointages de la journée de service, même rattachement que
 * lib/compteurs/donnees.js : fenêtre entrée → sortie réelles pour un horaire
 * affecté (poste de nuit inclus), sinon jour civil hors pointages rattachés
 * au poste d'une autre journée.
 */
export async function lirePointages(db, pin, date) {
  const { rows } = await db.query(
    `WITH aff AS (
       SELECT a.date_service, a.heure_entree, a.heure_sortie
       FROM affectations_horaires_dynamiques a
       JOIN pers_person p ON p.id = a.cvaccess_person_id
       WHERE p.pin::text = $1 AND a.date_service BETWEEN $2::date - 1 AND $2::date + 1
     ),
     jour AS (SELECT * FROM aff WHERE date_service = $2::date)
     SELECT TO_CHAR(t.att_datetime, 'YYYY-MM-DD"T"HH24:MI:SS') AS horodatage, t.att_state AS etat
     FROM att_transaction t
     LEFT JOIN jour ON TRUE
     WHERE t.pers_person_pin = $1
       AND CASE
         WHEN jour.heure_entree IS NOT NULL AND jour.heure_sortie IS NOT NULL
           THEN t.att_datetime BETWEEN jour.heure_entree AND jour.heure_sortie
         WHEN jour.heure_entree IS NOT NULL
           THEN t.att_datetime >= jour.heure_entree AND t.att_datetime < $2::date + 1
         ELSE t.att_datetime >= $2::date AND t.att_datetime < $2::date + 1
           AND NOT EXISTS (
             SELECT 1 FROM aff a2
             WHERE a2.date_service <> $2::date
               AND a2.heure_entree IS NOT NULL AND a2.heure_sortie IS NOT NULL
               AND t.att_datetime BETWEEN a2.heure_entree AND a2.heure_sortie
           )
       END
     ORDER BY t.att_datetime
     LIMIT 200`,
    [pin, date]
  );
  return rows.map((r) => ({ horodatage: r.horodatage, ...libelleEtat(r.etat) }));
}

/**
 * Historique des valeurs journalières d'un employé entre deux dates incluses,
 * pour la comparaison jour par jour. Seules les valeurs enregistrées sont renvoyées.
 */
export async function lireHistoriqueJours(db, pin, debut, fin) {
  const { rows } = await db.query(
    `SELECT TO_CHAR(h.periode_debut, 'YYYY-MM-DD') AS jour, h.id_compteur, c.libelle, h.unite,
            h.valeur::float AS valeur, h.statut_calcul AS statut, h.message_erreur AS message,
            (h.version_formule < c.version_formule) AS perimee
     FROM historique_compteurs h
     JOIN compteurs c ON c.id_compteur = h.id_compteur
     WHERE h.id_employe = $1 AND h.periodicite = 'JOUR'
       AND h.periode_debut BETWEEN $2::date AND $3::date
     ORDER BY h.periode_debut DESC, c.libelle`,
    [pin, debut, fin]
  );
  return rows;
}

/**
 * Valeurs des compteurs pour le jour, la semaine et le mois contenant la date.
 * Les compteurs actifs sans valeur enregistrée sont renvoyés avec statut
 * NON_CALCULE ; un compteur désactivé n'apparaît que s'il a une valeur.
 */
export async function lireValeursCompteurs(db, pin, date) {
  const periodes = {
    JOUR: periodeContenant('JOUR', date),
    SEMAINE: periodeContenant('SEMAINE', date),
    MOIS: periodeContenant('MOIS', date),
  };

  const { rows } = await db.query(
    `WITH periodes(periodicite, debut, fin) AS (
       VALUES ('JOUR', $2::date, $3::date), ('SEMAINE', $4::date, $5::date), ('MOIS', $6::date, $7::date)
     ),
     attendus AS (
       SELECT c.id_compteur, p.periodicite, p.debut, p.fin
       FROM compteurs c
       JOIN periodes p ON (p.periodicite = 'JOUR' AND c.journalier)
                       OR (p.periodicite = 'SEMAINE' AND c.hebdomadaire)
                       OR (p.periodicite = 'MOIS' AND c.mensuel)
       WHERE c.actif
       UNION
       SELECT h.id_compteur, h.periodicite, h.periode_debut, h.periode_fin
       FROM historique_compteurs h
       JOIN periodes p ON p.periodicite = h.periodicite AND p.debut = h.periode_debut
       WHERE h.id_employe = $1
     )
     SELECT a.id_compteur, c.libelle, c.unite AS unite_compteur, c.actif, c.version_formule AS version_actuelle,
            a.periodicite, TO_CHAR(a.debut, 'YYYY-MM-DD') AS periode_debut, TO_CHAR(a.fin, 'YYYY-MM-DD') AS periode_fin,
            h.valeur::float AS valeur, h.unite, h.statut_calcul, h.message_erreur, h.version_formule,
            h.calcule_le
     FROM attendus a
     JOIN compteurs c ON c.id_compteur = a.id_compteur
     LEFT JOIN historique_compteurs h
       ON h.id_employe = $1 AND h.id_compteur = a.id_compteur
      AND h.periodicite = a.periodicite AND h.periode_debut = a.debut
     ORDER BY CASE a.periodicite WHEN 'JOUR' THEN 1 WHEN 'SEMAINE' THEN 2 ELSE 3 END, c.libelle`,
    [
      pin,
      periodes.JOUR.debut, periodes.JOUR.fin,
      periodes.SEMAINE.debut, periodes.SEMAINE.fin,
      periodes.MOIS.debut, periodes.MOIS.fin,
    ]
  );

  return {
    periodes,
    valeurs: rows.map((r) => ({
      id_compteur: r.id_compteur,
      libelle: r.libelle,
      actif: r.actif,
      periodicite: r.periodicite,
      periode_debut: r.periode_debut,
      periode_fin: r.periode_fin,
      unite: r.unite ?? r.unite_compteur,
      valeur: r.valeur,
      statut: r.statut_calcul ?? 'NON_CALCULE',
      message: r.message_erreur,
      // Valeur calculée avec une ancienne version de la formule
      perimee: r.version_formule !== null && r.version_formule < r.version_actuelle,
      calcule_le: r.calcule_le,
    })),
  };
}
