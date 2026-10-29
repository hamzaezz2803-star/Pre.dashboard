-- Index de performance pour la base ocp_pointage (a executer une seule fois, sans risque).
-- Executer dans DBeaver sur la base ocp_pointage avec Alt+X.
-- Les tables copiees par la synchronisation sont videes (TRUNCATE) : les index sont conserves.

CREATE INDEX IF NOT EXISTS idx_att_transaction_pin_dt
  ON att_transaction (pers_person_pin, att_datetime);
CREATE INDEX IF NOT EXISTS idx_att_transaction_dt
  ON att_transaction (att_datetime);

CREATE INDEX IF NOT EXISTS idx_affect_dyn_date_service
  ON affectations_horaires_dynamiques (date_service);
CREATE INDEX IF NOT EXISTS idx_affect_dyn_person
  ON affectations_horaires_dynamiques (cvaccess_person_id, date_service);

CREATE INDEX IF NOT EXISTS idx_pers_person_pin ON pers_person (pin);
CREATE INDEX IF NOT EXISTS idx_pers_person_dept ON pers_person (auth_dept_id);
-- INDEX CRITIQUE : la vue v_presence_jour cherche dans att_record pour chaque (employe, jour).
-- Sans lui : 8916 lectures completes de la table = 73 secondes.
CREATE INDEX IF NOT EXISTS idx_att_record_lookup
  ON att_record ((pers_person_pin::text), ((att_date)::date), update_time DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_pointage_jour_date ON pointage_journalier (date_pointage);

ANALYZE;
