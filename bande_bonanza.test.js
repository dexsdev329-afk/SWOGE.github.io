/* LA BANDE DU HAUT DE SWOGE BONANZA : GAIN | LOGO | MISE.
 *
 * Le gain et la mise prenaient chacun une ligne entiere SOUS la grille, et le
 * bouton SPIN finissait sous le bord de l'ecran sur un telephone. Ils sont
 * maintenant ranges de part et d'autre du logo, dans une bande qui existait
 * deja.
 *
 * Tout le gain de place repose sur une chose : QUE LA BANDE NE GRANDISSE PAS
 * quand elle se remplit. Si un texte long la fait pousser, la place gagnee en
 * bas est reprise en haut et l'operation n'a rien donne — sans que ca se voie,
 * parce qu'on ne regarde jamais la page au pire moment.
 *
 * Cet essai la remplit donc avec les textes les PLUS LONGS que le jeu produit
 * — la cascade a trois amas, la mise au plafond — et mesure. Il verifie aussi
 * que le logo reste centre (une colonne qui s'elargit le pousse de cote) et
 * que la croix qui efface la mise reste une cible qu'un doigt atteint.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const http = require('http');

const SITE = __dirname;
let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) {}
if (!chromium) { console.log('bande_bonanza.test.js : playwright absent — essai saute'); process.exit(0); }

let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };

const T = { '.html': 'text/html', '.js': 'text/javascript', '.webp': 'image/webp',
            '.png': 'image/png', '.jpg': 'image/jpeg', '.css': 'text/css',
            '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };

/* Les pires textes que le jeu sait produire, pas des exemples commodes :
   `bzJoueEtapes` liste chaque amas d'une cascade, et il peut y en avoir
   trois ; `bzFmt` monte jusqu'a « 5.0M » sur la mise. */
const CAS = [
  { nom: 'rien encore', gain: '', mise: '' },
  { nom: 'une perte', gain: '<b>-8.6k $SWOGE</b>', mise: 'Bet 8.6k' },
  { nom: 'un gain', gain: '<b>+5.6k $SWOGE</b> <i>1.65×</i>', mise: 'Bet 8.6k' },
  { nom: 'une cascade a trois amas',
    gain: '<b>+1.65×</b> <i>12 bonbon violet · 10 pasteque · 9 raisin</i>',
    mise: 'Bet 5.0M' },
];
/* Le petit ecran est celui qui decide : c'est la que la place manque. */
const ECRANS = [{ nom: 'iPhone SE', w: 375, h: 667 }, { nom: 'grand telephone', w: 430, h: 932 }];

(async () => {
  const srv = http.createServer((q, r) => {
    let p = decodeURIComponent(q.url.split('?')[0]);
    if (p === '/') p = '/index.html';
    const f = path.join(SITE, p);
    if (!f.startsWith(SITE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(r);
  });
  await new Promise((res) => srv.listen(0, res));
  const port = srv.address().port;
  const nav = await chromium.launch();

  for (const e of ECRANS) {
    console.log('\n-- ' + e.nom + ' ' + e.w + '×' + e.h + ' --');
    const p = await nav.newPage({ viewport: { width: e.w, height: e.h } });
    /* Rien ne sort de la machine : le serveur de jeu n'est pas de la partie
       ici, on mesure une mise en page. */
    await p.route('**/*', (r) => (r.request().url().includes('localhost:' + port)
      ? r.continue() : r.fulfill({ status: 503, body: '' })));
    await p.goto('http://localhost:' + port + '/swoge_bonanza.html', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(800);

    const mesures = [];
    for (const c of CAS) {
      mesures.push(await p.evaluate(([g, mi]) => {
        const G = document.getElementById('bzGain');
        const M = document.getElementById('bzMise');
        G.innerHTML = g;
        if (mi) { M.hidden = false; M.innerHTML = '<span>' + mi + '</span><button id="bzClear" type="button">×</button>'; }
        else { M.hidden = true; M.innerHTML = ''; }
        const T2 = document.querySelector('.bz-tete').getBoundingClientRect();
        const L = document.querySelector('.bz-titre').getBoundingClientRect();
        const GR = G.getBoundingClientRect();
        const MR = M.hidden ? null : M.getBoundingClientRect();
        const B = document.getElementById('bzClear');
        const BR = B ? B.getBoundingClientRect() : null;
        return {
          bande: T2.height, logo: L.height,
          /* le logo pousse de cote = une colonne laterale s'est elargie */
          decentre: Math.abs((L.left + L.right) / 2 - (T2.left + T2.right) / 2),
          gainDeborde: GR.bottom > T2.bottom + 1 || GR.top < T2.top - 1,
          /* Le gain a GAUCHE, la mise a DROITE : c'est la demande d'origine, et
             elle porte sur la BANDE, pas sur le logo. On comparait aux bords
             du logo tant qu'il etait etroit et centre ; le bandeau du cadre
             fourni prend toute la largeur et le gain se pose PAR-DESSUS son
             extremite gauche. La demande n'a pas change, la geometrie si :
             on demande donc que le centre du gain tombe dans le tiers gauche
             de la bande et celui de la mise dans le tiers droit. */
          gainAGauche: (GR.left + GR.right) / 2 < T2.left + T2.width / 3,
          miseADroite: MR ? (MR.left + MR.right) / 2 > T2.left + 2 * T2.width / 3 : null,
          croix: BR ? Math.min(BR.width, BR.height) : null,
        };
      }, [c.gain, c.mise]));
    }

    const hauteurs = mesures.map((m) => Math.round(m.bande));
    ok(new Set(hauteurs).size === 1,
       'la bande garde la MEME hauteur des quatre cas, du vide au pire texte'
       + ' (' + hauteurs.join(', ') + ' px) — sinon la place gagnee en bas est reprise en haut');
    ok(mesures.every((m) => m.bande <= m.logo + 1),
       'et cette hauteur est celle du logo : le gain et la mise ne coutent pas'
       + ' un pixel de plus (' + Math.round(mesures[0].bande) + ' px pour un logo de '
       + Math.round(mesures[0].logo) + ')');
    ok(mesures.every((m) => m.decentre < 1),
       'le logo reste exactement centre dans les quatre cas — un texte long'
       + ' elargirait sa colonne et le pousserait de cote');
    ok(mesures.every((m) => !m.gainDeborde),
       'le gain tient dans la bande, y compris la cascade a trois amas qui'
       + ' s ecrit sur trois lignes');
    ok(mesures.every((m) => m.gainAGauche),
       'le gain est bien dans le TIERS GAUCHE de la bande');
    ok(mesures.filter((m) => m.miseADroite !== null).every((m) => m.miseADroite),
       'et la mise dans le TIERS DROIT : c est la disposition demandee, pas l inverse');
    /* Le bouton s'appelait « clear » en 15 px de texte. Dans une colonne de
       cent pixels, cette cible-la se rate ; on l'a remplacee par un rond. */
    const croix = mesures.map((m) => m.croix).filter((x) => x !== null);
    ok(croix.length > 0 && croix.every((x) => x >= 24),
       'la croix qui efface la mise fait au moins 24 px de cote ('
       + croix.map((x) => Math.round(x)).join(', ') + ') : elle se touche au doigt');

    await p.close();
  }

  /* Ce que tout ca sert a : le bouton SPIN plus haut dans la page. On ne le
     compare pas a une valeur inventee — on verifie qu'il tient dans la
     hauteur d'un iPhone SE une fois retirees les barres du navigateur. */
  const p2 = await nav.newPage({ viewport: { width: 375, height: 667 } });
  await p2.route('**/*', (r) => (r.request().url().includes('localhost:' + port)
    ? r.continue() : r.fulfill({ status: 503, body: '' })));
  await p2.goto('http://localhost:' + port + '/swoge_bonanza.html', { waitUntil: 'domcontentloaded' });
  await p2.waitForTimeout(800);
  const bas = await p2.evaluate(() => {
    const b = document.querySelector('.bz-spin').getBoundingClientRect();
    return Math.round(b.bottom + scrollY);
  });
  console.log('\n-- la place gagnee --');
  ok(bas < 654,
     'sur un iPhone SE le bas du bouton SPIN est a ' + bas + ' px du haut de la page,'
     + ' contre 654 avant que le gain et la mise remontent dans la bande');
  await p2.close();

  await nav.close(); srv.close();
  console.log('\n' + n + ' verifications, ' + rates + ' echec(s)');
  process.exit(rates ? 1 : 0);
})();
