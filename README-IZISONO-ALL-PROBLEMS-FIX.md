# IZISONO — ALL PROBLEMS FIX

Ce ZIP est basé sur la version **IZISONO-v10-ADMIN-FIX** et intègre les corrections prioritaires identifiées sur le SaaS.

## Corrections incluses

1. **Crédits sécurisés**
   - le navigateur ne peut plus modifier `profiles.credits`;
   - débit/remboursement atomiques côté serveur;
   - clé service role uniquement côté backend.

2. **Dashboard admin**
   - dashboard `/admin` inclus;
   - actualisation, suspension, suppression et gestion des Notes;
   - protection contre suppression/suspension de son propre compte admin;
   - audit log;
   - réconciliation Moneroo depuis l'admin.

3. **Mureka plus robuste**
   - suivi serveur en arrière-plan;
   - récupération des générations après redémarrage du serveur;
   - limitation des générations simultanées;
   - remboursement automatique si le démarrage échoue;
   - gestion des entrées trop longues et des erreurs fournisseur.

4. **Moneroo**
   - crédit uniquement après vérification du statut réellement réussi;
   - idempotence conservée;
   - un admin ne peut plus transformer manuellement un paiement en `success`;
   - bouton de réconciliation avec Moneroo.

5. **Anti-abus**
   - confirmation email exigée pour générer;
   - limite par IP;
   - maximum de générations simultanées par utilisateur;
   - limite glissante de générations sur 24 h.

6. **Audio permanent**
   - tentative de copie de l'audio terminé vers Supabase Storage;
   - fallback vers l'URL Mureka si le stockage échoue;
   - bucket `tracks` créé automatiquement côté serveur.

7. **Profil / paramètres**
   - `display_name` en base;
   - modification du nom depuis le profil;
   - le frontend ne modifie pas directement la table `profiles`.

8. **Support et pages légales**
   - `/support.html`;
   - `/legal.html`;
   - liens ajoutés dans le footer.

9. **Durcissement Supabase**
   - privilèges minimaux sur profiles/generation_jobs/payment_transactions;
   - index manquants ajoutés;
   - audit log sécurisé;
   - fonctions SECURITY DEFINER avec `search_path` vide.

## Installation locale Windows

Depuis ton dossier du projet :

```powershell
cd "C:\Users\WINER\Desktop\izisono 6"
```

Extrais ce ZIP **à la racine du projet** en autorisant le remplacement des fichiers.

Puis :

```powershell
cd ".\izisono-server"
npm.cmd install
npm.cmd start
```

## Migration Supabase

Après avoir déployé le nouveau backend, applique :

```text
supabase/migrations/20260909_izisono_all_hardening.sql
```

sur le projet Supabase `cezxykekfgoflwszzkwb`.

**Important :** ne supprime pas `SUPABASE_SERVICE_ROLE_KEY` de Render. Elle doit rester une variable secrète backend et ne doit jamais apparaître dans le frontend.

## Variables Render à vérifier

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `MUREKA_API_KEY`
- `MUREKA_MODEL`
- `MONEROO_SECRET_KEY`
- `MONEROO_WEBHOOK_SECRET`
- `PUBLIC_APP_URL`
- `CLIENT_URL`

Pour plusieurs origines autorisées, `CLIENT_URL` peut être une liste séparée par des virgules.

## Dernière configuration manuelle Supabase

Consulte `SUPABASE-PRODUCTION-CHECKLIST.md` pour l'activation de **Leaked Password Protection**, qui est une configuration Auth et non une migration SQL.


## Correctif connexion V11
- L’interface est initialisée avant le démarrage Supabase : un échec du CDN ou de `/api/config` ne rend plus les boutons muets.
- Le SDK Supabase est chargé dynamiquement avec un fallback jsDelivr.
- Le parsing de `localStorage` des notifications est protégé contre les données corrompues.
- `/api/config` est enregistré avant les routeurs `/api` et envoyé avec `Cache-Control: no-store`.
