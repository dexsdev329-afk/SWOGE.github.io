/* LE DECOR SEME DU NEXUS : IL EXISTE, ET IL EST AU BON ENDROIT.
 *
 * ---- POURQUOI CET ESSAI EXISTE ----
 *
 * Le semis a rate DEUX FOIS de suite, et les deux fois en silence.
 *
 * La premiere : une seule liste d'ecartement pour toutes les familles. Trois
 * cents touffes d'herbe posees d'abord, puis des arbres qui devaient se tenir
 * a trois cents unites de CHACUNE — pas un seul arbre n'est apparu. La page
 * ne levait rien : elle dessinait consciencieusement zero arbre.
 *
 * La seconde : les arbres poses avant les pierres levees. Onze objets
 * magiques a quatre cent vingt unites de trente-quatre arbres deja plantes ne
 * trouvent rien — pas une pierre. Toujours aucune erreur.
 *
 * Une famille qui ne pose RIEN est donc le defaut le plus probable de ce
 * code, et c'est exactement celui qu'aucun chiffre ne trahit. Il faut le
 * regarder pour le voir, et cet essai le regarde.
 *
 * ---- CE QU'IL VERIFIE, ET DANS QUEL ORDRE ----
 *
 * 1. CHAQUE FAMILLE POSE. C'est le cas ci-dessus.
 * 2. RIEN SUR UN CHEMIN. Un arbre au milieu d'une allee n'est pas du decor,
 *    c'est une erreur qu'on contourne tous les jours.
 * 3. RIEN DANS UNE FACADE. On ecarte le RECTANGLE d'un batiment et non son
 *    rayon : la grange fait quatre cent vingt de large pour un rayon de cent
 *    cinquante, et un chene aurait pousse dans sa porte.
 * 4. C'EST LE MEME DECOR A CHAQUE FOIS. Une place qui se rearrange a chaque
 *    rechargement est une place ou l'on ne se repere jamais.
 *
 * On lit ce qui est PEINT, jamais une variable : elles vivent dans une
 * fermeture, et ce qui compte est de toute facon ce qui arrive a l'ecran.
 */
'use strict';
const path = require('path');
const fs = require('fs');

const SITE = __dirname;
let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) {}
if (!chromium) { console.log('decor_nexus_page.test.js : playwright absent — essai saute'); process.exit(0); }

let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };

function servirLeSite(racine) {
  const http = require('http');
  const T = { '.html': 'text/html', '.js': 'text/javascript', '.webp': 'image/webp',
              '.png': 'image/png', '.css': 'text/css', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
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

/* Les familles declarees dans la source. On ne les recopie pas : le jour ou
   une cinquieme arrive, cet essai doit l'exiger sans qu'on y pense. */
function famillesDeclarees() {
  const src = fs.readFileSync(path.join(SITE, 'nexus.js'), 'utf8');
  const dep = src.indexOf('var DECOR_FAMILLES = [');
  const bloc = src.slice(dep, src.indexOf('];', dep));
  return [...bloc.matchAll(/cle: '(\w+)'[\s\S]*?combien: (\d+)[\s\S]*?sol: (true|false)/g)]
    .map((m) => ({ cle: m[1], combien: Number(m[2]), sol: m[3] === 'true' }));
}

/* Ce que la page peint : on releve la destination de chaque planche de decor,
   plus les tuiles de sol, qui nous diront ou passent les chemins. */
const espionne = () => `(() => {
  const C = CanvasRenderingContext2D.prototype;
  if (C.__espionDec) return;
  C.__espionDec = true;
  window.__dec = []; window.__solX = {};
  const di = C.drawImage;
  C.drawImage = function (im) {
    const u = (im && (im.currentSrc || im.src)) || '';
    const n = arguments.length;
    const d = n >= 9 ? 5 : 1;
    /* ---- LE NOM VIENT DU FICHIER, PAS D'UNE LISTE ----
     * Il y avait ici trois noms ecrits en dur : herbe, magie, arbres. Dans un
     * essai qui declare pourtant, vingt lignes plus haut, ne PAS recopier les
     * familles, pour que le jour ou une cinquieme arrive il l'exige sans qu'on
     * y pense. La liste etait bien derivee ; le motif qui reconnait les
     * planches, lui, etait grave dans la pierre.
     * La lisiere est arrivee : l'essai a exige qu'elle pose quelque chose et
     * n'a jamais pu en compter une seule. Il annoncait 0 sur 52 et accusait le
     * semis d'un defaut qui etait le sien.
     * Le nom se lit donc dans le chemin du fichier, qui EST la cle : une
     * famille nomme sa planche nexus_<cle>.webp.
     * Et pas de guillemet oblique dans ce commentaire : il vit a l'interieur
     * d'un litteral de gabarit, ou le moindre en refermerait la chaine. */
    const m = u.match(/nexus_(\\w+)\\.webp/);
    if (m && n >= 5) {
      window.__dec.push({ f: m[1],
                          x: Math.round(arguments[d] + arguments[d + 2] / 2),
                          y: Math.round(arguments[d + 1] + arguments[d + 3]),
                          l: Math.round(arguments[d + 2]),
                          h: Math.round(arguments[d + 3]) });
    }
    /* Les cases de CHEMIN, relevees par leur planche : c'est la page qui sait
       ou elle en pose, et le refaire ici serait refaire son calcul. */
    if (/ground_path\\.webp/.test(u) && n >= 5) {
      window.__solX[Math.round(arguments[d]) + ',' + Math.round(arguments[d + 1])] = 1;
    }
    return di.apply(this, arguments);
  };
})()`;

(async () => {
  const decl = famillesDeclarees();
  console.log('-- la source --');
  ok(decl.length >= 3, `${decl.length} familles de decor declarees : ${decl.map((f) => f.cle).join(', ')}`);

  const site = await servirLeSite(SITE);
  const nav = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const base = `http://127.0.0.1:${site.port}`;

  const releve = async () => {
    const p = await nav.newPage({ viewport: { width: 1600, height: 1000 } });
    const erreurs = [];
    p.on('pageerror', (e) => erreurs.push(String(e).slice(0, 160)));
    await p.goto(base + '/nexus.html', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(2000);
    await p.evaluate(espionne());
    /* On DEZOOME au maximum : le decor n'est peint que s'il touche l'ecran, et
       une vue serree ne montrerait qu'un coin de la place. */
    await p.evaluate(() => {
      const e = document.getElementById('nxVuePct');
      if (e) { e.value = 1800; e.dispatchEvent(new Event('input', { bubbles: true })); }
    });
    await p.waitForTimeout(1200);
    /* ---- UN OBJET, PAS UNE TRAME ----
     * La page repeint TOUT a chaque image : sans ce dedoublonnage, l'essai
     * comptait quatorze mille quatre cents touffes pour trois cents posees, et
     * deux releves ne pouvaient jamais avoir le meme total puisqu'ils
     * n'avaient pas dure le meme nombre de trames. On ne veut pas les coups de
     * pinceau, on veut les OBJETS. */
    const out = await p.evaluate(() => {
      const vus = {};
      for (const d of window.__dec) vus[d.f + ':' + d.x + ':' + d.y] = d;
      return { dec: Object.values(vus), sol: Object.keys(window.__solX) };
    });
    await p.close();
    return { ...out, erreurs };
  };

  console.log('\n-- ce que la page peint --');
  const a = await releve();
  ok(a.erreurs.length === 0, 'aucune erreur de page' + (a.erreurs.length ? ' — ' + a.erreurs[0] : ''));

  /* 1. CHAQUE FAMILLE POSE. Le defaut qui est arrive deux fois. */
  const parFamille = {};
  a.dec.forEach((d) => { parFamille[d.f] = (parFamille[d.f] || 0) + 1; });
  for (const f of decl) {
    const vus = parFamille[f.cle] || 0;
    ok(vus > 0, `« ${f.cle} » pose quelque chose (${vus} vus a l'ecran sur ${f.combien} demandes)`);
    /* Et pas trois sur trois cents : une famille qui ne trouve presque jamais
       de place est une famille dont le reglage est faux, meme si elle n'est
       pas vide. */
    ok(vus >= f.combien * 0.4,
       `et pas une poignee : ${vus} sur ${f.combien}, soit ${Math.round(vus / f.combien * 100)} %`);
  }

  /* ---- LA GEOMETRIE DE LA CARTE SE LIT DANS LA SOURCE ----
   * Elle etait ecrite en dur ici : la tuile a 128, et surtout le centre a
   * (1280, 928), c'est-a-dire le centre d'une carte de vingt sur quinze. Le
   * jour ou la carte a grandi pour faire place a la lisiere et a la riviere,
   * tous les rectangles de batiment reconstruits ici se sont retrouves decales
   * de cinq cent douze unites — et l'essai a annonce trente-cinq objets
   * plantes dans des facades qui n'etaient plus la.
   * Meme lecon que l'espion vingt lignes plus haut, dans le meme fichier : ce
   * qui est derive resiste au changement, ce qui est grave l'accuse. */
  const geo = (() => {
    const src = fs.readFileSync(path.join(SITE, 'nexus.js'), 'utf8');
    const t = Number(/var TUILE = (\d+)/.exec(src)[1]);
    const c = /var CARTE = \{ cols: (\d+), rows: (\d+) \}/.exec(src);
    const d = /y: MONDE\.h \/ 2 - (\d+)/.exec(src);
    return { T: t, cx: c[1] * t / 2, cy: c[2] * t / 2 - Number(d[1]) };
  })();
  console.log(`   carte lue dans la source : tuile ${geo.T}, centre ${geo.cx},${geo.cy}`);

  /* 2. RIEN SUR UN CHEMIN. Les cases de chemin viennent du DESSIN de la page. */
  console.log('\n-- rien sur les allees --');
  {
    const T = geo.T;
    const chemin = new Set(a.sol.map((k) => {
      const [x, y] = k.split(',').map(Number);
      return Math.round(x / T) + ',' + Math.round(y / T);
    }));
    const dessus = a.dec.filter((d) => chemin.has(Math.floor(d.x / T) + ',' + Math.floor(d.y / T)));
    ok(dessus.length === 0,
       `aucun des ${a.dec.length} objets n'est plante dans une allee` +
       (dessus.length ? ` — ${dessus.length} le sont, dont ${dessus[0].f} en (${dessus[0].x},${dessus[0].y})` : ''));
  }

  /* 3. RIEN DANS UNE FACADE. Les lieux viennent de la source, avec leur
        rectangle : c'est lui qu'on ecarte, pas le rayon d'ouverture. */
  console.log('\n-- rien dans les facades --');
  {
    const src = fs.readFileSync(path.join(SITE, 'nexus.js'), 'utf8');
    const bloc = src.slice(src.indexOf('var LIEUX = ['), src.indexOf('LIEUX.forEach(function (l) { l.img'));
    const lieux = [...bloc.matchAll(/x: CENTRE\.x ([-+]) (\d+), y: CENTRE\.y ([-+]) (\d+), larg: (\d+), haut: (\d+)/g)]
      .map((m) => ({ x: geo.cx + (m[1] === '-' ? -1 : 1) * Number(m[2]),
                     y: geo.cy + (m[3] === '-' ? -1 : 1) * Number(m[4]),
                     larg: Number(m[5]), haut: Number(m[6]) }));
    ok(lieux.length >= 5, `${lieux.length} batiments relus dans la source`);
    const dedans = a.dec.filter((d) => lieux.some((l) =>
      Math.abs(d.x - l.x) < l.larg / 2 && d.y < l.y + 10 && d.y > l.y - l.haut));
    /* ---- ET AUCUN NE RECOUVRE UN BATIMENT ----
     *
     * Le controle du dessus regarde les PIEDS. Il ne dit donc rien d'un objet
     * dont les pieds sont ailleurs mais dont le DESSIN monte par-dessus un
     * batiment — et c'est exactement le defaut qui est arrive : la lisiere a
     * des cases deux fois plus hautes que larges, sa taille reglait la largeur,
     * et chaque bouquet montait a huit cent quarante unites. Une bande de pieds
     * le long du bord devenait un rideau qui recouvrait l'arcade, la table de
     * blackjack, les Series et la porte +18. Mesure faite apres coup : son
     * sommet montait a 1774.
     * Rien ne l'a signale. Aucune erreur, aucun essai rouge — il a fallu qu'un
     * joueur regarde son telephone. C'est le genre de defaut qui merite un
     * gardien, parce que l'oeil ne repasse pas a chaque fois.
     *
     * On ne regarde que le decor qui se TRIE : celui du sol est peint sous les
     * batiments, une touffe d'herbe sous une facade ne cache rien. Ce qui se
     * trie, lui, passe devant des que ses pieds sont plus bas. */
    const trie = new Set(decl.filter((f) => !f.sol).map((f) => f.cle));
    const rideaux = a.dec.filter((d) => trie.has(d.f) && d.l && d.h).filter((d) => lieux.some((l) =>
      d.y > l.y                                        // il passe DEVANT
      && d.x + d.l / 2 > l.x - l.larg / 2 + 20         // et son dessin
      && d.x - d.l / 2 < l.x + l.larg / 2 - 20         // mord sur le sien
      && d.y - d.h < l.y - 20));
    ok(rideaux.length === 0,
       `aucun decor ne recouvre un batiment` +
       (rideaux.length ? ` — ${rideaux.length} le font, dont ${rideaux[0].f} en ` +
        `(${rideaux[0].x},${rideaux[0].y}), haut de ${rideaux[0].h}` : ''));

    ok(dedans.length === 0,
       `aucun objet n'a pousse dans une facade` +
       (dedans.length ? ` — ${dedans.length}, dont ${dedans[0].f} en (${dedans[0].x},${dedans[0].y})` : ''));
  }

  /* 4. LE MEME DECOR A CHAQUE FOIS. */
  console.log('\n-- la place ne se rearrange pas --');
  {
    const b = await releve();
    const cle = (l) => l.map((d) => d.f + ':' + d.x + ':' + d.y).sort().join('|');
    ok(cle(a.dec) === cle(b.dec),
       `deux chargements donnent exactement le meme decor (${a.dec.length} et ${b.dec.length} objets)`);
  }

  await nav.close(); site.stop();
  console.log(`\ndecor_nexus_page.test.js — ${n} verifications, ${rates} echec(s)`);
  process.exit(rates ? 1 : 0);
})();
