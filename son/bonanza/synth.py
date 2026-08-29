# -*- coding: utf-8 -*-
"""Le jeu de bruitages de SWOGE Bonanza, synthetise.

TOUT est ecrit dans UNE seule gamme — do majeur pentatonique (do re mi sol la).
C'est la raison d'etre de ce fichier : deux bruitages qui se superposent — et
ils se superposent tout le temps, une colonne se pose pendant qu'un amas paie —
ne peuvent pas frotter s'ils sont pris dans la meme gamme sans demi-ton. C'est
ca, « l'harmonie des sons » : pas un effet, une contrainte d'ecriture.

Le timbre est de la meme famille partout : attaque instantanee, decroissance
exponentielle, partiels de metal ou de bois. C'est le son d'une recompense dans
tous les jeux du genre, et ca supporte d'etre transpose — le bus audio de la
page monte `pose`, `gain` et `cascade` jusqu'a une octave.
"""
import math, struct, wave

SR = 44100

# ---- la gamme, en do majeur pentatonique ----
DO3, RE3, MI3, SOL3, LA3 = 130.81, 146.83, 164.81, 196.00, 220.00
DO4, RE4, MI4, SOL4, LA4 = 261.63, 293.66, 329.63, 392.00, 440.00
DO5, RE5, MI5, SOL5, LA5 = 523.25, 587.33, 659.26, 783.99, 880.00
DO6, MI6, SOL6           = 1046.50, 1318.51, 1567.98

# ---- les timbres ----
# Le bois : partiels presque harmoniques, decroissance courte. Un maillet.
BOIS  = [(1.0, 1.00), (3.90, 0.22), (10.1, 0.06)]
# Le metal : partiels INHARMONIQUES — c'est ce qui separe un glockenspiel
# d'une sinusoide, et ce qui fait qu'un gain "brille" au lieu de "sonner".
METAL = [(1.0, 1.00), (2.76, 0.34), (5.40, 0.14), (8.93, 0.055)]
# La cloche douce, pour ce qui doit rester rond.
DOUX  = [(1.0, 1.00), (2.00, 0.16), (3.01, 0.05)]

def _graine(n, s=12345):
    """bruit reproductible : deux encodages doivent donner le meme fichier"""
    x = s; out = []
    for _ in range(n):
        x = (1103515245 * x + 12345) & 0x7FFFFFFF
        out.append((x / 0x3FFFFFFF) - 1.0)
    return out

def note(buf, f, debut, tau, gain, timbre=METAL, glisse=0.0):
    """Une note posee dans `buf`. `glisse` fait descendre la hauteur (en
       demi-tons) pendant la decroissance — c'est ce qui donne le 'ploc' d'un
       maillet et le poids d'une bombe."""
    d0 = int(debut * SR)
    n  = min(len(buf) - d0, int((tau * 6 + 0.02) * SR))
    if n <= 0: return
    att = int(0.0025 * SR)
    for i in range(n):
        t = i / SR
        e = (i / att) if i < att else math.exp(-(t - 0.0025) / tau)
        # On ne sort qu'APRES l'attaque : `e` vaut zero au tout premier
        # echantillon (la rampe part de zero), et sortir la-dessus ecrivait
        # une note entierement vide — huit fichiers muets, sans une erreur.
        if i >= att and e < 1e-4: break
        # la hauteur descend un peu pendant la note
        fh = f * (2 ** (-glisse * (1 - math.exp(-t / max(tau, 1e-6))) / 12.0))
        s = 0.0
        for mult, amp in timbre:
            s += amp * math.sin(2 * math.pi * fh * mult * t)
        buf[d0 + i] += s * e * gain

def souffle(buf, debut, duree, gain, f0=400.0, f1=2600.0, s=7):
    """Un souffle filtre qui monte : un passe-bande a un pole dont la
       frequence centrale glisse. Sert au depart du tour."""
    d0 = int(debut * SR); n = min(len(buf) - d0, int(duree * SR))
    if n <= 0: return
    br = _graine(n, s); y = 0.0; prev = 0.0
    for i in range(n):
        u = i / n
        fc = f0 * (f1 / f0) ** u
        a = math.exp(-2 * math.pi * fc / SR)
        y = (1 - a) * br[i] + a * y          # passe-bas glissant
        bande = y - prev; prev = y           # derivee -> passe-bande
        env = math.sin(math.pi * u) ** 1.4
        buf[d0 + i] += bande * env * gain * 26

def boum(buf, debut, gain, f=92.0, tau=0.20, s=31):
    """Le coup sourd : une sinusoide grave dont la hauteur tombe, plus une
       bouffee de bruit tres courte pour l'attaque."""
    d0 = int(debut * SR); n = min(len(buf) - d0, int(tau * 7 * SR))
    if n <= 0: return
    br = _graine(n, s)
    for i in range(n):
        t = i / SR
        e = math.exp(-t / tau)
        fh = f * (1.0 + 1.5 * math.exp(-t / 0.035))   # la hauteur tombe vite
        buf[d0 + i] += (math.sin(2 * math.pi * fh * t) * e * gain
                        + br[i] * math.exp(-t / 0.012) * gain * 0.30)

def ecris(nom, buf, crete=0.62, ferme=0.03):
    n = len(buf)
    f = int(ferme * SR)
    for i in range(max(0, n - f), n):        # on ferme la fin, sinon ca claque
        buf[i] *= (n - i) / f
    m = max(abs(v) for v in buf) or 1.0
    k = crete / m
    w = wave.open(nom, 'wb'); w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes(b''.join(struct.pack('<h', int(max(-1, min(1, v * k)) * 32767))
                           for v in buf))
    w.close()
    return n / SR

def vide(sec): return [0.0] * int(sec * SR)

# ==================== LES HUIT ====================

# -- debut : le tour part. Un souffle qui monte, ferme par un clic de bois. --
b = vide(0.34)
souffle(b, 0.0, 0.26, 0.5, 300, 2400)
note(b, SOL4, 0.20, 0.045, 0.55, BOIS, glisse=1.5)
ecris('spin_debut.wav', b, 0.55)

# -- pose : une colonne se pose. SIX fois par tour, et le bus la transpose
#    jusqu'a l'octave : elle doit rester courte, basse et sans queue. --
b = vide(0.15)
note(b, DO4, 0.0, 0.026, 1.00, BOIS, glisse=2.2)
note(b, DO5, 0.0, 0.012, 0.28, BOIS)
ecris('symbole_pose.wav', b, 0.58, ferme=0.02)

# -- gain : un amas paie. Deux notes de metal qui montent, do -> sol. --
b = vide(0.42)
note(b, DO5,  0.000, 0.085, 1.00, METAL)
note(b, SOL5, 0.050, 0.095, 0.80, METAL)
note(b, DO6,  0.050, 0.062, 0.32, METAL)
ecris('gain.wav', b, 0.62)

# -- cascade : les etages suivants. Meme famille, plus bref et plus discret :
#    il se rejoue a chaque etage et ne doit pas doubler le gain. --
b = vide(0.32)
note(b, MI5,  0.000, 0.062, 1.00, METAL)
note(b, LA5,  0.040, 0.068, 0.62, METAL)
ecris('cascade.wav', b, 0.55)

# -- scatter : une sucette tombe, l'attente s'allume. Un carillon qui MONTE :
#    c'est le seul son du jeu qui doit donner envie de la suivante. --
b = vide(0.80)
for k, f in enumerate([DO5, MI5, SOL5, DO6]):
    note(b, f, 0.055 * k, 0.150 + 0.02 * k, 0.95 - 0.10 * k, METAL)
note(b, SOL6, 0.22, 0.30, 0.22, METAL)
ecris('scatter.wav', b, 0.66)

# -- gratuits : le bonus s'ouvre. Un tour sur 201 : c'est le seul moment du
#    jeu qui a droit a une fanfare. Montee pentatonique puis accord tenu. --
# Le bandeau des tours gratuits reste 1,9 s a l'ecran puis s'en va : une
# fanfare plus longue que lui sonnerait dans le vide.
b = vide(1.92)
mont = [DO4, MI4, SOL4, DO5, MI5, SOL5, DO6]
for k, f in enumerate(mont):
    note(b, f, 0.058 * k, 0.14, 0.72, METAL)
for f, g in [(DO4, 0.85), (SOL4, 0.55), (DO5, 0.75), (MI5, 0.62), (SOL5, 0.52), (DO6, 0.42)]:
    note(b, f, 0.44, 0.52, g, METAL)
for f, g in [(SOL5, 0.30), (DO6, 0.34), (MI6, 0.26)]:   # la queue qui brille
    note(b, f, 0.86, 0.34, g, METAL)
ecris('tours_gratuits.wav', b, 0.72)

# -- bombe : un coup sourd, puis le metal du multiplicateur par-dessus. --
b = vide(0.85)
boum(b, 0.0, 0.85, 92.0, 0.19)
note(b, DO5,  0.045, 0.130, 0.52, METAL)
note(b, SOL5, 0.045, 0.150, 0.40, METAL)
note(b, DO6,  0.100, 0.220, 0.24, METAL)
ecris('bombe.wav', b, 0.70)

# -- gros : vingt fois la mise et plus. L'accord complet, tenu, avec une
#    montee d'eclat derriere. --
b = vide(1.90)
for f, g in [(DO3, 0.80), (DO4, 0.85), (SOL4, 0.62), (DO5, 0.78), (MI5, 0.66), (SOL5, 0.54)]:
    note(b, f, 0.0, 0.70, g, METAL)
for k, f in enumerate([DO5, MI5, SOL5, DO6, MI6, SOL6]):
    note(b, f, 0.30 + 0.065 * k, 0.34, 0.30, METAL)
for f, g in [(DO4, 0.45), (SOL4, 0.32), (DO5, 0.40), (MI5, 0.34)]:
    note(b, f, 0.90, 0.55, g, DOUX)
ecris('gros_gain.wav', b, 0.78)

print("huit bruitages ecrits")
