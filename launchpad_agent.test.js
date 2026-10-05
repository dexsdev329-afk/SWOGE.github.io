'use strict';
/* LE PANNEAU « AI AGENT (PREVIEW) » DU LAUNCHPAD (05/10/2026).
 *
 * Intention (modele AgencyPad porte sur Robinhood Chain) : le createur peut
 * choisir une persona + un objectif et PREVISUALISER le premier post de l'agent
 * de son jeton, sans rien publier. L'essai tient ce que la page promet — et ce
 * qu'elle NE promet PAS : la publication autonome vient APRES le lancement, et
 * l'agent ne cite que des faits (jamais un chiffre invente). Statique : on lit
 * le fichier, aucun navigateur.
 */
const fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, 'launchpad.html'), 'utf8');

let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };

console.log('-- le panneau existe, avec ses personas --');
ok(/id="cAgentPersona"/.test(html), 'le selecteur de persona est present');
['hype', 'analyst', 'stoic', 'contrarian', 'builder'].forEach((p) => ok(new RegExp('value="' + p + '"').test(html), 'persona proposee : ' + p));
ok(/>No agent</.test(html), 'l option « No agent » existe (l agent est optionnel)');
ok(/id="cAgentGoal"/.test(html) && /id="cAgentPreviewBtn"/.test(html) && /id="cAgentPreview"/.test(html), 'objectif, bouton d apercu et zone de resultat presents');

console.log('\n-- le bouton appelle l apercu PUBLIC, et ne publie rien --');
ok(/\/agent\/preview_config/.test(html), 'le bouton POST vers /agent/preview_config (apercu, pas de publication)');
ok(!/\/agent\/attach/.test(html), 'la page n attache rien elle-meme (le self-service createur viendra avec l auth de session)');

console.log('\n-- l honnetete de la promesse --');
ok(/preview/i.test(html.slice(html.indexOf('cAgentChamp') - 2000, html.indexOf('cAgentChamp') + 1200)) , 'le panneau se presente comme un APERCU');
ok(/goes live after launch/i.test(html), 'il dit que la publication autonome vient APRES le lancement (rien n est deja en ligne)');
ok(/never invents numbers/i.test(html), 'il dit que l agent ne cite que des faits, jamais un chiffre invente');

console.log('\n' + (rates ? 'RATES : ' + rates + '/' + n : 'VERIFICATIONS : ' + n + ' — tout passe'));
process.exit(rates ? 1 : 0);
