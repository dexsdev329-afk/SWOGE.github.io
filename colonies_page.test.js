'use strict';
/* ============================================================================
 * SOLANA AI / ETHEREUM AI : LES PAGES SONT RETIREES, LEURS ADRESSES RENVOIENT (14/10/2026)
 *
 * Cet essai gardait swoge_sol_ai.html et swoge_eth_ai.html (scindees le 08/10 de
 * swoge_colonies.html) : la banque papier contre son controle, rien de vert dans le
 * hasard. Le proprietaire les a retirees le 14/10 (« swoge ai eth et swoge ai solana,
 * ca ne sert a rien, ont de mauvais resultats ») et garde la colonie Robinhood.
 * L'intention qui reste : les trois adresses (dont l'ancienne swoge_colonies.html, qui
 * renvoyait vers Solana AI) menent a swoge_ai.html sans perdre ?server= ni l'ancre, hors
 * des moteurs, et plus aucune page ne les propose (outils/essai_renvoi.js).
 * ==========================================================================*/
const { verifieRenvoi } = require('./outils/essai_renvoi.js');
verifieRenvoi(['swoge_sol_ai.html', 'swoge_eth_ai.html', 'swoge_colonies.html'], 'Solana AI / Ethereum AI')
  .then((rates) => process.exit(rates ? 1 : 0))
  .catch((e) => { console.error(e); process.exit(1); });
