"""Mi Fe Católica — grabación de la voz con Chatterbox Multilingual (Resemble AI, licencia MIT).
Normaliza el texto en español, lo divide en frases, genera cada frase, la verifica con reconocimiento de voz
(faster-whisper) y la vuelve a generar si no coincide. Une todo con pausas naturales.

Uso: python voz_nueva.py textos.json salida/ [--solo id1,id2] [--ref referencia.wav] [--prueba]"""
import sys, os, re, json, argparse, difflib, unicodedata, time
import numpy as np, torch, soundfile as sf
from num2words import num2words

ORD_F = ['', 'primera', 'segunda', 'tercera', 'cuarta', 'quinta', 'sexta', 'séptima', 'octava', 'novena', 'décima',
         'undécima', 'duodécima', 'decimotercera', 'decimocuarta']
ROMANOS_PAPAS = {'II': 'segundo', 'VI': 'sexto', 'XVI': 'dieciséis', 'XXIII': 'veintitrés', 'XIV': 'catorce', 'XIII': 'trece', 'XII': 'doce'}

def num(n): return num2words(int(n), lang='es')

def normalizar(t):
    t = t.replace(' ', ' ')
    t = re.sub(r'[«»"“”]', '', t)
    t = re.sub(r'\s*[—–]\s*', ', ', t)
    t = re.sub(r'\b(Juan Pablo|Juan|Pablo|Benedicto|León|Pío|Gregorio)\s+([IVXL]{1,6})\b', lambda m: m.group(1) + ' ' + ROMANOS_PAPAS.get(m.group(2), m.group(2)), t)
    # citas bíblicas: «Lucas 1, 26-38» → «Lucas, capítulo uno, versículos veintiséis al treinta y ocho»
    t = re.sub(r'\b([A-ZÁÉÍÓÚ][a-záéíóú]+)\s(\d+),\s?(\d+)\s?-\s?(\d+)', lambda m: f'{m.group(1)}, capítulo {num(m.group(2))}, versículos {num(m.group(3))} al {num(m.group(4))}', t)
    t = re.sub(r'\b([A-ZÁÉÍÓÚ][a-záéíóú]+)\s(\d+),\s?(\d+)', lambda m: f'{m.group(1)}, capítulo {num(m.group(2))}, versículo {num(m.group(3))}', t)
    t = re.sub(r'\bEstación (\d+)\b', lambda m: f'{ORD_F[int(m.group(1))].capitalize()} estación', t)
    t = re.sub(r'\b(\d+)\b', lambda m: num(m.group(1)), t)
    t = t.replace('del Ángel a María', 'del Ángel, a María')  # evita que se junte «a María»
    t = re.sub(r'[ \t]+', ' ', t)
    return t.strip()

def frases(t, maxc=230):
    """Divide en frases cortas; devuelve [(texto, pausa_despues_en_seg)]."""
    out = []
    for parrafo in [p.strip() for p in re.split(r'\n\s*\n', t) if p.strip()]:
        lineas = [l.strip() for l in parrafo.split('\n') if l.strip()]
        if len(lineas) > 8 and max(len(l) for l in lineas[:-1]) < 80:  # letanías: agrupar invocaciones cortas
            grupos, buf = [], ''
            for l in lineas:
                l = l if re.search(r'[.!?;:]$', l) else l + '.'
                if buf and len(buf) + len(l) + 1 > 125: grupos.append(buf); buf = l
                else: buf = (buf + ' ' + l).strip()
            if buf: grupos.append(buf)
            lineas = grupos
        for li, linea in enumerate(lineas):
            partes = re.findall(r'[^.!?;:]+[.!?;:]*', linea) or [linea]
            buf = ''
            for p in partes:
                p = p.strip()
                if not p: continue
                if len(buf) + len(p) + 1 <= maxc: buf = (buf + ' ' + p).strip()
                else:
                    if buf: out.append([buf, 0.38])
                    while len(p) > maxc:  # frase larga: cortar en coma
                        k = p.rfind(',', 0, maxc)
                        k = k if k > 40 else maxc
                        out.append([p[:k + 1].strip(), 0.22]); p = p[k + 1:].strip()
                    buf = p
            if buf: out.append([buf, 0.45])
        if out: out[-1][1] = 0.75
    if out: out[-1][1] = 0.2
    return [(a if re.search(r'[.!?;:]$', a) else a + '.', b) for a, b in out]

def simple(s):
    s = unicodedata.normalize('NFD', s.lower()); s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    return re.sub(r'[^a-zñ ]+', ' ', s).split()

def similitud(a, b):
    # Whisper suele escribir los números con cifras: se pasan a palabras antes de comparar
    b = re.sub(r'\d+', lambda m: num(m.group(0)), b)
    return difflib.SequenceMatcher(None, simple(a), simple(b)).ratio()

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('textos'); ap.add_argument('salida'); ap.add_argument('--solo', default='')
    ap.add_argument('--ref', default=None); ap.add_argument('--grupos', default='clips,papas,oraciones,via,nov')
    ap.add_argument('--exag', type=float, default=0.4); ap.add_argument('--cfg', type=float, default=0.45); ap.add_argument('--temp', type=float, default=0.7)
    ap.add_argument('--umbral', type=float, default=0.86); ap.add_argument('--intentos', type=int, default=3); ap.add_argument('--semilla', type=int, default=0); ap.add_argument('--rehacer', action='store_true')
    a = ap.parse_args()
    os.makedirs(a.salida, exist_ok=True)
    d = json.load(open(a.textos, encoding='utf-8'))
    items = []
    for g in a.grupos.split(','):
        if g == 'clips': items += sorted(d['clips'].items(), key=lambda kv: kv[0] == 'letanias')
        else: items += [(('oracion-' + x['id']) if g == 'oraciones' else x['id'], x['t']) for x in d[g]]
    if a.solo: items = [x for x in items if x[0] in a.solo.split(',')]
    torch.set_num_threads(os.cpu_count() or 4)
    from chatterbox.mtl_tts import ChatterboxMultilingualTTS
    from faster_whisper import WhisperModel
    tts = ChatterboxMultilingualTTS.from_pretrained(device='cpu')
    asr = WhisperModel('small', device='cpu', compute_type='int8')
    if a.ref: tts.prepare_conditionals(a.ref, exaggeration=a.exag)
    sr = tts.sr
    ruta_inf = os.path.join(a.salida, '_informe.json')
    informe = json.load(open(ruta_inf)) if os.path.exists(ruta_inf) else {}
    import hashlib
    cache = os.path.join(a.salida, '_cache'); os.makedirs(cache, exist_ok=True)
    for k, texto in items:
        destino = os.path.join(a.salida, k + '.wav')
        if os.path.exists(destino): continue
        t0 = time.time(); trozos = []; malos = []
        for f, pausa in frases(normalizar(texto)):
            mejor = (-1, None, '')
            np_ = len(simple(f)); umbral = min(a.umbral, 1 - 1.6 / max(np_, 2))
            clave = os.path.join(cache, hashlib.sha1(f'{f}|{a.exag}|{a.cfg}|{a.temp}|{a.ref}'.encode()).hexdigest() + '.npy')
            if os.path.exists(clave) and not a.rehacer:
                trozos.append(np.load(clave)); trozos.append(np.zeros(int(pausa * sr), dtype=np.float32)); continue
            for intento in range(a.intentos):
                torch.manual_seed(1000 + a.semilla + intento * 7 + len(f))
                wav = tts.generate(f, language_id='es', exaggeration=a.exag, cfg_weight=a.cfg, temperature=a.temp).squeeze(0).numpy()
                # recorte de silencios en los extremos
                idx = np.where(np.abs(wav) > 0.01)[0]
                if len(idx): wav = wav[max(0, idx[0] - int(.03 * sr)): idx[-1] + int(.08 * sr)]
                w16 = np.interp(np.arange(0, len(wav), sr / 16000), np.arange(len(wav)), wav).astype(np.float32)
                segs, _ = asr.transcribe(w16, language='es', beam_size=1, vad_filter=False)
                oido = ' '.join(s.text for s in segs)
                sim = similitud(f, oido)
                dur_ok = 0.035 <= len(wav) / sr / max(1, len(f)) <= 0.14
                score = sim - (0 if dur_ok else 0.2)
                if score > mejor[0]: mejor = (score, wav, oido)
                if sim >= umbral and dur_ok: break
            np.save(clave, mejor[1])
            if mejor[0] < umbral: malos.append({'frase': f, 'oido': mejor[2], 'sim': round(mejor[0], 2)})
            trozos.append(mejor[1]); trozos.append(np.zeros(int(pausa * sr), dtype=np.float32))
        audio = np.concatenate(trozos)
        sf.write(destino, audio, sr)
        informe[k] = {'seg': round(len(audio) / sr, 1), 'tardo': round(time.time() - t0), 'dudosas': malos}
        print(k, informe[k]['seg'], 's audio en', informe[k]['tardo'], 's', ('· DUDOSAS: ' + str(len(malos))) if malos else '', flush=True)
        json.dump(informe, open(os.path.join(a.salida, '_informe.json'), 'w'), ensure_ascii=False, indent=1)

if __name__ == '__main__':
    main()
