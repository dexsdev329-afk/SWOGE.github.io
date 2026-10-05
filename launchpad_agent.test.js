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

console.log('\n-- le self-service createur : attache SIGNEE, jamais en aveugle --');
/* Intention d origine : la page n attache rien SANS autorisation. Depuis le 05/10 le
   createur attache l agent de SON jeton — mais seulement en SIGNANT une preuve, verifiee
   on-chain cote serveur. On tient donc le fond : aucune attache sans signature. */
ok(/\/agent\/attach_createur/.test(html), 'le createur attache via /agent/attach_createur (self-service, apres lancement)');
ok(/signer\.signMessage\(agentSignMsg\(/.test(html), 'l attache est precedee d une SIGNATURE (preuve de creation), jamais en aveugle');
ok(!/\/agent\/attach\b(?!_createur)/.test(html) && !/x-admin-key/.test(html), 'la page n appelle jamais la route admin /agent/attach ni n envoie de cle admin');

console.log('\n-- le createur relie le compte X (OAuth PIN), signe, sans secret --');
ok(/\/agent\/x\/begin/.test(html) && /\/agent\/x\/finish/.test(html), 'la liaison X passe par /agent/x/begin puis /agent/x/finish');
ok(/authorizeUrl/.test(html) && /window\.open\(/.test(html), 'elle ouvre l URL d autorisation X (mode PIN), rien saisi en clair cote page');
ok(/agXpinInput|paste the PIN/i.test(html), 'le createur colle le PIN que X lui montre');
ok(!/accessToken|accessSecret|X_CONSUMER|oauth_token_secret/.test(html), 'la page ne voit jamais de jeton d acces ni de secret : X les donne au serveur, qui les chiffre');

console.log('\n-- le GESTE entre dans la signature (constat de l audit) --');
ok(/Action: "\+g\+"/.test(html), 'le message signe porte une ligne Action: <geste>');
ok(/preuve\("link-x"\)/.test(html) && /preuve\("unlink-x"\)/.test(html) && /preuve\("pause"\)/.test(html) && /agentSignMsg\(ctx\.token, ts, "configure"\)/.test(html),
   'chaque geste signe SON action (configure / pause / link-x / unlink-x)');

console.log('\n-- un agent par jeton, accessible depuis la fiche du jeton --');
ok(/id="tvAgentPanel"/.test(html) && /id="tvAgentBtn"/.test(html), 'la fiche du jeton (Trade) porte un panneau AI agent');
ok(/construitAgentForm\(box, \{ token:curToken/.test(html), 'le panneau construit l agent DU jeton ouvert (curToken), un seul par jeton');
ok(/removeAttribute\("data-built"\)/.test(html), 'changer de jeton repart propre (pas de melange entre jetons)');

console.log('\n-- gestion par le createur : pause/reprise + historique + liens --');
ok(/\/agent\/toggle_createur/.test(html) && /Pause agent|Resume agent/.test(html), 'le createur peut mettre en pause / relancer son agent (toggle_createur signe)');
ok(/\/feed\?n=/.test(html) && /\/trades\?n=/.test(html), 'l historique lit le mur (posts) et le journal des gestes d argent');
ok(/Fuel \(pays the API\)|Treasury \(paper\)/.test(html), 'il montre le carburant et le tresor du jeton');
ok(/esc\(CHAIN\.scan\)\+'\/tx\/'\+esc\(x\.tx\)/.test(html), 'une depense reelle (quand elle existera) porte un lien vers la transaction on-chain');
ok(/simulated — no on-chain tx yet/i.test(html), 'tant que l execution reste papier, c est dit clairement (aucun lien invente)');

console.log('\n-- l honnetete de la promesse --');
ok(/preview/i.test(html.slice(html.indexOf('id="cAgentChamp"'), html.indexOf('id="cAgentChamp"') + 1200)), 'le panneau se presente comme un APERCU');
ok(/goes live after launch/i.test(html) || /autonomous X posting goes live once the team enables it/i.test(html), 'il dit que la publication autonome X vient APRES (rien n est deja en ligne)');
ok(/never invents numbers/i.test(html), 'il dit que l agent ne cite que des faits, jamais un chiffre invente');
ok(/simulated \(paper\)|simulated \/ paper/i.test(html), 'le rachat (geste d argent) est annonce comme simule / paper');

console.log('\n' + (rates ? 'RATES : ' + rates + '/' + n : 'VERIFICATIONS : ' + n + ' — tout passe'));
process.exit(rates ? 1 : 0);
