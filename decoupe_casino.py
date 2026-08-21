# -*- coding: utf-8 -*-
"""La table de blackjack et son enseigne, pour le Nexus.

Les deux planches arrivent DEJA detourees (couche alpha reelle) : il n'y a
donc rien a propager depuis les bords. Ce qu'il reste a faire est ce qu'on
oublie toujours — RECADRER sur le dessin.

---- pourquoi recadrer, et avec un SEUIL ----

Une image rendue porte un halo d'alpha 1 ou 2 tout autour, invisible a l'oeil
et bien present pour `getbbox()`. Recadree dessus, la table se retrouve dans
une boite plus grande que son dessin : posee dans le jeu a une taille donnee,
elle apparait plus petite que demandee, et surtout ses PIEDS ne sont plus au
bas de l'image — or c'est par les pieds qu'un objet du Nexus est ancre et
trie avec le joueur. Un objet mal recadre passe devant quelqu'un qui est
devant lui.

---- pas d'echelle commune ici ----

Contrairement a une planche de creature, ces deux objets sont INDEPENDANTS :
ils sont poses dans le jeu a deux tailles differentes. Leur imposer une
echelle commune reviendrait a decider ici de leur rapport de taille, alors
que c'est `LIEUX` qui le dit — et le dit mieux, puisqu'il le dit en unites
de monde.
"""
import sys
sys.path.insert(0, '.')
from PIL import Image
import planches as P

SRC = '/tmp/claude-0/-home-user/118d9ef2-eea7-5e85-9073-c9373d1a7fd3/scratchpad/bj/'

for fichier, cle in [('1.png', 'obj_bj_table'), ('2.png', 'obj_bj_enseigne')]:
    im = Image.open(SRC + fichier).convert('RGBA')
    im = P.nettoie_isoles(P.nettoie(im))
    b = P.boite(im, seuil=16)
    im = im.crop(b)
    P.ecrit(im, 'img/nexus/tiles/%s.webp' % cle)
    print('%-18s %s' % (cle, im.size))
