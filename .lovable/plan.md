# Plan : 5 fonctionnalités majeures pour Kaayu

## 1. Édition de documents créés (nouveau)
- Nouvelle page `/app/documents/$id/edit` avec éditeur texte riche (Tiptap)
- Bouton "Nouveau document texte" dans Documents → crée un `.html` vide stocké
- Bouton "Modifier" sur chaque document texte (mime `text/html`, `text/plain`, `text/markdown`)
- Sauvegarde dans Storage + nouvelle entrée dans `document_versions`

## 2. Historique de versions
- Nouvelle table `document_versions` (document_id, version_number, storage_path, size_bytes, created_by, created_at, comment)
- À chaque upload/édition d'un document existant → snapshot de l'ancienne version
- Onglet "Versions" dans la page document : liste, télécharger, restaurer

## 3. Partage interne
- Nouvelle table `document_shares` (document_id, shared_with_user_id, permission [read/write], created_at)
- Bouton "Partager" sur chaque document → modal avec recherche utilisateur (profiles)
- RLS : un user voit ses docs OU ceux partagés avec lui
- Section "Partagé avec moi" dans Documents

## 4. Exports DOCX / PDF / Excel
- Bouton export sur :
  - **Documents** (liste filtrée → Excel CSV)
  - **Réunions** (résumé → PDF + DOCX via `docx` + `jspdf`)
  - **Tâches** (liste → Excel CSV + PDF)
- Librairies : `docx`, `jspdf`, `jspdf-autotable` (côté client, pas besoin de serveur)

## 5. Centre de notifications & rappels
- Bouton cloche dans header → popover avec liste notifications
- Marquer comme lu / tout marquer
- Edge function `send-reminders` (cron) qui scanne `calendar_events` & `tasks` à échéance et insère dans `notifications`
- Realtime subscription pour push instantané dans l'UI

## Détails techniques
- Nouveaux fichiers :
  - `src/routes/app.documents.$id.tsx` (vue + édition)
  - `src/components/share-document-dialog.tsx`
  - `src/components/notifications-popover.tsx`
  - `src/lib/exports.ts` (helpers DOCX/PDF/XLSX)
  - `supabase/functions/send-reminders/index.ts`
- Migrations : `document_versions`, `document_shares`, RLS policies
- Bucket storage existant `documents` réutilisé

## Ordre d'exécution
1. Migrations DB (versions + partages)
2. Installation libs (`docx`, `jspdf`, `jspdf-autotable`, `@tiptap/react`, `@tiptap/starter-kit`)
3. Helpers exports
4. Page édition + versions
5. Dialog partage + section "Partagé avec moi"
6. Popover notifications + edge function rappels
