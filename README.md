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

## Connexion (statique)

La page `/login` utilise un compte fixe de démonstration : `admin` / `admin123` (voir `lib/auth.ts` et `app/actions/auth.ts`). La protection des pages est faite par `proxy.ts` via un cookie. À remplacer par une vraie authentification avant la mise en production.

## Points à compléter

- Les pages `/conditions` et `/confidentialite` sont des gabarits provisoires, à faire valider par le service juridique.
- Le domaine personnalisé de production est à configurer au déploiement.
