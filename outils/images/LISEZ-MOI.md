# Images en lot

Deux outils, un dossier `sorties/` (ignoré par git).

## Rendu local, sans clé : `rendu.js`

Gabarit HTML → PNG par Chromium. Pour tout ce qui porte du texte : cartes X,
bannières, badges, avatars titrés. Aucune faute d'orthographe, même rendu à
chaque fois, autant d'images que d'entrées dans `cartes.json`.

```bash
NODE_PATH=<scratchpad>/pw/node_modules node outils/images/rendu.js outils/images/cartes.json
```

Gabarits dans `gabarits/` (`carte.html` : sur-titre, titre, lignes, pied).
`{{cle}}` insère une valeur, `{{#lignes}}…{{/lignes}}` répète.

## Illustrations par l'API d'images d'OpenAI : `genere.js`

Une liste de prompts, tout part d'un coup, trois en parallèle. La clé vit dans
l'environnement, jamais ici.

```bash
OPENAI_API_KEY=sk-… node outils/images/genere.js outils/images/prompts.json --modele gpt-image-1.5 --qualite medium
```

Sans clé, le script affiche ce qu'il ferait et s'arrête. Tailles : 1024x1024,
1024x1536, 1536x1024, auto. Qualités : low, medium, high, xhigh, max, auto.
Fond transparent : `"background": "transparent"` (PNG). Paramètres lus dans le
SDK officiel `openai-node` le 17/09/2026.
