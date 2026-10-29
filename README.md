# OCP Pointage — Plateforme de Suivi des Pointages et Présences

Système moderne et centralisé de gestion, suivi et analyse des pointages, présences et affectations horaires pour le personnel de l'OCP.

L'application consolide les données biométriques issues de pointeuses ZKBio / CVAccess dans une base PostgreSQL dédiée, applique des règles de calcul de présence et d'horaires dynamiques (postes matin, après-midi, nuit franchissant minuit), et fournit des tableaux de bord interactifs avec export Excel et PDF.

---

## Sommaire

1. [Fonctionnalités Principales](#-fonctionnalités-principales)
2. [Architecture Technique & Stack](#-architecture-technique--stack)
3. [Prérequis](#-prérequis)
4. [Installation & Configuration](#-installation--configuration)
5. [Démarrage & Utilisation](#-démarrage--utilisation)
6. [Gestion des Rôles & Authentification](#-gestion-des-rôles--authentification)
7. [Synchronisation des Données Biometriques](#-synchronisation-des-données-biométriques)
8. [Exports & Rapports](#-exports--rapports)
9. [Scripts Utiles & Maintenance](#-scripts-utiles--maintenance)
10. [Structure du Projet](#-structure-du-projet)

---

## 🚀 Fonctionnalités Principales

### 1. Tableau de bord des Pointages (`/`)
- **Indicateurs clés (KPIs)** en temps réel : Taux de présence global, effectif présent, absents, retards et anomalies.
- **Filtres multicritères** : Période (date de début / fin), filtrage par département/service, recherche textuelle instantanée (matricule/PIN, nom, prénom).
- **Tableau interactif** : Premier et dernier pointage de la journée, nombre de badges, calcul automatique du temps de présence réel (en heures et minutes), zones de pointage associées.
- **Statuts automatiques** : Présent, Retard, Sortie anticipée, Absence justifiée/injustifiée, Anomalie de pointage unique.

### 2. Affectation Horaire Dynamique (`/affectation-horaire`)
- **Paramétrage des plages horaires** :
  - **H001 - Matin** : 08h00 – 16h00
  - **H002 - Après-midi** : 14h00 – 22h00
  - **H003 - Nuit** : 22h00 – 06h00 (gestion automatique du franchissement de minuit `J+1`)
  - Création et personnalisation d'horaires sur mesure.
- **Affectation dynamique intelligente** : Attribution automatique du bon shift de travail selon l'heure effective du premier pointage de l'agent.
- **Suivi des anomalies horaires** : Détection des retards par rapport à l'horaire théorique, départs anticipés, pointages impairs ou manquants.

### 3. Rapport des Présences (`/rapport-presences`)
- Synthèse périodique détaillée par employé et par jour.
- Statistiques consolidées : total heures prestées, heures de nuit, total des retards cumulés.

### 4. Exports Professionnels
- **Export Excel stylisé** (`.xlsx` via ExcelJS) : En-têtes aux couleurs corporate, alternance de lignes, formatage conditionnel des statuts, colonnes ajustées et totaux calculés.
- **Export PDF** (via jsPDF & AutoTable) : Tableaux optimisés pour l'impression A4/Landscape, pagination et récapitulatif.

### 5. Administration & Gestion des Utilisateurs (`/admin/utilisateurs`)
- Interface dédiée au `super_admin` pour gérer les comptes applicatifs (création, modification, rôles, réinitialisation de mot de passe, activation/désactivation).
- Page Profil utilisateur (`/profil`) et page Paramètres système (`/parametres`).

---

## 🛠 Architecture Technique & Stack

| Composant | Technologie | Description |
| :--- | :--- | :--- |
| **Frontend & Backend** | [Next.js 16 (App Router)](https://nextjs.org/) + React 19 + TypeScript | Rendu serveur (SSR), Server Actions et API Routes unifiées |
| **Design & UI** | [Tailwind CSS v4](https://tailwindcss.com/) + Lucide Icons | Interface réactive, moderne, avec support thèmes Clair / Sombre |
| **Tableaux de données** | [@tanstack/react-table](https://tanstack.com/table) | Pagination, tri, filtrage dynamique |
| **Base de Données** | [PostgreSQL](https://www.postgresql.org/) (`pg` pool) | Double connexion : source (ZKBio/CVAccess) & cible (`ocp_pointage`) |
| **Authentification** | JWT (`jose`) + `bcryptjs` | Sessions sécurisées via cookies HTTP-only, hachage 12 rounds |
| **Exports** | `exceljs`, `jspdf`, `jspdf-autotable` | Moteurs de génération de documents côté client/serveur |

---

## 📋 Prérequis

- **Node.js** : version 20 LTS ou supérieure recommandée.
- **PostgreSQL** : instance en fonctionnement contenant :
  - La base source des pointeuses (ex. `biosecurity-boot` ou tables `att_transaction`, `att_record`, `pers_person`, `auth_department`, `att_timeslot`).
  - La base cible de l'application (ex. `ocp_pointage`).

---

## ⚙️ Installation & Configuration

### 1. Cloner ou ouvrir le projet

```bash
cd c:\ocpdahsboard
```

### 2. Installer les dépendances

```bash
npm install
```

### 3. Configurer les variables d'environnement

Copiez le fichier `.env.example` en `.env` :

```bash
copy .env.example .env
```

Modifiez le fichier `.env` avec vos informations :

```env
# Base ZKBio / CVAccess (source, lecture seule)
SOURCE_DATABASE_URL="postgresql://zk_lecture:mot_de_passe@127.0.0.1:5442/biosecurity-boot"

# Base applicative ocp_pointage (cible)
DATABASE_URL="postgresql://root:mot_de_passe@127.0.0.1:5442/ocp_pointage"

# Lecture optimisée pour les vues de présence
BIOTIME_DATABASE_URL="postgresql://ocp_readonly:mot_de_passe@127.0.0.1:5442/ocp_pointage"

# Fréquence de synchronisation automatique (en minutes)
SYNC_INTERVAL_MIN=15

# Clé secrète JWT (générer une clé de 64 caractères hexadécimaux)
AUTH_SECRET="votre_cle_secrete_jwt_aleatoire"

# Mode de cookies de session :
# - false : pour accès en HTTP sur le réseau local (LAN / Wi-Fi)
# - true  : uniquement si le serveur est servi derrière un reverse proxy HTTPS
SECURE_COOKIES=false
```

> **Astuce** : Pour générer rapidement une clé `AUTH_SECRET` aléatoire sécurisée :
> ```bash
> node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
> ```

---

## 🖥 Démarrage & Utilisation

### Option A — Démarrage simplifié en 1 clic (Windows)

Double-cliquez sur le script batch fourni à la racine :

- **`demarrer.bat`** :
  1. Vérifie et libère automatiquement le port `3000` si nécessaire.
  2. Détecte l'adresse IP réseau locale (LAN / Wi-Fi) de votre machine.
  3. Compile automatiquement l'application Next.js si c'est la première exécution (`.next`).
  4. Démarre le serveur backend en tâche de fond.
  5. Ouvre automatiquement votre navigateur par défaut sur `http://localhost:3000`.
  6. Affiche l'adresse IP pour permettre aux collègues ou téléphones connectés au même réseau d'accéder au dashboard (ex. `http://192.168.x.x:3000`).

Pour stopper le serveur :
- Double-cliquez sur **`arreter.bat`** (ou fermez la fenêtre de commande en tâche de fond).

### Option B — Démarrage classique en ligne de commande

```bash
# Mode développement (rechargement à chaud)
npm run dev

# Mode production (recommandé pour une utilisation fluide)
npm run build
npm run start -- -H 0.0.0.0 -p 3000
```

---

## 🔒 Gestion des Rôles & Cloisonnement par Département

L'accès à l'application est protégé par un système de contrôle d'accès basé sur les rôles (RBAC) vérifié à la fois par `middleware.js` et au niveau de toutes les routes API :

| Rôle | Périmètre d'accès | Droits & Actions |
| :--- | :--- | :--- |
| **`super_admin`** | **Accès global sans restriction** | Consultation et gestion de l'intégralité des départements et agents, déclenchement de la synchronisation ZKBio manuelle, et accès exclusif à la gestion des utilisateurs (`/admin/utilisateurs`). |
| **`admin`** | **Cloisonné aux départements affectés** | Consultation des pointages, suivi des horaires, anomalies et rapports de présences **strictement limités aux départements affectés** (et à leurs sous-départements récursifs). Les exports Excel et PDF mentionnent expressément le périmètre couvert. |

### 🏢 Cloisonnement des données (Multi-départements & Hiérarchie)

1. **Table de liaison `utilisateur_departements`** :
   - Associe un compte administrateur (`admin`) à un ou plusieurs départements ZKBio (`auth_department.id`).
   - Supprimée en cascade lors de la suppression de l'utilisateur (`ON DELETE CASCADE`).
   - Le script SQL de migration est disponible dans [`scripts/migration-departements-admin.sql`](scripts/migration-departements-admin.sql).

2. **Résolution hiérarchique récursive** :
   - Les départements ZKBio sont structurés en arborescence (`parent_id`).
   - La fonction `obtenirPerimetreDepartements` (`lib/perimetre.js`) effectue une requête récursive `WITH RECURSIVE` pour inclure automatiquement tous les sous-départements et divisions enfants d'un département affecté.

3. **Sécurité serveur stricte (zéro contournement)** :
   - Le périmètre est relu en base de données à chaque requête (non figé dans le JWT), garantissant une prise en compte immédiate de tout changement sans obliger l'utilisateur à se reconnecter.
   - Les requêtes SQL vers le personnel (`pers_person`) et les départements sont systématiquement filtrées via des requêtes paramétrées `ANY($n)` pour interdire toute injection SQL.
   - Toute tentative d'accès via l'URL ou un paramètre query à un matricule ou département hors périmètre est rejetée avec un code d'erreur **403 Forbidden**.

4. **Interface d'administration & Exports** :
   - Le `super_admin` dispose d'un sélecteur multiple de départements avec barre de recherche, boutons « Tout sélectionner / Tout désélectionner », et avertissement visuel si aucun département n'est attribué.
   - La sidebar indique discrètement à l'administrateur son périmètre de consultation (avec infobulle de la liste complète).
   - Les en-têtes et métadonnées de tous les exports **Excel** et **PDF** mentionnent explicitement les départements concernés.

Les mots de passe sont hachés avec `bcryptjs` avec 12 tours de salt. Les sessions sont gérées par des jetons JWT chiffrés et stockés dans un cookie HTTP-only (`auth_token`).

---

## 🔄 Synchronisation des Données Biométriques

Le module de synchronisation (`lib/sync.js`) et son instrumentation (`instrumentation.js`) assurent la réplication sécurisée des pointages depuis la base ZKBio :

1. **Tables synchronisées** :
   - `pers_person` (personnel, matricule, département, position)
   - `pers_position` (postes)
   - `auth_department` (départements / services)
   - `att_record` (enregistrements de présence brute)
   - `att_transaction` (transactions de pointage horodatées)
   - `acc_transaction` (transactions de contrôle d'accès)
   - `att_timeslot` (créneaux horaires officiels ZKBio -> `cvaccess_horaires`)
2. **Consolidation** : Calcul automatique et insertion dans la table `pointage_journalier` (heures min/max, cumul de présence, zones).
3. **Périodicité** :
   - Synchronisation automatique au démarrage du serveur Node.js.
   - Synchronisation périodique toutes les `SYNC_INTERVAL_MIN` minutes (par défaut 15 min).
   - Possibilité de forcer une synchronisation manuelle à tout moment depuis l'interface par un `super_admin`.

---

## 📊 Exports & Rapports

L'application offre plusieurs types d'exports adaptés aux besoins des services RH et d'exploitation :

1. **Export Pointages Journaliers (Excel)** : Liste filtrée selon les dates et services choisis, avec statut coloré, cumul de temps et heures d'entrée/sortie.
2. **Export Rapport Présences (Excel & PDF)** : Vue consolidée par matricule/agent sur la période complète.
3. **Export Suivi Horaires & Anomalies** : Détail des retards constatés par rapport à l'horaire théorique affecté (Matin / Après-midi / Nuit).

---

## 🛠 Scripts Utiles & Maintenance

Le dossier [`scripts/`](scripts/) contient des utilitaires dédiés aux tests et à la maintenance :

- **`scripts/diagnostic-db.mjs`** : Teste et valide la connectivité vers la base source et la base cible.
- **`scripts/migration-jours-semaine.sql`** : Script SQL pour la gestion des plannings et jours de la semaine.
- **`scripts/optimisation-index.sql`** : Index PostgreSQL pour accélérer les requêtes d'agrégation volumineuses.
- **`scripts/purger-tous-les-tests.mjs`** : Nettoie les données de test ou doublons éventuels.
- **`scripts/creer-raccourcis.ps1`** : Génère des raccourcis de bureau pour les scripts de démarrage/arrêt Windows.

---

## 📁 Structure du Projet

```text
ocpdahsboard/
├── app/                          # Next.js App Router
│   ├── (app)/                    # Pages protégées (dashboard, affectation, profil...)
│   │   ├── admin/utilisateurs/   # Gestion des utilisateurs (super_admin)
│   │   ├── affectation-horaire/  # Gestion des shifts et anomalies
│   │   ├── rapport-presences/    # Rapports de synthèse
│   │   ├── profil/ & parametres/ # Paramètres du compte et de l'app
│   │   └── page.tsx              # Tableau de bord principal des pointages
│   ├── (auth)/login/             # Page de connexion sécurisée
│   ├── api/                      # Routes API REST (pointages, sync, auth, etc.)
│   └── globals.css               # Styles globaux et variables de thème
├── components/                   # Composants React réutilisables
│   ├── ui/                       # Composants d'interface atomiques (boutons, inputs...)
│   ├── attendance-table.tsx      # Tableau principal des pointages
│   ├── affectation-horaire-*.tsx # Modules de gestion des horaires
│   ├── sidebar.tsx               # Barre de navigation latérale dynamique
│   └── user-management.tsx       # Interface d'administration des utilisateurs
├── lib/                          # Logique métier, services et utilitaires
│   ├── auth.js                   # Authentification, gestion JWT et middleware RBAC
│   ├── db.js                     # Pools de connexion PostgreSQL (source et cible)
│   ├── sync.js                   # Moteur de synchronisation ZKBio -> ocp_pointage
│   ├── horaires.js               # Algorithmes d'affectation dynamique des shifts
│   ├── export-excel.ts           # Moteur de génération des classeurs Excel
│   └── export-pdf.ts             # Moteur de génération des rapports PDF
├── scripts/                      # Scripts SQL et utilitaires de maintenance
├── demarrer.bat                  # Lanceur automatique 1-clic pour Windows
├── arreter.bat                   # Arrêt propre du serveur Windows
└── ecosystem.config.js           # Configuration pour déploiement avec PM2
```

---

## 📄 Licence & Confidentialité

Projet interne développé pour le suivi du personnel OCP. Les données traitées relèvent du cadre de confidentialité de l'entreprise.
