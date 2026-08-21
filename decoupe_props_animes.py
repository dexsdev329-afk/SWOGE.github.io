"""Les quatre decors animes du Nexus : deux portails, l'etal, le coffre.

Un seul decoupeur pour les quatre. Ils posent exactement le meme probleme, et
la fontaine nous l'a deja coute une fois — c'est la que ces regles ont ete
apprises, pas ici.

---- CE QUI RATE, A CHAQUE FOIS ----

1. LA GRILLE. `bandes` coupe aux creux du dessin : les quatre objets ne sont
   jamais exactement au meme endroit dans leur case, et une coupe au contenu
   DEPLACE donc l'image d'une case a l'autre. On coupe au PAS FIXE.

2. LA DERIVE. Le modele redessine l'objet entier quatre fois au lieu de ne
   changer que la partie animee. Joue a six images par seconde, un glissement
   d'un pixel ne se lit pas comme un detail : le decor entier TREMBLE. On
   recale donc chaque image sur la premiere, en cherchant le decalage qui rend
   la partie FIXE la plus semblable.

3. ET LE RECALAGE NE SUFFIT PAS. Sur la fontaine, il rendait zero : la derive
   n'etait pas un glissement mais un redessin — les lanternes bougeaient d'un
   pixel, les fleurs n'etaient pas les memes. Aucun decalage ne corrige ca. On
   FIGE donc tout ce qui n'est pas la zone animee : en dehors du masque, les
   quatre images reprennent la premiere.

C'est le point important, et il vaut d'etre dit clairement : la zone animee est
decrite A LA MAIN, en fractions de la case. Ce n'est pas de la paresse. On a
essaye de la trouver par la difference (« ce qui bouge, c'est l'animation ») et
la mesure a dit non : la pierre changeait autant que l'eau. Une ellipse ecrite
a la main est une DECISION — « voici ce qui doit bouger » — et c'est
exactement ce qu'un dessin ne peut pas nous apprendre tout seul.

---- USAGE ----

    python3 decoupe_props_animes.py portail
    python3 decoupe_props_animes.py             # les quatre d'un coup

La source attendue est <scratchpad>/<cle>.png : une bande de quatre images.
"""
import sys
import planches as P
from PIL import Image, ImageChops, ImageDraw, ImageFilter

SC = '/tmp/claude-0/-home-user/118d9ef2-eea7-5e85-9073-c9373d1a7fd3/scratchpad/'
CADRES = 4
RECHERCHE = 3

# Pour chaque decor : ou est la partie ANIMEE, et ou est la partie FIXE qui
# sert de reference au recalage. Les deux sont en fraction de la case.
#
# `anime` est une liste de zones : un portail a son tourbillon ET ses deux
# torches, qui ne sont pas au meme endroit. Une seule ellipse aurait oblige a
# choisir entre les deux, ou a couvrir tout l'objet — ce qui revient a ne rien
# figer.
DECORS = {
    'portail': {
        'sortie': 'img/nexus/tiles/obj_portal.webp',
        # Le tourbillon dans l'arche, et les deux torches de part et d'autre.
        'anime': [(0.30, 0.06, 0.70, 0.55),      # le vortex
                  (0.02, 0.34, 0.22, 0.62),      # torche gauche
                  (0.78, 0.34, 0.98, 0.62)],     # torche droite
        # La pierre du socle : elle ne bouge jamais, c'est la meilleure
        # reference qui soit.
        'fixe': (0.20, 0.72, 0.80, 0.98),
    },
    'portailPvp': {
        'sortie': 'img/nexus/tiles/obj_portal_pvp.webp',
        'anime': [(0.32, 0.10, 0.68, 0.58),
                  (0.04, 0.02, 0.28, 0.30),
                  (0.72, 0.02, 0.96, 0.30)],
        'fixe': (0.20, 0.72, 0.80, 0.98),
    },
    'etal': {
        'sortie': 'img/nexus/tiles/obj_market_stall.webp',
        # L'auvent qui ondule, et les deux lanternes.
        'anime': [(0.14, 0.12, 0.86, 0.40),
                  (0.02, 0.28, 0.20, 0.55),
                  (0.80, 0.28, 0.98, 0.55)],
        # Le plateau et les caisses : du bois qui n'a aucune raison de remuer.
        'fixe': (0.20, 0.62, 0.80, 0.98),
    },
    'coffre': {
        'sortie': 'img/nexus/tiles/obj_vault_door.webp',
        # Les deux torches, et la couronne de rivets qui s'allume.
        'anime': [(0.06, 0.02, 0.30, 0.34),
                  (0.70, 0.02, 0.94, 0.34),
                  (0.28, 0.28, 0.72, 0.76)],
        'fixe': (0.20, 0.80, 0.80, 0.99),
    },
}


def cases(im, n):
    """n cases de largeur EGALE, au pas fixe. Voir 1 en tete de fichier."""
    w, h = im.size
    pas = w / float(n)
    return [im.crop((round(i * pas), 0, round((i + 1) * pas), h))
              .resize((round(pas), h))
            for i in range(n)]


def ecart(a, b, zone):
    d = ImageChops.difference(a.convert('RGB').crop(zone), b.convert('RGB').crop(zone))
    px = d.load()
    w, h = d.size
    return sum(sum(px[x, y]) for y in range(0, h, 2) for x in range(0, w, 2))


def recale(ref, c, zone):
    """Le decalage qui rend la ZONE la plus semblable a la reference."""
    best, bdx, bdy = None, 0, 0
    for dy in range(-RECHERCHE, RECHERCHE + 1):
        for dx in range(-RECHERCHE, RECHERCHE + 1):
            e = ecart(ref, ImageChops.offset(c, dx, dy), zone)
            if best is None or e < best:
                best, bdx, bdy = e, dx, dy
    return bdx, bdy


def masque_de(zones, L, H):
    """Le masque des parties animees, adouci sur ses bords.

    Le flou n'est pas cosmetique : un masque net laisse une COUTURE visible
    entre la partie figee et la partie animee — une ligne d'un pixel qui
    scintille au rythme de l'animation, et qui se voit d'autant plus qu'on
    regarde justement cet endroit-la.
    """
    m = Image.new('L', (L, H), 0)
    d = ImageDraw.Draw(m)
    for (x0, y0, x1, y1) in zones:
        d.ellipse([x0 * L, y0 * H, x1 * L, y1 * H], fill=255)
    return m.filter(ImageFilter.GaussianBlur(max(2.0, L * 0.012)))


def fait(cle):
    D = DECORS[cle]
    src = SC + cle + '.png'
    im = Image.open(src).convert('RGBA')
    lot = cases(im, CADRES)
    L, H = lot[0].size
    fixe = tuple(int(v * (L if i % 2 == 0 else H)) for i, v in enumerate(D['fixe']))

    aligne = [lot[0]]
    for i, c in enumerate(lot[1:], 1):
        dx, dy = recale(lot[0], c, fixe)
        if dx or dy:
            print('  image %d recalee de (%+d, %+d)' % (i + 1, dx, dy))
        aligne.append(ImageChops.offset(c, dx, dy))

    m = masque_de(D['anime'], L, H)
    part = sum(1 for v in m.getdata() if v > 127) / float(L * H)
    aligne = [aligne[0]] + [Image.composite(c, aligne[0], m) for c in aligne[1:]]
    reste = max(ecart(aligne[0], c, fixe) for c in aligne[1:])
    print('  la zone animee couvre %.0f%% du dessin, le reste est fige '
          '(ecart %d, zero attendu)' % (100 * part, reste))

    planche = Image.new('RGBA', (L * CADRES, H), (0, 0, 0, 0))
    for i, c in enumerate(aligne):
        planche.paste(c, (i * L, 0), c)
    P.ecrit(planche, D['sortie'])
    print('  %-30s %s  %d images de %dx%d'
          % (D['sortie'].split('/')[-1], planche.size, CADRES, L, H))


if __name__ == '__main__':
    voulus = sys.argv[1:] or list(DECORS)
    for cle in voulus:
        if cle not in DECORS:
            print('inconnu : %s (connus : %s)' % (cle, ', '.join(DECORS)))
            continue
        print(cle)
        fait(cle)
