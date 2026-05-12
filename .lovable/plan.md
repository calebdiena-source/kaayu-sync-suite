# Plan d'implémentation Kaayu — 4 chantiers

Je propose de livrer dans cet ordre (du plus rapide au plus lourd), en commitant après chaque étape pour que tu puisses tester.

## Étape 1 — Indicateur En ligne / Hors connexion (rapide)
- Hook `useOnlineStatus` basé sur `navigator.onLine` + events `online`/`offline`.
- Pastille dans le header de `app-shell.tsx` (point vert + "En ligne" / point orange + "Hors connexion").
- Toast Sonner quand l'état change.

## Étape 2 — En-tête "Taux du jour" auto sur chaque document (haute valeur)
- Helper `buildRateHeader()` qui lit la dernière ligne `exchange_rates` du jour et retourne :
  ```
  === TAUX DU JOUR — 12/05/2026 — 10:35:22 ===
  USD/FC: 2800.000000 | EUR/USD: 1.082345 | CHF/USD: 1.123456
  ===========================================
  ```
- Insertion automatique en haut :
  - Création d'une **Note** (route `app.documents.tsx` → handler Note).
  - Sauvegarde d'un document existant dans l'éditeur TipTap (`app.documents.$id.tsx`) : si l'en-tête existe déjà, on le remplace par la version actuelle ; sinon on l'ajoute.
  - Téléversement d'un fichier (.docx créé wrapper, autres formats : on stocke l'en-tête dans `document_versions.comment` puisqu'on ne réécrit pas un PDF/JPG).
- L'en-tête est aussi enregistré dans `document_versions.comment` à chaque save → l'IA pourra le lire pour les rapports mensuels.

## Étape 3 — Rapport mensuel IA avec évolution des taux
- Edge function `monthly-report` : agrège `exchange_rates` + `documents` du mois choisi, appelle Lovable AI (`google/gemini-2.5-pro`) avec un prompt structuré (résumé activité + variations devises).
- UI dans l'AI assistant : bouton "Générer rapport mensuel", sélection mois.
- Génération `.docx` côté client via la lib `docx` déjà installée + bouton "Télécharger PDF" (impression navigateur).
- Mini-graphique d'évolution (recharts) des 3 paires de devises sur le mois.

## Étape 4 — Support offline (le plus lourd)
- **Service Worker** : configuration prudente (NetworkFirst pour HTML, désactivé en preview Lovable, voir contraintes PWA).
- **IndexedDB** via `idb` :
  - File d'attente `outbox` pour documents/notes/tâches/réunions créés ou édités offline.
  - Cache lecture des listes principales (documents, tasks, meetings, calendar_events).
- **Sync au retour online** : flush de l'outbox, upsert Supabase, gestion d'erreurs.
- **Résolution de conflits** : si `updated_at` distant > `updated_at` local au moment du flush → dialog "Garder local / Garder distant / Fusionner".
- Adaptation des routes Documents / Notes / Tasks / Meetings pour passer par une couche `syncedStore` au lieu d'appeler Supabase directement.

⚠️ L'étape 4 est volumineuse (≥ 8-10 fichiers, refactor des CRUD) et s'exécute mal dans la preview iframe Lovable — le SW ne s'active qu'en build publié. Je recommande de la garder pour la fin et de la livrer en plusieurs sous-étapes.

## Détails techniques
- Pas de changement de schéma DB nécessaire (on réutilise `document_versions.comment` pour stocker l'en-tête taux).
- Edge function `monthly-report` utilise `LOVABLE_API_KEY` (déjà présent).
- Service Worker conditionnel : `if (!isPreviewHost && !isInIframe) register()`.

## Question avant de commencer
Je commence par les **étapes 1 + 2** dans ce premier tour (rapides, immédiatement testables), puis l'étape 3, puis l'étape 4 séparément ? Ou tu préfères que je tente tout en un seul gros tour (plus risqué) ?
