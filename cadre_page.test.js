/* LE JEU TIENT-IL DANS L'ECRAN ? — telephone, tablette, PC.
 *
 * ---- POURQUOI CE FICHIER EXISTE ----
 *
 * Trois pannes de cadrage ont ete signalees coup sur coup, toutes differentes,
 * toutes invisibles pour les essais existants :
 *
 *   1. LE MONDE ECRASE SUR TELEPHONE. Le canvas dimensionnait sa reserve de
 *      pixels sur la FENETRE (`innerHeight`) alors que sa boite CSS est plus
 *      courte de la hauteur des deux barres. Une reserve plus grande que sa
 *      boite ne deborde pas : le navigateur l'ECRASE dedans. Dix-huit pour
 *      cent en portrait, quarante-cinq en paysage — et tout ce que le jeu
 *      calcule a partir de la hauteur du canvas se trompait d'autant.
 *   2. UN ASCENSEUR FANTOME SUR PC. `body{padding-bottom}`, pose pour les
 *      pages qui defilent, rendait le document soixante-deux pixels plus haut
 *      que la fenetre sur une page qui ne defile jamais.
 *   3. L'ENGRENAGE DES REGLAGES HORS DE L'ECRAN. La ligne du nom reclamait
 *      176 pixels dans un panneau qui en offre 147 : le bouton finissait
 *      trente-sept pixels dehors, et rien ne disait qu'il fallait pousser le
 *      panneau de cote pour l'atteindre. Un reglage qu'on ne peut pas ouvrir
 *      n'existe pas.
 *
 * Les trois se ressemblent : RIEN NE CASSE. Pas d'erreur, pas de console
 * rouge, la page se charge et le jeu tourne. Seul un oeil sur un vrai
 * telephone les voit — et il les a vues trois fois de suite.
 *
 * ---- CE QU'ON MESURE, ET POURQUOI PAS AUTRE CHOSE ----
 *
 * On ne compare aucune capture d'ecran : une image de reference casse a
 * chaque retouche de couleur et finit desactivee. On mesure trois nombres qui
 * n'ont qu'une seule valeur juste, a n'importe quelle taille d'ecran :
 *
 *   A. le document ne depasse pas la fenetre, ni en hauteur ni en largeur ;
 *   B. la reserve de pixels du canvas vaut exactement sa boite CSS ;
 *   C. aucun element du panneau ne finit hors de l'ecran.
 *
 * Un element dans un conteneur qui DEFILE ne compte pas — il attend qu'on
 * descende — et un panneau FERME non plus, personne ne le voit. Sans ces deux
 * exclusions l'essai accuserait toutes les fenetres modales du site, crierait
 * a tort, et finirait ignore.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const http = require('http');

const SITE = __dirname;
let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) {}
if (!chromium) { console.log('cadre_page.test.js : playwright absent — essai saute'); process.exit(0); }

let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg', '.ico': 'image/x-icon' };

function servirLeSite() {
  return new Promise((res) => {
    const s = http.createServer((q, r) => {
      const u = decodeURIComponent(q.url.split('?')[0]);
      const f = path.join(SITE, u === '/' ? 'index.html' : u);
      if (!f.startsWith(SITE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
        r.writeHead(404); return r.end();
      }
      r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(r);
    });
    s.listen(0, '127.0.0.1', () => res({ port: s.address().port, stop: () => s.close() }));
  });
}

/* Les formats qu'on tient. Le premier est celui de la capture qui a signale la
   panne : le navigateur interne de Telegram sur iPhone. */
const ECRANS = [
  { nom: 'iPhone / Telegram  390x760', l: 390, h: 760, tel: true },
  { nom: 'iPhone 12 portrait 390x844', l: 390, h: 844, tel: true },
  { nom: 'iPhone SE          375x667', l: 375, h: 667, tel: true },
  { nom: 'iPhone paysage     844x390', l: 844, h: 390, tel: true },
  { nom: 'tablette           820x1100', l: 820, h: 1100, tel: true },
  { nom: 'portable          1440x900', l: 1440, h: 900, tel: false },
  { nom: 'PC                1920x1080', l: 1920, h: 1080, tel: false },
];

(async () => {
  const site = await servirLeSite();
  const nav = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });

  for (const e of ECRANS) {
    console.log('\n-- ' + e.nom + ' --');
    const p = await nav.newPage({ viewport: { width: e.l, height: e.h },
      deviceScaleFactor: e.tel ? 3 : 1, isMobile: e.tel, hasTouch: e.tel });
    await p.goto(`http://127.0.0.1:${site.port}/nexus.html`, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(2600);
    /* ---- LA BARRE DU BAS, COMME CHEZ UN JOUEUR CONNECTE ----
     * `stakebubble.js` ne la monte qu'une fois le joueur identifie, et c'est
     * PRECISEMENT le moment ou la panne 1 apparaissait : le cadre retrecit et
     * aucun evenement `resize` ne part. Sans elle, cet essai mesurerait la
     * page d'avant la connexion, c'est-a-dire pas celle qui cassait. */
    await p.evaluate(() => {
      if (document.querySelector('.swbb')) return;
      const st = document.createElement('style');
      st.textContent = '.swbb{position:fixed;left:0;right:0;bottom:0;z-index:2147482000;'
        + 'display:flex;background:#f4f7fc;border-top:1px solid rgba(11,27,54,.10);padding:5px 4px;}'
        + 'body{padding-bottom:var(--swbb-h)!important;}:root{--swbb-h:62px;}';
      document.head.appendChild(st);
      const d = document.createElement('div');
      d.className = 'swbb';
      d.innerHTML = '<button style="flex:1;height:52px">Play</button>'
        + '<button style="flex:1;height:52px">Bets</button>'
        + '<button style="flex:1;height:52px">Chests</button>'
        + '<button style="flex:1;height:52px">Profile</button>';
      document.body.appendChild(d);
    });
    await p.waitForTimeout(1000);

    const m = await p.evaluate(() => {
      const de = document.documentElement;
      const V = de.clientWidth, H = de.clientHeight;
      const c = document.getElementById('nxCanvas');
      const D = Math.min(window.devicePixelRatio || 1, 2);
      const rc = c.getBoundingClientRect();
      /* Ce qui DEFILE cache ce qui depasse, et ce qui est FERME ne se voit
         pas : ni l'un ni l'autre n'est un debordement. */
      const invisible = (el) => {
        for (let q = el; q; q = q.parentElement) {
          const s = getComputedStyle(q);
          if (s.display === 'none' || s.visibility === 'hidden'
              || s.opacity === '0' || s.pointerEvents === 'none') return true;
        }
        return false;
      };
      const defilant = (el) => {
        for (let q = el.parentElement; q; q = q.parentElement) {
          const s = getComputedStyle(q);
          if (/auto|scroll/.test(s.overflow + s.overflowY + s.overflowX)) return true;
        }
        return false;
      };
      const dehors = [];
      const pan = document.getElementById('nxPanneau');
      if (pan) {
        pan.querySelectorAll('*').forEach((el) => {
          if (invisible(el)) return;
          const r = el.getBoundingClientRect();
          if (r.width === 0 && r.height === 0) return;
          const d = Math.round(r.right - V);
          if (d > 1) dehors.push((el.id ? '#' + el.id : el.tagName.toLowerCase()) + ' (+' + d + ')');
        });
      }
      return {
        V, H,
        docL: de.scrollWidth, docH: de.scrollHeight,
        boiteL: Math.round(rc.width), boiteH: Math.round(rc.height),
        reserveL: Math.round(c.width / D), reserveH: Math.round(c.height / D),
        panL: pan ? pan.scrollWidth : 0, panUtile: pan ? pan.clientWidth : 0,
        dehors, defilant: !!defilant,
      };
    });

    ok(m.docH <= m.H + 1, `le document ne depasse pas en hauteur (${m.docH} pour ${m.H})`);
    ok(m.docL <= m.V + 1, `ni en largeur (${m.docL} pour ${m.V})`);
    ok(m.reserveH === m.boiteH && m.reserveL === m.boiteL,
       `la reserve du canvas vaut sa boite (${m.reserveL}x${m.reserveH} contre ${m.boiteL}x${m.boiteH})`);
    ok(m.panL <= m.panUtile,
       `le panneau tient dans sa largeur (contenu ${m.panL}, place ${m.panUtile})`);
    ok(m.dehors.length === 0,
       m.dehors.length ? `hors de l ecran : ${m.dehors.join(', ')}`
                       : 'aucun element du panneau ne finit hors de l ecran');

    /* ---- D. UN PANNEAU OUVERT N'EST PAS PEINT SOUS LA BARRE DU SITE ----
     * Quatrieme panne de cadrage, signalee comme les trois autres : « dans
     * l'editeur de maps on voit pas les boutons du haut ». Ils y etaient, a
     * leur place, dessines — sous `.sw-haut`, qui est `position:fixed` avec un
     * z-index de 220 quand les voiles de la page vivent entre 52 et 200.
     * Cinq boutons sur cinq inatteignables, a toutes les tailles, celui qui
     * FERME l'editeur compris.
     * On ne mesure donc pas une hauteur : on VISE chaque bouton et on demande
     * a la page qui repond a cet endroit. C'est la seule question qui ait la
     * meme reponse qu'un doigt. */
    const barre = await p.evaluate(() => {
      const v = document.getElementById('nxMapVoile');
      if (!v) return null;
      v.classList.add('on');
      const g = document.getElementById('nxMapGalerie');
      if (g) g.classList.add('on');
      const b = document.getElementById('nxMapBarre');
      if (!b) return null;
      const out = [];
      b.querySelectorAll('button, input').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) return;
        const q = document.elementFromPoint(Math.round(r.left + r.width / 2),
                                           Math.round(r.top + r.height / 2));
        if (!(q === el || el.contains(q))) {
          out.push((el.id || el.textContent || el.tagName).toString().trim().slice(0, 16)
                   + ' <- ' + (q ? (q.id ? '#' + q.id : q.tagName.toLowerCase()) : 'rien'));
        }
      });
      v.classList.remove('on');
      if (g) g.classList.remove('on');
      return { caches: out, combien: b.querySelectorAll('button, input').length };
    });
    ok(barre && barre.combien > 0, `la barre de l editeur a des boutons (${barre ? barre.combien : 0})`);
    ok(barre && barre.caches.length === 0,
       barre && barre.caches.length ? `recouverts : ${barre.caches.join(', ')}`
                                    : 'et aucun n est recouvert par la barre du site');
    await p.close();
  }

  await nav.close(); site.stop();
  console.log(`\ncadre_page.test.js — ${n} verifications, ${rates} echec(s)`);
  process.exit(rates ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
