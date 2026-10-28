-- =====================================================================
-- Migration : Ajout de la sélection des jours d'application de la plage horaire
-- Table : public.horaires
-- Trigger : fn_affecter_horaire_dynamique
-- =====================================================================

-- 1. Ajout de la colonne jours_semaine (tableau d'entiers de 1 à 7 : 1 = Lundi, ..., 7 = Dimanche)
ALTER TABLE public.horaires 
ADD COLUMN IF NOT EXISTS jours_semaine integer[] DEFAULT '{1,2,3,4,5,6,7}';

-- 2. Mise à jour des règles existantes sans jours spécifiés (par défaut tous les jours)
UPDATE public.horaires 
SET jours_semaine = '{1,2,3,4,5,6,7}' 
WHERE jours_semaine IS NULL;

-- 3. Mise à jour de la fonction trigger pour prendre en compte le jour de pointage
CREATE OR REPLACE FUNCTION public.fn_affecter_horaire_dynamique()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
DECLARE
    v_person_id VARCHAR(64);
    v_horaire_id VARCHAR(64);
    v_nb_regles BIGINT;

    v_debut_horaire TIME;
    v_fin_horaire TIME;

    v_debut_prevu TIMESTAMP;
    v_fin_prevue TIMESTAMP;
    v_sortie_reelle TIMESTAMP;
    v_iso_dow INT;

BEGIN
    -- Ignorer les journées sans pointage
    IF NEW.premier_pointage IS NULL
       OR COALESCE(NEW.nb_pointages, 0) = 0 THEN
        RETURN NEW;
    END IF;

    -- Vérifier que l'employé a activé l'affectation dynamique
    SELECT p.id
    INTO v_person_id
    FROM public.pers_person p
    JOIN public.employes_affectation_dynamique e
        ON e.cvaccess_person_id = p.id
    WHERE p.pin = NEW.id
      AND e.actif = TRUE
    LIMIT 1;

    IF v_person_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Si le premier pointage termine un service de nuit précédent
    UPDATE public.affectations_horaires_dynamiques a
    SET
        heure_sortie = NEW.premier_pointage,
        statut = 'termine',
        updated_at = CURRENT_TIMESTAMP
    WHERE a.cvaccess_person_id = v_person_id
      AND a.date_service = NEW.date_pointage - 1
      AND a.fin_prevue::date = NEW.date_pointage
      AND NEW.premier_pointage BETWEEN
          a.fin_prevue - INTERVAL '2 hours'
          AND a.fin_prevue + INTERVAL '2 hours'
      AND a.heure_sortie IS DISTINCT FROM NEW.premier_pointage;

    -- Calculer le jour de la semaine du pointage (1 = Lundi, 2 = Mardi, ..., 7 = Dimanche)
    v_iso_dow := EXTRACT(ISODOW FROM NEW.date_pointage)::INT;

    -- Chercher la règle correspondant au premier pointage et au jour de la semaine
    SELECT
        COUNT(*),
        MIN(h.cvaccess_horaire_id)
    INTO
        v_nb_regles,
        v_horaire_id
    FROM public.horaires h
    WHERE h.actif = TRUE
      AND (h.jours_semaine IS NULL OR v_iso_dow = ANY(h.jours_semaine))
      AND NEW.premier_pointage::time
          BETWEEN h.heure_debut AND h.heure_fin;

    -- Refuser une affectation ambiguë ou sans règle
    IF v_nb_regles <> 1 THEN
        RETURN NEW;
    END IF;

    -- Récupérer l'horaire officiel CVAccess
    SELECT
        c.to_work_time,
        c.off_work_time
    INTO
        v_debut_horaire,
        v_fin_horaire
    FROM public.cvaccess_horaires c
    WHERE c.cvaccess_horaire_id = v_horaire_id;

    IF v_debut_horaire IS NULL OR v_fin_horaire IS NULL THEN
        RETURN NEW;
    END IF;

    -- Construire les dates et heures prévues
    v_debut_prevu := NEW.date_pointage + v_debut_horaire;
    v_fin_prevue := NEW.date_pointage + v_fin_horaire;

    -- Horaire de nuit : sortie le lendemain
    IF v_fin_prevue <= v_debut_prevu THEN
        v_fin_prevue := v_fin_prevue + INTERVAL '1 day';
    END IF;

    v_sortie_reelle := NULL;

    -- Sortie d'un horaire de jour
    IF v_fin_prevue::date = NEW.date_pointage
       AND NEW.dernier_pointage > NEW.premier_pointage THEN

        v_sortie_reelle := NEW.dernier_pointage;

    -- Sortie d'un horaire de nuit déjà synchronisée
    ELSIF v_fin_prevue::date > NEW.date_pointage THEN

        SELECT j.premier_pointage
        INTO v_sortie_reelle
        FROM public.pointage_journalier j
        WHERE j.id = NEW.id
          AND j.date_pointage = NEW.date_pointage + 1
          AND j.premier_pointage BETWEEN
              v_fin_prevue - INTERVAL '2 hours'
              AND v_fin_prevue + INTERVAL '2 hours'
        ORDER BY j.premier_pointage
        LIMIT 1;

    END IF;

    -- Enregistrer ou mettre à jour l'affectation
    INSERT INTO public.affectations_horaires_dynamiques AS a (
        cvaccess_person_id,
        date_service,
        cvaccess_horaire_id,
        debut_prevu,
        fin_prevue,
        heure_entree,
        heure_sortie,
        statut
    )
    VALUES (
        v_person_id,
        NEW.date_pointage,
        v_horaire_id,
        v_debut_prevu,
        v_fin_prevue,
        NEW.premier_pointage,
        v_sortie_reelle,
        CASE
            WHEN v_sortie_reelle IS NULL THEN 'en_cours'
            ELSE 'termine'
        END
    )
    ON CONFLICT (cvaccess_person_id, date_service)
    DO UPDATE SET
        cvaccess_horaire_id = EXCLUDED.cvaccess_horaire_id,
        debut_prevu = EXCLUDED.debut_prevu,
        fin_prevue = EXCLUDED.fin_prevue,
        heure_entree = EXCLUDED.heure_entree,
        heure_sortie = COALESCE(
            EXCLUDED.heure_sortie,
            a.heure_sortie
        ),
        statut = CASE
            WHEN COALESCE(
                EXCLUDED.heure_sortie,
                a.heure_sortie
            ) IS NULL THEN 'en_cours'
            ELSE 'termine'
        END,
        updated_at = CURRENT_TIMESTAMP;

    RETURN NEW;
END;
$function$;
