# 🚗 AutoClean — Système de réservation en ligne

Formulaire de réservation mobile-first avec calendrier, sélection de formules, paiement affiché en temps réel, confirmation SMS + Email et intégration Notion.

---

## Prérequis
- Node.js v18+

## Installation
```bash
cd autoclean-booking
npm install
```

---

## Configuration

### 1. Logo
Placer le logo dans `public/logo.png`

### 2. Notion
1. Aller sur https://www.notion.so/my-integrations → New integration → copier le token
2. Créer une base de données vide dans Notion
3. La connecter à l'intégration (⋯ → Connections)
4. Récupérer l'ID dans l'URL : `notion.so/XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX`
5. Au 1er démarrage, le serveur configure automatiquement toutes les propriétés

### 3. Twilio SMS (optionnel)
1. Créer un compte sur twilio.com (gratuit pour tests)
2. Récupérer Account SID, Auth Token et un numéro Twilio

### 4. Gmail Email (optionnel)
1. Activer la validation en 2 étapes sur ton compte Gmail
2. Aller sur https://myaccount.google.com/apppasswords
3. Créer un mot de passe d'application "Mail" → copier le code 16 caractères

### 5. Remplir le .env
```env
NOTION_TOKEN=secret_...
NOTION_DATABASE_ID=...

TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+32...
OWNER_PHONE_NUMBER=+32...

GMAIL_USER=ton@gmail.com
GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
OWNER_EMAIL=ton@gmail.com

PUBLIC_URL=https://ton-app.onrender.com
```

---

## Lancer en local
```bash
node server.js
```
→ http://localhost:3000

## Générer le QR code
```bash
node generate-qr.js
```

---

## Modifier les tarifs / créneaux
**Tout est dans `config.js` uniquement** — ne jamais hardcoder ailleurs.

---

## Déployer sur Render
1. Pusher sur GitHub
2. Render → New Web Service → connecter le repo
3. Build command : `npm install`
4. Start command : `node server.js`
5. Ajouter les variables d'environnement
6. Générer un domaine et mettre à jour `PUBLIC_URL`
