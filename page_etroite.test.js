'use strict';
/*
 * SUR UN ECRAN ETROIT, LA PAGE NE SE DECALE PAS SUR LE COTE.
 *
 * ---- ce qui etait signale ----
 *
 * « https://swoleeswoge.dog/swogebet.html toujours le soucis en fait », avec
 * une capture prise dans le navigateur de Telegram sur iPhone : la page y est
 * POUSSEE vers la gauche. La marque « SWOGE / WORLD » s'y lit « OGE / LD »,
 * « PLAYERS » s'y lit « AYERS », la rangee de navigation est coupee aux deux
 * bouts, et la banniere passe sous le bord droit. Tout est decale du meme
 * nombre de pixels : ce n'est pas un element trop large, c'est la page
 * entiere qui a glisse.
 *
 * ---- pourquoi elle glissait ----
 *
 * La rangee de connexion porte deux boutons en `white-space:nowrap` —
 * « CONNECT WALLET » (165 px) et « SIGN UP — EMAIL » (159 px), plus 8 px de
 * gouttiere : 332 px que rien ne peut retrecir. Elle etait aussi en
 * `flex-wrap:nowrap !important`, donc elle ne pouvait pas non plus se replier.
 *
 * Sur un ecran de 320 points — un iPhone avec le zoom d'affichage en « texte
 * plus grand », un iPhone SE — il reste 288 px de contenu. Le navigateur ne
 * peut alors ni couper ni replier : il ELARGIT la fenetre de mise en page a
 * 348 px et laisse l'utilisateur balayer. D'ou le decalage, et sa mesure
 * exacte : 348 - 320 = 28 px.
 *
 * `body{overflow-x:hidden}` n'y pouvait rien : il n'y avait pas de
 * debordement a masquer. La fenetre elle-meme etait devenue plus large que
 * l'ecran.
 *
 * Onze autres pages portaient la meme rangee et le meme defaut ; seule
 * `swogebet.html` avait ete signalee.
 *
 * ---- ce que cet essai tient ----
 *
 * Il ne lit pas la feuille de style. Sur CHAQUE page du site, a 320 points de
 * large, il compare la fenetre de mise en page a l'ecran. Tant que les deux
 * sont egales, la page ne peut pas glisser. C'est la seule mesure qui compte,
 * et elle attrape la prochaine boite indeformable ou qu'elle apparaisse.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) {}
if (!chromium) { console.log('page_etroite.test.js : playwright absent — essai saute'); process.exit(0); }

const SITE = __dirname;
let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };

const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.webp': 'image/webp',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.css': 'text/css', '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg', '.json': 'application/json', '.svg': 'image/svg+xml' };

/* 320 : l'iPhone SE, et tout iPhone dont le proprietaire a mis le zoom
   d'affichage sur « texte plus grand » — c'est le cas signale. */
const LARGE = 320;

(async () => {
  const s = http.createServer((q, r) => {
    const f = path.join(SITE, decodeURIComponent(q.url.split('?')[0]));
    fs.readFile(f, (e, d) => {
      if (e) { r.writeHead(404); return r.end(); }
      r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
      r.end(d);
    });
  });
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  const port = s.address().port;
  const nav = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const ctx = await nav.newContext({ viewport: { width: LARGE, height: 568 },
                                     isMobile: true, hasTouch: true });
  await ctx.route('**/cdnjs.cloudflare.com/**', (r) => r.abort());

  const pages = fs.readdirSync(SITE).filter((f) => f.endsWith('.html')).sort();
  console.log(`-- ${pages.length} pages a ${LARGE} points de large --`);

  for (const f of pages) {
    const p = await ctx.newPage();
    let mesure = null;
    try {
      await p.goto(`http://127.0.0.1:${port}/${f}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
      /* On laisse le temps aux pastilles et aux rangees que les scripts
         ajoutent apres coup : c'est justement une de ces rangees qui
         elargissait la fenetre, une ou deux secondes apres l'ouverture. */
      await p.waitForTimeout(2200);
      mesure = await p.evaluate(() => ({
        fenetre: window.innerWidth,
        ecran: document.documentElement.clientWidth,
        doc: document.documentElement.scrollWidth,
      }));
    } catch (e) { /* mesure reste nulle */ }
    await p.close();
    if (!mesure) { ok(false, `${f} : la page n'a pas pu s'ouvrir`); continue; }
    const glisse = Math.max(mesure.fenetre, mesure.doc) - LARGE;
    ok(glisse <= 0,
       glisse > 0
         ? `${f} : la page GLISSE de ${glisse} px (fenetre ${mesure.fenetre}, document ${mesure.doc})`
         : `${f} : fenetre et document a ${LARGE}, rien ne glisse`);
  }

  /* ---- ET LA RANGEE DE CONNEXION S'EST BIEN REPLIEE, PAS EFFACEE ----
   * Une rangee `display:none` passerait l'essai du dessus sans rien reparer.
   * On verifie donc qu'a 320 les deux boutons sont toujours la, l'un SOUS
   * l'autre — et qu'a 390, ou la place existe, ils sont restes cote a cote. */
  for (const [large, memeLigne] of [[LARGE, false], [360, true], [390, true]]) {
    const p = await nav.newPage({ viewport: { width: large, height: 700 },
                                  isMobile: true, hasTouch: true });
    await p.route('**/cdnjs.cloudflare.com/**', (r) => r.abort());
    await p.goto(`http://127.0.0.1:${port}/swogebet.html`, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(1600);
    const v = await p.evaluate(() => {
      const r = document.getElementById('connRow');
      if (!r) return null;
      const b = [...r.querySelectorAll('button')]
        .filter((e) => getComputedStyle(e).display !== 'none')
        .map((e) => { const c = e.getBoundingClientRect();
                      return { haut: c.top, bas: c.bottom, d: Math.round(c.right) }; });
      /* « Sur la meme ligne » ne veut pas dire « meme `top` au pixel pres » :
         les deux boutons n'ont pas tout a fait la meme hauteur et le centrage
         les decale d'un pixel. On regarde donc s'ils se CHEVAUCHENT en
         hauteur — deux boutons empiles, eux, ne se touchent pas. */
      const chevauche = b.length > 1
        && b.every((x) => x.haut < b[0].bas - 2 && x.bas > b[0].haut + 2);
      return { n: b.length, memeLigne: chevauche,
               dehors: b.filter((x) => x.d > document.documentElement.clientWidth + 1).length };
    });
    await p.close();
    ok(v && v.n >= 2, `a ${large} : les deux boutons de connexion sont la (${v ? v.n : 0})`);
    if (!v || v.n < 2) continue;
    ok(v.memeLigne === memeLigne,
       memeLigne ? `a ${large} : ils tiennent cote a cote comme avant`
                 : `a ${large} : ils se sont empiles au lieu de pousser l'ecran`);
    ok(v.dehors === 0, `a ${large} : aucun des deux ne depasse le bord droit`);
  }

  await ctx.close(); await nav.close(); s.close();
  console.log(rates ? `\npage_etroite.test.js : ${rates} echec(s) sur ${n}\n`
                    : `\npage_etroite.test.js : ${n} verifications OK\n`);
  process.exit(rates ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
