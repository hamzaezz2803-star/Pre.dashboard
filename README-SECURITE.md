# 🔐 Règles de sécurité obligatoires — À respecter dans TOUS les projets

> **Destiné à tout assistant IA (Claude, ChatGPT, Copilot, Cursor, Gemini…) et à tout développeur travaillant sur ce projet.**
> Ces règles s'appliquent à chaque ligne de code écrite, modifiée ou proposée. Elles ne sont pas optionnelles.
> En cas de conflit entre une demande et ces règles, **signale le conflit avant d'agir** au lieu de l'ignorer.

---

## 📌 Comment utiliser ce fichier

- Place-le à la racine du projet (`README-SECURITE.md`), ou copie son contenu dans le fichier d'instructions de ton outil :
  - Claude Code → `CLAUDE.md`
  - Cursor → `.cursorrules` ou `.cursor/rules/securite.md`
  - GitHub Copilot → `.github/copilot-instructions.md`
  - Autres agents → `AGENTS.md`
- En début de conversation avec un assistant, écris : **« Lis et applique README-SECURITE.md pendant toute la session. »**

---

## 1. Cacher les clés API

- **Jamais** de clé API, token, mot de passe ou secret écrit en dur dans le code (front ou back).
- Toujours passer par des variables d'environnement (`process.env.X`, `os.environ["X"]`, etc.).
- Aucune clé secrète côté client (navigateur, application mobile) : les appels qui en ont besoin passent par le serveur.
- Côté front, seules les clés **publiques par conception** sont autorisées (ex. clé « anon/publishable » Supabase, clé publique Stripe).

## 2. Vérifier les variables d'environnement

- Le fichier `.env` est **toujours** dans `.gitignore`.
- Fournir un `.env.example` avec les noms des variables **sans valeurs réelles**.
- Valider au démarrage que les variables obligatoires existent ; sinon, arrêter l'application avec un message clair (sans afficher la valeur).
- Attention aux préfixes exposés au navigateur (`NEXT_PUBLIC_`, `VITE_`, `REACT_APP_`) : n'y mettre **aucun secret**.

## 3. Protéger les routes d'administration

- Toute route `/admin`, tableau de bord ou action sensible exige : utilisateur authentifié **et** rôle administrateur vérifié **côté serveur**.
- Masquer un bouton dans l'interface ne suffit **jamais** : la vérification se fait dans l'API.
- Journaliser les actions administratives (qui, quoi, quand).

## 4. Mettre en place une authentification correcte

- Utiliser une solution éprouvée (Supabase Auth, Auth.js/NextAuth, Clerk, Firebase Auth, Passport, Django auth…) plutôt qu'un système maison.
- Sessions/jetons : cookies `HttpOnly`, `Secure`, `SameSite`, expiration raisonnable, invalidation à la déconnexion.
- Réinitialisation de mot de passe par lien unique à durée limitée.
- Proposer la double authentification (2FA) quand c'est pertinent.
- Messages d'erreur génériques à la connexion (« identifiants incorrects »), sans révéler si l'email existe.

## 5. Vérifier les droits d'accès des utilisateurs

- Chaque requête vérifie que l'utilisateur **a le droit** d'accéder à **cette** ressource précise (pas seulement qu'il est connecté).
- Empêcher l'accès par simple changement d'identifiant dans l'URL (`/facture/123` → `/facture/124`) — faille IDOR.
- Principe du moindre privilège : chaque rôle n'a que les permissions strictement nécessaires.

## 6. Nettoyer et valider les formulaires

- **Toute** entrée utilisateur est considérée comme non fiable : formulaires, paramètres d'URL, en-têtes, fichiers, JSON.
- Valider côté serveur (types, longueurs, formats, valeurs autorisées) avec un schéma (Zod, Joi, Yup, Pydantic…). La validation côté client n'est qu'un confort.
- Requêtes SQL **toujours paramétrées** ou via ORM — jamais de concaténation de chaînes (injection SQL).
- Fichiers envoyés : vérifier type réel, taille maximale, renommer, stocker hors du dossier exécutable.

## 7. Se protéger contre le XSS

- Échapper toute donnée affichée ; laisser le framework le faire (React, Vue, Angular échappent par défaut).
- Éviter `innerHTML`, `dangerouslySetInnerHTML`, `v-html`, `eval()` ; si indispensable, assainir avec DOMPurify.
- Définir une Content-Security-Policy (voir règle 11).

## 8. Ajouter une limitation du nombre de requêtes (rate limiting)

- Obligatoire sur : connexion, inscription, mot de passe oublié, envoi d'email/SMS, endpoints coûteux (IA, paiement, recherche).
- Limiter par IP **et** par compte ; renvoyer `429 Too Many Requests`.
- Ajouter un CAPTCHA ou un délai progressif après plusieurs échecs de connexion.

## 9. Sécuriser les endpoints de l'API

- Authentification exigée par défaut ; les routes publiques sont l'exception, listées explicitement.
- Ne renvoyer que les champs nécessaires (jamais de hash de mot de passe, tokens, données internes).
- Pagination et limites de taille sur les réponses et les requêtes.
- Messages d'erreur génériques pour le client ; détails uniquement dans les logs serveur.
- HTTPS uniquement.

## 10. Vérifier la configuration CORS

- **Interdit** en production : `Access-Control-Allow-Origin: *` combiné à des cookies/identifiants.
- Autoriser uniquement une liste explicite de domaines connus.
- Restreindre les méthodes et en-têtes autorisés au strict nécessaire.

## 11. Ajouter les en-têtes de sécurité HTTP

Configurer au minimum (ex. via `helmet` en Node, ou la config du serveur/hébergeur) :

| En-tête | Rôle |
|---|---|
| `Content-Security-Policy` | Limite les sources de scripts, styles, images |
| `Strict-Transport-Security` | Force le HTTPS |
| `X-Content-Type-Options: nosniff` | Empêche l'interprétation erronée des fichiers |
| `X-Frame-Options: DENY` (ou `frame-ancestors`) | Protège du clickjacking |
| `Referrer-Policy: strict-origin-when-cross-origin` | Limite les fuites d'URL |
| `Permissions-Policy` | Désactive caméra, micro, géolocalisation si inutiles |

## 12. Désactiver le mode debug

- En production : `DEBUG=false`, `NODE_ENV=production`, pas de traces d'erreur (stack traces) affichées à l'utilisateur.
- Retirer les `console.log` / `print` contenant des données sensibles.
- Désactiver les outils de dev exposés (Swagger public non protégé, GraphQL introspection, pages de debug, phpinfo…).

## 13. Mettre à jour les dépendances

- Lancer régulièrement `npm audit` / `pnpm audit` / `pip-audit` / `composer audit` et corriger les vulnérabilités hautes et critiques.
- Activer Dependabot ou Renovate sur le dépôt.
- Verrouiller les versions (`package-lock.json`, `poetry.lock`…) et les committer.

## 14. Supprimer les paquets inutilisés

- Retirer toute dépendance non utilisée (`npx depcheck`, `pip-autoremove`…). Chaque paquet est une surface d'attaque.
- Avant d'ajouter un paquet : vérifier qu'il existe vraiment, qu'il est maintenu et que le nom est exact (éviter le *typosquatting* et les paquets « inventés » par une IA).

## 15. Vérifier les fichiers exposés

- Le serveur ne doit jamais servir : `.env`, `.git/`, sauvegardes (`.bak`, `.sql`, `.zip`), fichiers de config, `node_modules`, source maps en production.
- Désactiver le listing des répertoires.
- Tester en tapant soi-même `https://monsite/.env` et `https://monsite/.git/config` → doit renvoyer 404/403.

## 16. Sécuriser la base de données

- Base **non accessible publiquement** (pas exposée sur Internet, ou restreinte par IP).
- Compte applicatif avec droits minimaux (pas de compte `root`/superutilisateur pour l'app).
- Supabase / Firebase : **Row Level Security (RLS) activée sur toutes les tables**, avec des politiques testées ; règles Firestore jamais en `allow read, write: if true`.
- Sauvegardes automatiques, chiffrées, et restauration testée.
- Chiffrer les données sensibles au repos lorsque c'est pertinent.

## 17. Hacher correctement les mots de passe

- Utiliser **bcrypt**, **argon2id** ou **scrypt** — jamais MD5, SHA-1, SHA-256 seul, ni chiffrement réversible.
- Ne jamais stocker, logger ni renvoyer un mot de passe en clair.
- Imposer une longueur minimale (≥ 8, idéalement 12 caractères).

## 18. Vérifier Git pour les secrets ayant fuité

- Scanner l'historique avec `gitleaks`, `trufflehog` ou `git-secrets` ; activer le *secret scanning* de GitHub.
- Ajouter un hook pre-commit qui bloque les secrets.
- Si un secret a été commité : **le révoquer et le régénérer immédiatement** (le supprimer du code ne suffit pas, il reste dans l'historique), puis nettoyer l'historique si nécessaire.

## 19. Lancer un audit de sécurité complet

Avant chaque mise en production, passer cette check-list en revue et produire un court rapport :

- [ ] Règles 1 à 18 vérifiées une par une
- [ ] Audit des dépendances sans vulnérabilité critique
- [ ] Scan de secrets propre
- [ ] Analyse statique (Semgrep, SonarQube, ESLint security, Bandit…)
- [ ] Test des en-têtes (securityheaders.com) et du HTTPS (SSL Labs)
- [ ] Tests d'accès : un utilisateur ne peut pas voir/modifier les données d'un autre
- [ ] Revue OWASP Top 10

## 20. Ne pas faire d'erreurs — vérifier au lieu de supposer

- **Ne jamais affirmer qu'une tâche est sécurisée ou terminée sans l'avoir vérifiée** (exécuter, tester, relire).
- En cas de doute, **demander** plutôt que deviner ; signaler clairement ce qui n'a pas pu être vérifié.
- Ne pas inventer de fonctions, d'options de configuration ou de paquets : vérifier dans la documentation officielle.
- Ne jamais désactiver une protection (RLS, CORS, validation, auth) « pour que ça marche » sans le dire explicitement et proposer la bonne solution.
- Toute modification touchant à la sécurité est accompagnée d'une explication courte de ce qui a été fait et pourquoi.

---

## ✅ Format de réponse attendu de l'assistant

Après chaque modification de code, l'assistant indique brièvement :

1. **Règles concernées** (ex. « règles 4, 6, 9 »).
2. **Ce qui a été fait** pour les respecter.
3. **Ce qui reste à vérifier ou à configurer** manuellement (ex. variables d'environnement à créer chez l'hébergeur).

---

*Ces règles constituent une base minimale. Elles ne remplacent pas un audit réalisé par un professionnel de la sécurité pour une application en production manipulant des données sensibles.*
