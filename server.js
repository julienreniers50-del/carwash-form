require('dotenv').config();
const express = require('express');
const path    = require('path');
const QRCode  = require('qrcode');
const config  = require('./config');
const notion  = require('./notion');
const { envoyerEmail } = require('./notifications');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Cache et verrou promo ─────────────────────────────────────────────────────
let promoCache        = null;
let promoCacheTs      = 0;
let promoLock         = false;
// Compteur en mémoire — fallback si NOTION_CONFIG_DATABASE_ID non configuré
let placesRestantesMem = config.PROMO_LANCEMENT.places_total;

async function withPromoLock(fn) {
  let tries = 0;
  while (promoLock && tries < 3) {
    await new Promise(r => setTimeout(r, 500));
    tries++;
  }
  if (promoLock) throw new Error('Promo lock timeout');
  promoLock = true;
  try { return await fn(); }
  finally { promoLock = false; }
}

async function getPromoCached() {
  const now = Date.now();
  if (promoCache && now - promoCacheTs < 60000) return promoCache;
  const raw = await notion.getPromoConfig();
  const P   = config.PROMO_LANCEMENT;
  if (raw) {
    promoCache = { active: raw.promo_active, places_restantes: raw.places_restantes,
                   places_total: P.places_total, prix_promo: P.prix_promo,
                   prix_normal: P.prix_normal, pourcentage: P.pourcentage };
  } else {
    promoCache = { active: placesRestantesMem > 0, places_restantes: placesRestantesMem,
                   places_total: P.places_total, prix_promo: P.prix_promo,
                   prix_normal: P.prix_normal, pourcentage: P.pourcentage };
  }
  promoCacheTs = now;
  return promoCache;
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Helpers créneaux ───────────────────────────────────────────────────────────
function toMin(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function fromMin(min) {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

// Génère tous les créneaux entre HORAIRES.debut et HORAIRES.fin (par pas de INTERVALLES_CRENEAUX)
function genererTousCreneaux() {
  const debut = toMin(config.HORAIRES.debut);
  const fin   = toMin(config.HORAIRES.fin);
  const slots = [];
  for (let t = debut; t < fin; t += config.INTERVALLES_CRENEAUX) {
    slots.push(fromMin(t));
  }
  return slots;
}

// Durée totale en minutes : formuleId + supplementIds
function calculerDureeMinutes(formuleId, supplementIds) {
  const f = config.FORMULES.find(x => x.id === formuleId);
  if (!f) return 60;
  if (f.inclut_supplements) return f.duree_minutes; // Showroom : suppléments inclus
  let d = f.duree_minutes;
  for (const id of (supplementIds || [])) {
    const s = config.SUPPLEMENTS.find(x => x.id === id);
    if (s && !s.incompatible_avec.includes(formuleId)) d += s.duree_extra_minutes;
  }
  return d;
}

// Calcule les créneaux disponibles pour une date/formule donnée
// reservations : [{ heureRdv, formule, supplements, dureePrestation }]
// Retourne : [{ heure: 'HH:MM', disponible: bool }]
function calculerCreneauxDisponibles(reservations, formuleId, dureeService) {
  const DELAI      = config.HORAIRES.deplacement;
  const finJournee = toMin(config.HORAIRES.fin);
  const showroomHeures = reservations
    .filter(r => r.formule === 'Formule Showroom')
    .map(r => r.heureRdv);

  // ── Showroom : uniquement les 2 créneaux fixes ────────────────────────────
  if (formuleId === 'showroom') {
    return config.SHOWROOM_CRENEAUX_FIXES.map(h => {
      const hMin = toMin(h);
      // Règle 1 : prestation doit finir avant 18:30
      if (hMin + dureeService > finJournee) return { heure: h, disponible: false };
      // Règle 2 : chevauchement avec réservation existante
      for (const r of reservations) {
        const rStart   = toMin(r.heureRdv);
        const rBloquee = r.dureePrestation + DELAI;
        if (hMin < rStart + rBloquee && hMin + dureeService + DELAI > rStart) {
          return { heure: h, disponible: false };
        }
      }
      return { heure: h, disponible: true };
    });
  }

  // ── Autres formules : grille dynamique toutes les INTERVALLES_CRENEAUX min ─
  return genererTousCreneaux().map(h => {
    const hMin = toMin(h);

    // Règle 1 : prestation doit finir avant 18:30
    if (hMin + dureeService > finJournee) return { heure: h, disponible: false };

    // Règle 2 : bloquer les créneaux fixes si un Showroom y est déjà réservé
    if (config.SHOWROOM_CRENEAUX_FIXES.includes(h) && showroomHeures.includes(h)) {
      return { heure: h, disponible: false };
    }

    // Règle 3 : chevauchement avec une réservation existante
    for (const r of reservations) {
      const rStart   = toMin(r.heureRdv);
      const rBloquee = r.dureePrestation + DELAI;
      if (hMin < rStart + rBloquee && hMin + dureeService + DELAI > rStart) {
        return { heure: h, disponible: false };
      }
    }

    return { heure: h, disponible: true };
  });
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

// ── GET /api/promo ────────────────────────────────────────────────────────────
app.get('/api/promo', async (req, res) => {
  try {
    res.json(await getPromoCached());
  } catch (err) {
    console.error('[PROMO]', err.message);
    const P = config.PROMO_LANCEMENT;
    res.json({ active: false, places_restantes: 0, places_total: P.places_total,
               prix_promo: P.prix_promo, prix_normal: P.prix_normal, pourcentage: P.pourcentage });
  }
});

// ── Routes pages ──────────────────────────────────────────────────────────────
app.get('/',            (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/reservation', (req, res) => res.sendFile(path.join(__dirname, 'public', 'reservation.html')));

// ── GET /api/config ───────────────────────────────────────────────────────────
app.get('/api/config', (req, res) => {
  res.json({
    FORMULES:                config.FORMULES,
    SUPPLEMENTS:             config.SUPPLEMENTS,
    HORAIRES:                config.HORAIRES,
    INTERVALLES_CRENEAUX:    config.INTERVALLES_CRENEAUX,
    SHOWROOM_CRENEAUX_FIXES: config.SHOWROOM_CRENEAUX_FIXES,
    JOURS_OUVRES:            config.JOURS_OUVRES,
    JOURS_MAX_A_L_AVANCE:    config.JOURS_MAX_A_L_AVANCE,
    ENTREPRISE:              config.ENTREPRISE
  });
});

// ── GET /api/disponibilites-mois?mois=YYYY-MM&formule=ID&supplements=IDs ──────
app.get('/api/disponibilites-mois', async (req, res) => {
  const { mois, formule: formuleId, supplements: suppsStr } = req.query;
  if (!mois || !/^\d{4}-\d{2}$/.test(mois)) return res.status(400).json({ erreur: 'Mois invalide.' });
  const supplementIds = suppsStr ? suppsStr.split(',').filter(Boolean) : [];
  const dureeRequise  = formuleId ? calculerDureeMinutes(formuleId, supplementIds) : 45;
  try {
    const parJour = await notion.getReservationsMois(mois);
    const result  = {};
    for (const [date, reservations] of Object.entries(parJour)) {
      const creneaux    = calculerCreneauxDisponibles(reservations, formuleId, dureeRequise);
      const jour_complet = creneaux.every(c => !c.disponible);
      result[date] = { total: reservations.length, jour_complet };
    }
    res.json(result);
  } catch (err) {
    console.error('[API disponibilites-mois]', err.message);
    res.json({});
  }
});

// ── GET /api/creneaux?date=YYYY-MM-DD&formule=ID&supplements=IDs ──────────────
app.get('/api/creneaux', async (req, res) => {
  const { date, formule: formuleId, supplements: suppsStr } = req.query;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ erreur: 'Date invalide.' });
  if (!validerDate(date)) return res.status(400).json({ erreur: 'Date non disponible.' });

  const supplementIds = suppsStr ? suppsStr.split(',').filter(Boolean) : [];
  const dureeRequise  = formuleId ? calculerDureeMinutes(formuleId, supplementIds) : 45;

  try {
    const { reservations } = await notion.getDisponibilitesJour(date);
    const creneaux = calculerCreneauxDisponibles(reservations, formuleId, dureeRequise);
    res.json({ date, formule: formuleId, creneaux });
  } catch {
    res.json({ date, formule: formuleId, creneaux: [] });
  }
});

// ── POST /api/reservation ─────────────────────────────────────────────────────
app.post('/api/reservation', async (req, res) => {
  const { prenom, nom, telephone, email, adresse, codePostal, ville,
          formuleId, supplements, dateRdv, heureRdv, commentaire,
          promo_attendue, accepter_prix_normal } = req.body;

  const erreurs = [];
  if (!prenom || prenom.trim().length < 2)  erreurs.push('Prénom invalide.');
  if (!nom    || nom.trim().length < 2)     erreurs.push('Nom invalide.');
  if (!telephone || !validerTel(telephone)) erreurs.push('Téléphone belge invalide.');
  if (email && email.trim() && !validerEmail(email)) erreurs.push('Email invalide.');
  if (!adresse || !codePostal || !ville)    erreurs.push('Adresse incomplète.');
  if (codePostal && !/^\d{4}$/.test(codePostal.trim())) erreurs.push('Code postal invalide.');

  const formule = config.FORMULES.find(f => f.id === formuleId);
  if (!formule) erreurs.push('Formule invalide.');

  if (!dateRdv || !validerDate(dateRdv)) erreurs.push('Date invalide.');

  // Validation de l'heure RDV
  const heureValide = heureRdv && /^\d{2}:\d{2}$/.test(heureRdv)
    && toMin(heureRdv) >= toMin(config.HORAIRES.debut)
    && toMin(heureRdv) < toMin(config.HORAIRES.fin);
  if (!heureValide) erreurs.push('Créneau invalide.');
  if (formule && formule.id === 'showroom' && !config.SHOWROOM_CRENEAUX_FIXES.includes(heureRdv)) {
    erreurs.push('Créneau Showroom invalide — uniquement 07:30 ou 15:30.');
  }

  if (erreurs.length > 0) return res.status(400).json({ succes: false, erreurs });

  // Double-check disponibilité en temps réel
  try {
    const { reservations } = await notion.getDisponibilitesJour(dateRdv);
    const dureeRequise = calculerDureeMinutes(formuleId, supplements || []);
    const creneaux     = calculerCreneauxDisponibles(reservations, formuleId, dureeRequise);
    const creneauDemande = creneaux.find(c => c.heure === heureRdv);
    if (!creneauDemande || !creneauDemande.disponible) {
      return res.status(409).json({ succes: false, erreurs: ["Ce créneau n'est plus disponible. Veuillez en choisir un autre."] });
    }
  } catch { /* non bloquant */ }

  // ── Calcul prix (avec logique promo Showroom) ─────────────────────────────
  let prixBase = formule.prix;
  let promoDecision = null;

  if (formuleId === config.PROMO_LANCEMENT.formule_id) {
    if (accepter_prix_normal) {
      prixBase = config.PROMO_LANCEMENT.prix_normal;
    } else {
      try {
        promoDecision = await withPromoLock(async () => {
          const p = await notion.getPromoConfig();
          if (p) {
            if (p.promo_active && p.places_restantes > 0) {
              return { pageId: p.pageId, nouvelles_places: p.places_restantes - 1, inMemory: false };
            }
            return null;
          } else {
            if (placesRestantesMem > 0) {
              placesRestantesMem--;
              promoCache = null;
              return { pageId: null, nouvelles_places: placesRestantesMem, inMemory: true };
            }
            return null;
          }
        });
      } catch { promoDecision = null; }

      if (promoDecision) {
        prixBase = config.PROMO_LANCEMENT.prix_promo;
      } else if (promo_attendue) {
        promoCache = null;
        return res.status(409).json({
          succes: false, promo_expiree: true,
          prix_actuel: config.PROMO_LANCEMENT.prix_normal,
          erreurs: ["L'offre de lancement vient de se terminer. La Formule Showroom est maintenant à 120€."]
        });
      } else {
        prixBase = config.PROMO_LANCEMENT.prix_normal;
      }
    }
  }

  let prixTotal = prixBase;
  const nomsSupps = [];
  for (const id of (supplements || [])) {
    const s = config.SUPPLEMENTS.find(x => x.id === id && !x.incompatible_avec.includes(formuleId));
    if (s) { prixTotal += s.prix; nomsSupps.push(s.nom); }
  }

  const dureePrestation = calculerDureeMinutes(formuleId, supplements || []);

  const reservation = {
    prenom: prenom.trim(), nom: nom.trim(),
    telephone: telephone.trim(), email: (email || '').trim().toLowerCase(),
    adresse: adresse.trim(), codePostal: codePostal.trim(), ville: ville.trim(),
    commentaire: (commentaire || '').trim(),
    formule: formule.nom, supplements: nomsSupps,
    dateRdv, heureRdv, prixTotal, dureePrestation,
    promo_lancement: !!promoDecision
  };

  try {
    await notion.creerReservation(reservation);
    console.log(`[NOTION] ✅ ${reservation.prenom} ${reservation.nom} — ${dateRdv} ${heureRdv} — ${formule.nom}${promoDecision ? ' [PROMO 90€]' : ''}`);
  } catch (err) {
    console.error('[NOTION] ❌', err.code, err.message);
    return res.status(500).json({ succes: false, erreurs: ["Erreur d'enregistrement. Veuillez réessayer."] });
  }

  if (promoDecision && !promoDecision.inMemory) {
    notion.updatePromoConfig(promoDecision.pageId, promoDecision.nouvelles_places)
      .then(() => { promoCache = null; console.log(`[PROMO] ✅ Places restantes → ${promoDecision.nouvelles_places}`); })
      .catch(e => console.error('[PROMO décrement]', e.message));
  } else if (promoDecision && promoDecision.inMemory) {
    console.log(`[PROMO] ✅ Places restantes (mémoire) → ${promoDecision.nouvelles_places}`);
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
