'use strict';
/*
 * LE SCORE EN DIRECT, DU TABLEAU D'ESPN JUSQU'A LA LIGNE DE LA PAGE.
 *
 * ---- ce qui etait demande ----
 *
 * « comment avoir les score en direct des match comme flashscore », et
 * « nba affiche rien nfl aussi ».
 *
 * ---- ce que cet essai tient ----
 *
 * Il fait le chemin ENTIER, parce que chaque moitie peut marcher seule et la
 * chaine casser quand meme : un module qui apparie bien mais dont le serveur
 * n'attache rien, une page qui saurait dessiner un score qu'on ne lui envoie
 * jamais. On sert donc un vrai serveur, avec un vrai calendrier, un tableau
 * ESPN enregistre, et l'on REGARDE la page.
 *
 *   1. Une rencontre en cours montre son score et son minutage, pas l'heure
 *      du coup d'envoi — qui n'apprend plus rien une fois qu'on a commence.
 *   2. Une rencontre a venir montre toujours son heure.
 *   3. Un sport hors saison dit QUAND il revient. « Nothing on the board for
 *      this sport yet » n'avouait ni pourquoi ni jusqu'a quand, et un ecran
 *      qui ne dit rien se lit comme un ecran casse.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const net = require('net');
const path = require('path');

let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) {}
if (!chromium) { console.log('paris_direct.test.js : playwright absent — essai saute'); process.exit(0); }

const SITE = __dirname;
const SERVEUR = process.env.SWOGE_SERVEUR || '/home/user/swoge-pusher-server.github.io';
if (!fs.existsSync(path.join(SERVEUR, 'server.js'))) {
  console.log('paris_direct.test.js : serveur absent — essai saute'); process.exit(0);
}

let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };
const eq = (a, b, m) => ok(a === b, `${m} [${JSON.stringify(a)} vs ${JSON.stringify(b)}]`);

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
                '.webp': 'image/webp', '.png': 'image/png', '.css': 'text/css', '.mp4': 'video/mp4' };
function servirLeSite() {
  const http = require('http');
  return new Promise((res) => {
    const s = http.createServer((q, r) => {
      const f = path.join(SITE, decodeURIComponent(q.url.split('?')[0]));
      fs.readFile(f, (e, d) => {
        if (e) { r.writeHead(404); return r.end(); }
        r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
        r.end(d);
      });
    });
    s.listen(0, '127.0.0.1', () => res({ port: s.address().port, stop: () => s.close() }));
  });
}

(async () => {
  const VOL = fs.mkdtempSync(path.join(os.tmpdir(), 'direct-'));
  process.env.DATA_DIR = VOL;
  process.env.RPC_URL = ''; process.env.ADMIN_KEY = 'k';
  process.env.VAULT_ADDRESS = '0x1111111111111111111111111111111111111111';
  process.env.GAME_IMAGE_BASE = 'https://swoleeswoge.dog/media';

  const T = Date.now();
  const ENCOURS = T - 40 * 60000;          // commence il y a quarante minutes
  const APRES = T + 3 * 3600000;           // dans trois heures
  const RETOUR = T + 36 * 86400000;        // la reprise du sport absent

  /* ---- LE CALENDRIER ----
   * Deux rencontres de football : une en cours, une a venir. Et AUCUNE en
   * NBA — c'est le cas qu'on vient mesurer. */
  const cote = { '1': 1.8, N: 3.4, '2': 4.2 };
  const mk = (id, dom, ext, debut) => ({
    id, sport: 'foot', competition: 'Epl', pays: 'GB',
    /* Le catalogue veut une date LISIBLE, pas un nombre : `Date.parse` d'un
       entier rend NaN. C'est la meme porte que celle de l'import. */
    domicile: dom, exterieur: ext, debut: new Date(debut).toISOString(),
    source: { ligue: 'soccer_epl', evenement: id },
    marches: { '1n2': { cotes: cote } },
  });
  fs.writeFileSync(path.join(VOL, 'paris_catalogue.json'), JSON.stringify({
    sports: [{ cle: 'foot', nom: 'Football', actif: true },
             { cle: 'nba', nom: 'NBA', actif: true }],
    matchs: [mk('epl-live', 'Chelsea', 'Everton', ENCOURS),
             mk('epl-plus-tard', 'Arsenal', 'Fulham', APRES)],
  }, null, 1));

  /* ---- LE TABLEAU D'ESPN, ENREGISTRE ----
   * Chelsea mene 2-1 a la 67e ; et la NBA ne reprend que dans cinq semaines.
   * `global.fetch` est remplace AVANT que le serveur ne demarre : c'est le
   * seul moment ou personne ne tient encore de reference dessus. */
  const vrai = global.fetch;
  const ev = (dom, ext, sd, se, quand, etat, fini, detail) => ({
    date: quand, status: { type: { state: etat, completed: fini, shortDetail: detail } },
    competitions: [{ competitors: [
      { team: { displayName: dom }, score: sd }, { team: { displayName: ext }, score: se }] }],
  });
  let vus = 0;
  global.fetch = async (url, o) => {
    const u = String(url);
    if (!/espn\.com/.test(u)) return vrai(url, o);
    vus++;
    const rep = (d) => ({ ok: true, status: 200, json: async () => d });
    if (/soccer\/eng\.1/.test(u)) {
      return rep({ events: [ev('Chelsea', 'Everton', '2', '1',
                               new Date(ENCOURS).toISOString(), 'in', false, "67'")] });
    }
    if (/basketball\/nba/.test(u)) {
      return rep({ events: [ev('Miami Heat', 'Toronto Raptors', '0', '0',
                               new Date(RETOUR).toISOString(), 'pre', false, 'Scheduled')] });
    }
    return rep({ events: [] });
  };

  const port = await new Promise((r) => { const s = net.createServer(); s.listen(0, () => { const q = s.address().port; s.close(() => r(q)); }); });
  process.env.PORT = String(port);
  process.chdir(SERVEUR);
  const tg = require.resolve(path.join(SERVEUR, 'telegram'));
  require.cache[tg] = { id: tg, filename: tg, loaded: true, exports: {
    notify(){}, notifyPhoto(){}, sendDocument(){}, chatEstPublic(){return true;}, enabled(){return true;} } };
  require(path.join(SERVEUR, 'server'));
  await new Promise((r) => setTimeout(r, 1500));

  /* La route publique, d'abord : c'est elle qui porte la mesure. Le premier
     appel amorce la releve, le second la lit — c'est voulu, rien n'attend le
     reseau pendant qu'un visiteur regarde. */
  const lis = async () => (await (await fetch(`http://127.0.0.1:${port}/paris/calendrier`)).json());
  await lis();
  await new Promise((r) => setTimeout(r, 1200));
  const cal = await lis();
  if (process.env.SWOGE_DEBUG_DIRECT) console.log('[dbg] reponse :', Object.keys(cal).join(','), '| directs', (cal.directs||[]).length, '| reprises', JSON.stringify(cal.reprises));

  console.log('\n-- ce que le serveur envoie --');
  ok(vus > 0, `le tableau d ESPN a ete consulte (${vus} fois)`);
  /* ---- LA REGLE QU'ON NE TOUCHE PAS ----
   * Une rencontre COMMENCEE n'est plus au tableau des paris : le serveur ferme
   * au coup d'envoi, et c'est ce qui empeche de miser en regardant le score.
   * Le direct vit donc dans sa propre liste. */
  ok(!(cal.matchs || []).some((m) => m.id === 'epl-live'),
     'la rencontre commencee n est PLUS pariable — la fermeture au coup d envoi tient');
  ok((cal.matchs || []).some((m) => m.id === 'epl-plus-tard'),
     'celle a venir reste au tableau');
  const live = (cal.directs || []).find((m) => m.id === 'epl-live');
  ok(!!live, `elle est au tableau du DIRECT (${(cal.directs || []).length} rencontre(s))`);
  if (live) {
    eq(live.score, '2-1', 'avec le score, dans notre ordre');
    eq(live.etat, 'in', 'et l etat « en cours »');
    eq(live.detail, "67'", 'et le minutage');
  }
  ok(!(cal.directs || []).some((m) => m.id === 'epl-plus-tard'),
     'et celle qui n a pas commence n y est pas');
  const rn = cal.reprises && Number(cal.reprises.nba);
  ok(!!rn && isFinite(rn),
     `la NBA annonce son retour (${rn ? new Date(rn).toISOString().slice(0, 10) : '—'})`);

  /* ---- ET MAINTENANT, CE QU'ON VOIT ---- */
  const site = await servirLeSite();
  const nav = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const p = await nav.newPage({ viewport: { width: 1400, height: 1000 } });
  const boum = [];
  p.on('pageerror', (e) => boum.push(e.message));
  await p.route('**/cdnjs.cloudflare.com/**', (r) => r.abort());
  await p.goto(`http://127.0.0.1:${site.port}/swogebet.html?server=ws://127.0.0.1:${port}`,
               { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(3500);

  console.log('\n-- ce que la page montre --');
  /* La liste est REPLIEE par tournoi — c'est voulu, et un autre essai le tient.
     On ouvre donc, comme un joueur qui veut parier. */
  await p.evaluate(() => {
    const t = document.querySelector('#sbListe .sb-tt, #sbListe [data-tournoi], #sbListe button');
    if (t) t.click();
  });
  await p.waitForTimeout(400);
  const vue = await p.evaluate(() => {
    const bloc = document.getElementById('sbDirect');
    return {
      directVu: !!bloc && !bloc.hidden,
      titre: ((bloc && bloc.querySelector('.sb-dt b')) || {}).textContent || '',
      directs: [...document.querySelectorAll('#sbDirect .sb-d')].map((d) => ({
        noms: [...d.querySelectorAll('.sb-deq span')].map((x) => x.textContent.trim()),
        score: (d.querySelector('.sb-dsc') || {}).textContent || null,
        detail: (d.querySelector('.sb-dq') || {}).textContent || null,
        bat: d.classList.contains('on'),
        boutons: d.querySelectorAll('button').length,
      })),
      lignes: [...document.querySelectorAll('.sb-m')].map((d) => ({
        noms: [...d.querySelectorAll('.sb-eq span')].map((x) => x.textContent.trim()),
        heure: (d.querySelector('.sb-h') || {}).textContent || null,
      })),
    };
  });
  ok(vue.directVu, 'le tableau du direct est visible');
  ok(/LIVE/i.test(vue.titre), `et il s annonce comme tel (${JSON.stringify(vue.titre)})`);
  const d1 = vue.directs[0];
  ok(!!d1, `il porte la rencontre en cours (${vue.directs.length})`);
  if (d1) {
    ok(d1.noms.join(' ').indexOf('Chelsea') >= 0, `avec ses deux camps (${d1.noms.join(' / ')})`);
    eq(d1.score, '2-1', 'et son score');
    eq(d1.detail, "67'", 'et son minutage');
    ok(d1.bat, 'marquee « en cours »');
    eq(d1.boutons, 0, 'et SANS un seul bouton : on ne parie plus dessus');
  }
  const l2 = vue.lignes.find((x) => x.noms.join(' ').indexOf('Arsenal') >= 0);
  ok(!!l2, `le tableau des paris garde la rencontre a venir (${vue.lignes.length} ligne(s))`);
  ok(l2 && !!l2.heure, l2 ? `avec son heure (${l2.heure})` : 'avec son heure');
  ok(!vue.lignes.some((x) => x.noms.join(' ').indexOf('Chelsea') >= 0),
     'et pas celle qui a commence');

  /* Le sport hors saison. */
  const chip = await p.evaluate(() => {
    const b = [...document.querySelectorAll('#sbSports button')]
      .find((x) => /nba/i.test(x.textContent));
    if (!b) return null;
    const r = { texte: b.textContent.trim(), grise: b.disabled };
    if (!b.disabled) b.click();
    return r;
  });
  await p.waitForTimeout(600);
  ok(!!chip, 'l onglet NBA existe');
  ok(chip && !chip.grise,
     'et il est TOUCHABLE — grise, sa raison n etait pas lisible');
  ok(chip && /Oct/i.test(chip.texte),
     `la pastille porte la date du retour (${chip ? JSON.stringify(chip.texte) : '—'})`);
  const vide = await p.evaluate(() => {
    const v = document.getElementById('sbVide');
    return { vu: v && !v.hidden, texte: (v || {}).textContent || '' };
  });
  ok(vide.vu, 'l onglet NBA montre un message');
  ok(/out of season/i.test(vide.texte) && /reopens/i.test(vide.texte),
     `qui dit que la saison est finie : ${JSON.stringify(vide.texte)}`);
  ok(!/yet\.$/.test(vide.texte),
     'et non plus « Nothing on the board for this sport yet », qui n avouait rien');

  ok(boum.length === 0, 'aucune erreur de page' + (boum.length ? ' — ' + boum[0] : ''));
  await nav.close(); site.stop();
  console.log(rates ? `\nparis_direct.test.js : ${rates} echec(s) sur ${n}\n`
                    : `\nparis_direct.test.js : ${n} verifications OK\n`);
  process.exit(rates ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
