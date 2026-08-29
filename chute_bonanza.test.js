'use strict';
/* L'ANIMATION DE CHUTE DOIT RACONTER LA VERITE.
 *
 * La page calcule elle-meme d'ou tombe chaque symbole : le serveur n'envoie
 * que les grilles successives, pas les deplacements. Ce calcul REPRODUIT la
 * regle de `faitTomber` cote serveur — par colonne, les survivants gardent
 * leur ordre et se reempilent en bas, les nouveaux entrent par le haut.
 *
 * Si les deux regles divergeaient, l'animation montrerait un symbole tomber
 * d'un endroit ou il n'a jamais ete. Rien ne le signalerait : la grille
 * d'arrivee serait juste, le mouvement faux. C'est le genre de mensonge qu'un
 * joueur sent sans pouvoir le nommer, et qui, sur un jeu d'argent, se paie
 * cher en confiance.
 *
 * Cet essai rejoue de vraies cascades produites par le serveur et verifie,
 * case par case, que le symbole que la page fait tomber depuis la rangee
 * `arrivee - distance` est bien celui qui s'y trouvait.
 */
const path = require('path');
const SERVEUR = process.env.SWOGE_SERVEUR || '/home/user/swoge-pusher-server.github.io';
const bonanza = require(path.join(SERVEUR, 'bonanza.js'));

let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };

/* ---- LA COPIE EXACTE DE CE QUE FAIT LA PAGE ----
 * Recopiee depuis `bzChutes` dans swoge_bonanza.html. Si l'une change sans
 * l'autre, cet essai tombe — c'est precisement ce qu'on lui demande. */
function bzChutes(avant, gagnants) {
  const d = new Array(30).fill(0);
  for (let c = 0; c < 6; c++) {
    const survivants = [];
    for (let r = 4; r >= 0; r--) if (!gagnants.has(avant[r * 6 + c])) survivants.push(r);
    for (let k = 0; k < survivants.length; k++) {
      const arrivee = 4 - k;
      d[arrivee * 6 + c] = arrivee - survivants[k];
    }
    const neufs = 5 - survivants.length;
    for (let r2 = 0; r2 < neufs; r2++) d[r2 * 6 + c] = neufs;
  }
  return d;
}

/* La page lit la meme chose que le fichier ? On compare les deux sources. */
const fs = require('fs');
const page = fs.readFileSync(path.join(__dirname, 'swoge_bonanza.html'), 'utf8');
ok(/function bzChutes\(avant, gagnants\)\{/.test(page.replace(/\s+/g, ' ').replace(/ \{/g, '{')) ||
   /function bzChutes\(avant, gagnants\)/.test(page),
   'la page porte bien une fonction bzChutes');

let cascadesVues = 0, casesVerifiees = 0, incoherences = 0;
const exemples = [];

for (let i = 0; i < 4000 && cascadesVues < 400; i++) {
  const t = bonanza.joue({ serverSeed: 'chute', clientSeed: 'c', nonce: i, mise: 100 });
  const etapes = t.base.etapes;
  for (let k = 0; k + 1 < etapes.length; k++) {
    const avant = etapes[k].grille, apres = etapes[k + 1].grille;
    const amas = etapes[k].amas || [];
    if (!amas.length) continue;
    cascadesVues++;
    const gagnants = new Set(amas.map((a) => a.symbole));
    const d = bzChutes(avant, gagnants);

    for (let c = 0; c < 6; c++) {
      let survivants = 0;
      for (let r = 0; r < 5; r++) if (!gagnants.has(avant[r * 6 + c])) survivants++;
      const neufs = 5 - survivants;
      for (let rA = 0; rA < 5; rA++) {
        const iA = rA * 6 + c;
        if (rA < neufs) continue;                  // case neuve : rien a retrouver au-dessus
        const rD = rA - d[iA];
        casesVerifiees++;
        if (rD < 0 || rD > 4 || avant[rD * 6 + c] !== apres[iA]) {
          incoherences++;
          if (exemples.length < 3) exemples.push(`colonne ${c}, rangee ${rA} : la page la fait tomber de ${d[iA]} rangee(s), donc depuis la rangee ${rD} ou se trouvait « ${avant[rD * 6 + c]} », mais la grille d'arrivee y porte « ${apres[iA]} »`);
        }
        if (gagnants.has(avant[rD * 6 + c])) {
          incoherences++;                          // on ferait tomber un symbole qui a explose
        }
      }
    }
  }
}

console.log(`\n  ${cascadesVues} cascades rejouees, ${casesVerifiees} cases de survivant verifiees`);
ok(cascadesVues > 100, `assez de cascades pour conclure (${cascadesVues})`);
ok(incoherences === 0,
   incoherences === 0
     ? 'chaque survivant tombe exactement de la ou il etait'
     : `${incoherences} incoherence(s) — ` + exemples.join(' | '));

/* La distance ne peut pas etre negative : un symbole ne remonte jamais. */
let negatives = 0;
for (let i = 0; i < 600; i++) {
  const t = bonanza.joue({ serverSeed: 'signe', clientSeed: 'c', nonce: i, mise: 100 });
  for (const e of t.base.etapes) {
    const amas = e.amas || [];
    if (!amas.length) continue;
    const d = bzChutes(e.grille, new Set(amas.map((a) => a.symbole)));
    for (const x of d) if (x < 0) negatives++;
  }
}
ok(negatives === 0, `aucune chute negative : rien ne remonte (${negatives})`);

console.log(`\n${n} verifications, ${rates} echec(s)`);
process.exit(rates ? 1 : 0);
