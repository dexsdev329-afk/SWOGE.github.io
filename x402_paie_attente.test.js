'use strict';
/*
 * APRES LA SIGNATURE, UN REGLEMENT SOLANA « EN ATTENTE » EST REPRESENTE (14/10/2026)
 *
 * Le serveur ne reconciliait que Base : une recharge Solana en attente n etait jamais
 * creditee (revue du Studio). Il retient maintenant la transaction et la relit sur la
 * chaine a la reprise (x402.js, reconcilieSolana ; credit_solana_attente.test.js dans le
 * depot du serveur). La page doit donc representer la MEME transaction, comme pour Base.
 *
 * L essai tient :
 *   1. Solana en attente, puis credite : la MEME PAYMENT-SIGNATURE representee, une seule
 *      signature, et la reponse finale est le 200 ;
 *   2. un serveur d avant, qui repond « already presented » a la reprise : la page ne conclut
 *      ni « not charged » ni rien qui fasse signer une seconde fois ;
 *   3. une reponse 402 avec demande de paiement au PREMIER envoi (paiement refuse) : rendue
 *      telle quelle, comme avant.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };

const ctx = { setTimeout, Promise, btoa: (s) => Buffer.from(s, 'binary').toString('base64'), atob: (s) => Buffer.from(s, 'base64').toString('binary'),
  escape, unescape, encodeURIComponent, decodeURIComponent, JSON, SWOGE_PAIE_DELAIS: [5] };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'x402_paie.js'), 'utf8'), ctx);
const P = ctx.SwogePaie;
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64');

/* Une reponse comme fetch la rend : status, en-tetes, corps. */
function rep(status, entetes, corps) {
  const h = new Map(Object.entries(entetes || {}));
  const r = { status, headers: { get: (k) => (h.has(k) ? h.get(k) : null) }, text: async () => corps || '' };
  r.clone = () => rep(status, entetes, corps);
  return r;
}
const SOL = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
const PENDANTE = () => rep(402, { 'payment-response': b64({ success: false, errorReason: 'settlement_pending', transaction: '5sIg', network: SOL }) },
  JSON.stringify({ ok: false, error: 'payment pending - retry the same request with the same PAYMENT-SIGNATURE' }));
const DEJA = () => rep(402, { 'payment-required': b64({ x402Version: 2, accepts: [] }) },
  JSON.stringify({ ok: false, error: 'invalid_payload: this nonce was already presented', raison: 'invalid_payload', detail: 'this nonce was already presented' }));
const REFUS = () => rep(402, { 'payment-required': b64({ x402Version: 2, accepts: [] }) }, JSON.stringify({ ok: false, error: 'invalid_payment_requirements' }));

async function joue(reponses) {
  const envois = [], statuts = [];
  const o = { statut: (t) => statuts.push(t), appel: async (e) => { envois.push(e['payment-signature']); return reponses.shift()(); } };
  let fin = null, err = null;
  try { fin = await P._envoieSigne(o, { 'payment-signature': 'SIGNE-UNE-FOIS' }, true); } catch (e) { err = e; }
  return { envois, statuts, fin, err };
}

(async () => {
  const src = fs.readFileSync(path.join(__dirname, 'x402_paie.js'), 'utf8');
  ok(/payload: \{ transaction: [^}]*\}, extensions: req\.extensions \}\) \}, true\);/.test(src), 'Solana : l envoi signe est representable, comme Base');

  const a = await joue([PENDANTE, PENDANTE, () => rep(200, {}, JSON.stringify({ ok: true, creditedUsd: 5 }))]);
  ok(a.envois.length === 3 && a.envois.every((e) => e === 'SIGNE-UNE-FOIS') && a.fin && a.fin.status === 200,
     'en attente deux fois puis credite : la MEME signature representee (' + a.envois.length + ' envois), la reponse finale est le 200');
  ok(a.statuts.some((t) => /waiting for the chain - don't sign again/.test(t)), 'pendant l attente : « waiting for the chain - don\'t sign again »');

  const b = await joue([PENDANTE, DEJA]);
  const phrase = b.err ? P.echec(b.err, 'Not topped up') : '';
  ok(b.err && b.err.attente === true && b.err.tx === '5sIg' && !/not charged/i.test(phrase) && /don't sign again/.test(phrase),
     'un serveur d avant (« already presented » a la reprise) : « ' + phrase.slice(0, 80) + '… », jamais « not charged »');

  const c = await joue([REFUS]);
  ok(c.fin && c.fin.status === 402 && c.envois.length === 1, 'un refus au premier envoi : rendu tel quel, pas de reprise');

  console.log('\n' + (rates ? 'RATES : ' + rates + '/' + n : 'VERIFICATIONS : ' + n + ' — tout passe'));
  process.exit(rates ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
