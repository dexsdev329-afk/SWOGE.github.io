# Analyse produit — sources

`artifact.html` est **fabriqué** et porte les deux langues. Ne le modifiez pas à
la main.

1. corriger `fr.html` ou `en.html` ;
2. relancer `python3 teardown-src/build.py` ;
3. republier `artifact.html`.

Français par défaut — c'est un document de travail, pas une plaquette. La clé de
mémorisation est la même que celle du white paper : un choix explicite vaut donc
pour les deux documents, et en son absence chacun garde sa langue de départ.

**Il n'est volontairement pas publié sur le site.** Il dit sans détour qu'il n'y
a pas d'audit, que le contrôle est mono-signature et que 893 millions ne sont pas
documentés. Le white paper dit les mêmes choses de façon responsable ; celui-ci
est un outil interne, à partager au cas par cas.

`chrome.html` ne sert qu'à fournir la feuille de style ; son contenu est ignoré.
