'use strict';
/* ============================================================================
 * PREDICT (BNB) : LA PAGE EST RETIREE, SON ADRESSE RENVOIE (14/10/2026)
 *
 * Cet essai gardait swoge_predict.html : papier, vraies donnees, cadre honnete. Le
 * proprietaire l'a retiree le 14/10 (« meme swoge ai predict pour BNB »). L'intention
 * qui reste : l'adresse partagee mene a swoge_ai.html sans perdre ?server= ni l'ancre,
 * hors des moteurs, et plus aucune page ne propose Predict (outils/essai_renvoi.js).
 * Le moteur (predict_moteur.js) reste dans le depot : le serveur en garde une copie
 * identique (predict_serveur.test.js) ; il est garde par predict_moteur.test.js.
 * ==========================================================================*/
const { verifieRenvoi } = require('./outils/essai_renvoi.js');
verifieRenvoi(['swoge_predict.html'], 'Predict')
  .then((rates) => process.exit(rates ? 1 : 0))
  .catch((e) => { console.error(e); process.exit(1); });
