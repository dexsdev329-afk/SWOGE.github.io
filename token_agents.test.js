'use strict';
/* LA PAGE PUBLIQUE DES AGENTS DE JETON (token_agents.html, 05/10/2026).
 *
 * Intention : montrer, en lecture seule, l annuaire des agents, le mur de chacun,
 * et l apercu avant lancement — en lisant les routes publiques /agent/annuaire,
 * /agent/jeton/<t>/feed, /agent/preview_config. Honnetete tenue : la publication
 * autonome est « off » tant qu elle n est pas allumee, et le rachat est « paper ».
 * Statique : on lit le fichier, aucun navigateur.
 */
const fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, 'token_agents.html'), 'utf8');

let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };

console.log('-- la page lit les bonnes routes publiques --');
ok(/\/agent\/annuaire/.test(html), 'elle charge l annuaire public');
ok(/\/agent\/jeton\/"\s*\+\s*token\s*\+\s*"\/feed/.test(html) || /\/feed\?n=/.test(html), 'elle lit le mur d un agent (feed)');
ok(/\/agent\/preview_config/.test(html), 'elle propose l apercu avant lancement (preview_config)');
ok(/\/trades/.test(html), 'elle montre le journal des gestes d argent (paper)');

console.log('\n-- elle n ecrit rien, ne demande aucun secret --');
ok(!/\/agent\/attach|\/agent\/x\/connect|x-admin-key|accessSecret|AGENT_X_CLE/.test(html), 'aucune ecriture ni secret : lecture seule (la config passe ailleurs)');

console.log('\n-- honnetete de la promesse --');
ok(/goes live|Autonomous posting: off|not yet running/i.test(html), 'elle dit que la publication autonome est off tant qu elle n est pas allumee');
ok(/simulated|paper/i.test(html), 'elle dit que le rachat (money action) est en simulation/paper');
ok(/never invents numbers/i.test(html), 'elle rappelle que l agent ne cite que des faits');

console.log('\n-- lien depuis le launchpad --');
const lp = fs.readFileSync(path.join(__dirname, 'launchpad.html'), 'utf8');
ok(/token_agents\.html/.test(lp), 'le launchpad renvoie vers la page AI Agents');

console.log('\n' + (rates ? 'RATES : ' + rates + '/' + n : 'VERIFICATIONS : ' + n + ' — tout passe'));
process.exit(rates ? 1 : 0);
