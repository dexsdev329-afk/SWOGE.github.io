#!/usr/bin/env python3
"""
Ajoute le morpion et les dames a la rubrique « Head to head » de games.html.

On INSERE deux cartes a cote de celle du Connect 4, sans toucher au reste :
les autres cartes portent chacune une capture de 100 Ko, et les recomposer
les ferait diverger de ce qu'elles montrent.

Le repere est la fin de la carte du Connect 4 dans la grille des duels. S'il
a bouge, le script s'arrete plutot que d'ecrire n'importe ou.
"""
import base64, io, os, sys

CIBLE = '/home/user/SWOGE.github.io/games.html'
MEDIA = '/home/user/SWOGE.github.io/media'

src = open(CIBLE, encoding='utf-8').read()
fin_ligne = '\r\n' if '\r\n' in src else '\n'
s = src.replace('\r\n', '\n')

if 'morpion.html' in s or 'dames.html' in s:
    sys.exit('les deux cartes sont deja la — rien a faire')

deb = s.find('<div class="grid duel">')
if deb < 0:
    sys.exit('rubrique des duels introuvable')
fin = s.find('\n    </div>', deb)
if fin < 0:
    sys.exit('fin de la rubrique des duels introuvable')


def vignette(nom):
    return base64.b64encode(open(os.path.join(MEDIA, nom), 'rb').read()).decode()


def carte(lien, image, titre, texte, tags):
    tg = ''.join('<span class="tag">%s</span>' % t for t in tags)
    return ('      <a class="card live" href="%s">\n'
            '        <div class="thumb"><img class="tvid" alt="" src="data:image/jpeg;base64,%s"></div>\n'
            '        <div class="body">\n'
            '          <h3>%s</h3>\n'
            '          <p>%s</p>\n'
            '          <div class="tags">%s</div>\n'
            '          <span class="play">&#9654; Play now</span>\n'
            '        </div>\n'
            '      </a>' % (lien, vignette(image), titre, texte, tg))


MORPION = carte(
    'morpion.html', 'jeu-mp.jpg', 'Tic-Tac-Toe',
    'The fastest duel on the site. Both players put up the same stake, three in a row takes '
    'the pot &mdash; the house keeps 5%. Twenty seconds a move, so a match lasts about a '
    'minute. <b>A draw hands both stakes straight back</b>, house fee included: nobody pays '
    'for a tie.',
    ['1v1 duel', 'One minute a match', 'Draw refunds both'])

DAMES = carte(
    'dames.html', 'jeu-dm.jpg', 'Checkers',
    'Twelve pieces each on an 8&times;8 board, <b>captures are mandatory</b> &mdash; so nobody '
    'can sit on a lead and run the clock down. Chain your jumps, crown a king on the last row, '
    'and take the pot when the other side has nothing left to play. Same stake both sides, '
    'the house keeps 5%.',
    ['1v1 duel', 'Captures are mandatory', 'Winner takes the pot'])

s = s[:fin] + '\n\n' + MORPION + '\n\n' + DAMES + s[fin:]
open(CIBLE, 'w', encoding='utf-8', newline=fin_ligne).write(s)
print('games.html : deux cartes ajoutees a la rubrique des duels (%.0f Ko)'
      % (os.path.getsize(CIBLE) / 1024))
