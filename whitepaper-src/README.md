# White paper — sources

Le fichier `../whitepaper.html` est **fabriqué**. Ne le modifiez pas à la main :
il porte les deux langues et vos corrections seraient perdues à la prochaine
fabrication.

## ⚠ LA PAGE DU SITE A DIVERGÉ DE CES SOURCES — NE PAS RECONSTRUIRE TEL QUEL

`../whitepaper.html` a été **retouchée directement** depuis la dernière
fabrication, par deux passes qui ont traversé tout le site et que
`chrome-site.html` n'a pas reçues :

- le bloc de **correctifs communs** (double-tap, cibles de 44 px, calque qui
  relève le noir) posé juste après le `viewport` sur les vingt-cinq pages ;
- le bloc de **référencement et partage** (og:, twitter:, icônes, manifeste) ;
- la **barre blanche** du site (`.sw-haut`), le thème clair, et le script des
  quatre chiffres de la vitrine — l'ancienne `.sitenav` sombre de
  `chrome-site.html` a été remplacée en entier.

Mesuré : relancer `build.py` aujourd'hui retire **517 lignes** de la page et lui
rend son thème sombre. Le contenu (`en.html`, `fr.html`) est resté juste ; c'est
la **chrome** qui est périmée.

Deux corrections à faire avant de refabriquer, dans cet ordre :

1. reporter dans `chrome-site.html` la tête et la barre de la page actuelle
   (tout ce qui va du `viewport` au `<style>\n:root{`, puis le `<header
   class="sw-haut">` et son script) ;
2. dans `build.py`, remplacer `site_src.split('</style>', 1)` par
   `site_src.rsplit('</style>', 1)` — la chrome portera alors DEUX feuilles, et
   couper à la première jetterait toute la mise en page.

En attendant, une correction de contenu se fait **aux deux endroits** : dans
`en.html` / `fr.html` (pour la fabrication future) et à la main dans
`../whitepaper.html` (pour la page en ligne). C'est ce qui a été fait pour
« ETH » → « ETH (RH) ».

## Modifier le document

1. corriger `fr.html` ou `en.html` — ce sont les deux seules sources de contenu ;
2. relancer :

       python3 whitepaper-src/build.py

3. cela réécrit `../whitepaper.html` (la page du site) et `artifact.html`
   (la version hébergée).

## Pourquoi les deux langues dans un seul fichier

Une seule adresse, une bascule instantanée, et le choix retenu d'une visite à
l'autre. Une règle CSS cache la langue inactive ; sans JavaScript, l'anglais
s'affiche seul.

## Le piège des ancres

Les deux versions portent les mêmes numéros de section. Deux éléments de même
identifiant dans une page, c'est du HTML invalide, et le navigateur saute sur le
**premier** — donc parfois sur celui qui est caché. Les identifiants sont donc
préfixés (`en-s17`, `fr-s17`), et la bascule traduit l'ancre courante pour que le
lecteur ne perde pas sa place au milieu de quarante sections.

## Le second piège

Les boutons de langue **ne portent pas** `data-l`. C'est l'attribut qui cache le
contenu de l'autre langue : un bouton `data-l="fr"` se cacherait lui-même dès
qu'on est en anglais, c'est-à-dire par défaut. Ils portent `data-set`.

## Les chiffres

Tout ce qui est marqué « confirmé » a été lu dans le code déployé ou directement
sur la chaîne. En modifiant un paramètre du serveur, pensez à corriger la ligne
correspondante dans les deux langues.

`chrome-site.html` ne sert qu'à fournir la barre de navigation et la feuille de
style de la page du site ; son contenu est ignoré.
