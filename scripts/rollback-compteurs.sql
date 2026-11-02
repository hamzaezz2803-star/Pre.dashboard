-- =====================================================================
-- Annulation de scripts/migration-compteurs.sql
-- ATTENTION : efface definitivement les compteurs, leurs versions et tout
-- l'historique des valeurs. Faire une sauvegarde avant execution.
-- =====================================================================

BEGIN;

DROP TABLE IF EXISTS public.historique_compteurs;
DROP TABLE IF EXISTS public.compteurs_versions;
DROP TABLE IF EXISTS public.compteurs;

COMMIT;
