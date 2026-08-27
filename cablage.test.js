/* CHAQUE BOUTON PEINT EST-IL BRANCHE A QUELQUE CHOSE ?
 *
 * ---- la panne que cet essai cherche ----
 *
 * Un panneau entier du bench a cesse de fonctionner sans que rien ne le dise.
 * En retirant un panneau voisin qui faisait doublon, la coupe a emporte le
 * MOTEUR de celui d'a cote : le balisage est reste — plaques peintes, titres,
 * champs — et plus une seule ligne de code ne le nommait. Generate, Play, Stop
 * et Send etaient toujours la, toujours cliquables. Ils ne faisaient plus rien.
 *
 * C'est la panne la plus difficile a voir de toutes : la page se charge, la
 * console reste vide, rien n'est grise ni barre. Le seul symptome est un clic
 * qui ne produit rien — et il faut penser a cliquer pour s'en apercevoir.
 * Aucune verification visuelle ne l'attrape, parce qu'il n'y a rien a voir.
 *
 * ---- ce qu'on mesure, dans les DEUX sens ----
 *
 * Une coupe trop large casse le lien entre le balisage et le code, et elle
 * peut tomber d'un cote comme de l'autre :
 *
 *   A. LE BALISAGE SURVIT AU CODE — un bouton que plus personne ne nomme.
 *      C'est le cas du bench : rien ne casse, rien ne se voit, le bouton ment.
 *   B. LE CODE SURVIT AU BALISAGE — du code qui cherche un element disparu.
 *      Celui-la, au moins, crie : `null.onclick` arrete toute la page. On le
 *      verifie quand meme, parce qu'il arrete la page ENTIERE, donc tout ce
 *      qui suit sur la page.
 *
 * ---- pourquoi c'est un essai STATIQUE ----
 *
 * Il ne lance aucun navigateur : il lit les vingt-sept pages et leur code. Un
 * essai qui doit ouvrir Chromium page par page coute une minute et ne tourne
 * jamais ; celui-ci coute une seconde, donc il tourne. La verification par le
 * CLIC existe aussi, sur la page qui a eu le probleme (`bench_page.test.js`) :
 * les deux se completent, celui-ci couvre tout le site en surface, l'autre va
 * au fond sur une page.
 *
 * ---- les trois facons legitimes de brancher un bouton ----
 *
 * On accepte les trois, sinon l'essai crierait sur du code correct :
 *   - par son IDENTIFIANT      `$("#gen").onclick = …`
 *   - par sa CLASSE, en delegation  `e.target.closest(".bo-x")`
 *   - par un attribut DATA, en delegation  `e.target.closest("[data-buy]")`
 * Un bouton qu'aucune des trois ne touche ne peut rien declencher.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const SITE = __dirname;
let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };

/* Le code que la page execute VRAIMENT : ses `<script>` en ligne, plus les
   fichiers .js du depot qu'elle charge. Un bouton branche par `stakebubble.js`
   est branche, meme si la page ne le nomme pas elle-meme. */
function codeDe(fichier) {
  const s = fs.readFileSync(path.join(SITE, fichier), 'utf8');
  const enLigne = [...s.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
    .map((m) => m[1]).join('\n');
  const externe = [...s.matchAll(/<script[^>]*\bsrc="([^":?]+\.js)/g)]
    .map((m) => m[1])
    .filter((u) => !/^https?:/.test(u) && fs.existsSync(path.join(SITE, u)))
    .map((u) => fs.readFileSync(path.join(SITE, u), 'utf8'))
    .join('\n');
  return { html: s, enLigne, tout: enLigne + '\n' + externe };
}

const PAGES = fs.readdirSync(SITE).filter((f) => f.endsWith('.html')).sort();

console.log('\n-- A. AUCUN BOUTON PEINT N EST ORPHELIN --');
{
  let boutons = 0;
  const orphelins = [];
  for (const f of PAGES) {
    const { html, tout } = codeDe(f);
    for (const m of html.matchAll(/<button\b([^>]*)>/g)) {
      const attrs = m[1];
      const id = (attrs.match(/\bid="([^"]+)"/) || [])[1];
      /* Un bouton SANS identifiant ne se branche que par classe ou par data,
         et ces deux formes sont deja couvertes par la page qui les emploie.
         On mesure ceux qui ont un identifiant : c'est la promesse la plus
         explicite qu'une page puisse faire — « ce bouton, quelqu'un le
         nomme ». */
      if (!id) continue;
      boutons++;
      const classes = ((attrs.match(/\bclass="([^"]*)"/) || [])[1] || '').split(/\s+/).filter(Boolean);
      const datas = [...attrs.matchAll(/\bdata-([a-z0-9-]+)/g)].map((x) => 'data-' + x[1]);
      const cite = (nom) => new RegExp('["\'`#.\\[]' + nom.replace(/-/g, '\\-') + '\\b').test(tout);
      if (!cite(id) && !classes.some(cite) && !datas.some(cite)) orphelins.push(`${f} → #${id}`);
    }
  }
  ok(boutons > 300, `il y a bien des boutons a verifier (${boutons} sur ${PAGES.length} pages)`);
  ok(orphelins.length === 0,
     orphelins.length
       ? `${orphelins.length} bouton(s) que RIEN ne nomme : ${orphelins.join(' | ')}`
       : `aucun des ${boutons} boutons n est orphelin`);
}

console.log('\n-- B. AUCUN CODE NE CHERCHE UN ELEMENT DISPARU --');
{
  /* On ne signale que le dereferencement IMMEDIAT — `$("#x").value` — c'est
     a dire celui qui arrete la page. `var e = $("#x"); if (e) …` est du code
     correct et volontaire : plusieurs pages partagent un meme script et ne
     portent pas toutes les memes elements. Crier dessus rendrait cet essai
     insupportable, donc ignore, donc inutile. */
  const casses = [];
  for (const f of PAGES) {
    const { html, enLigne } = codeDe(f);
    const ids = new Set([...html.matchAll(/\bid="([A-Za-z0-9_-]+)"/g)].map((m) => m[1]));
    /* ---- ON NEUTRALISE D ABORD LES FORMES PROTEGEES ----
     * `$("#x") && $("#x").checked` et `$("#x") ? $("#x").value : …` sont du
     * code CORRECT : le premier terme est la protection du second. Les lire
     * comme deux dereferencements ferait crier cet essai sur du bon code — et
     * un garde-fou qui crie a tort finit desactive, ce qui est precisement
     * comment on en arrive a la panne qu il surveille. On efface donc le terme
     * protecteur avant de compter, exactement comme on ignore deja
     * `var e = $("#x"); if (e) …`. */
    const scanne = enLigne.replace(
      /(?:getElementById\(\s*["'`]|\$\(\s*["'`]#?|querySelector\(\s*["'`]#)[A-Za-z0-9_-]+["'`]\s*\)\s*(?:&&|\?|\|\|)\s*/g, ' ');
    const vises = new Set();
    for (const m of scanne.matchAll(
      /(?:getElementById\(\s*["'`]|\$\(\s*["'`]#?|querySelector\(\s*["'`]#)([A-Za-z0-9_-]+)["'`]\s*\)\s*\./g)) {
      vises.add(m[1]);
    }
    for (const i of vises) if (!ids.has(i)) casses.push(`${f} → #${i}`);
  }
  ok(casses.length === 0,
     casses.length
       ? `${casses.length} dereferencement(s) vers un element absent : ${casses.join(' | ')}`
       : 'aucun code ne dereference un element que la page ne porte pas');
}

console.log('\n-- C. AUCUN NOM DECLARE PAR LE SERVEUR N EST SANS FICHIER --');
{
  /* ---- LA MEME PANNE, DE L AUTRE COTE DU RESEAU ----
   *
   * Un bouton que rien ne nomme ne fait rien et ne dit rien. Un NOM DE PLANCHE
   * que le serveur envoie et dont l image n existe pas fait exactement pareil :
   * la page demande le fichier, recoit un 404, et retombe en silence sur la
   * planche par defaut. Rien ne casse, la console du joueur est vide, et le
   * donjon se dessine avec le decor d un autre. C est comme ca que l arene a
   * passe une semaine a faire tomber la meteorite de FEU du Sanctuaire sous un
   * boss de foudre.
   *
   * On lit donc les noms que la table des donjons declare, et l on verifie que
   * chacun a ses fichiers. Le depot du serveur peut etre absent — cet essai
   * tourne aussi seul — auquel cas on saute, comme les autres.
   *
   * Les trois planches d une famille d effets sont exigees ENSEMBLE. Une
   * famille a moitie livree est le pire des cas : deux cercles bleus et une
   * pierre en flammes qui tombe au milieu, ce qui se lit comme un bug de
   * dessin et non comme un fichier manquant. */
  const SERVEUR = process.env.SWOGE_SERVEUR || '/home/user/swoge-pusher-server.github.io';
  const monde = path.join(SERVEUR, 'monde.js');
  if (!fs.existsSync(monde)) {
    console.log('  --   depot du serveur introuvable — section sautee');
  } else {
    const M = require(monde);
    const manquants = [];
    const attendu = [];
    for (const cle of Object.keys(M.DONJONS)) {
      const D = M.DONJONS[cle];
      if (D.sol) attendu.push(['sol', `img/nexus/tiles/ground_${D.sol}.webp`]);
      if (D.mur) attendu.push(['mur', `img/nexus/tiles/mur_${D.mur}.webp`]);
      if (D.decor) attendu.push(['decor', `img/nexus/tiles/obj_${D.decor}.webp`]);
      if (D.effets) {
        for (const q of ['annonce', 'onde', 'chute']) {
          attendu.push([`effets:${D.effets}`, `img/nexus/effets/${q}_${D.effets}.webp`]);
        }
      }
    }
    /* Et le dessin de chaque projectile que le monde nomme : un `sprite`
       inconnu ne leve rien non plus — le tir se dessine en navette grise, et
       le joueur n apprend plus ce qui lui arrive. */
    for (const e of Object.keys(M.MONSTRES)) {
      const t = M.MONSTRES[e].tir;
      if (t && t.sprite) attendu.push([`tir:${e}`, `img/nexus/tirs/${t.sprite}.webp`]);
    }
    for (const [quoi, f] of attendu) {
      if (!fs.existsSync(path.join(SITE, f))) manquants.push(`${quoi} → ${f}`);
    }
    ok(attendu.length > 20, `il y a bien des noms a verifier (${attendu.length})`);
    ok(manquants.length === 0,
       manquants.length
         ? `${manquants.length} nom(s) sans fichier : ${[...new Set(manquants)].join(' | ')}`
         : `les ${attendu.length} noms declares ont tous leur fichier`);
  }
}

console.log(`\ncablage.test.js — ${n} verifications, ${rates} echec(s)`);
process.exit(rates ? 1 : 0);
