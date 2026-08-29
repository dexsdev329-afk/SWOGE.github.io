/* LES SONS BRANCHES DANS LA PAGE TIENNENT-ILS LEUR CRENEAU ?
 *
 * Un bruitage se juge d'abord a sa DUREE, parce que la duree decide s'il
 * peut se rejouer aussi souvent que son creneau l'exige. `gain` part a
 * chaque etage de cascade — jusqu'a dix fois sur un bon tour, a 1,4 s
 * d'intervalle ; `pose` part six fois par tour, a 130 ms d'intervalle. Un
 * fichier de deux secondes dans l'un de ces deux creneaux se recouvre
 * lui-meme et devient une bouillie.
 *
 * ET IL Y A LE PIEGE QUI NOUS EST TOMBE DESSUS. J'ai pose sur `pose` un
 * fichier de 0,49 s, sourd, a l'attaque nette — le profil d'un choc. C'etait
 * une VOIX qui dit « welcome », et elle partait six fois par tour. Quatre
 * chiffres ne separent pas une parole courte d'un clic court.
 *
 * Ce qui les separe se mesure : la PERIODICITE. Une voix voisee est
 * fortement periodique (les cordes vocales) et sa hauteur tombe entre 85 et
 * 255 Hz. Un choc, non. Cet essai le mesure sur chaque fichier branche dans
 * un creneau repetitif et refuse ce qui ressemble a de la parole.
 *
 * Il ne remplace pas une oreille — un carillon aussi est periodique, d'ou la
 * fenetre de hauteur. Il attrape le cas precis qui nous a coute un tour de
 * jeu, et c'est deja ca.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const SITE = __dirname;
let ffmpeg = null;
try { ffmpeg = require('@ffmpeg-installer/ffmpeg').path; } catch (e) {}
if (!ffmpeg) {
  const s = process.env.SWOGE_MODULES;
  if (s && fs.existsSync(path.join(s, '@ffmpeg-installer/linux-x64/ffmpeg'))) {
    ffmpeg = path.join(s, '@ffmpeg-installer/linux-x64/ffmpeg');
  }
}
if (!ffmpeg) { console.log('sons_bonanza.test.js : ffmpeg absent — essai saute'); process.exit(0); }

let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };

const page = fs.readFileSync(path.join(SITE, 'swoge_bonanza.html'), 'utf8');

/* La table des sons, lue dans la page — pas recopiee : une copie vieillit. */
const bloc = /var l=\{([^}]*)\}/.exec(page);
ok(!!bloc, 'la table des sons se lit dans la page');
if (!bloc) { console.log('\n' + n + ' verifications, ' + (rates) + ' echec(s)'); process.exit(1); }
const sons = {};
for (const m of bloc[1].matchAll(/(\w+)\s*:\s*"([^"]+)"/g)) sons[m[1]] = m[2];

/* Combien de fois par tour un creneau peut partir, et l'intervalle le plus
   court entre deux departs. C'est ce qui donne la duree maximale tenable. */
const CRENEAUX = {
  pose:     { parTour: 6,  intervalle: 0.13, max: 0.60 },
  gain:     { parTour: 10, intervalle: 1.40, max: 1.30 },
  cascade:  { parTour: 10, intervalle: 1.40, max: 1.30 },
  scatter:  { parTour: 3,  intervalle: 0.62, max: 1.20 },
  debut:    { parTour: 1,  intervalle: 3.00, max: 2.50 },
  bombe:    { parTour: 10, intervalle: 0.85, max: 1.50 },
  gratuits: { parTour: 1,  intervalle: 1.50, max: 2.00 },
  gros:     { parTour: 1,  intervalle: 3.00, max: 5.00 },
  rien:     { parTour: 1,  intervalle: 3.00, max: 2.00 },
};

const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'sons-'));
function mesure(rel) {
  const src = path.join(SITE, rel);
  if (!fs.existsSync(src)) return null;
  const wav = path.join(tmp, 'x.wav');
  /* On garde 44,1 kHz. Descendre a 22 kHz divisait par deux la resolution de
     hauteur, et la voix qui disait « welcome » ressortait a 0,51 au lieu de
     0,72 — juste sous le seuil. Baisser le seuil aurait ete regler l'essai
     sur un echantillon ; c'est la MESURE qu'il fallait rendre solide. */
  execFileSync(ffmpeg, ['-nostdin', '-v', 'error', '-i', src, '-ac', '1', '-ar', '44100',
                        '-c:a', 'pcm_s16le', wav, '-y']);
  const b = fs.readFileSync(wav);
  const sr = 44100;
  const x = [];
  for (let i = 44; i + 1 < b.length; i += 2) x.push(b.readInt16LE(i) / 32768);
  const N = x.length;
  if (N < 1024) return { duree: N / sr, periodicite: 0, hauteur: 0 };

  /* Une parole alterne des parties voisees et des parties soufflees. On
     promene donc plusieurs fenetres et on garde la MEILLEURE periodicite :
     une seule fenetre, posee au hasard sur une consonne, ne voit rien. */
  const W = 2048;
  const lagMin = Math.floor(sr / 300), lagMax = Math.floor(sr / 80);
  let best = 0, lag = 0;
  for (let d = 0; d + W <= N; d += Math.floor(W / 2)) {
    const seg = x.slice(d, d + W);
    const moy = seg.reduce((s2, v) => s2 + v, 0) / W;
    for (let i = 0; i < W; i++) seg[i] -= moy;
    const e0 = seg.reduce((s2, v) => s2 + v * v, 0);
    if (e0 < 1e-6) continue;                       // fenetre muette
    for (let L = lagMin; L <= lagMax && L < W; L++) {
      let s2 = 0;
      for (let i = 0; i + L < W; i++) s2 += seg[i] * seg[i + L];
      const r = s2 / e0;
      if (r > best) { best = r; lag = L; }
    }
  }
  /* La brillance : combien de fois le signal traverse zero par seconde. Une
     parole porte ses formants entre 300 et 3400 Hz ; un « boum » de dessin
     anime est grave et lisse. C'est ce qui les separe quand tous deux sont
     periodiques vers 100-150 Hz. */
  let zc = 0;
  for (let i = 1; i < N; i++) if ((x[i - 1] < 0) !== (x[i] < 0)) zc++;
  return { duree: N / sr, periodicite: best, hauteur: lag ? sr / lag : 0,
           brillance: (zc * sr) / (2 * N) };
}

console.log('\n-- ce que la page joue --');
const trop = [], absents = [], voix = [];
for (const [cle, rel] of Object.entries(sons)) {
  const m = mesure(rel);
  if (!m) { absents.push(cle + ' → ' + rel); continue; }
  const c = CRENEAUX[cle];
  const drapeau = (c && m.duree > c.max) ? '  ← TROP LONG' : '';
  console.log('  ' + cle.padEnd(9) + m.duree.toFixed(2).padStart(6) + 's'
    + '   periodicite ' + m.periodicite.toFixed(2)
    + '   hauteur ' + m.hauteur.toFixed(0).padStart(4) + ' Hz'
    + '   brillance ' + m.brillance.toFixed(0).padStart(4) + ' Hz'
    + '   ' + rel.replace('son/bonanza/', '') + drapeau);
  if (c && m.duree > c.max) trop.push(cle + ' ' + m.duree.toFixed(2) + 's > ' + c.max + 's');
  /* La parole : assez LONGUE pour etre un mot, fortement periodique, et dans
     la fenetre de hauteur de la voix humaine.
     Le plancher de duree n'est pas un reglage de confort : aucune syllabe ne
     tient en 70 ms. Sans lui, l'essai accusait `cascade` (0,07 s) d'etre une
     voix — sur un fichier aussi court, la fenetre d'autocorrelation analyse
     surtout du remplissage. Verifie que le plancher ne desarme pas le
     controle : la piste qui disait « welcome » fait 0,49 s, periodicite 0,72
     a 143 Hz — elle reste prise. */
  /* Fenetre de hauteur 100-255 Hz. La brillance ne separait PAS le cas
     genant : le « boum » de la bombe sort a 503 Hz, la voix a 404 — le boum
     est le plus brillant des deux. Ce qui les separe est la HAUTEUR : 94 Hz
     pour le boum, 144 pour la voix. Le plancher passe donc de 80 a 100 Hz.
     Ce que ca coute, dit franchement : une voix tres grave (sous 100 Hz)
     passerait. Ce que ca evite : crier au loup sur chaque son grave et
     periodique, ce qui ferait ignorer l'essai — le sort de tout controle qui
     se trompe souvent. */
  if (c && c.parTour >= 6 && m.duree >= 0.20
      && m.periodicite > 0.55 && m.hauteur >= 100 && m.hauteur <= 255) {
    voix.push(cle + ' (periodicite ' + m.periodicite.toFixed(2) + ' a ' + m.hauteur.toFixed(0) + ' Hz)');
  }
}

ok(absents.length === 0,
   'chaque son de la table existe sur le disque'
   + (absents.length ? ' — MANQUE : ' + absents.join(', ') : ''));
ok(trop.length === 0,
   'chaque son tient dans la duree que son creneau permet'
   + (trop.length ? ' — TROP LONG : ' + trop.join(', ') : ''));
ok(voix.length === 0,
   'aucun son d un creneau REPETITIF ne ressemble a de la parole'
   + (voix.length ? ' — ON DIRAIT UNE VOIX : ' + voix.join(', ')
                  : ' (c est ce qui a mis « welcome » six fois par tour)'));

/* Le dossier `lot/` est une salle d'attente : rien n'en sort sans avoir ete
   ecoute. La page ne doit donc jamais y pointer. */
ok(!/son\/bonanza\/lot\//.test(page),
   'la page ne joue AUCUN fichier du dossier `lot/` : il est en attente d ecoute');

fs.rmSync(tmp, { recursive: true, force: true });
console.log('\n' + n + ' verifications, ' + rates + ' echec(s)');
process.exit(rates ? 1 : 0);
