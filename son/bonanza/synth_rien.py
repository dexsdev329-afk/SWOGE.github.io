import math, struct, wave

SR = 44100

def env(n, att, tau, total):
    """attaque lineaire courte puis decroissance exponentielle, tail ramenee a zero"""
    out = []
    a = int(att*SR)
    for i in range(n):
        t = i/SR
        e = (i/a) if i < a else math.exp(-(t-att)/tau)
        # on ferme les 25 derniers ms pour ne pas claquer
        reste = total - t
        if reste < 0.025: e *= max(0.0, reste/0.025)
        out.append(e)
    return out

def note(f, debut, duree, total, harm, tau, gain):
    n = int(total*SR)
    buf = [0.0]*n
    d0 = int(debut*SR)
    e = env(n-d0, 0.006, tau, total-debut)
    for i in range(d0, n):
        t = (i-d0)/SR
        s = 0.0
        for k, amp in enumerate(harm, start=1):
            s += amp*math.sin(2*math.pi*f*k*t)
        buf[i] = s*e[i-d0]*gain
    return buf

def melange(*pistes):
    n = max(len(p) for p in pistes)
    out = [0.0]*n
    for p in pistes:
        for i, v in enumerate(p): out[i] += v
    return out

def ecris(nom, buf, crete=0.55):
    m = max(abs(v) for v in buf) or 1.0
    k = crete/m
    w = wave.open(nom, 'wb'); w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes(b''.join(struct.pack('<h', int(max(-1,min(1,v*k))*32767)) for v in buf))
    w.close()

# Gamme pentatonique de DO — la MEME que la montee des cascades, pour que le
# tour perdu et le tour gagne parlent la meme langue.
DO, RE, MI, SOL, LA = 261.63, 293.66, 329.63, 392.00, 440.00

# --- A : maillet doux, tierce mineure descendante SOL -> MI ---
HARM = [1.0, 0.26, 0.09, 0.03]
a = melange(note(SOL, 0.000, 0.30, 0.46, HARM, 0.115, 1.00),
            note(MI,  0.105, 0.34, 0.46, HARM, 0.135, 0.92))
ecris('rien_a.wav', a)

# --- B : une seule note tenue, ronde, sans jugement (LA -> rien) ---
b = melange(note(LA, 0.000, 0.34, 0.40, [1.0, 0.18, 0.05], 0.105, 1.0))
ecris('rien_b.wav', b, 0.50)

# --- C : trois notes qui redescendent la gamme, tres court (SOL MI RE) ---
c = melange(note(SOL, 0.000, 0.20, 0.50, HARM, 0.075, 0.95),
            note(MI,  0.085, 0.22, 0.50, HARM, 0.085, 0.88),
            note(RE,  0.170, 0.30, 0.50, HARM, 0.125, 0.80))
ecris('rien_c.wav', c)
print("trois candidats ecrits")
