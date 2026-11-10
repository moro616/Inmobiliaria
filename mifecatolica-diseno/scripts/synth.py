"""Mi Fe Católica — música instrumental propia (melodías de dominio público y composiciones originales).
Sintetizador aditivo sencillo: piano, cuerdas, órgano, colchón (pad) y campanas, con reverberación de iglesia.
Uso: python3 synth.py <carpeta_salida>   → genera WAV estéreo a 32 kHz (luego se codifican a Opus con ffmpeg)."""
import sys, os, wave
import numpy as np

SR = 32000
rng = np.random.default_rng(7)
NOTAS = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}

def midi(n):
    """'C4', 'F#5', 'Bb3' → número MIDI."""
    base = NOTAS[n[0]]; i = 1
    while n[i] in '#b':
        base += 1 if n[i] == '#' else -1; i += 1
    return base + 12 * (int(n[i:]) + 1)

def hz(m): return 440.0 * 2 ** ((m - 69) / 12)

# ---------------- instrumentos ----------------
def env_ar(n, att, rel_start, rel):
    t = np.arange(n) / SR
    e = np.minimum(1.0, t / max(att, 1e-4))
    e = np.where(t > rel_start, e * np.exp(-(t - rel_start) / rel), e)
    return e

def piano(f, d, v):
    tail = 1.6; n = int((d + tail) * SR); t = np.arange(n) / SR
    out = np.zeros(n)
    amps = [1, .55, .32, .2, .13, .08, .05, .03]
    tau1 = 2.4 * (220 / f) ** 0.35
    for k, a in enumerate(amps, 1):
        fk = f * k * np.sqrt(1 + 0.00035 * k * k)
        if fk > SR / 2.3: break
        tau = tau1 / (1 + 0.55 * (k - 1))
        out += a * np.sin(2 * np.pi * fk * t + rng.uniform(0, 6.28)) * np.exp(-t / tau)
    e = env_ar(n, 0.004, d, 0.28)
    return v * out * e * 0.5

def cuerdas(f, d, v, att=0.18, vib=True):
    rel = 0.9; n = int((d + rel * 5) * SR); t = np.arange(n) / SR
    out = np.zeros(n)
    vibr = (1 + 0.0045 * np.sin(2 * np.pi * 5.2 * t) * np.clip((t - 0.35) / 0.4, 0, 1)) if vib else 1
    for cents in (-6, 0, 6):
        fd = f * 2 ** (cents / 1200)
        ph = 2 * np.pi * np.cumsum(fd * vibr) / SR
        for k in range(1, 11):
            if fd * k > SR / 2.3: break
            out += (1 / k) * np.exp(-k / 3.2) * np.sin(k * ph + rng.uniform(0, 6.28))
    e = env_ar(n, att, d, rel)
    return v * out * e * 0.22

def pad(f, d, v):
    return cuerdas(f, d, v, att=0.9, vib=False) * 0.8

def organo(f, d, v):
    rel = 0.35; n = int((d + rel * 4) * SR); t = np.arange(n) / SR
    trem = 1 + 0.025 * np.sin(2 * np.pi * 5.0 * t)
    out = (np.sin(2 * np.pi * f * t) + .5 * np.sin(2 * np.pi * 2 * f * t) + .14 * np.sin(2 * np.pi * 3 * f * t) + .18 * np.sin(2 * np.pi * 4 * f * t)
           + .06 * np.sin(2 * np.pi * 6 * f * t))
    e = env_ar(n, 0.06, d, rel)
    return v * out * e * trem * 0.32

def campana(f, d, v):
    n = int(7.0 * SR); t = np.arange(n) / SR
    out = np.zeros(n)
    for r, a, tau in ((1, 1, 2.6), (2.76, .35, 1.1), (5.4, .16, .5), (8.93, .07, .25)):
        if f * r < SR / 2.3: out += a * np.sin(2 * np.pi * f * r * t) * np.exp(-t / tau)
    return v * out * env_ar(n, 0.002, 99, 1) * 0.35

INSTR = {'piano': piano, 'cuerdas': cuerdas, 'pad': pad, 'organo': organo, 'campana': campana}
PAN = {'piano': -0.15, 'cuerdas': 0.2, 'pad': 0.0, 'organo': 0.1, 'campana': 0.35}

class Pista:
    def __init__(self, segundos):
        self.buf = np.zeros((2, int(segundos * SR) + SR * 8))
    def nota(self, inst, nota, t0, dur, vel):
        m = midi(nota) if isinstance(nota, str) else nota
        s = INSTR[inst](hz(m), dur, vel)
        i = int(t0 * SR); j = min(i + len(s), self.buf.shape[1]); s = s[:j - i].copy()
        k = min(len(s), int(0.06 * SR)); s[-k:] *= np.linspace(1, 0, k) ** 2  # sin clics al final de cada nota
        p = PAN[inst]; self.buf[0, i:j] += s * (1 - p) * 0.75; self.buf[1, i:j] += s * (1 + p) * 0.75

# ---------------- acordes ----------------
ACORDES = {
    'C': ['C', 'E', 'G'], 'G': ['G', 'B', 'D'], 'G7': ['G', 'B', 'D', 'F'], 'F': ['F', 'A', 'C'], 'Am': ['A', 'C', 'E'], 'Dm': ['D', 'F', 'A'],
    'Em': ['E', 'G', 'B'], 'D': ['D', 'F#', 'A'], 'A': ['A', 'C#', 'E'], 'Bm': ['B', 'D', 'F#'], 'F#m': ['F#', 'A', 'C#'], 'Bb': ['Bb', 'D', 'F'],
    'Gm': ['G', 'Bb', 'D'], 'C7': ['C', 'E', 'G', 'Bb'], 'D7': ['D', 'F#', 'A', 'C'],
}
def voz(nombre, oct_base):
    """Acorde en posición cerrada desde la octava dada."""
    notas = ACORDES[nombre]; out = []; prev = -1
    for n in notas:
        m = midi(n + str(oct_base))
        while m <= prev: m += 12
        out.append(m); prev = m
    return out

def arpegio(p, inst, acorde, t0, dur_beat, beats, vel, oct_bajo=3, patron=(0, 1, 2, 3, 2, 1), sub=2):
    """Arpegio de corcheas (sub notas por pulso) sobre el acorde."""
    a = voz(acorde, oct_bajo); tonos = [a[0], a[1 % len(a)] if len(a) > 1 else a[0], a[2 % len(a)], a[0] + 12, a[1] + 12]
    tonos = [a[0], a[2 % len(a)], a[0] + 12, a[1] + 12, a[2 % len(a)] + 12]
    n = int(beats * sub)
    for k in range(n):
        idx = patron[k % len(patron)]
        p.nota(inst, tonos[idx], t0 + k * dur_beat / sub, dur_beat / sub * 1.6, vel * (1.0 if k % len(patron) == 0 else 0.72))

def colchon(p, acorde, t0, dur, vel, oct_=4, inst='pad'):
    for m in voz(acorde, oct_): p.nota(inst, m, t0, dur, vel)
    p.nota(inst, voz(acorde, 2)[0], t0, dur, vel * 0.9)

def melodia(p, inst, notas, t0, beat, vel, trans=0):
    t = t0
    for n, d in notas:
        if n != 'R': p.nota(inst, midi(n) + trans, t, d * beat * 0.97, vel)
        t += d * beat
    return t

# ---------------- reverberación y salida ----------------
def reverb(x, segundos=3.2, mezcla=0.32):
    n = int(segundos * SR); t = np.arange(n) / SR
    out = np.zeros_like(x)
    N = 1 << int(np.ceil(np.log2(x.shape[1] + n)))
    for c in range(2):
        ir = rng.standard_normal(n) * np.exp(-t / (segundos / 6.9))
        ir[: int(0.012 * SR)] = 0  # pre-delay
        k = np.fft.rfft(ir, N); ir_lp = np.fft.irfft(k * (1 / (1 + (np.fft.rfftfreq(N, 1 / SR) / 5200) ** 2)), N)[:n]
        ir_lp /= np.sqrt(np.sum(ir_lp ** 2))
        wet = np.fft.irfft(np.fft.rfft(x[c], N) * np.fft.rfft(ir_lp, N), N)[: x.shape[1]]
        out[c] = x[c] * (1 - mezcla) + wet * mezcla * 1.6
    return out

def guardar(p, ruta, fin):
    x = p.buf[:, : int((fin + 6) * SR)]
    x = reverb(x)
    # fundido de entrada/salida
    fi = int(0.5 * SR); x[:, :fi] *= np.linspace(0, 1, fi)
    fo = int(5 * SR); x[:, -fo:] *= np.linspace(1, 0, fo) ** 1.5
    x = x / (np.max(np.abs(x)) + 1e-9) * 0.89
    pcm = (x.T * 32767).astype('<i2')
    with wave.open(ruta, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())

# ======================= PIEZAS =======================
def noche_de_paz():
    """Stille Nacht — Franz Xaver Gruber (1818), dominio público. 6/8 en Do; unidad = corchea."""
    e = 60 / 138  # corchea
    mel = [('G4', 1.5), ('A4', .5), ('G4', 1), ('E4', 3), ('G4', 1.5), ('A4', .5), ('G4', 1), ('E4', 3),
           ('D5', 2), ('D5', 1), ('B4', 3), ('C5', 2), ('C5', 1), ('G4', 3),
           ('A4', 2), ('A4', 1), ('C5', 1.5), ('B4', .5), ('A4', 1), ('G4', 1.5), ('A4', .5), ('G4', 1), ('E4', 3),
           ('A4', 2), ('A4', 1), ('C5', 1.5), ('B4', .5), ('A4', 1), ('G4', 1.5), ('A4', .5), ('G4', 1), ('E4', 3),
           ('D5', 2), ('D5', 1), ('F5', 1.5), ('D5', .5), ('B4', 1), ('C5', 3), ('E5', 3),
           ('C5', 1.5), ('G4', .5), ('E4', 1), ('G4', 1.5), ('F4', .5), ('D4', 1), ('C4', 6)]
    acordes = [('C', 6), ('C', 6), ('G7', 6), ('C', 6), ('F', 6), ('C', 6), ('F', 6), ('C', 6), ('G7', 6), ('C', 6), ('C', 3), ('G7', 3), ('C', 6)]
    verso = sum(d for _, d in acordes) * e
    p = Pista(verso * 4 + 30)
    t = 0
    for a in ('C', 'G7'):  # introducción
        arpegio(p, 'piano', a, t, e, 6, .5, sub=1); colchon(p, a, t, 6 * e, .25); t += 6 * e
    planes = [('piano', 0, .9, False), ('cuerdas', 0, .8, True), ('piano', 12, .75, True), ('cuerdas', 0, .7, False)]
    for inst, tr, vel, bells in planes:
        tt = t
        for a, d in acordes:
            arpegio(p, 'piano', a, tt, e, d, .42, sub=1); colchon(p, a, tt, d * e, .2); tt += d * e
            if bells: p.nota('campana', voz(a, 5)[0], tt - d * e, 1, .25)
        melodia(p, inst, mel, t, e, vel, tr)
        if inst == 'cuerdas' and tr == 0 and not bells: pass
        t = tt
    colchon(p, 'C', t, 9 * e, .3); p.nota('campana', 'C6', t, 2, .35); p.nota('piano', 'C3', t, 4, .5)
    return p, t + 9 * e

def himno_alegria():
    """Himno de la alegría — L. van Beethoven (1824), dominio público. 4/4 en Do; unidad = negra."""
    b = 60 / 88
    L1 = [('E4', 1), ('E4', 1), ('F4', 1), ('G4', 1), ('G4', 1), ('F4', 1), ('E4', 1), ('D4', 1), ('C4', 1), ('C4', 1), ('D4', 1), ('E4', 1), ('E4', 1.5), ('D4', .5), ('D4', 2)]
    L2 = L1[:12] + [('D4', 1.5), ('C4', .5), ('C4', 2)]
    L3 = [('D4', 1), ('D4', 1), ('E4', 1), ('C4', 1), ('D4', 1), ('E4', .5), ('F4', .5), ('E4', 1), ('C4', 1), ('D4', 1), ('E4', .5), ('F4', .5), ('E4', 1), ('D4', 1), ('C4', 1), ('D4', 1), ('G3', 2)]
    mel = L1 + L2 + L3 + L2
    ac = ['C', 'G', 'C', 'G', 'C', 'G', 'C', ('G', 'C'), 'G', ('G', 'C'), ('G', 'C'), ('C', 'G'), 'C', 'G', 'C', ('G', 'C')]
    pasada = 16 * 4 * b
    p = Pista(pasada * 3 + 30); t = 0
    for a in ('C', 'G'):
        arpegio(p, 'piano', a, t, b, 4, .45); colchon(p, a, t, 4 * b, .2); t += 4 * b
    for inst, tr, vel in (('piano', 12, .85), ('organo', 12, .55), ('cuerdas', 12, .75)):
        tt = t
        for a in ac:
            parts = a if isinstance(a, tuple) else (a,)
            for x in parts:
                d = 4 / len(parts)
                arpegio(p, 'piano', x, tt, b, d, .38); colchon(p, x, tt, d * b, .18); tt += d * b
            if inst == 'cuerdas': p.nota('campana', voz(parts[0], 5)[0], tt - 4 * b, 1, .18)
        melodia(p, inst, mel, t, b, vel, tr)
        t = tt
    colchon(p, 'C', t, 6 * b, .3); p.nota('piano', 'C3', t, 4, .5); p.nota('campana', 'E6', t, 2, .3)
    return p, t + 6 * b

def canon_re():
    """Canon en Re — Johann Pachelbel (c. 1700), dominio público. Versión de meditación."""
    b = 60 / 58
    ac = ['D', 'A', 'Bm', 'F#m', 'G', 'D', 'G', 'A']
    bajo = ['D3', 'A2', 'B2', 'F#2', 'G2', 'D2', 'G2', 'A2']
    m1 = [('F#5', 2), ('E5', 2), ('D5', 2), ('C#5', 2), ('B4', 2), ('A4', 2), ('B4', 2), ('C#5', 2)]
    m2 = [(n, 1) for n in ['D5', 'F#5', 'A5', 'G5', 'F#5', 'D5', 'F#5', 'E5', 'D5', 'B4', 'D5', 'A5', 'G5', 'B5', 'A5', 'G5']]
    ciclo = 16 * b; n = 8
    p = Pista(ciclo * n + 30)
    for c in range(n):
        t0 = c * ciclo
        for i, (a, bj) in enumerate(zip(ac, bajo)):
            t = t0 + i * 2 * b
            p.nota('cuerdas', bj, t, 2 * b, .55)
            colchon(p, a, t, 2 * b, .14 if c in (0, n - 1) else .11)
            if c in (3, 4, 6): arpegio(p, 'piano', a, t, b, 2, .3, oct_bajo=4, patron=(0, 1, 2, 1))
            if c == 5: arpegio(p, 'campana', a, t, b, 2, .22, oct_bajo=5, patron=(0, 1, 2, 3))
        if c in (1, 3, 5): melodia(p, 'cuerdas', m1, t0, b, .6)
        if c in (2, 4, 6): melodia(p, 'piano', m2, t0, b, .7)
        if c == 6: melodia(p, 'cuerdas', m1, t0, b, .45, -12)
        if c == 7: melodia(p, 'campana', m1, t0, b, .35)
    t = n * ciclo
    colchon(p, 'D', t, 8 * b, .25); p.nota('cuerdas', 'D2', t, 8 * b, .5); p.nota('campana', 'D6', t, 3, .3)
    return p, t + 8 * b

def luz_de_maria():
    """«Luz de María» — composición original de Mi Fe Católica. 3/4 en Fa."""
    b = 60 / 74
    A = [('C5', 2), ('A4', 1), ('D5', 2), ('A4', 1), ('Bb4', 1), ('C5', 1), ('D5', 1), ('C5', 2), ('G4', 1),
         ('A4', 2), ('C5', 1), ('E5', 2), ('C5', 1), ('D5', 1), ('C5', 1), ('Bb4', 1), ('G4', 3)]
    B = [('F5', 2), ('D5', 1), ('D5', 1.5), ('C5', .5), ('Bb4', 1), ('A4', 1), ('C5', 1), ('F5', 1), ('E5', 2), ('C5', 1),
         ('D5', 2), ('Bb4', 1), ('C5', 1), ('A4', 1), ('F4', 1), ('G4', 1), ('Bb4', 1), ('E4', 1), ('F4', 3)]
    acA = ['F', 'Dm', 'Bb', 'C', 'F', 'Am', 'Bb', 'C']
    acB = ['Dm', 'Bb', 'F', 'C', 'Bb', 'F', ('Gm', 'C'), 'F']
    frase = 8 * 3 * b
    p = Pista(frase * 7 + 30); t = 0
    for a in ('F', 'C'):
        arpegio(p, 'piano', a, t, b, 3, .45); colchon(p, a, t, 3 * b, .18); t += 3 * b
    plan = [(A, acA, 'piano', 0, .85), (B, acB, 'piano', 0, .85), (A, acA, 'cuerdas', 0, .7), (B, acB, 'cuerdas', 0, .7),
            (A, acA, 'piano', 12, .65), (B, acB, 'piano', 12, .6)]
    for mel, acs, inst, tr, vel in plan:
        tt = t
        for a in acs:
            parts = a if isinstance(a, tuple) else (a,)
            for x in parts:
                d = 3 / len(parts) if len(parts) == 1 else (2 if x == parts[0] else 1)
                arpegio(p, 'piano', x, tt, b, d, .34); colchon(p, x, tt, d * b, .16); tt += d * b
            if tr: p.nota('campana', voz(parts[0], 5)[0], tt - 3 * b, 1, .16)
        melodia(p, inst, mel, t, b, vel, tr); t = tt
    colchon(p, 'F', t, 6 * b, .28); p.nota('piano', 'F2', t, 4, .5); p.nota('campana', 'A5', t, 2, .3)
    return p, t + 6 * b

def adoracion():
    """«Adoración» — composición original de Mi Fe Católica. Órgano y colchón, 4/4 en Sol, lento."""
    b = 60 / 56
    A = [('B4', 3), ('A4', 1), ('G4', 2), ('E4', 2), ('D5', 3), ('B4', 1), ('A4', 4),
         ('G4', 2), ('B4', 2), ('C5', 2), ('E5', 2), ('C5', 2), ('A4', 1), ('F#4', 1), ('G4', 4)]
    B = [('E5', 2), ('D5', 1), ('C5', 1), ('B4', 2), ('D5', 2), ('C5', 2), ('A4', 2), ('F#4', 2), ('A4', 2),
         ('B4', 2), ('E5', 2), ('E5', 1), ('D5', 1), ('C5', 2), ('A4', 2), ('F#4', 2), ('G4', 4)]
    acA = ['Em', 'C', 'G', 'D', 'Em', 'C', ('Am', 'D'), 'G']
    acB = ['C', 'G', 'Am', 'D', 'Em', 'C', ('Am', 'D'), 'G']
    p = Pista(8 * 4 * b * 6 + 30); t = 0
    for a in ('Em', 'C'):
        colchon(p, a, t, 4 * b, .22); t += 4 * b
    plan = [(A, acA, 'organo', 0, .6, False), (B, acB, 'organo', 0, .6, False), (A, acA, 'cuerdas', 12, .55, True), (B, acB, 'cuerdas', 12, .55, True)]
    for mel, acs, inst, tr, vel, arp in plan:
        tt = t
        for a in acs:
            parts = a if isinstance(a, tuple) else (a,)
            for x in parts:
                d = 4 / len(parts)
                colchon(p, x, tt, d * b, .17)
                if arp: arpegio(p, 'piano', x, tt, b, d, .26, patron=(0, 1, 2, 3))
                tt += d * b
        melodia(p, inst, mel, t, b, vel, tr)
        if arp: p.nota('campana', 'G5', t, 1, .2)
        t = tt
    colchon(p, 'G', t, 8 * b, .26); p.nota('organo', 'G2', t, 6 * b, .3)
    return p, t + 8 * b

def claustro():
    """«Silencio del claustro» — composición original en estilo gregoriano (modo de Re), sobre un bordón."""
    b = 60 / 72
    f1 = [('D4', 1), ('F4', 1), ('G4', 1), ('A4', 2), ('A4', 1), ('G4', 1), ('A4', 1), ('C5', 1), ('B4', 1), ('A4', 2),
          ('G4', 1), ('F4', 1), ('G4', 1), ('E4', 1), ('D4', 3), ('R', 1)]
    f2 = [('A4', 1), ('C5', 1), ('D5', 2), ('C5', 1), ('A4', 1), ('B4', 1), ('C5', 1), ('A4', 2), ('G4', 1), ('A4', 1),
          ('F4', 1), ('E4', 1), ('D4', 3), ('R', 1)]
    f3 = [('F4', 1), ('E4', 1), ('D4', 1), ('F4', 1), ('G4', 2), ('A4', 1), ('G4', 1), ('F4', 1), ('E4', 1), ('D4', 1),
          ('E4', 1), ('D4', 4), ('R', 2)]
    canto = f1 + f2 + f3
    largo = sum(d for _, d in canto) * b
    p = Pista(largo * 3 + 40); t = 2 * b
    total = largo * 3 + 8 * b
    # bordón continuo (Re y La)
    k = 0
    while k * 8 * b < total:
        for n in ('D2', 'A2', 'D3'): p.nota('pad', n, k * 8 * b, 8 * b, .32)
        k += 1
    melodia(p, 'cuerdas', canto, t, b, .6); t += largo
    melodia(p, 'organo', canto, t, b, .45); melodia(p, 'cuerdas', canto, t, b, .35, -12)
    for x in (sum(d for _, d in f1), sum(d for _, d in f1 + f2), sum(d for _, d in canto)):
        p.nota('campana', 'D5', t + (x - 1) * b, 1, .2)
    t += largo
    melodia(p, 'cuerdas', canto, t, b, .5, 12); t += largo
    p.nota('campana', 'D5', t, 2, .3)
    return p, t + 6 * b

PIEZAS = {'noche-de-paz': noche_de_paz, 'himno-alegria': himno_alegria, 'canon-re': canon_re,
          'luz-de-maria': luz_de_maria, 'adoracion': adoracion, 'claustro': claustro}

if __name__ == '__main__':
    out = sys.argv[1]; os.makedirs(out, exist_ok=True)
    for nombre in (sys.argv[2:] or PIEZAS):
        p, fin = PIEZAS[nombre]()
        guardar(p, os.path.join(out, nombre + '.wav'), fin)
        print(nombre, round(fin), 's')
