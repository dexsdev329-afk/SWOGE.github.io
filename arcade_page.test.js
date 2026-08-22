/* LA BORNE D'ARCADE DU NEXUS.
 *
 * Le jeu qui tourne dans la borne n'est pas de nous : il vit sous `arcade/`,
 * dans un iframe, avec ses propres modules et son propre ecouteur clavier.
 * Ce qui peut casser n'est donc PAS la logique du combat — c'est la couture.
 * Six coutures, et chacune casse d'une facon qu'on ne voit pas en regardant
 * la page une seconde :
 *
 * 1. LA CASSE DES CHEMINS. Le depot d'origine a ete ecrit sur une machine
 *    insensible a la casse : huit de ses modules demandent `Stage.js` alors
 *    que le fichier s'appelait `stage.js`, et la page en demandait `ken.png`
 *    au lieu de `Ken.png`. Sur GitHub Pages, qui est sensible a la casse, ca
 *    donne un ecran NOIR — pas une erreur visible, un rectangle vide. On
 *    verifie donc que TOUTE requete partie de la borne a repondu 200, et pas
 *    seulement que le cadre existe.
 *
 * 2. LA BOUCLE QUI SURVIT A LA FERMETURE. La borne joue sa musique en
 *    boucle et tourne soixante trames par seconde. Un iframe simplement
 *    masque continue les deux : le joueur cherche d'ou vient le son en
 *    croyant le Nexus casse. On verifie que la fermeture VIDE le `src`.
 *
 * 3. WASD APPARTIENT AUX DEUX. Le combat se joue en WASD, qui est
 *    exactement ce qui fait marcher le personnage du hall. Sans gel, se
 *    battre fait traverser la place derriere le voile, et on ressort devant
 *    la boutique sans avoir marche. On MESURE la position avant et apres.
 *
 * 4. LE RAPPORT DES PLANCHES. `larg`/`haut` sont recopies a la main depuis
 *    la taille du fichier. Deux nombres ronds ecrasent le dessin, et une
 *    image etiree ne leve aucune erreur — elle a juste l'air moins bien.
 *    L'essai compare au fichier REEL, il ne connait aucun nombre.
 *
 * 5. UNE PORTE NON INSCRITE NE FAIT RIEN, SANS RIEN DIRE. C'est la faute
 *    que la table `PANNEAUX` existe pour empecher. On relit la source : tout
 *    lieu qui a un rayon et n'a ni adresse, ni monde, ni « bientot » doit
 *    etre dans la table.
 *
 * 6. LA TOUCHE QUI RESTE ENFONCEE. Les boutons du telephone posent un
 *    `keydown` dans la fenetre de la borne. Fermer le panneau le doigt
 *    encore pose laissait la touche tenue : a la reouverture, le combattant
 *    partait tout seul vers la gauche.
 */
'use strict';
const path = require('path');
const fs = require('fs');

const SITE = __dirname;
let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) {}
if (!chromium) { console.log('arcade_page.test.js : playwright absent — essai saute'); process.exit(0); }

let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };

function servirLeSite(racine) {
  const http = require('http');
  /* `.ogg` compte : sans son type, le navigateur refuse la musique de la
     borne et l'essai croirait a une panne de chargement. */
  const T = { '.html': 'text/html', '.js': 'text/javascript', '.webp': 'image/webp',
              '.png': 'image/png', '.jpg': 'image/jpeg', '.css': 'text/css',
              '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
  return new Promise((res) => {
    const s = http.createServer((q, r) => {
      const f = path.join(racine, decodeURIComponent(q.url.split('?')[0]));
      fs.readFile(f, (e, d) => {
        if (e) { r.writeHead(404); r.end(); return; }
        r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' });
        r.end(d);
      });
    });
    s.listen(0, '127.0.0.1', () => res({ port: s.address().port, stop: () => s.close() }));
  });
}
process.on('unhandledRejection', (e) => {
  console.log('  RATE essai interrompu : ' + (e && e.message ? e.message : e));
  process.exit(1);
});

/* ---- LA SOURCE, RELUE ----
 * Les deux verifications de structure ne demandent pas de navigateur : elles
 * portent sur ce qui est ECRIT. Les faire ici plutot que dans la page evite
 * de les rendre dependantes d'un serveur qui demarre. */
function litSource() {
  const src = fs.readFileSync(path.join(SITE, 'nexus.js'), 'utf8');
  const bloc = src.slice(src.indexOf('var LIEUX = ['), src.indexOf('LIEUX.forEach(function (l) { l.img'));
  const lieux = [];
  const re = /\{\s*cle:\s*'([^']+)'([\s\S]*?)\},?\s*(?=\n\s*(?:\/\*|\{|\]))/g;
  let m;
  while ((m = re.exec(bloc))) {
    const corps = m[2];
    const val = (nom) => { const v = corps.match(new RegExp(nom + ":\\s*([^,\\n]+)")); return v ? v[1].trim() : null; };
    lieux.push({ cle: m[1], src: (val('src') || '').replace(/'/g, ''),
                 larg: Number(val('larg')), haut: Number(val('haut')),
                 rayon: val('rayon') ? Number(val('rayon')) : 0,
                 cadres: val('cadres') ? Number(val('cadres')) : 1,
                 href: !!val('href'), monde: !!val('monde'), bientot: !!val('bientot') });
  }
  const tab = src.slice(src.indexOf('var PANNEAUX = {'));
  const panneaux = (tab.slice(0, tab.indexOf('};')).match(/^\s*(\w+):/gm) || [])
    .map((x) => x.trim().replace(':', ''));
  return { lieux, panneaux };
}

(async () => {
  const S = litSource();
  console.log('- la source');
  ok(S.lieux.length >= 10, S.lieux.length + ' lieux relus dans la source');
  ok(S.panneaux.length >= 4, 'la table PANNEAUX en compte ' + S.panneaux.length);
  ok(S.lieux.some((l) => l.cle === 'arcade'), 'la borne est un lieu du hall');
  ok(S.panneaux.indexOf('arcade') >= 0, 'la borne est inscrite dans PANNEAUX');

  /* COUTURE 5 : toute porte qui ne mene nulle part d'autre doit etre
     inscrite. `coffre` est traite avant la table, dans sa propre salle — on
     le NOMME ici plutot que de laisser l'essai croire qu'il l'a oublie. */
  const HORS_TABLE = ['coffre'];
  const orphelines = S.lieux.filter((l) => l.rayon && !l.href && !l.monde && !l.bientot
                                   && HORS_TABLE.indexOf(l.cle) < 0
                                   && S.panneaux.indexOf(l.cle) < 0);
  ok(orphelines.length === 0,
     'aucune porte muette' + (orphelines.length ? ' — ' + orphelines.map((l) => l.cle).join(', ') : ''));

  /* COUTURE 4 : le rapport dessine contre le rapport du FICHIER. On ne
     compare pas a un nombre ecrit ici : on ouvre la planche. */
  console.log('- les planches');
  const tailleWebp = (f) => {
    const d = fs.readFileSync(f);
    const i = d.indexOf(Buffer.from('VP8X'));
    if (i >= 0) return { w: d.readUIntLE(i + 8, 3) + 1, h: d.readUIntLE(i + 11, 3) + 1 };
    const j = d.indexOf(Buffer.from('VP8L'));
    if (j >= 0) { const v = d.readUInt32LE(j + 9); return { w: (v & 0x3FFF) + 1, h: ((v >> 14) & 0x3FFF) + 1 }; }
    const k = d.indexOf(Buffer.from('VP8 '));
    return { w: d.readUInt16LE(k + 14) & 0x3FFF, h: d.readUInt16LE(k + 16) & 0x3FFF };
  };
  S.lieux.forEach((l) => {
    if (!l.src || !l.larg || !l.haut) return;
    const f = path.join(SITE, l.src);
    if (!fs.existsSync(f)) { ok(false, l.cle + ' : planche introuvable ' + l.src); return; }
    const t = tailleWebp(f);
    /* Une planche animee est une BANDE de plusieurs images cote a cote : son
       rapport de FICHIER n'est pas celui d'une image. On divise donc par le
       nombre de cadres que le lieu declare, plutot que de deviner « c'est
       large donc c'est une bande » — le portail fait 624 sur 242 pour quatre
       images, ce qui n'a l'air large qu'a moitie, et une regle au juge se
       serait tue sur exactement les trois planches a verifier. */
    const rapport = (t.w / l.cadres) / t.h;
    const ecart = Math.abs((l.larg / l.haut) / rapport - 1);
    ok(ecart < 0.06, l.cle + ' garde le rapport de sa planche (ecart ' +
       Math.round(ecart * 100) + '%, fichier ' + t.w + 'x' + t.h +
       (l.cadres > 1 ? ' en ' + l.cadres + ' cadres' : '') +
       ', dessine ' + l.larg + 'x' + l.haut + ')');
  });

  const site = await servirLeSite(SITE);
  const nav = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const base = `http://127.0.0.1:${site.port}`;

  /* ---- COUTURE 1 : LA BORNE, SERVIE PAR UN SERVEUR SENSIBLE A LA CASSE ----
   * On la charge SEULE d'abord. Melangee au hall, un 404 se perdrait dans le
   * bruit des requetes du Nexus, et l'essai dirait « ca marche » devant un
   * ecran noir. */
  console.log('- la borne, chargee seule');
  {
    const p = await nav.newPage({ viewport: { width: 900, height: 600 } });
    const echecs = [], erreurs = [];
    p.on('response', (r) => { if (r.status() >= 400) echecs.push(r.status() + ' ' + r.url().replace(base, '')); });
    p.on('pageerror', (e) => erreurs.push(String(e).slice(0, 160)));
    await p.goto(base + '/arcade/index.html', { waitUntil: 'load' });
    await p.waitForTimeout(1500);
    ok(echecs.length === 0, 'aucune requete en echec' + (echecs.length ? ' — ' + echecs.join(' | ') : ''));
    ok(erreurs.length === 0, 'aucune erreur de script' + (erreurs.length ? ' — ' + erreurs.join(' | ') : ''));
    /* Un canvas vide et un canvas qui dessine se ressemblent dans le DOM. On
       lit donc des PIXELS : si les modules n'ont pas charge, la boucle ne
       tourne pas et tout reste a zero. */
    const vivant = await p.evaluate(() => {
      const c = document.querySelector('canvas');
      if (!c) return { canvas: false };
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let allumes = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 30) allumes++;
      return { canvas: true, w: c.width, h: c.height, allumes, total: d.length / 4 };
    });
    ok(vivant.canvas, 'la borne a un ecran');
    ok(vivant.allumes > vivant.total * 0.02,
       'la borne DESSINE (' + vivant.allumes + ' pixels allumes sur ' + vivant.total + ')');
    await p.close();
  }

  /* ---- LE HALL ----
   * On y marche comme un joueur. Poser `on` sur le voile a la main
   * ouvrirait le panneau sans passer par le chemin qu'on veut mesurer. */
  console.log('- on marche jusqu\'a la borne');
  const p = await nav.newPage({ viewport: { width: 1280, height: 900 } });
  const echecsHall = [];
  p.on('response', (r) => { if (r.status() >= 400 && r.url().indexOf('/arcade/') >= 0) echecsHall.push(r.status() + ' ' + r.url().replace(base, '')); });
  await p.goto(base + '/nexus.html', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2200);

  /* On lit la position DESSINEE : c'est le seul repere commun entre l'essai
     et la page, et il ne refait pas le calcul de la camera. */
  await p.evaluate(() => {
    const C = CanvasRenderingContext2D.prototype;
    if (C.__espionArc) return;
    C.__espionArc = true;
    window.__moi = null; window.__borne = null;
    const di = C.drawImage;
    C.drawImage = function (im) {
      const u = (im && (im.currentSrc || im.src)) || '';
      if (u.indexOf('obj_arcade_borne') >= 0 && arguments.length >= 5) {
        const d = arguments.length >= 9 ? 5 : 1;
        window.__borne = { x: arguments[d] + arguments[d + 2] / 2, y: arguments[d + 1] + arguments[d + 3] };
      }
      if (arguments.length >= 9 && arguments[3] === 256 && arguments[4] === 256
          && arguments[7] === 150 && arguments[8] === 150) {
        window.__moi = { x: Math.round(arguments[5] + 75), y: Math.round(arguments[6] + 130) };
      }
      return di.apply(this, arguments);
    };
  });
  const marche = async (t, ms) => { await p.keyboard.down(t); await p.waitForTimeout(ms); await p.keyboard.up(t); await p.waitForTimeout(200); };
  const vue = () => p.evaluate(() => {
    const v = document.getElementById('nxArcVoile');
    const f = document.getElementById('nxArcJeu');
    return { on: !!(v && v.classList.contains('on')), src: f ? f.getAttribute('src') : null,
             moi: window.__moi, borne: window.__borne };
  });

  /* La borne est au sud-ouest. On part deja trois cents unites SOUS le
     centre, a vingt-cinq unites de sa hauteur : il ne reste qu'a aller vers
     l'ouest, tout droit.
     Descendre d'abord — ce que faisait cet essai — passait par la table de
     blackjack, qui s'ouvrait, gelait le hall, et les quatorze pas suivants
     ne bougeaient plus rien. L'essai accusait alors la borne de ne pas
     s'ouvrir alors qu'on n'avait jamais quitte le sud. */
  for (let i = 0; i < 14 && !(await vue()).on; i++) await marche('ArrowLeft', 500);
  let v = await vue();
  ok(v.on, 'marcher sur la borne ouvre le panneau');
  ok(v.src === 'arcade/index.html', 'le panneau charge le jeu (src = ' + v.src + ')');
  await p.waitForTimeout(2500);
  ok(echecsHall.length === 0, 'la borne se charge sans 404 depuis le hall'
     + (echecsHall.length ? ' — ' + echecsHall.join(' | ') : ''));

  /* COUTURE 3 : WASD ne doit plus faire marcher le personnage. */
  console.log('- le hall est fige derriere le voile');
  const avant = (await vue()).moi;
  await marche('ArrowRight', 900);
  await marche('ArrowUp', 900);
  const apres = (await vue()).moi;
  const bouge = avant && apres ? Math.hypot(apres.x - avant.x, apres.y - avant.y) : -1;
  ok(bouge === 0, 'le personnage n\'a pas bouge pendant le combat (' + bouge + ' px)');

  /* COUTURE 6 puis 2 : les boutons du telephone, puis la fermeture. */
  console.log('- les touches du telephone');
  const espionTouches = await p.evaluate(() => {
    const f = document.getElementById('nxArcJeu');
    const w = f && f.contentWindow;
    if (!w) return false;
    window.__vues = [];
    w.addEventListener('keydown', (e) => window.__vues.push('down:' + e.code));
    w.addEventListener('keyup', (e) => window.__vues.push('up:' + e.code));
    return true;
  });
  ok(espionTouches, 'on peut ecouter la fenetre de la borne (meme origine)');
  /* On appelle le meme chemin que le doigt : `pointerdown` sur le bouton. Le
     pad est cache au clavier — c'est voulu — donc on ne peut pas cliquer
     dessus, on pose l'evenement. */
  await p.evaluate(() => {
    const b = document.querySelector('#nxArcPad [data-t="KeyA"]');
    b.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, bubbles: true }));
  });
  await p.waitForTimeout(120);
  let vues = await p.evaluate(() => window.__vues.slice());
  ok(vues.indexOf('down:KeyA') >= 0, 'le bouton gauche enfonce KeyA dans la borne (' + vues.join(',') + ')');
  /* Le doigt reste pose et on FERME. Sans le rattrapage, la touche restait
     tenue et le combattant repartait seul a la reouverture. */
  await p.evaluate(() => { document.querySelector('#nxArcVoile .nxcf-x').click(); });
  await p.waitForTimeout(200);
  vues = await p.evaluate(() => window.__vues.slice());
  ok(vues.indexOf('up:KeyA') >= 0, 'fermer le panneau RELACHE la touche encore tenue (' + vues.join(',') + ')');

  console.log('- la fermeture');
  v = await vue();
  ok(!v.on, 'la croix ferme le panneau');
  ok(v.src === 'about:blank', 'le src est vide : plus de musique ni de boucle (src = ' + v.src + ')');
  /* Et le hall repart : sans ca, fermer la borne laissait le joueur fige
     pour de bon, ce qui est pire que le probleme qu'on soignait. */
  const p0 = (await vue()).moi;
  await marche('ArrowUp', 700);
  const p1 = (await vue()).moi;
  ok(p0 && p1 && Math.hypot(p1.x - p0.x, p1.y - p0.y) > 20,
     'le personnage remarche apres la fermeture');

  await nav.close(); site.stop();
  console.log('\n' + n + ' verifications, ' + rates + ' rate(s)');
  process.exit(rates ? 1 : 0);
})();
