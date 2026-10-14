'use strict';
/* ============================================================================
 * POLYMARKET AI : LA PAGE EST RETIREE, SON ADRESSE RENVOIE (14/10/2026)
 *
 * Cet essai gardait swoge_polymarket_ai.html tant qu'elle existait : la page montrait
 * la colonie papier telle que le serveur l'avait mesuree, chaque chiffre avec son
 * effectif, une strategie au-dessus de la barre dite CANDIDATE et jamais « edge » ni
 * « proven ». Le proprietaire l'a retiree le 14/10, apres AI Perps, Predict, Solana AI
 * et Ethereum AI ; la colonie est eteinte cote serveur (POLY_PAPIER=0). L'intention qui
 * reste : l'adresse partagee ne casse pas, elle mene a la colonie Robinhood
 * (swoge_ai.html) sans perdre ?server= ni l'ancre, hors des moteurs, et plus aucun menu,
 * onglet ou carte de l'accueil ne propose Polymarket AI (outils/essai_renvoi.js).
 * La page des paris Polymarket (swoge_polymarket.html) est une autre page : elle reste,
 * et polymarket_page.test.js la garde.
 * ==========================================================================*/
const { verifieRenvoi } = require('./outils/essai_renvoi.js');
verifieRenvoi(['swoge_polymarket_ai.html'], 'Polymarket AI')
  .then((rates) => process.exit(rates ? 1 : 0))
  .catch((e) => { console.error(e); process.exit(1); });
