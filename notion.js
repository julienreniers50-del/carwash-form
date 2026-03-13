require('dotenv').config();
const { Client } = require('@notionhq/client');
const config = require('./config');

const notion      = new Client({ auth: process.env.NOTION_TOKEN });
const DATABASE_ID = process.env.NOTION_DATABASE_ID;
const CONFIG_DB_ID = process.env.NOTION_CONFIG_DATABASE_ID;

// ── Helpers ────────────────────────────────────────────────────────────────────
function toMin(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function fromMin(min) {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

// Calcule la durée de prestation depuis le nom de formule et des suppléments
// Utilisé comme fallback pour les anciennes réservations sans "Durée prestation"
function getDureeMinsFromNoms(formuleName, supplementNames) {
  const f = config.FORMULES.find(x => x.nom === formuleName);
  if (!f) return 60;
  if (f.inclut_supplements) return f.duree_minutes; // Showroom : suppléments inclus
  let d = f.duree_minutes;
  for (const nom of (supplementNames || [])) {
    const s = config.SUPPLEMENTS.find(x => x.nom === nom);
    if (s) d += s.duree_extra_minutes;
  }
  return d;
}

// ── Créer une réservation ──────────────────────────────────────────────────────
async function creerReservation(data) {
  const { prenom, nom, telephone, email, adresse, codePostal, ville, commentaire,
          formule, supplements, dateRdv, heureRdv, prixTotal, dureePrestation } = data;

  const finEstimee        = fromMin(toMin(heureRdv) + dureePrestation);
  const dureeTotaleBloquee = dureePrestation + config.HORAIRES.deplacement;

  return notion.pages.create({
    parent: { database_id: DATABASE_ID },
    properties: {
      'Prénom':               { title:        [{ text: { content: prenom } }] },
      'Nom':                  { rich_text:    [{ text: { content: nom } }] },
      'Téléphone':            { phone_number: telephone },
      'Email':                { email:        email || null },
      'Adresse':              { rich_text:    [{ text: { content: adresse } }] },
      'Code postal':          { rich_text:    [{ text: { content: codePostal } }] },
      'Ville':                { rich_text:    [{ text: { content: ville } }] },
      'Commentaire':          { rich_text:    [{ text: { content: commentaire || '' } }] },
      'Formule':              { select:       { name: formule } },
      'Suppléments':          { multi_select: supplements.map(s => ({ name: s })) },
      'Date RDV':             { date:         { start: dateRdv } },
      'Heure RDV':            { rich_text:    [{ text: { content: heureRdv } }] },
      'Prix Total':           { number:       prixTotal },
      'Durée prestation':     { number:       dureePrestation },
      'Fin estimée':          { rich_text:    [{ text: { content: finEstimee } }] },
      'Durée totale bloquée': { number:       dureeTotaleBloquee },
      'Statut':               { select:       { name: 'À confirmer' } },
      'Date inscription':     { date:         { start: new Date().toISOString() } }
    }
  });
}

// ── Réservations d'une journée ─────────────────────────────────────────────────
async function getDisponibilitesJour(dateStr) {
  const res = await notion.databases.query({
    database_id: DATABASE_ID,
    filter: {
      and: [
        { property: 'Date RDV', date: { equals: dateStr } },
        { property: 'Statut',   select: { does_not_equal: 'Annulé' } }
      ]
    }
  });

  const reservations = res.results
    .map(p => {
      const heureRdv    = p.properties['Heure RDV']?.rich_text?.[0]?.text?.content;
      const formule     = p.properties['Formule']?.select?.name;
      const supplements = p.properties['Suppléments']?.multi_select?.map(s => s.name) || [];
      // Durée stockée en priorité, fallback sur calcul par nom
      const dureeLue    = p.properties['Durée prestation']?.number;
      const dureePrestation = (dureeLue && dureeLue > 0)
        ? dureeLue
        : getDureeMinsFromNoms(formule, supplements);
      return { heureRdv, formule, supplements, dureePrestation };
    })
    .filter(r => r.heureRdv);

  return { reservations };
}

// ── Réservations d'un mois, groupées par jour ──────────────────────────────────
async function getReservationsMois(moisStr) {
  const [year, month] = moisStr.split('-').map(Number);
  const debut = `${moisStr}-01`;
  const fin   = new Date(year, month, 0).toISOString().slice(0, 10);

  const res = await notion.databases.query({
    database_id: DATABASE_ID,
    filter: {
      and: [
        { property: 'Date RDV', date: { on_or_after:  debut } },
        { property: 'Date RDV', date: { on_or_before: fin   } },
        { property: 'Statut',   select: { does_not_equal: 'Annulé' } }
      ]
    }
  });

  const parJour = {};
  for (const page of res.results) {
    const date        = page.properties['Date RDV']?.date?.start?.slice(0, 10);
    const heureRdv    = page.properties['Heure RDV']?.rich_text?.[0]?.text?.content;
    const formule     = page.properties['Formule']?.select?.name;
    const supplements = page.properties['Suppléments']?.multi_select?.map(s => s.name) || [];
    const dureeLue    = page.properties['Durée prestation']?.number;
    const dureePrestation = (dureeLue && dureeLue > 0)
      ? dureeLue
      : getDureeMinsFromNoms(formule, supplements);
    if (!date || !heureRdv) continue;
    if (!parJour[date]) parJour[date] = [];
    parJour[date].push({ heureRdv, formule, supplements, dureePrestation });
  }

  return parJour;
}

// ── Setup base de données ──────────────────────────────────────────────────────
async function setupDatabase() {
  const db          = await notion.databases.retrieve({ database_id: DATABASE_ID });
  const existantes  = Object.keys(db.properties);
  const titreActuel = Object.entries(db.properties).find(([, v]) => v.type === 'title')?.[0];
  const updates     = {};

  if (titreActuel && titreActuel !== 'Prénom') updates[titreActuel] = { name: 'Prénom' };

  const nouvelles = {
    'Nom':                  { rich_text: {} },
    'Téléphone':            { phone_number: {} },
    'Email':                { email: {} },
    'Adresse':              { rich_text: {} },
    'Code postal':          { rich_text: {} },
    'Ville':                { rich_text: {} },
    'Commentaire':          { rich_text: {} },
    'Formule':              { select: { options: [
      { name: 'Lavage Intérieur',  color: 'green'  },
      { name: 'Lavage Extérieur',  color: 'blue'   },
      { name: 'Lavage Complet',    color: 'purple' },
      { name: 'Formule Showroom',  color: 'yellow' }
    ]}},
    'Suppléments':          { multi_select: { options: [
      { name: 'Extraction eau sièges & moquettes', color: 'blue'   },
      { name: 'Cire de protection carrosserie',    color: 'orange' }
    ]}},
    'Date RDV':             { date: {} },
    'Heure RDV':            { rich_text: {} },
    'Prix Total':           { number: { format: 'euro' } },
    'Durée prestation':     { number: {} },
    'Fin estimée':          { rich_text: {} },
    'Durée totale bloquée': { number: {} },
    'Statut':               { select: { options: [
      { name: 'À confirmer', color: 'yellow' },
      { name: 'Confirmé',    color: 'green'  },
      { name: 'Terminé',     color: 'blue'   },
      { name: 'Annulé',      color: 'red'    }
    ]}},
    'Date inscription':     { date: {} }
  };

  for (const [nom, cfg] of Object.entries(nouvelles)) {
    if (!existantes.includes(nom)) updates[nom] = cfg;
  }

  if (Object.keys(updates).length > 0) {
    await notion.databases.update({ database_id: DATABASE_ID, properties: updates });
    console.log('[NOTION] ✅ Base de données configurée.');
  }
}

// ── Config promo ───────────────────────────────────────────────────────────────
async function getPromoConfig() {
  if (!CONFIG_DB_ID) return null;
  try {
    const res = await notion.databases.query({ database_id: CONFIG_DB_ID, page_size: 1 });
    if (!res.results.length) return null;
    const p = res.results[0];
    return {
      pageId:           p.id,
      places_restantes: p.properties['places_restantes']?.number ?? 0,
      promo_active:     p.properties['promo_active']?.checkbox ?? false
    };
  } catch { return null; }
}

async function updatePromoConfig(pageId, nouvellePlaces) {
  await notion.pages.update({
    page_id: pageId,
    properties: {
      'places_restantes': { number: nouvellePlaces },
      'promo_active':     { checkbox: nouvellePlaces > 0 }
    }
  });
}

module.exports = {
  creerReservation, getDisponibilitesJour, getReservationsMois, setupDatabase,
  getPromoConfig, updatePromoConfig
};
