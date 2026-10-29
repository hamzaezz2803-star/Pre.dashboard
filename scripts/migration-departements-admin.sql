-- =====================================================================
-- Migration : Cloisonnement des données par département (sous-admins)
-- Base      : ocp_pointage (cible). La base source ZKBio n'est JAMAIS modifiée.
-- A executer une seule fois dans DBeaver avec Alt+X. Script idempotent.
-- =====================================================================
--
-- Table de liaison : un admin voit uniquement les employes rattaches aux
-- departements listes ici (+ leurs sous-departements, calcules a la lecture
-- par lib/perimetre.js avec une requete WITH RECURSIVE sur auth_department.parent_id).
-- Un super_admin n'a aucune ligne ici : son acces est total et implicite.
--
-- IMPORTANT - pourquoi departement_id n'a PAS de cle etrangere vers auth_department :
--   1. auth_department n'a ni cle primaire ni contrainte d'unicite dans ocp_pointage
--      (table copiee telle quelle depuis ZKBio), une FK est donc impossible.
--   2. La synchronisation (lib/sync.js) execute TRUNCATE TABLE "auth_department" CASCADE
--      a chaque cycle : une FK ferait vider cette table de liaison et effacerait
--      toutes les affectations a chaque synchronisation.
--   L'integrite est assuree cote application (les identifiants inconnus sont ignores
--   par la requete recursive) ; la cle etrangere vers users(id) est conservee.

BEGIN;

CREATE TABLE IF NOT EXISTS public.utilisateur_departements (
  utilisateur_id INTEGER     NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  departement_id VARCHAR(50) NOT NULL,
  cree_le        TIMESTAMP   NOT NULL DEFAULT NOW(),
  CONSTRAINT utilisateur_departements_pkey PRIMARY KEY (utilisateur_id, departement_id)
);

-- Recherche inverse (quels admins sont rattaches a un departement ?)
CREATE INDEX IF NOT EXISTS idx_utilisateur_departements_dept
  ON public.utilisateur_departements (departement_id);

-- Parcours de la hierarchie des departements (WITH RECURSIVE ... parent_id)
CREATE INDEX IF NOT EXISTS idx_auth_department_parent
  ON public.auth_department (parent_id);
CREATE INDEX IF NOT EXISTS idx_auth_department_id
  ON public.auth_department (id);

-- Filtrage du personnel par departement (deja crees par optimisation-index.sql)
CREATE INDEX IF NOT EXISTS idx_pers_person_pin  ON public.pers_person (pin);
CREATE INDEX IF NOT EXISTS idx_pers_person_dept ON public.pers_person (auth_dept_id);

COMMIT;

ANALYZE public.utilisateur_departements;

-- ---------------------------------------------------------------------
-- NOTE : apres migration, les admins existants n'ont AUCUN departement et ne
-- voient donc aucune donnee tant que le super_admin ne leur en a pas affecte
-- (page /admin/utilisateurs > Modifier). Exemple d'affectation manuelle :
--
--   INSERT INTO public.utilisateur_departements (utilisateur_id, departement_id)
--   SELECT u.id, d.id
--   FROM public.users u, public.auth_department d
--   WHERE u.username = 'hamza' AND d.name IN ('Production', 'Maintenance industrielle')
--   ON CONFLICT DO NOTHING;
-- ---------------------------------------------------------------------
