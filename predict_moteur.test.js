"use strict";
/* ============================================================================
 * SWOGE PREDICT — LE MOTEUR NE MENT PAS
 *
 * Le prix a court terme est quasi aleatoire. Ce qu on teste :
 *   1. les indicateurs sont justes sur des series connues ;
 *   2. la martingale double, se reinitialise, et ne mise JAMAIS plus que la
 *      bankroll ni que le plafond ;
 *   3. le gestionnaire de risque PEUT dire non et met en pause ;
 *   4. le backtest est deterministe et rend la VRAIE precision — pas 90 % ;
 *   5. le moteur ne pretend jamais une certitude : pas de « garanti », et la
 *      probabilite reste bridee loin de 100 %.
 * ==========================================================================*/
var fs = require('fs'), path = require('path');
var P = require('./predict_moteur.js');
var n = 0, rates = 0;
function ok(c, m) { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } }
function eq(a, b, m) { ok(a === b, m + ' [' + JSON.stringify(a) + ']'); }
function pres(a, b, m) { ok(Math.abs(a - b) < 1e-6, m + ' [' + a + ']'); }

console.log('-- 1. les indicateurs, sur des series connues --');
{
  eq(P.TA.sma([2, 4, 6], 3), 4, 'SMA de 2,4,6 = 4');
  eq(P.TA.sma([1], 3), null, 'SMA se tait sous sa fenetre');
  /* Une serie strictement montante : RSI = 100 (aucune baisse). */
  eq(P.TA.rsi([1, 2, 3, 4, 5, 6], 5), 100, 'RSI d une montee pure = 100');
  /* Une serie plate : momentum nul. */
  eq(P.TA.momentum([10, 10, 10, 10], 2), 0, 'momentum d une serie plate = 0');
  pres(P.TA.momentum([100, 110], 1), 0.1, 'momentum +10% = 0.1');
  var e = P.TA.ema([5, 5, 5, 5, 5], 3); pres(e, 5, 'EMA d une constante = la constante');
  var bb = P.TA.bollinger([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 10);
  ok(bb && bb.haut > bb.moyenne && bb.bas < bb.moyenne, 'Bollinger encadre la moyenne');
}

console.log('\n-- 2. la martingale : double, plafonne, se reinitialise --');
{
  var m = new P.MartingaleEngine({ initial: 10, mult: 2, maxBet: 100 });
  eq(m.prochaine(1000), 10, 'premier pari = mise initiale');
  m.resultat(false); eq(m.prochaine(1000), 20, 'apres une perte : x2');
  m.resultat(false); eq(m.prochaine(1000), 40, 'encore : x2');
  m.resultat(true);  eq(m.prochaine(1000), 10, 'apres un gain : retour a l initial');
  /* Le plafond de mise. */
  var m2 = new P.MartingaleEngine({ initial: 10, mult: 10, maxBet: 50 });
  m2.resultat(false); eq(m2.prochaine(1000), 50, 'le pari est plafonne a maxBet');
  /* LA GARDE : jamais plus que la bankroll disponible. */
  var m3 = new P.MartingaleEngine({ initial: 10, mult: 2 });
  for (var i = 0; i < 8; i++) m3.resultat(false);   /* 10*2^8 = 2560 voulu */
  eq(m3.prochaine(300), 300, 'la mise ne depasse JAMAIS la bankroll disponible');
  eq(m3.prochaine(0), 0, 'bankroll a zero : mise a zero, pas negative');
}

console.log('\n-- 3. le risque peut dire non --');
{
  var bank = new P.BankrollManager(1000);
  var r = new P.RiskManager({ maxRisquePct: 1, maxBet: 10, perteJourMax: 100 });
  eq(r.plafondMise(bank), 10, 'plafond = 1% de 1000 = 10');
  ok(r.autorise(10, bank).ok, '10 passe');
  ok(!r.autorise(2000, bank).ok, 'une mise superieure a la bankroll est refusee');
  /* La perte quotidienne : au-dela, PAUSE, plus aucune mise. */
  r.noteResultat(-100);
  var v = r.autorise(5, bank);
  ok(!v.ok && /daily loss/i.test(v.raison), 'la limite de perte quotidienne met en PAUSE');
  ok(!r.autorise(5, bank).ok, 'et la pause tient : plus aucune mise generee');
}

console.log('\n-- 4. le backtest rejoue de vraies bougies et dit la verite --');
{
  /* Des bougies deterministes (une marche aleatoire figee) : le meme
     backtest rend TOUJOURS le meme resultat. */
  var candles = [], px = 1000, graine = 42;
  function rnd() { graine = (graine * 1103515245 + 12345) & 0x7fffffff; return graine / 0x7fffffff; }
  for (var i = 0; i < 400; i++) { var d = (rnd() - 0.5) * 20; var o = px; px += d;
    candles.push({ o: o, c: px, h: Math.max(o, px) + 1, l: Math.min(o, px) - 1, v: 100 + rnd() * 50 }); }
  var a = P.backtest(candles, { bankroll: 1000, miseInitiale: 10, mult: 2, maxBet: 100 });
  var b = P.backtest(candles, { bankroll: 1000, miseInitiale: 10, mult: 2, maxBet: 100 });
  eq(a.roi, b.roi, 'le backtest est deterministe : deux passages, meme ROI');
  ok(a.rounds > 50, 'il a joue assez de rounds [' + a.rounds + ']');
  /* La verite honnete : sur une marche aleatoire, la precision reste pres de
     50 %. Un moteur qui pretendrait 80 % mentirait. */
  ok(a.precision > 30 && a.precision < 70, 'la precision reelle reste pres du hasard [' + a.precision.toFixed(1) + '%]');
  ok(/not an edge/i.test(a.note), 'et le resultat le DIT : ce n est pas un avantage');
  ok(typeof a.ruine === 'boolean', 'il dit si la martingale a ruine la bankroll [' + a.ruine + ']');
}

console.log('\n-- 5. le moteur ne pretend jamais une certitude --');
{
  var closes = [];
  for (var i = 0; i < 60; i++) closes.push({ o: 100 + i, c: 100 + i + 1, h: 102 + i, l: 99 + i, v: 100 });
  var pred = new P.PredictionEngine().evalue(closes);
  ok(pred.prob <= 68, 'meme sur une tendance pure, la proba reste bridee (<=68%) [' + pred.prob + ']');
  ok(pred.prob >= 50, 'sur une montee, le sens penche UP');
  eq(pred.sens, 'UP', 'et le sens est UP');
  ok(Array.isArray(pred.raisons) && pred.raisons.length >= 3, 'chaque prediction porte ses raisons');
  ok(['LOW', 'MEDIUM', 'HIGH'].indexOf(pred.confiance) !== -1, 'et un niveau de confiance');
  /* Le mot interdit, nulle part dans le moteur ni la page. */
  var src = fs.readFileSync(path.join(__dirname, 'predict_moteur.js'), 'utf8');
  ok(!/guarantee|guaranteed|sure win|certain profit/i.test(src), 'aucun « garanti » dans le moteur');
  ok(/quasi aleatoire|not an edge|TRES HAUT RISQUE/i.test(src), 'et il dit franchement le risque');
  /* Sous 30 bougies, il refuse de conclure. */
  eq(new P.PredictionEngine().evalue([{ o: 1, c: 1, h: 1, l: 1, v: 1 }]).assez, false, 'sous 30 bougies : pas de conclusion');
}

console.log('\nVERIFICATIONS : ' + n + (rates ? '  —  RATES : ' + rates + '/' + n : '  —  tout passe'));
process.exit(rates ? 1 : 0);
