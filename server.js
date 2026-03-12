require('dotenv').config();
const express = require('express');
const path    = require('path');
const QRCode  = require('qrcode');
const config  = require('./config');
const notion  = require('./notion');
const { envoyerSMS, envoyerEmail } = require('./notifications');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Validation ────────────────────────────────────────────────────────────────
function validerTel(tel) {
  return /^(\+32|0)[0-9]{8,9}$/.test(tel.replace(/[\s.\-()]/g, ''));
}
function validerEmail(e) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}
function validerDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const aujourd = new Date(); aujourd.setHours(0,0,0,0);
  if (d <= aujourd) return false;
  if (!config.JOURS_OUVRES.includes(d.getDay())) return false;
  const diff = Math.ceil((d - aujourd) / 86400000);
  return diff <= config.JOURS_MAX_A_L_AVANCE;
}

// ── Routes pages ──────────────────────────────────────────────────────────────
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/reservation', (req, res) => res.sendFile(path.join(__dirname, 'public', 'reservation.html')));

// ── GET /api/config ───────────────────────────────────────────────────────────
app.get('/api/config', (req, res) => {
  res.json({
    FORMULES:             config.FORMULES,
    SUPPLEMENTS:          config.SUPPLEMENTS,
    CRENEAUX:             config.CRENEAUX,
    JOURS_OUVRES:         config.JOURS_OUVRES,
    JOURS_MAX_A_L_AVANCE: config.JOURS_MAX_A_L_AVANCE,
    ENTREPRISE:           config.ENTREPRISE
  });
});

// ── GET /api/creneaux?date=YYYY-MM-DD ─────────────────────────────────────────
app.get('/api/creneaux', async (req, res) => {
  const { date } = req.query;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ erreur: 'Date invalide.' });
  if (!validerDate(date)) return res.status(400).json({ erreur: 'Date non disponible.' });
  try {
    const reserves    = await notion.getCreneauxReserves(date);
    const disponibles = config.CRENEAUX.filter(c => !reserves.includes(c));
    res.json({ disponibles, reserves });
  } catch {
    res.json({ disponibles: config.CRENEAUX, reserves: [] });
  }
});

// ── POST /api/reservation ─────────────────────────────────────────────────────
app.post('/api/reservation', async (req, res) => {
  const { prenom, nom, telephone, email, adresse, codePostal, ville,
          formuleId, supplements, dateRdv, heureRdv, vehiculeFonce } = req.body;

  const erreurs = [];
  if (!prenom || prenom.trim().length < 2)  erreurs.push('Prénom invalide.');
  if (!nom    || nom.trim().length < 2)     erreurs.push('Nom invalide.');
  if (!telephone || !validerTel(telephone)) erreurs.push('Téléphone belge invalide.');
  if (!email || !validerEmail(email))       erreurs.push('Email invalide.');
  if (!adresse || !codePostal || !ville)    erreurs.push('Adresse incomplète.');
  if (codePostal && !/^\d{4}$/.test(codePostal.trim())) erreurs.push('Code postal invalide.');

  const formule = config.FORMULES.find(f => f.id === formuleId);
  if (!formule) erreurs.push('Formule invalide.');

  if (!dateRdv || !validerDate(dateRdv)) erreurs.push('Date invalide.');
  if (!heureRdv || !config.CRENEAUX.includes(heureRdv)) erreurs.push('Créneau invalide.');

  if (erreurs.length > 0) return res.status(400).json({ succes: false, erreurs });

  // Double-check dispo
  try {
    const reserves = await notion.getCreneauxReserves(dateRdv);
    if (reserves.includes(heureRdv)) {
      return res.status(409).json({ succes: false, erreurs: ["Ce créneau vient d'être réservé. Choisissez-en un autre."] });
    }
  } catch { /* non bloquant */ }

  // Prix total
  let prixTotal = formule.prix;
  const nomsSupps = [];
  for (const id of (supplements || [])) {
    const s = config.SUPPLEMENTS.find(x => x.id === id && !x.incompatible_avec.includes(formuleId));
    if (s) { prixTotal += s.prix; nomsSupps.push(s.nom); }
  }

  const reservation = {
    prenom: prenom.trim(), nom: nom.trim(),
    telephone: telephone.trim(), email: email.trim().toLowerCase(),
    adresse: adresse.trim(), codePostal: codePostal.trim(), ville: ville.trim(),
    formule: formule.nom, supplements: nomsSupps,
    dateRdv, heureRdv, prixTotal, vehiculeFonce: !!vehiculeFonce
  };

  try {
    await notion.creerReservation(reservation);
    console.log(`[NOTION] ✅ ${reservation.prenom} ${reservation.nom} — ${dateRdv} ${heureRdv} — ${formule.nom}`);
  } catch (err) {
    console.error('[NOTION] ❌', err.code, err.message);
    return res.status(500).json({ succes: false, erreurs: ["Erreur d'enregistrement. Veuillez réessayer."] });
  }

  envoyerSMS(reservation.telephone, reservation).catch(e => console.error('[SMS]', e.message));
  envoyerEmail(reservation.email, reservation).catch(e => console.error('[EMAIL]', e.message));

  res.json({ succes: true, reservation });
});

// ── GET /qrcode.png ───────────────────────────────────────────────────────────
app.get('/qrcode.png', async (req, res) => {
  const url = process.env.PUBLIC_URL || `https://${req.headers.host}`;
  const buf = await QRCode.toBuffer(url, {
    width: 400, margin: 2,
    color: { dark: '#0D1B3E', light: '#FFFFFF' },
    errorCorrectionLevel: 'H'
  });
  res.setHeader('Content-Type', 'image/png');
  res.send(buf);
});

app.listen(PORT, async () => {
  console.log(`\n🚗 AutoClean — http://localhost:${PORT}`);
  console.log(`   Notion  : ${process.env.NOTION_TOKEN ? '✅' : '⚠️  non configuré'}`);
  console.log(`   Twilio  : ${process.env.TWILIO_ACCOUNT_SID ? '✅' : '— non configuré'}`);
  console.log(`   Gmail   : ${process.env.GMAIL_USER ? '✅' : '— non configuré'}\n`);
  if (process.env.NOTION_TOKEN && process.env.NOTION_DATABASE_ID) {
    notion.setupDatabase().catch(e => console.error('[NOTION setup]', e.message));
  }
});
