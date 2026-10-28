-- =====================================================================
-- SCRIPT SQL : NETTOYAGE DES DONNÉES DE TEST (OCP POINTAGE)
-- =====================================================================
-- Exécutez ce script dans la base 'ocp_pointage' (PostgreSQL).
-- Choisissez la section adaptée à votre besoin :

-- =====================================================================
-- OPTION 1 (RECOMMANDÉE) : Vider uniquement les pointages et calculs de test
-- Conserve les collaborateurs, les départements, les comptes et les règles configurées.
-- Idéal pour repartir à zéro sur les présences avant les vrais pointages.
-- =====================================================================

BEGIN;

-- 1. Vider les affectations dynamiques calculées
TRUNCATE TABLE public.affectations_horaires_dynamiques RESTART IDENTITY CASCADE;

-- 2. Vider les pointages journaliers agrégés
TRUNCATE TABLE public.pointage_journalier RESTART IDENTITY CASCADE;

-- 3. Vider les transactions brutes de pointage (horodatages de badgeage)
TRUNCATE TABLE public.att_transaction RESTART IDENTITY CASCADE;

-- 4. Vider les enregistrements de présences CVAccess synchronisés
TRUNCATE TABLE public.att_record RESTART IDENTITY CASCADE;

-- 5. Vider les transactions d'accès (si utilisées)
TRUNCATE TABLE public.acc_transaction RESTART IDENTITY CASCADE;

COMMIT;

-- Vérification :
SELECT 'affectations_horaires_dynamiques' AS table, count(*) FROM public.affectations_horaires_dynamiques
UNION ALL
SELECT 'pointage_journalier', count(*) FROM public.pointage_journalier
UNION ALL
SELECT 'att_transaction', count(*) FROM public.att_transaction
UNION ALL
SELECT 'att_record', count(*) FROM public.att_record;


-- =====================================================================
-- OPTION 2 : Remise à zéro complète (Pointages + Employés TEST + Règles TEST)
-- Supprime les transactions ET les employés fictifs (TEST_DYNAMIQUE, etc.)
-- PRÉSERVE les comptes utilisateurs (table public.users).
-- =====================================================================
/*
BEGIN;

-- 1. Vider les pointages et affectations
TRUNCATE TABLE public.affectations_horaires_dynamiques RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.pointage_journalier RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.att_transaction RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.att_record RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.acc_transaction RESTART IDENTITY CASCADE;

-- 2. Vider la sélection des employés dynamiques
TRUNCATE TABLE public.employes_affectation_dynamique RESTART IDENTITY CASCADE;

-- 3. Supprimer les employés de test (matricules 12, 13, 14 ou préfixés TEST_)
DELETE FROM public.pers_person 
WHERE pin IN ('12', '13', '14') 
   OR last_name ILIKE 'TEST%' 
   OR name ILIKE 'TEST%';

-- 4. Supprimer les départements de test
DELETE FROM public.auth_department 
WHERE name ILIKE '%TEST%';

-- 5. (Optionnel) Vider les règles horaires de test
-- TRUNCATE TABLE public.horaires RESTART IDENTITY CASCADE;

COMMIT;
*/


-- =====================================================================
-- OPTION 3 (CVACCESS / biosecurity-boot) : Vider la base source si nécessaire
-- À exécuter dans la base 'biosecurity-boot' (port 5442) si vous souhaitez
-- purger les faux badgeages injectés dans le logiciel ZKTeco.
-- =====================================================================
/*
TRUNCATE TABLE att_transaction CASCADE;
TRUNCATE TABLE att_record CASCADE;
DELETE FROM pers_person WHERE pin IN ('12', '13', '14') OR last_name ILIKE 'TEST%';
*/
