# Suivi des pointages du personnel

Interface de dashboard (Next.js, TypeScript, Tailwind, TanStack Table, lucide-react, xlsx). Aucune base de données : les données sont fictives.

## Lancer

```bash
npm install
npm run dev     # http://localhost:3000
npm run build
```

Ajoutez `?simulate=error` à l'URL de `/` pour tester l'état d'erreur.

## Brancher la base de données

Tout passe par [`lib/attendance-service.ts`](lib/attendance-service.ts). Remplacez le corps de `getAttendance`, `getDepartments` et `searchEmployees` (requêtes SQL, ORM ou API) en gardant les signatures et les types de [`lib/types.ts`](lib/types.ts). Les composants n'appellent que ce service.

Le fichier `lib/mock-data.ts` ne sert qu'aux données fictives et peut être supprimé ensuite. Le calcul du temps de présence (paires entrée/sortie) et des absences (jours ouvrés sans pointage) se trouve dans `getAttendance` : à conserver côté service ou à déplacer en SQL.

## Authentification et Rôles

L'application utilise une authentification basée sur PostgreSQL (table `users`), JWT (via `jose`, signé avec `AUTH_SECRET`) et mots de passe sécurisés par `bcryptjs` (12 tours).

- **super_admin** : Accès complet (pointages, filtres, exports, bouton Actualiser et gestion des utilisateurs sur `/admin/utilisateurs`).
- **admin** : Consultation des pointages, filtres et exports (Excel & PDF). Bouton Actualiser et lien Utilisateurs masqués.
- Protection stricte côté serveur avec `middleware.js` et vérification des rôles sur chaque route API (`exigerRole`).

## Points à compléter

- Les pages `/conditions` et `/confidentialite` sont des gabarits provisoires, à faire valider par le service juridique.
- Le domaine personnalisé de production est à configurer au déploiement.
