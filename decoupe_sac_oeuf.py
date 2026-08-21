"""Le sac d'oeuf : un septieme sac, et son propre fichier.

---- POURQUOI PAS UNE SEPTIEME CASE DE LA PLANCHE ----

Les six autres vivent dans `sacs.webp`, six cases de 96 sur une rangee. Y
ajouter la septieme aurait demande de refaire la planche entiere a chaque
ajout — et celle-ci est deja en ligne, dans le cache de tous les joueurs.
Un sac de plus, c'est un FICHIER de plus et une ligne dans `SAC_A_PART` ;
la planche ne bouge pas.

---- ON DETOURE, ON NE RECADRE PAS ----

`detoure` part des BORDS et remplit vers l'interieur : le damier ou le fond
plat s'en va, et ce qui est enclos par le dessin reste. C'est la lecon de
l'enseigne de Crimson Reach, ou un fond blanc pris au piege entre un support
et des chaines etait reste en place — verifie sur fond sombre, invisible.

`boite` recadre ensuite au contenu REEL. Sans ce recadrage, le sac serait
dessine plus petit qu'il ne doit l'etre : la page cale sa taille sur celle du
fichier, et une marge transparente de vingt pour cent le reduit d'autant.
"""
import planches as P
from PIL import Image

SC = '/tmp/claude-0/-home-user/118d9ef2-eea7-5e85-9073-c9373d1a7fd3/scratchpad/'
SOURCE = SC + 'sac_oeuf.png'
SORTIE = 'img/nexus/objets/sac_oeuf.webp'

im = Image.open(SOURCE).convert('RGBA')
im = P.detoure(im, seuilClair=232, seuilGris=18)
im = P.nettoie_isoles(im)
im = P.boite(im, seuil=12)
P.ecrit(im, SORTIE)
print('%-34s %s  (rapport %.2f)' % (SORTIE.split('/')[-1], im.size,
                                    im.width / float(im.height)))
