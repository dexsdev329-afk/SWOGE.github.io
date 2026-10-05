'use strict';
/* LANCER SUR SOLANA via Pump.fun — la page (launchpad.html, 05/10/2026).
 *
 * Intention : une option « Solana (Pump.fun) » dans le launchpad, NON CUSTODIALE —
 * le mint est genere dans le navigateur, Phantom signe, le serveur ne relaie que
 * les deux appels Pump.fun/PumpPortal. On tient ce qui compte : l option existe, le
 * flux appelle les bonnes routes, le mint est genere cote page, Phantom signe, et on
 * reste honnete (l agent IA par jeton reste une fonction Robinhood Chain). Statique. */
const fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, 'launchpad.html'), 'utf8');
const srv = fs.readFileSync(path.join(__dirname, '..', 'swoge-pusher-server.github.io', 'solana_pump.js'), 'utf8');

let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };

console.log('-- l option Solana existe dans le launchpad --');
ok(/data-pool="solana"/.test(html), 'un bouton de pool « solana »');
ok(/Pump\.fun/.test(html) && /Phantom/.test(html), 'la fiche parle de Pump.fun et de Phantom');
ok(/poolChoisi==="solana"/.test(html) && /return lanceSolana\(\)/.test(html), 'le bouton Launch route vers lanceSolana pour Solana');

console.log('\n-- flux non custodial : mint genere ici, Phantom signe --');
ok(/web3\.Keypair\.generate\(\)/.test(html), 'le mint est genere DANS la page (non custodial)');
ok(/tx\.sign\(\[mint\]\)/.test(html) && /signAndSendTransaction\(tx\)/.test(html), 'le mint co-signe, puis Phantom signe et envoie');
ok(/\/launchpad\/solana\/metadata/.test(html) && /\/launchpad\/solana\/offre/.test(html), 'la page appelle les routes serveur metadata + offre');
ok(/VersionedTransaction\.deserialize/.test(html), 'elle deserialise la transaction renvoyee par PumpPortal');
ok(/unpkg\.com\/@solana\/web3\.js/.test(html), 'elle charge @solana/web3.js (a la demande)');

console.log('\n-- honnetete --');
ok(/Pump\.fun requires one|image file \(Pump\.fun requires/i.test(html), 'elle dit que Pump.fun exige une image');
ok(/AI agent is a Robinhood Chain feature/i.test(html), 'elle dit que l agent IA par jeton reste une fonction Robinhood Chain (pas de fausse promesse sur Solana)');
ok(/SWOGE never holds your keys/i.test(html), 'elle rappelle qu on ne detient jamais les cles');

console.log('\n-- le serveur ne fait que relayer, aucune cle --');
ok(/NON CUSTODIAL/.test(srv) && !/privateKey|secretKey|Keypair/.test(srv), 'solana_pump.js ne touche aucune cle (il relaie IPFS + trade-local)');
ok(/pumpportal\.fun\/api\/trade-local/.test(srv) && /pump\.fun\/api\/ipfs/.test(srv), 'il vise les vraies API Pump.fun/PumpPortal');

console.log('\n' + (rates ? 'RATES : ' + rates + '/' + n : 'VERIFICATIONS : ' + n + ' — tout passe'));
process.exit(rates ? 1 : 0);
