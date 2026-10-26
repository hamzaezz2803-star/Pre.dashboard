import { targetPool } from './db.js';

/**
 * Horaires de test par défaut exigés par les spécifications :
 * - H001 : 08:00–16:00 (Matin)
 * - H002 : 14:00–22:00 (Après-midi)
 * - H003 : 22:00–06:00 le lendemain (Nuit)
 */
export const DEFAULT_HORAIRES = [
  {
    code: 'H001',
    nom: 'Matin',
    heure_debut: '08:00',
    heure_fin: '16:00',
    est_nuit: false,
    description: 'Poste du matin (08h00 - 16h00)',
  },
  {
    code: 'H002',
    nom: 'Après-midi',
    heure_debut: '14:00',
    heure_fin: '22:00',
    est_nuit: false,
    description: 'Poste d\'après-midi (14h00 - 22h00)',
  },
  {
    code: 'H003',
    nom: 'Nuit',
    heure_debut: '22:00',
    heure_fin: '06:00',
    est_nuit: true,
    description: 'Poste de nuit traversant minuit (22h00 - 06h00 le lendemain)',
  },
];

/**
 * Vérifie et initialise la table horaires_config dans la base de données.
 */
export async function initialiserTableHoraires() {
  await targetPool.query(`
    CREATE TABLE IF NOT EXISTS horaires_config (
      id SERIAL PRIMARY KEY,
      code VARCHAR(50) UNIQUE NOT NULL,
      nom VARCHAR(100) NOT NULL,
      heure_debut VARCHAR(5) NOT NULL,
      heure_fin VARCHAR(5) NOT NULL,
      est_nuit BOOLEAN DEFAULT FALSE,
      description VARCHAR(255),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
  `);

  const { rows } = await targetPool.query('SELECT COUNT(*) AS count FROM horaires_config');
  if (parseInt(rows[0].count, 10) === 0) {
    for (const h of DEFAULT_HORAIRES) {
      await targetPool.query(
        `INSERT INTO horaires_config (code, nom, heure_debut, heure_fin, est_nuit, description)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (code) DO NOTHING;`,
        [h.code, h.nom, h.heure_debut, h.heure_fin, h.est_nuit, h.description]
      );
    }
  }
}

/**
 * Récupère tous les horaires configurés, triés par heure de début.
 */
export async function obtenirHoraires() {
  try {
    await initialiserTableHoraires();
    const { rows } = await targetPool.query(
      'SELECT id, code, nom, heure_debut, heure_fin, est_nuit, description, created_at, updated_at FROM horaires_config ORDER BY code ASC'
    );
    return rows;
  } catch (error) {
    console.error('[Horaires] Erreur lors de la lecture des horaires:', error);
    return DEFAULT_HORAIRES.map((h, i) => ({ id: i + 1, ...h }));
  }
}

/**
 * Calcule si un horaire traverse minuit (ex: 22:00 à 06:00).
 */
export function estHoraireNuit(debut, fin) {
  if (!debut || !fin) return false;
  const [hDeb, mDeb] = debut.split(':').map(Number);
  const [hFin, mFin] = fin.split(':').map(Number);
  const minDeb = hDeb * 60 + mDeb;
  const minFin = hFin * 60 + mFin;
  return minFin <= minDeb;
}

/**
 * Affecte automatiquement un horaire configuré en fonction des pointages réels.
 * Ne modifie pas les règles sources, analyse dynamiquement le créneau d'entrée.
 */
export function determinerHoraireDynamique(premierPtg, dernierPtg, listeHoraires) {
  if (!premierPtg) {
    return {
      code: 'NON_DEFINI',
      nom: 'Horaire non défini',
      libelle: 'Non défini',
      estNuit: false,
      conforme: false,
    };
  }

  const [hPtg, mPtg] = premierPtg.split(':').map(Number);
  const minPtg = hPtg * 60 + mPtg;

  let meilleurHoraire = null;
  let plusPetiteDistance = Infinity;

  for (const horaire of listeHoraires) {
    const [hDeb, mDeb] = horaire.heure_debut.split(':').map(Number);
    const minDeb = hDeb * 60 + mDeb;

    // Calcul de la distance temporelle circulaire (sur 24h = 1440 min)
    let diff = Math.abs(minPtg - minDeb);
    if (diff > 720) diff = 1440 - diff;

    // On associe si le pointage se situe dans une fenêtre tolérée (ex: dans les 3 heures)
    if (diff < plusPetiteDistance && diff <= 180) {
      plusPetiteDistance = diff;
      meilleurHoraire = horaire;
    }
  }

  if (meilleurHoraire) {
    const isNuit = meilleurHoraire.est_nuit || estHoraireNuit(meilleurHoraire.heure_debut, meilleurHoraire.heure_fin);
    return {
      id: meilleurHoraire.id,
      code: meilleurHoraire.code,
      nom: meilleurHoraire.nom,
      libelle: `${meilleurHoraire.code} ${meilleurHoraire.nom}`,
      heureDebut: meilleurHoraire.heure_debut,
      heureFin: meilleurHoraire.heure_fin,
      estNuit: isNuit,
      conforme: true,
    };
  }

  return {
    code: 'NON_DEFINI',
    nom: 'Horaire non défini',
    libelle: 'Non défini',
    estNuit: false,
    conforme: false,
  };
}
