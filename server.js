require('dotenv').config();
const express = require('express');
const path    = require('path');
const QRCode  = require('qrcode');
const config  = require('./config');
const notion  = require('./notion');
const { envoyerEmail } = require('./notifications');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Helpers durée ─────────────────────────────────────────────────────────────
function toMin(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

// Durée totale en minutes à partir de l'ID formule + IDs suppléments
function calculerDureeMinutes(formuleId, supplementIds) {
  const f = config.FORMULES.find(x => x.id === formuleId);
  if (!f) return 60;
  let d = f.duree_minutes;
  for (const id of (supplementIds || [])) {
    const s = config.SUPPLEMENTS.find(x => x.id === id);
    if (s && !s.incompatible_avec.includes(formuleId)) d += s.duree_extra_minutes;
  }
  return d;
}

// Durée totale à partir du NOM formule + NOMs suppléments (données Notion)
function getDureeMinsFromNoms(formuleName, supplementNames) {
  const f = config.FORMULES.find(x => x.nom === formuleName);
  let d = f ? f.duree_minutes : 60;
  for (const nom of (supplementNames || [])) {
    const s = config.SUPPLEMENTS.find(x => x.nom === nom);
    if (s) d += s.duree_extra_minutes;
  }
  return d;
}

// Vérifie le chevauchement entre le nouveau créneau et les RDV existants
// duree_bloquee = duree_service + DELAI_DEPLACEMENT
// Conflit si: [s, s+sBloquee] chevauche [rStart, rStart+rBloquee]
function slotEnConflit(slotHeure, serviceMinutes, reservations) {
  const DELAI = config.DELAI_DEPLACEMENT_MINUTES;
  const s        = toMin(slotHeure);
  const sBloquee = serviceMinutes + DELAI;
  for (const r of reservations) {
    const rStart   = toMin(r.heureRdv);
    const rBloquee = getDureeMinsFromNoms(r.formule, r.supplements) + DELAI;
    if (s < rStart + rBloquee && s + sBloquee > rStart) return true;
  }
  return false;
}

// ── Validation ────────────────────────────────────────────────────────────────
function validerTel(tel) {
  return /^(\+32|0)[0-9]{8,9}$/.test(tel.replace(/[\s.\-()]/g, ''));
}
function validerEmail(e) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}
function validerDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const aujourd = new Date(); aujourd.setHours(0, 0, 0, 0);
  if (d <= aujourd) return false;
  if (!config.JOURS_OUVRES.includes(d.getDay())) return false;
  const diff = Math.ceil((d - aujourd) / 86400000);
  return diff <= config.JOURS_MAX_A_L_AVANCE;
}

// ── Routes pages ──────────────────────────────────────────────────────────────
app.get('/',            (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/reservation', (req, res) => res.sendFile(path.join(__dirname, 'public', 'reservation.html')));

// ── GET /api/config ───────────────────────────────────────────────────────────
app.get('/api/config', (req, res) => {
  res.json({
    FORMULES:             config.FORMULES,
    SUPPLEMENTS:          config.SUPPLEMENTS,
    CRENEAUX:             config.CRENEAUX,
    CRENEAUX_FLAT:        config.CRENEAUX_FLAT,
    JOURS_OUVRES:         config.JOURS_OUVRES,
    JOURS_MAX_A_L_AVANCE: config.JOURS_MAX_A_L_AVANCE,
    MAX_PAR_JOUR:         config.MAX_PAR_JOUR,
    MAX_PAR_DEMI_JOURNEE: config.MAX_PAR_DEMI_JOURNEE,
    ENTREPRISE:           config.ENTREPRISE
  });
});

// ── GET /api/disponibilites-mois?mois=YYYY-MM&formule=ID&supplements=ID1,ID2 ──
app.get('/api/disponibilites-mois', async (req, res) => {
  const { mois, formule: formuleId, supplements: suppsStr } = req.query;
  if (!mois || !/^\d{4}-\d{2}$/.test(mois)) return res.status(400).json({ erreur: 'Mois invalide.' });
  const supplementIds  = suppsStr ? suppsStr.split(',').filter(Boolean) : [];
  const serviceMinutes = formuleId ? calculerDureeMinutes(formuleId, supplementIds) : 45;
  try {
    const dispo = await notion.getDisponibilitesMois(mois, serviceMinutes);
    res.json(dispo);
  } catch (err) {
    console.error('[API disponibilites-mois]', err.message);
    res.json({});
  }
});

// ── GET /api/creneaux?date=YYYY-MM-DD&formule=ID&supplements=id1,id2 ──────────
app.get('/api/creneaux', async (req, res) => {
  const { date, formule: formuleId, supplements: suppsStr } = req.query;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ erreur: 'Date invalide.' });
  if (!validerDate(date)) return res.status(400).json({ erreur: 'Date non disponible.' });

  const supplementIds = suppsStr ? suppsStr.split(',').filter(Boolean) : [];
  const dureeRequise  = formuleId ? calculerDureeMinutes(formuleId, supplementIds) : 45;

  try {
    const { reservations } = await notion.getDisponibilitesJour(date);

    // Créneaux bloqués par chevauchement de durée réelle + 30 min de trajet
    const creneaux_pris = config.CRENEAUX_FLAT.filter(slot =>
      slotEnConflit(slot, dureeRequise, reservations)
    );

    const matin_complet      = config.CRENEAUX.matin.every(s => creneaux_pris.includes(s));
    const apres_midi_complet = config.CRENEAUX.apres_midi.every(s => creneaux_pris.includes(s));

    res.json({
      creneaux_pris,
      matin_complet,
      apres_midi_complet,
      jour_complet: creneaux_pris.length >= config.CRENEAUX_FLAT.length
    });
  } catch {
    res.json({ creneaux_pris: [], matin_complet: false, apres_midi_complet: false, jour_complet: false });
  }
});

// ── POST /api/reservation ─────────────────────────────────────────────────────
app.post('/api/reservation', async (req, res) => {
  const { prenom, nom, telephone, email, adresse, codePostal, ville,
          formuleId, supplements, dateRdv, heureRdv, commentaire } = req.body;

  const erreurs = [];
  if (!prenom || prenom.trim().length < 2)  erreurs.push('Prénom invalide.');
  if (!nom    || nom.trim().length < 2)     erreurs.push('Nom invalide.');
  if (!telephone || !validerTel(telephone)) erreurs.push('Téléphone belge invalide.');
  // Email optionnel — validé seulement s'il est fourni
  if (email && email.trim() && !validerEmail(email)) erreurs.push('Email invalide.');
  if (!adresse || !codePostal || !ville)    erreurs.push('Adresse incomplète.');
  if (codePostal && !/^\d{4}$/.test(codePostal.trim())) erreurs.push('Code postal invalide.');

  const formule = config.FORMULES.find(f => f.id === formuleId);
  if (!formule) erreurs.push('Formule invalide.');

  if (!dateRdv || !validerDate(dateRdv)) erreurs.push('Date invalide.');
  if (!heureRdv || !config.CRENEAUX_FLAT.includes(heureRdv)) erreurs.push('Créneau invalide.');

  if (erreurs.length > 0) return res.status(400).json({ succes: false, erreurs });

  // Double-check disponibilité avec règles de durée réelle
  try {
    const { reservations } = await notion.getDisponibilitesJour(dateRdv);
    const dureeRequise = calculerDureeMinutes(formuleId, supplements || []);

    if (slotEnConflit(heureRdv, dureeRequise, reservations)) {
      return res.status(409).json({ succes: false, erreurs: ["Ce créneau n'est plus disponible. Veuillez en choisir un autre."] });
    }
  } catch { /* non bloquant */ }

  // Calcul prix total
  let prixTotal = formule.prix;
  const nomsSupps = [];
  for (const id of (supplements || [])) {
    const s = config.SUPPLEMENTS.find(x => x.id === id && !x.incompatible_avec.includes(formuleId));
    if (s) { prixTotal += s.prix; nomsSupps.push(s.nom); }
  }

  const reservation = {
    prenom: prenom.trim(), nom: nom.trim(),
    telephone: telephone.trim(), email: (email || '').trim().toLowerCase(),
    adresse: adresse.trim(), codePostal: codePostal.trim(), ville: ville.trim(),
    commentaire: (commentaire || '').trim(),
    formule: formule.nom, supplements: nomsSupps,
    dateRdv, heureRdv, prixTotal
  };

  try {
    await notion.creerReservation(reservation);
    console.log(`[NOTION] ✅ ${reservation.prenom} ${reservation.nom} — ${dateRdv} ${heureRdv} — ${formule.nom}`);
  } catch (err) {
    console.error('[NOTION] ❌', err.code, err.message);
    return res.status(500).json({ succes: false, erreurs: ["Erreur d'enregistrement. Veuillez réessayer."] });
  }

  envoyerEmail(reservation).catch(e => console.error('[EMAIL]', e.message));

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
  console.log(`   Gmail   : ${process.env.GMAIL_USER ? '✅' : '— non configuré'}\n`);
  if (process.env.NOTION_TOKEN && process.env.NOTION_DATABASE_ID) {
    notion.setupDatabase().catch(e => console.error('[NOTION setup]', e.message));
  }
});
