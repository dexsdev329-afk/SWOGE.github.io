'use strict';
/* Le QR de la carte eSIM (swogeagentic.html) est-il LE generateur prouve de swoge_wallet.html ?
   Memes 200 empreintes de reference (segno 1.6.6, relues par OpenCV) : wallet_qr.prouve.json. */
const fs = require('fs');
const crypto = require('crypto');
const { qr } = require('./wallet_extrait.js');
let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };

const Q = qr(__dirname + '/swogeagentic.html');
const REF = JSON.parse(fs.readFileSync(__dirname + '/wallet_qr.prouve.json', 'utf8'));
console.log('\n-- le generateur de la page agent = le generateur prouve --');
ok(Q.TAILLE === 33, 'version 4 : 33 modules');
const ex = Q.lignes(REF.exemple.adresse);
ok(ex && ex.join('|') === REF.exemple.matrice.join('|'), 'la matrice d exemple, identique module par module');
let bons = 0;
for (const e of REF.empreintes) if (crypto.createHash('sha256').update(Q.lignes(e.adresse).join('|')).digest('hex') === e.sha256) bons++;
ok(bons === REF.empreintes.length, bons + ' / ' + REF.empreintes.length + ' matrices identiques a la reference');
const W = fs.readFileSync(__dirname + '/swoge_wallet.html', 'utf8'), P = fs.readFileSync(__dirname + '/swogeagentic.html', 'utf8');
const corps = (s) => s.slice(s.indexOf('var QR_TAILLE'), s.indexOf('}', s.indexOf('function qrMatrice(') + 900));
ok(corps(W).split('function qrMatrice(')[0] === corps(P).split('function qrMatrice(')[0], 'le code est la copie exacte de celui du portefeuille');

/* La boutique sans compte (swoge_esim.html, 28/09 au soir) porte la meme copie. */
const QE = qr(__dirname + '/swoge_esim.html'), E = fs.readFileSync(__dirname + '/swoge_esim.html', 'utf8');
let bonsE = 0;
for (const e of REF.empreintes) if (crypto.createHash('sha256').update(QE.lignes(e.adresse).join('|')).digest('hex') === e.sha256) bonsE++;
ok(bonsE === REF.empreintes.length && corps(W).split('function qrMatrice(')[0] === corps(E).split('function qrMatrice(')[0],
   'la boutique eSIM : ' + bonsE + ' / ' + REF.empreintes.length + ' matrices, et le code est la copie exacte');

console.log('\n-- un code d activation LPA --');
const lpa = 'LPA:1$rsp.truphone.com$QR-G-5C-1LS-1W1Z9P7';
ok(Q.lignes(lpa) && Q.lignes(lpa).length === 33, 'un code LPA de ' + lpa.length + ' caracteres tient dans le symbole');
ok(Q.lignes('LPA:1$' + 'x'.repeat(70)) === null, 'trop long (76 caracteres) : pas de QR, jamais un faux');

console.log('\n' + (rates ? 'RATES : ' + rates + '/' + n : 'VERIFICATIONS : ' + n + ' — tout passe'));
process.exit(rates ? 1 : 0);
