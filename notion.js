require('dotenv').config();
const { Client } = require('@notionhq/client');

const notion      = new Client({ auth: process.env.NOTION_TOKEN });
const DATABASE_ID = process.env.NOTION_DATABASE_ID;

async function creerReservation(data) {
  const { prenom, nom, telephone, email, adresse, codePostal, ville,
          formule, supplements, dateRdv, heureRdv, prixTotal, vehiculeFonce } = data;

  return notion.pages.create({
    parent: { database_id: DATABASE_ID },
    properties: {
      'Prénom':          { title:       [{ text: { content: prenom } }] },
      'Nom':             { rich_text:   [{ text: { content: nom } }] },
      'Téléphone':       { phone_number: telephone },
      'Email':           { email:       email },
      'Adresse':         { rich_text:   [{ text: { content: adresse } }] },
      'Code postal':     { rich_text:   [{ text: { content: codePostal } }] },
      'Ville':           { rich_text:   [{ text: { content: ville } }] },
      'Formule':         { select:      { name: formule } },
      'Suppléments':     { multi_select: supplements.map(s => ({ name: s })) },
      'Date RDV':        { date:        { start: dateRdv } },
      'Heure RDV':       { rich_text:   [{ text: { content: heureRdv } }] },
      'Prix Total':      { number:      prixTotal },
      'Véhicule foncé':  { checkbox:    vehiculeFonce },
      'Statut':          { select:      { name: 'À confirmer' } },
      'Date inscription':{ date:        { start: new Date().toISOString() } }
    }
  });
}

async function getCreneauxReserves(dateStr) {
  const res = await notion.databases.query({
    database_id: DATABASE_ID,
    filter: {
      and: [
        { property: 'Date RDV', date: { equals: dateStr } },
        { property: 'Statut', select: { does_not_equal: 'Annulé' } }
      ]
    }
  });
  return res.results.map(p => p.properties['Heure RDV']?.rich_text?.[0]?.text?.content).filter(Boolean);
}

async function setupDatabase() {
  const db          = await notion.databases.retrieve({ database_id: DATABASE_ID });
  const existantes  = Object.keys(db.properties);
  const titreActuel = Object.entries(db.properties).find(([, v]) => v.type === 'title')?.[0];
  const updates     = {};

  if (titreActuel && titreActuel !== 'Prénom') updates[titreActuel] = { name: 'Prénom' };

  const nouvelles = {
    'Nom':             { rich_text: {} },
    'Téléphone':       { phone_number: {} },
    'Email':           { email: {} },
    'Adresse':         { rich_text: {} },
    'Code postal':     { rich_text: {} },
    'Ville':           { rich_text: {} },
    'Formule':         { select: { options: [
      { name: 'Lavage Extérieur', color: 'blue' },
      { name: 'Lavage Intérieur', color: 'green' },
      { name: 'Lavage Complet',   color: 'purple' },
      { name: 'Formule Showroom', color: 'yellow' }
    ]}},
    'Suppléments':     { multi_select: { options: [
      { name: 'Extraction eau sièges & moquettes', color: 'blue' },
      { name: 'Cire de protection carrosserie',    color: 'orange' }
    ]}},
    'Date RDV':        { date: {} },
    'Heure RDV':       { rich_text: {} },
    'Prix Total':      { number: { format: 'euro' } },
    'Véhicule foncé':  { checkbox: {} },
    'Statut':          { select: { options: [
      { name: 'À confirmer', color: 'yellow' },
      { name: 'Confirmé',    color: 'green' },
      { name: 'Terminé',     color: 'blue' },
      { name: 'Annulé',      color: 'red' }
    ]}},
    'Date inscription': { date: {} }
  };

  for (const [nom, cfg] of Object.entries(nouvelles)) {
    if (!existantes.includes(nom)) updates[nom] = cfg;
  }

  if (Object.keys(updates).length > 0) {
    await notion.databases.update({ database_id: DATABASE_ID, properties: updates });
    console.log('[NOTION] ✅ Base de données configurée.');
  }
}

module.exports = { creerReservation, getCreneauxReserves, setupDatabase };
