'use strict';
/* swoge_security.html — la page defensive. Essai statique (pas de navigateur) :
 * ce qui compte est qu'elle reste DEFENSIVE et lecture seule.
 *
 * Intention : la page ne doit jamais exposer d'outil offensif, toujours exiger
 * une autorisation pour une cible, et ne pas recopier le texte d'attestation
 * (il vient du serveur, pour matcher au mot pres).
 */
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, 'swoge_security.html'), 'utf8');

let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };

console.log('-- la page defensive --');
ok(/id="att"/.test(src) && /type="checkbox"/.test(src), 'une case a cocher pour l autorisation existe');
ok(/\/bugbounty'[^]*attestationTexte/.test(src) && !/I confirm I am authorized to assess/.test(src),
   'le texte d attestation est LU depuis le serveur, jamais recopie en dur (pas de derive)');
ok(/\/bugbounty\/preaudit/.test(src) && /\/bugbounty\/recon/.test(src) && /\/bugbounty\/exposure/.test(src) && /\/bugbounty\/onion/.test(src),
   'les quatre outils appellent les routes du serveur');
ok(/read-only/i.test(src) && /authorized targets only/i.test(src), 'la page dit « read-only » et « authorized targets only »');
ok(/no active scanning/i.test(src) && /no exploitation/i.test(src), 'elle dit explicitement : aucun scan actif, aucune exploitation');
ok(/free-roam browser/i.test(src), 'le .onion est dit defensif, pas un navigateur libre');
ok(/no packet is sent to the target/i.test(src), 'l exposition dit qu aucun paquet n est envoye a la cible (passive)');

console.log('\n-- aucun outil offensif n est propose --');
for (const mot of ['sqlmap', 'sql injection', 'hashcat', 'hydra', 'nmap', 'masscan', 'brute', 'exploit the', 'crack hash']) {
  /* « SQL injection » n apparait que dans la liste « non disponible » : on verifie
     qu aucun de ces mots n est le nom d un BOUTON ou d un champ actif. */
  const dansBouton = new RegExp('<button[^>]*>[^<]*' + mot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(src);
  ok(!dansBouton, 'aucun bouton « ' + mot + ' »');
}
ok(/Not available here, by design/i.test(src) && /SQL injection/i.test(src) && /password\s+cracking/i.test(src),
   'la page NOMME ce qu elle refuse (injection SQL, cassage de mots de passe, scan actif)');

console.log('\n-- la garde cote page --');
ok(/function garde\(/.test(src) && /Authorization required/i.test(src), 'les outils cibles passent par une garde qui exige une autorisation');
ok(/autorise: true, texte: ATT_TXT/.test(src), 'l attestation envoyee porte le texte exact du serveur');

console.log('\n' + (rates ? 'RATES : ' + rates + '/' + n : 'VERIFICATIONS : ' + n + ' — tout passe'));
process.exit(rates ? 1 : 0);
