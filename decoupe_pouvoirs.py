"""Les six pouvoirs du familier — six planches d'effet, sur fond noir.

---- POURQUOI `lueur` ET PAS UN DETOURAGE ----

Un effet n'est pas un objet : il n'a pas de contour. Une flamme, une onde, une
colonne de lumiere s'eteignent en degrade, et c'est ce degrade qui les fait
tenir par-dessus le decor. `detoure_sombre` propage depuis les bords et rend un
alpha binaire : le halo disparait d'un coup, et l'effet se retrouve avec un
bord net qu'on lit comme un autocollant.

`lueur` fait l'inverse : l'alpha EST la luminosite. Ce qui est noir est vide, ce
qui brille est le dessin, et l'entre-deux garde son degrade.

Elle regle aussi, GRATUITEMENT, un probleme qu'on n'avait pas demande : la
planche de glace contient une creature sombre au milieu des cristaux. Posee
telle quelle sur un monstre, elle aurait peint un loup noir par-dessus lui.
Comme elle est sombre, `lueur` la rend transparente — il ne reste que la glace,
c'est-a-dire exactement ce qu'on voulait.

---- ET IL FAUT ENLEVER LES NUMEROS ----

Le generateur ecrit « 1 2 3 4 5 6 » sous les images. En blanc, sur du noir :
`lueur` les garderait comme le dessin le plus lumineux de la planche, et l'on
aurait un chiffre peint sur chaque monstre.

On ne les coupe pas a une hauteur ecrite en dur — elle differe sur les six
planches (246, 257, 236, 239, 281, 239). On cherche la DERNIERE bande non vide
en partant du bas : c'est elle, toujours, et un vrai creux noir la separe de
l'effet. On verifie les deux avant de couper : une bande mince, et un creux
d'au moins quelques rangees. Sans ces deux conditions, une planche sans
numeros se ferait amputer de son bas.
"""
import sys
import planches as P
from PIL import Image

SC = '/tmp/claude-0/-home-user/118d9ef2-eea7-5e85-9073-c9373d1a7fd3/scratchpad/'
CADRES = 6
LARGE = 160

POUVOIRS = {
    'mord':     { 'src': 'pw_1.png', 'sortie': 'fam_mord' },
    'brule':    { 'src': 'pw_2.png', 'sortie': 'fam_brule' },
    'gele':     { 'src': 'pw_3.png', 'sortie': 'fam_gele' },
    'repousse': { 'src': 'pw_4.png', 'sortie': 'fam_repousse' },
    'soigne':   { 'src': 'pw_5.png', 'sortie': 'fam_soigne' },
    # Le bouclier est fait de PIERRE, pas de lumiere. Ses blocs gris plafonnent
    # a une luminosite moyenne : a gamma 1 ils ressortent a moitie
    # transparents, et le mur ressemble a de la fumee. Le gamma seul n'y
    # suffit pas — essaye a 0.55, la roche restait vaporeuse. Le GAIN
    # multiplie l'alpha sans toucher a la forme du degrade : la roche redevient
    # de la roche, le bord continue de s'eteindre doucement, et le fond reste a
    # zero puisque le multiplier le laisse a zero.
    # Mesure sur la planche : 86,6 % des pixels sont a une luminosite de moins
    # de seize — c'est le fond. Tout ce qui est au-dessus est du dessin, donc
    # il n'y a rien de sombre a preserver.
    'bouclier': { 'src': 'pw_6.png', 'sortie': 'fam_bouclier',
                  'gamma': 0.75, 'gain': 3.2 },
}


def sansLegende(im):
    """Coupe la bande des numeros, si elle est la."""
    g = im.convert('RGB')
    px = g.load()
    w, h = g.size
    plein = [sum(1 for x in range(0, w, 2) if max(px[x, y]) > 28) for y in range(h)]
    y = h - 1
    while y >= 0 and plein[y] == 0:
        y -= 1
    if y < 0:
        return im
    bas = y
    while y >= 0 and plein[y] > 0:
        y -= 1
    haut = y + 1
    creux = 0
    while y >= 0 and plein[y] == 0:
        creux += 1
        y -= 1
    """Mince ET detachee : c'est la signature d'une legende. Un effet dont le
       bas serait une bande mince — une onde au sol, par exemple — n'aurait pas
       de creux noir au-dessus de lui."""
    if (bas - haut) < h * 0.08 and creux >= 5 and y >= 0:
        return im.crop((0, 0, w, haut))
    return im


def fait(cle):
    D = POUVOIRS[cle]
    im = Image.open(SC + D['src']).convert('RGBA')
    avant = im.height
    im = sansLegende(im)
    if im.height != avant:
        print('  legende retiree : %d -> %d' % (avant, im.height))

    pas = im.width / float(CADRES)
    lot = [im.crop((round(i * pas), 0, round((i + 1) * pas), im.height))
           for i in range(CADRES)]
    lot = [P.lueur(c, seuil=10, gamma=D.get('gamma', 1.0), gain=D.get('gain', 1.0))
           for c in lot]

    """Le recadrage est COMMUN aux six. Recadrer chaque image sur son propre
       contenu la recentrerait dans sa case : une flamme qui monte grandit vers
       le haut, et un recadrage par image la ramenerait au centre — la flamme
       cesserait de monter et se contenterait de grossir."""
    boites = [P.boite(c, seuil=8) for c in lot]
    boites = [b for b in boites if b]
    x0 = min(b[0] for b in boites); y0 = min(b[1] for b in boites)
    x1 = max(b[2] for b in boites); y1 = max(b[3] for b in boites)
    lot = [c.crop((x0, y0, x1, y1)) for c in lot]

    lot = [c.resize((LARGE, int(round(LARGE * c.height / float(c.width)))),
                    Image.LANCZOS) for c in lot]
    L, H = lot[0].size
    planche = Image.new('RGBA', (L * CADRES, H), (0, 0, 0, 0))
    for i, c in enumerate(lot):
        planche.paste(c, (i * L, 0), c)
    sortie = 'img/nexus/effets/%s.webp' % D['sortie']
    P.ecrit(planche, sortie)
    print('  %-24s %s  %d images de %dx%d  (rapport %.2f)'
          % (D['sortie'] + '.webp', planche.size, CADRES, L, H, L / float(H)))


if __name__ == '__main__':
    for cle in (sys.argv[1:] or list(POUVOIRS)):
        print(cle)
        fait(cle)
