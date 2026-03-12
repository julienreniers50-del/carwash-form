// ─────────────────────────────────────────────────────────────────────────────
// config.js — SOURCE UNIQUE DE VÉRITÉ AutoClean
// ─────────────────────────────────────────────────────────────────────────────

const ENTREPRISE = {
  nom: 'AutoClean',
  slogan: 'Une voiture plus que Clean',
  zone: 'Ath & Enghien — Hainaut, Belgique',
  email: process.env.OWNER_EMAIL || '',
  telephone: process.env.OWNER_PHONE_NUMBER || ''
};

const FORMULES = [
  {
    id: 'exterieur',
    nom: 'Lavage Extérieur',
    emoji: '🚗',
    prix: 35,
    duree: '45 min',
    description: 'Shampoing carrosserie, nettoyage jantes, gel brillant pneus, traitement plastiques extérieurs, silicone joints portes & coffre',
    badge: null,
    inclut_supplements: false
  },
  {
    id: 'interieur',
    nom: 'Lavage Intérieur',
    emoji: '🪑',
    prix: 25,
    duree: '45 min',
    description: 'Aspiration complète habitacle, nettoyage plastiques intérieurs, vitres intérieures sans traces',
    badge: null,
    inclut_supplements: false
  },
  {
    id: 'complet',
    nom: 'Lavage Complet',
    emoji: '✨',
    prix: 50,
    duree: '2h',
    description: 'Extérieur + Intérieur combinés — le meilleur rapport qualité/prix',
    badge: 'Populaire',
    inclut_supplements: false
  },
  {
    id: 'showroom',
    nom: 'Formule Showroom',
    emoji: '💎',
    prix: 95,
    duree: '2h30 - 3h',
    description: 'Lavage complet + cire de protection carrosserie, black wax peintures noires, gel brillant pneus, traitement plastiques, silicone joints, extraction eau sièges & moquettes incluse',
    badge: 'Premium',
    inclut_supplements: true
  }
];

const SUPPLEMENTS = [
  {
    id: 'extraction',
    nom: 'Extraction eau sièges & moquettes',
    emoji: '🧽',
    description: 'Shampouinage par injecteur-extracteur — nettoyage en profondeur des sièges et moquettes',
    prix: 15,
    duree_extra: '30 min',
    incompatible_avec: ['showroom']
  },
  {
    id: 'cire',
    nom: 'Cire de protection carrosserie',
    emoji: '✨',
    description: "Application car wax — protection et brillance longue durée (3 à 6 mois). Nécessite un espace ombragé.",
    prix: 10,
    duree_extra: '25 min',
    incompatible_avec: ['showroom']
  }
];

const CRENEAUX = ['08:00', '09:00', '10:00', '11:00', '12:00', '14:00', '15:00', '16:00'];
const JOURS_OUVRES = [1, 2, 3, 4, 5];
const JOURS_MAX_A_L_AVANCE = 60;

module.exports = { ENTREPRISE, FORMULES, SUPPLEMENTS, CRENEAUX, JOURS_OUVRES, JOURS_MAX_A_L_AVANCE };
