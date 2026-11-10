"""Copia las grabaciones nuevas (WAV) a la app como Opus y genera js/datos/voz.js con la lista de audios disponibles.
Uso: python3 integrar_voz.py carpeta_wav www/"""
import sys, os, json, subprocess
wav_dir, www = sys.argv[1], sys.argv[2]
dest = os.path.join(www, 'audio', 'voz'); os.makedirs(dest, exist_ok=True)
ids = []
for f in sorted(os.listdir(wav_dir)):
    if not f.endswith('.wav'): continue
    k = f[:-4]; out = os.path.join(dest, k + '.ogg'); src = os.path.join(wav_dir, f)
    if not os.path.exists(out) or os.path.getmtime(out) < os.path.getmtime(src):
        subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-i', src, '-af',
                        'highpass=f=70,acompressor=threshold=-20dB:ratio=2.2:attack=8:release=140,loudnorm=I=-17:TP=-1.5:LRA=9,apad=pad_dur=0.2',
                        '-ar', '48000', '-ac', '1', '-c:a', 'libopus', '-b:a', '40k', out], check=True)
    ids.append(k)
extra = sorted(k for k in ids if k.split('-')[0] in ('oracion', 'via', 'papa', 'novena'))
with open(os.path.join(www, 'js', 'datos', 'voz.js'), 'w', encoding='utf-8') as fh:
    fh.write('/* Grabaciones con voz natural incluidas en la app (generadas con scripts/voz_nueva.py). */\n')
    fh.write('window.MFC_VOZ = ' + json.dumps(extra, ensure_ascii=False) + ';\n')
cred = os.path.join(www, 'audio', 'creditos.json')
c = json.load(open(cred, encoding='utf-8'))
c['voz'] = {
    'motor': 'Chatterbox Multilingual (Resemble AI)', 'licencia_motor': 'MIT',
    'fuente': 'https://huggingface.co/ResembleAI/chatterbox',
    'timbre': 'Referencia de timbre: voz es_AR-daniela-high de Piper (CC BY-SA 4.0)',
    'verificacion': 'Cada frase se comprobó con reconocimiento de voz (faster-whisper) y se regeneró si no coincidía con el texto.',
    'textos': 'Oraciones tradicionales (dominio público), meditaciones originales de Mi Fe Católica y frases de los Papas citadas con su fuente.'
}
json.dump(c, open(cred, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(len(ids), 'audios integrados;', len(extra), 'para lectura de oraciones/novenas/Vía Crucis/Papas')
