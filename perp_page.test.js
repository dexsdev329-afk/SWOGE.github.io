'use strict';
/* ============================================================================
 * AI PERPS : LA PAGE EST RETIREE, SON ADRESSE RENVOIE (14/10/2026)
 *
 * Cet essai gardait swoge_perp.html tant qu'elle existait : « elles montrent, elles
 * ne decident rien », un chiffre seulement si l'echantillon le porte. Le proprietaire
 * l'a retiree le 14/10 (« ca ne sert a rien, ont de mauvais resultats »). L'intention
 * qui reste : l'adresse partagee ne casse pas, elle mene a la colonie Robinhood
 * (swoge_ai.html) sans perdre ?server= ni l'ancre, hors des moteurs, et plus aucun
 * menu, onglet ou carte de l'accueil ne propose AI Perps (outils/essai_renvoi.js).
 * ==========================================================================*/
const { verifieRenvoi } = require('./outils/essai_renvoi.js');
verifieRenvoi(['swoge_perp.html'], 'AI Perps')
  .then((rates) => process.exit(rates ? 1 : 0))
  .catch((e) => { console.error(e); process.exit(1); });
