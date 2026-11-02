-- =====================================================================
-- Migration : Compteurs dynamiques (définitions, versions, historique)
-- Base      : ocp_pointage (cible). La base source ZKBio n'est JAMAIS modifiée.
-- A executer une seule fois dans DBeaver avec Alt+X. Script idempotent.
-- Compatible PostgreSQL 9.6. Annulation : scripts/rollback-compteurs.sql
-- =====================================================================
--
-- Aucune table d'horaires n'est créée : l'horaire du jour est lu dans
-- affectations_horaires_dynamiques / cvaccess_horaires (lib/compteurs/donnees.js).
--
-- IMPORTANT - pourquoi id_employe n'a PAS de cle etrangere vers pers_person :
--   pers_person n'a pas de contrainte d'unicite sur pin et est videe puis
--   rechargee par la synchronisation (lib/sync.js) : une FK effacerait
--   l'historique a chaque cycle. L'integrite est assuree cote application.
--
-- Suppression : un compteur ayant des versions ou un historique ne peut pas
-- etre supprime (ON DELETE RESTRICT) ; on le desactive (actif = FALSE).

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Définitions des compteurs
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.compteurs (
  id_compteur      VARCHAR(30)  NOT NULL,
  libelle          VARCHAR(100) NOT NULL,
  formule          TEXT         NOT NULL,
  journalier       BOOLEAN      NOT NULL DEFAULT FALSE,
  hebdomadaire     BOOLEAN      NOT NULL DEFAULT FALSE,
  mensuel          BOOLEAN      NOT NULL DEFAULT FALSE,
  unite            VARCHAR(20)  NOT NULL DEFAULT 'minutes',
  description      VARCHAR(500),
  actif            BOOLEAN      NOT NULL DEFAULT TRUE,
  version_formule  INTEGER      NOT NULL DEFAULT 1,
  cree_par         INTEGER      REFERENCES public.users (id) ON DELETE SET NULL,
  modifie_par      INTEGER      REFERENCES public.users (id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT compteurs_pkey PRIMARY KEY (id_compteur),
  CONSTRAINT compteurs_id_format CHECK (id_compteur ~ '^[A-Z0-9][A-Z0-9_-]{0,29}$'),
  CONSTRAINT compteurs_libelle_non_vide CHECK (btrim(libelle) <> ''),
  CONSTRAINT compteurs_formule_taille CHECK (btrim(formule) <> '' AND char_length(formule) <= 2000),
  CONSTRAINT compteurs_une_periodicite CHECK (journalier OR hebdomadaire OR mensuel),
  CONSTRAINT compteurs_unite CHECK (unite IN ('minutes', 'heures', 'jours', 'nombre', 'pourcentage')),
  CONSTRAINT compteurs_version_positive CHECK (version_formule >= 1)
);

-- Unicite des libelles sans tenir compte de la casse ni des accents.
-- La base est en LC_CTYPE 'C' : lower() ne traite pas les lettres accentuees,
-- elles sont donc d'abord remplacees par translate() (meme expression que
-- CLE_LIBELLE_SQL dans lib/compteurs/service.js).
CREATE UNIQUE INDEX IF NOT EXISTS uq_compteurs_libelle
  ON public.compteurs (lower(translate(libelle,
    'ÀÁÂÃÄÅàáâãäåÇçÈÉÊËèéêëÌÍÎÏìíîïÑñÒÓÔÕÖòóôõöÙÚÛÜùúûüÝýÿ',
    'AAAAAAaaaaaaCcEEEEeeeeIIIIiiiiNnOOOOOoooooUUUUuuuuYyy')));

-- ---------------------------------------------------------------------
-- 2. Versions des formules (piste d'audit : qui, quoi, quand)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.compteurs_versions (
  id_compteur      VARCHAR(30)  NOT NULL REFERENCES public.compteurs (id_compteur) ON DELETE RESTRICT,
  version_formule  INTEGER      NOT NULL,
  formule          TEXT         NOT NULL,
  unite            VARCHAR(20)  NOT NULL,
  journalier       BOOLEAN      NOT NULL,
  hebdomadaire     BOOLEAN      NOT NULL,
  mensuel          BOOLEAN      NOT NULL,
  modifie_par      INTEGER      REFERENCES public.users (id) ON DELETE SET NULL,
  modifie_le       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT compteurs_versions_pkey PRIMARY KEY (id_compteur, version_formule)
);

-- ---------------------------------------------------------------------
-- 3. Historique des valeurs calculées
--    Une seule valeur courante par employe / compteur / periode.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.historique_compteurs (
  id_historique    BIGSERIAL     NOT NULL,
  id_employe       VARCHAR(50)   NOT NULL,
  id_compteur      VARCHAR(30)   NOT NULL REFERENCES public.compteurs (id_compteur) ON DELETE RESTRICT,
  periodicite      VARCHAR(7)    NOT NULL,
  periode_debut    DATE          NOT NULL,
  periode_fin      DATE          NOT NULL,
  valeur           NUMERIC(14,4),
  unite            VARCHAR(20)   NOT NULL,
  version_formule  INTEGER       NOT NULL,
  statut_calcul    VARCHAR(12)   NOT NULL,
  message_erreur   VARCHAR(500),
  calcule_le       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT historique_compteurs_pkey PRIMARY KEY (id_historique),
  CONSTRAINT historique_compteurs_unique UNIQUE (id_employe, id_compteur, periodicite, periode_debut),
  CONSTRAINT historique_periodicite CHECK (periodicite IN ('JOUR', 'SEMAINE', 'MOIS')),
  CONSTRAINT historique_periode CHECK (periode_fin >= periode_debut),
  CONSTRAINT historique_statut CHECK (statut_calcul IN ('OK', 'ERREUR', 'A_RECALCULER')),
  -- Une valeur OK est toujours renseignee ; une erreur n'a jamais de valeur inventee
  CONSTRAINT historique_valeur_ok CHECK (statut_calcul <> 'OK' OR valeur IS NOT NULL),
  CONSTRAINT historique_valeur_erreur CHECK (statut_calcul <> 'ERREUR' OR (valeur IS NULL AND message_erreur IS NOT NULL)),
  CONSTRAINT historique_version FOREIGN KEY (id_compteur, version_formule)
    REFERENCES public.compteurs_versions (id_compteur, version_formule) ON DELETE RESTRICT
);

-- Ecran « Detail jour » : valeurs d'un employe sur une periode
CREATE INDEX IF NOT EXISTS idx_historique_employe_periode
  ON public.historique_compteurs (id_employe, periode_debut);

-- File des recalculs en attente
CREATE INDEX IF NOT EXISTS idx_historique_a_recalculer
  ON public.historique_compteurs (id_compteur)
  WHERE statut_calcul = 'A_RECALCULER';

COMMIT;

ANALYZE public.compteurs;
ANALYZE public.compteurs_versions;
ANALYZE public.historique_compteurs;
