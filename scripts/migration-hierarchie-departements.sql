-- =====================================================================
-- Migration : Gestion hiérarchique des départements ZKBio (Arbre)
-- Base      : ocp_pointage (cible)
-- À exécuter dans DBeaver (Alt+X) ou via psql. Script idempotent.
-- =====================================================================

BEGIN;

-- 1. Indexation pour parcours récursif rapide de l'arbre
CREATE INDEX IF NOT EXISTS idx_auth_department_parent
  ON public.auth_department (parent_id);

CREATE INDEX IF NOT EXISTS idx_auth_department_id
  ON public.auth_department (id);

CREATE INDEX IF NOT EXISTS idx_auth_department_code
  ON public.auth_department (code);

-- 2. Vue de compatibilité user_departements (alias de utilisateur_departements)
CREATE OR REPLACE VIEW public.user_departements AS
  SELECT 
    utilisateur_id AS user_id, 
    departement_id, 
    cree_le
  FROM public.utilisateur_departements;

-- 3. Normalisation des affectations existantes :
-- Si un admin a actuellement un sous-département affecté dans utilisateur_departements,
-- on le rattache automatiquement à son département parent de niveau 1.
DO $$
DECLARE
  rec RECORD;
  parentIdNiveau1 VARCHAR(50);
BEGIN
  -- Identifier les affectations pointant vers un département qui a un parent
  FOR rec IN (
    SELECT ud.utilisateur_id, ud.departement_id, d.name
    FROM public.utilisateur_departements ud
    JOIN public.auth_department d ON d.id = ud.departement_id
    WHERE d.parent_id IS NOT NULL AND d.parent_id <> '' AND d.parent_id <> d.id
  ) LOOP
    -- Remonter récursivement jusqu'au parent de niveau supérieur
    WITH RECURSIVE ascendance AS (
      SELECT id, parent_id, 1 AS depth
      FROM public.auth_department
      WHERE id = rec.departement_id
      UNION ALL
      SELECT p.id, p.parent_id, a.depth + 1
      FROM public.auth_department p
      JOIN ascendance a ON p.id = a.parent_id
      WHERE p.id <> a.id AND a.depth < 10
    )
    SELECT id INTO parentIdNiveau1
    FROM ascendance
    WHERE parent_id IS NULL OR parent_id = '' OR parent_id = id
    ORDER BY depth DESC
    LIMIT 1;

    IF parentIdNiveau1 IS NOT NULL AND parentIdNiveau1 <> rec.departement_id THEN
      -- Remplacer l'affectation par le parent de niveau 1
      DELETE FROM public.utilisateur_departements
      WHERE utilisateur_id = rec.utilisateur_id AND departement_id = rec.departement_id;

      INSERT INTO public.utilisateur_departements (utilisateur_id, departement_id)
      VALUES (rec.utilisateur_id, parentIdNiveau1)
      ON CONFLICT DO NOTHING;

      RAISE NOTICE 'Admin % : département % (%) normalisé vers son parent %',
        rec.utilisateur_id, rec.name, rec.departement_id, parentIdNiveau1;
    END IF;
  END LOOP;
END $$;

COMMIT;

ANALYZE public.auth_department;
ANALYZE public.utilisateur_departements;
