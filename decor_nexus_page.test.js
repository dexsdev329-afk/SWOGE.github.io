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
  return [...bloc.matchAll(/cle: '(\w+)'[\s\S]*?combien: (\d+)/g)]
    .map((m) => ({ cle: m[1], combien: Number(m[2]) }));
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
    const m = u.match(/nexus_(herbe|magie|arbres)\\.webp/);
    if (m && n >= 5) {
      window.__dec.push({ f: m[1],
                          x: Math.round(arguments[d] + arguments[d + 2] / 2),
                          y: Math.round(arguments[d + 1] + arguments[d + 3]) });
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

  /* 2. RIEN SUR UN CHEMIN. Les cases de chemin viennent du DESSIN de la page. */
  console.log('\n-- rien sur les allees --');
  {
    const T = 128;
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
      .map((m) => ({ x: 1280 + (m[1] === '-' ? -1 : 1) * Number(m[2]),
                     y: 928 + (m[3] === '-' ? -1 : 1) * Number(m[4]),
                     larg: Number(m[5]), haut: Number(m[6]) }));
    ok(lieux.length >= 5, `${lieux.length} batiments relus dans la source`);
    const dedans = a.dec.filter((d) => lieux.some((l) =>
      Math.abs(d.x - l.x) < l.larg / 2 && d.y < l.y + 10 && d.y > l.y - l.haut));
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
