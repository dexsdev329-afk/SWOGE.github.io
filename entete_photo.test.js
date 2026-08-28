'use strict';
/*
 * SUR TELEPHONE, LA PHOTO DE PROFIL EST DANS LA PREMIERE RANGEE.
 *
 * ---- ce qui etait signale ----
 *
 * « Sur telephone sur toutes les pages retire SWOGE WORLD en haut pour mettre
 * la photo de profil, ca prend trop de place », capture a l'appui : la photo,
 * avec son cadre de niveau, occupait une rangee A ELLE, sous la marque et les
 * pastilles.
 *
 * ---- l'addition qui ne tombait pas juste ----
 *
 * Sur 358 px de barre utile a 390 de fenetre : la marque en prend 116, la
 * rangee de pastilles (solde, cours, joueurs en ligne) 258, la photo 38, plus
 * les gouttieres. Il manque une quinzaine de pixels — et c'est la photo,
 * derniere de la rangee, qui passe a la ligne.
 *
 * Deux choses le reparent, et il fallait les deux :
 *
 *   1. Le mot « SWOGE WORLD » s'efface sous 620 px. La patte reste, avec son
 *      lien vers le Nexus. 82 px rendus.
 *   2. La rangee de pastilles annonce une taille naturelle de zero. Sans ca,
 *      les 82 px ne suffisaient pas : flexbox COUPE les lignes avant de
 *      RETRECIR, d'apres la taille naturelle de chaque element — le
 *      `flex-shrink` de la rangee ne s'appliquait qu'apres le depart de la
 *      photo. Ce sont maintenant les pastilles qui se replient, a droite,
 *      au lieu d'expulser la photo.
 *
 * Mesure avant / apres, a 390 px, connecte :
 *   swogebet 170 px d'en-tete et la photo en rangee 2  ->  124 px, rangee 1
 *   nexus    113 px et la photo en rangee 2            ->   71 px, rangee 1
 *   blackjack 117 px et la photo en rangee 2           ->   71 px, rangee 1
 *
 * ---- ce que cet essai tient ----
 *
 * Il MESURE, sur les pages qui portent la barre : la photo partage bien la
 * premiere rangee avec la patte, le mot ne prend plus un pixel de large sur
 * telephone, il est toujours entier sur un ecran d'ordinateur, et le lien de
 * la marque garde un nom lisible pour un lecteur d'ecran — un `display:none`
 * l'aurait rendu muet, ce qui passe inapercu a l'oeil.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) {}
if (!chromium) { console.log('entete_photo.test.js : playwright absent — essai saute'); process.exit(0); }

const SITE = __dirname;
let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };

const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.webp': 'image/webp',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.css': 'text/css', '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg', '.json': 'application/json', '.svg': 'image/svg+xml' };

/* Les pages de la capture : une barre avec les pastilles ET la photo. */
const PAGES = ['swogebet.html', 'nexus.html', 'swoge_blackjack.html',
               'swoge_casino.html', 'index.html', 'games.html'];

/* On rejoue l'etat de la capture — connecte : les boutons de connexion sont
   effaces, le solde porte sa valeur, et les deux autres pastilles sont posees
   a leurs largeurs relevees sur l'image. On ne peut pas ouvrir de vraie
   session dans un essai, et c'est justement l'etat connecte qui remplit la
   barre au point de chasser la photo. */
function connecte() {
  document.querySelectorAll('#connectBtn,#emailBtn,#connRow,#mnSignIn,.cx-wallet,.cx-mail')
    .forEach((e) => { e.style.display = 'none'; });
  const nav = document.querySelector('nav.sb-ancre');
  if (!nav) return false;
  const bal = document.getElementById('bal'); if (bal) bal.textContent = '15.00';
  const mk = (html, w) => {
    const s = document.createElement('span');
    s.innerHTML = html;
    s.setAttribute('style', 'box-sizing:border-box;display:inline-flex;align-items:center;'
      + 'justify-content:center;width:' + w + 'px;height:34px;border-radius:999px;'
      + 'background:#fff;border:1px solid #E1E9F6;font:800 12.5px sans-serif;white-space:nowrap');
    return s;
  };
  nav.appendChild(mk('&#8776; $0.0004', 77));
  nav.appendChild(mk('&#9679; 2', 34));
  return true;
}

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

  const lis = async (page, w, h, connecter) => {
    const p = await nav.newPage({ viewport: { width: w, height: h }, isMobile: w < 700, hasTouch: w < 700 });
    await p.route('**/cdnjs.cloudflare.com/**', (r) => r.abort());
    await p.route('**/vitrine.json', (r) => r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ joueurs: 22, volume: 43500000, manches: 12400, rendus: 43500000 }) }));
    await p.goto(`http://127.0.0.1:${port}/${page}`, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(2200);
    if (connecter) { await p.evaluate(connecte); await p.waitForTimeout(250); }
    const v = await p.evaluate(() => {
      const m = document.querySelector('.sw-marque');
      const mot = m && m.querySelector('span:not(.sw-patte)');
      const patte = m && m.querySelector('.sw-patte');
      const pr = document.getElementById('gxProfil');
      const pastilles = document.querySelector('nav.sb-ancre');
      const chiffres = document.querySelector('.sw-chiffres');
      const visible = (e) => e && !e.hidden && getComputedStyle(e).display !== 'none'
                          && e.getBoundingClientRect().height > 1;
      const R = (e) => { const r = e.getBoundingClientRect();
                         return { x: r.left, y: r.top, w: r.width, h: r.height }; };
      return {
        pastilles: visible(pastilles) ? R(pastilles) : null,
        chiffres: visible(chiffres) ? R(chiffres) : null,
        mot: mot ? R(mot) : null,
        motTexte: mot ? (mot.textContent || '').replace(/\s+/g, '') : '',
        patte: patte ? R(patte) : null,
        profil: pr && getComputedStyle(pr).display !== 'none' ? R(pr) : null,
        barre: document.querySelector('.sw-haut')
          ? Math.round(document.querySelector('.sw-haut').getBoundingClientRect().height) : 0,
        page: document.documentElement.scrollWidth,
        ecran: document.documentElement.clientWidth,
      };
    });
    const nom = await p.evaluate(() => {
      const a = document.querySelector('.sw-marque');
      return a ? (a.getAttribute('aria-label') || a.textContent || '').replace(/\s+/g, ' ').trim() : '';
    });
    await p.close();
    return Object.assign(v, { nom });
  };

  console.log('-- telephone (390 px), connecte --');
  for (const pg of PAGES) {
    const v = await lis(pg, 390, 800, true);
    if (!v.mot || !v.patte) { ok(false, `${pg} : pas de marque dans la barre`); continue; }
    ok(v.mot.w <= 1, `${pg} : le mot ne prend plus de largeur (${Math.round(v.mot.w)} px)`);
    ok(v.patte.w > 20, `${pg} : la patte reste, et le lien avec (${Math.round(v.patte.w)} px)`);
    ok(/SWOGE/i.test(v.nom), `${pg} : le lien garde un nom lisible (« ${v.nom} »)`);
    if (!v.profil) { ok(false, `${pg} : la photo de profil est absente`); continue; }
    /* Meme rangee = les deux boites se chevauchent verticalement. Comparer les
       `top` au pixel pres serait faux : la patte fait 34 px, la photo 38, et
       le centrage les decale de deux. */
    const memeRangee = v.profil.y < v.patte.y + v.patte.h - 2
                    && v.profil.y + v.profil.h > v.patte.y + 2;
    ok(memeRangee,
       memeRangee ? `${pg} : la photo est dans la premiere rangee, barre a ${v.barre} px`
                  : `${pg} : la photo est TOMBEE a la ligne (patte y=${Math.round(v.patte.y)},`
                    + ` photo y=${Math.round(v.profil.y)}), barre a ${v.barre} px`);
    ok(v.page <= v.ecran, `${pg} : et la page ne glisse pas (${v.page}/${v.ecran})`);

    /* ---- ET LE SOLDE EST A COTE DE LA PHOTO ----
     * DEMANDE : « les soldes devraient aller a cote de la photo de profil ».
     * Sur l'accueil et le hall, la rangee de pastilles etait posee APRES la
     * bande des chiffres du site : elle tombait sur une troisieme rangee, sous
     * « ROUNDS PLAYED », loin du compte auquel elle se rapporte. */
    if (!v.pastilles) { ok(false, `${pg} : la rangee de pastilles est absente`); continue; }
    const memeQuePhoto = v.pastilles.y < v.profil.y + v.profil.h - 2
                      && v.pastilles.y + v.pastilles.h > v.profil.y + 2;
    ok(memeQuePhoto,
       memeQuePhoto
         ? `${pg} : le solde est sur la meme rangee que la photo`
         : `${pg} : le solde est sur une AUTRE rangee que la photo`
           + ` (pastilles y=${Math.round(v.pastilles.y)}, photo y=${Math.round(v.profil.y)})`);
    if (v.chiffres) {
      const apres = v.chiffres.y >= v.profil.y + v.profil.h - 2;
      ok(apres,
         apres ? `${pg} : et les chiffres du site passent en dessous`
               : `${pg} : les chiffres du site sont remontes devant le compte`
                 + ` (chiffres y=${Math.round(v.chiffres.y)})`);
    }
  }

  console.log('\n-- ordinateur (1280 px) : le mot est entier --');
  for (const pg of ['index.html', 'swogebet.html', 'nexus.html']) {
    const v = await lis(pg, 1280, 800, false);
    ok(v.mot && v.mot.w > 60,
       `${pg} : « ${v.motTexte} » s'affiche (${v.mot ? Math.round(v.mot.w) : 0} px de large)`);
  }

  /* La bascule est a 620 px : c'est la largeur ou les barres passent deja en
     mode telephone. Une valeur differente donnerait deux mises en page qui se
     contredisent entre 620 et le nouveau seuil. */
  console.log('\n-- la bascule tombe bien a 620 px --');
  {
    const etroit = await lis('swogebet.html', 620, 800, false);
    const large = await lis('swogebet.html', 621, 800, false);
    ok(etroit.mot && etroit.mot.w <= 1, `a 620 le mot est efface (${etroit.mot ? Math.round(etroit.mot.w) : '-'} px)`);
    ok(large.mot && large.mot.w > 60, `a 621 il revient (${large.mot ? Math.round(large.mot.w) : '-'} px)`);
  }

  await nav.close(); s.close();
  console.log(rates ? `\nentete_photo.test.js : ${rates} echec(s) sur ${n}\n`
                    : `\nentete_photo.test.js : ${n} verifications OK\n`);
  process.exit(rates ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
