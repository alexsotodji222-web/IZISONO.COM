# IZISONO — dernières actions Supabase à faire

Le ZIP automatise les corrections côté code et SQL. Une seule configuration Supabase Auth reste hors Data API :

1. Authentication → Password Security → activer **Leaked Password Protection**.
2. Vérifier que les confirmations email sont activées si tu veux bloquer les créations sans confirmation.
3. Garder `SUPABASE_SERVICE_ROLE_KEY` uniquement dans Render/backend, jamais dans `izisono-frontend`.
4. Après déploiement, lancer Security Advisor et corriger tout nouvel avertissement critique.

La migration `20260909_izisono_all_hardening.sql` doit être appliquée sur le projet `cezxykekfgoflwszzkwb`.
