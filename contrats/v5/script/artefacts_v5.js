#!/usr/bin/env node
/* ============================================================
   SWOGE V5 — LES ARTEFACTS QUE LIT LA PAGE DE DEPLOIEMENT (v5_deploy.html)

   Hors chaine, aucune cle, aucune transaction : ce script relit la sortie de
   `forge build` et n'en garde que ce qui est public — le code d'init
   (bytecode), l'ABI, le code deploye et la place de ses `immutable`, et les
   metadonnees du compilateur (pour la verification Sourcify, README etape 5).

     forge build --root <racine>          # foundry.toml du README, sources sous contrats/v5/src
     node contrats/v5/script/artefacts_v5.js <racine>/out

   Sortie : contrats/v5/build/v5_artefacts.json.

   La page ne peut pas savoir si ces octets viennent des sources du depot :
   chaque artefact porte donc l'empreinte keccak256 de chaque source (celle
   que solc ecrit lui-meme dans ses metadonnees). L'essai
   v5_deploy_page.test.js relit les fichiers de contrats/v5/src et tombe si
   une seule empreinte differe — un artefact perime est un deploiement d'un
   autre code que celui qu'on a teste.
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');

const OUT = process.argv[2];
if (!OUT || !fs.existsSync(OUT)) {
  console.error('usage : node contrats/v5/script/artefacts_v5.js <dossier out de forge>');
  process.exit(1);
}
const SORTIE = path.join(__dirname, '..', 'build', 'v5_artefacts.json');
// l'ordre des cinq transactions de DeployV5.s.sol
const CONTRATS = ['SwogeDeployerV5', 'SwogeHookV5', 'SwogeLaunchpadV5', 'SwogeHoldersV5', 'SwogeAllocV5'];

const res = { genere: new Date().toISOString(), compilateur: null, reglages: null, sources: {}, contrats: {} };
for (const c of CONTRATS) {
  const f = path.join(OUT, c + '.sol', c + '.json');
  const a = JSON.parse(fs.readFileSync(f, 'utf8'));
  const meta = JSON.parse(a.rawMetadata);
  const reg = { evmVersion: meta.settings.evmVersion, optimizer: meta.settings.optimizer, viaIR: !!meta.settings.viaIR,
    bytecodeHash: meta.settings.metadata && meta.settings.metadata.bytecodeHash };
  if (!res.compilateur) { res.compilateur = meta.compiler.version; res.reglages = reg; }
  if (res.compilateur !== meta.compiler.version || JSON.stringify(res.reglages) !== JSON.stringify(reg)) {
    throw new Error(c + ' : compile avec d\'autres reglages que les autres modules');
  }
  for (const [p, s] of Object.entries(meta.sources)) {
    if (!p.startsWith('contrats/v5/src/')) continue;
    if (res.sources[p] && res.sources[p] !== s.keccak256) throw new Error('deux empreintes pour ' + p);
    res.sources[p] = s.keccak256;
  }
  const code = a.bytecode.object, runtime = a.deployedBytecode.object;
  if (!/^0x[0-9a-f]+$/.test(code) || /__\$/.test(code)) throw new Error(c + ' : bytecode illisible ou bibliotheque non liee');
  /* Le code deploye, et ou le constructeur ecrit ses `immutable` : la page compare le code lu
     sur la chaine a celui-ci, octet par octet, ces plages seules masquees. Puis elle relit chaque
     `immutable` par son getter. */
  const immuables = [];
  for (const refs of Object.values(a.deployedBytecode.immutableReferences || {})) {
    for (const r of refs) immuables.push([r.start, r.length]);
  }
  immuables.sort((x, y) => x[0] - y[0]);
  res.contrats[c] = {
    abi: a.abi,
    bytecode: code,
    runtime,
    runtimeOctets: (runtime.length - 2) / 2,
    immuables,
    metadata: a.rawMetadata,
  };
}
fs.mkdirSync(path.dirname(SORTIE), { recursive: true });
fs.writeFileSync(SORTIE, JSON.stringify(res) + '\n');
console.log('solc', res.compilateur, '·', Object.keys(res.sources).length, 'sources ·',
  CONTRATS.map((c) => c + ' ' + res.contrats[c].runtimeOctets + ' o').join(', '));
console.log('ecrit :', SORTIE);
