# Izisono V15 — PayDunya + ZAR display + voice dictation + stable navigation

## 1. Paiement
V15 remplace le fournisseur de paiement Moneroo par PayDunya.

Variables serveur:

```env
PAYDUNYA_MODE=live
PAYDUNYA_MASTER_KEY=...
PAYDUNYA_PRIVATE_KEY=...
PAYDUNYA_TOKEN=...
```

L'API PayDunya utilise XOF pour les moyens de paiement Togo. L'interface Izisono affiche désormais les prix du shop en ZAR avec un taux d'affichage configurable:

```env
DISPLAY_ZAR_PER_XOF=0.02845
```

Le paiement réel reste en XOF pour T-Money / Moov Togo. Le checkout PayDunya est créé côté serveur; le token est vérifié côté serveur et le callback IPN est validé avec le SHA-512 de la Master Key.

Endpoint callback à configurer dans PayDunya si nécessaire:

`https://VOTRE-DOMAINE/api/billing/paydunya-ipn`

## 2. Base de données
La migration `20260910_paydunya_payment_provider.sql`:
- renomme l'identifiant de paiement en `payment_id`;
- supprime les anciennes fonctions de crédit liées à l'ancien fournisseur;
- crée `record_paydunya_transaction` et `apply_paydunya_payment`;
- garde les opérations de crédit côté `service_role` uniquement;
- conserve l'idempotence grâce à l'identifiant unique du paiement.

## 3. Micro
Le champ d'histoire et le champ paroles ont maintenant un bouton 🎙.
Le navigateur utilise Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`). Chrome/Edge sont recommandés. Le texte dicté est inséré directement dans le champ et le compteur est mis à jour.

## 4. Navigation
V15 ajoute une navigation interne stable basée sur les ancres et `hashchange`. Les clics sur Accueil, Créer, Explorer, Mes chansons et Crédits ne rechargent pas la page et ne renvoient plus arbitrairement à l'accueil.

## 5. Vérification avant déploiement
1. Appliquer la migration Supabase.
2. Ajouter les variables PayDunya dans Render.
3. Vérifier `/health`.
4. Vérifier `/api/config` : affichage ZAR et paiement XOF.
5. Tester un checkout PayDunya en mode test avant de passer en live si les clés de test sont disponibles.
6. Tester T-Money et Moov Togo en production uniquement avec les clés Live appropriées.
