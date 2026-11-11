"""Busca fotos de licencia libre en Wikimedia Commons y baja miniaturas candidatas.
Uso: python3 buscar_fotos.py carpeta_salida  (lee los temas de TEMAS)"""
import sys, os, json, re, html, time, urllib.parse, urllib.request, urllib.error
OUT = sys.argv[1]
UA = {'User-Agent': 'MiFeCatolicaApp/3.0 (busqueda de imagenes de licencia libre)'}
LIBRES = re.compile(r'^(cc0|public domain|pd|cc by(-sa)? [1-4]\.[05])', re.I)
TEMAS = {
 'papa': ['Pope Leo XIV', 'Leo XIV pope 2025', 'Papa León XIV'],
 'lujan': ['Basílica de Luján', 'Basílica Nuestra Señora de Luján interior'],
 'rosario': ['rosary in hands praying', 'rosary beads prayer'],
 'velas': ['votive candles church', 'candles in church prayer'],
 'rezar': ['person praying in church', 'praying hands church pew'],
 'biblia': ['open Bible on table', 'open Bible light'],
 'iglesia': ['church interior nave light', 'open church door light'],
 'amanecer': ['cross at sunrise', 'sunrise cross hill'],
 'adoracion': ['Eucharistic adoration monstrance', 'monstrance altar'],
 'sanpedro': ["St. Peter's Square Vatican", "St. Peter's Basilica facade"],
}
def api(params):
    url = 'https://commons.wikimedia.org/w/api.php?' + urllib.parse.urlencode({**params, 'format': 'json'})
    return json.loads(bajar(url))
def bajar(url, intentos=5):
    for k in range(intentos):
        try: return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60).read()
        except urllib.error.HTTPError as e:
            if e.code != 429 or k == intentos - 1: raise
            time.sleep(40 * (k + 1))
limpio = lambda s: re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', '', s or ''))).strip()
ruta_meta = os.path.join(OUT, '_meta.json')
meta = json.load(open(ruta_meta)) if os.path.exists(ruta_meta) else {}
MAX = 2
SOLO = sys.argv[2].split(',') if len(sys.argv) > 2 else list(TEMAS)
for tema, consultas in TEMAS.items():
    if tema not in SOLO: continue
    if any(k.startswith(tema + '-') for k in meta): print(tema, 'ya estaba'); continue
    vistos, n = set(), 0
    for q in consultas:
        try:
            r = api({'action': 'query', 'generator': 'search', 'gsrnamespace': 6, 'gsrsearch': q + ' filetype:bitmap', 'gsrlimit': 30,
                     'prop': 'imageinfo', 'iiprop': 'url|extmetadata|size|mime', 'iiurlwidth': 900})
        except Exception as e:
            print(tema, q, 'ERROR', e, flush=True); continue
        pags = sorted(r.get('query', {}).get('pages', {}).values(), key=lambda p: p.get('index', 99))
        for p in pags:
            ii = (p.get('imageinfo') or [{}])[0]; em = ii.get('extmetadata', {})
            lic = limpio(em.get('LicenseShortName', {}).get('value'))
            if p['title'] in vistos or ii.get('mime') != 'image/jpeg' or not LIBRES.match(lic): continue
            if ii.get('width', 0) < 1200 or ii.get('height', 0) < 800 or not ii.get('url') or ii.get('size', 9e9) > 7e6 or 'upload.wikimedia.org' not in ii['url']: continue
            vistos.add(p['title']); n += 1
            clave = f'{tema}-{n:02d}'
            try:
                data = bajar(ii['url'])
            except Exception as e:
                print(clave, 'descarga ERROR', e); n -= 1; continue
            open(os.path.join(OUT, clave + '.jpg'), 'wb').write(data)
            meta[clave] = {'titulo': p['title'], 'autor': limpio(em.get('Artist', {}).get('value'))[:120], 'licencia': lic,
                           'licencia_url': limpio(em.get('LicenseUrl', {}).get('value')), 'pagina': ii.get('descriptionurl'),
                           'original': ii.get('url'), 'w': ii.get('width'), 'h': ii.get('height'), 'fecha': limpio(em.get('DateTimeOriginal', {}).get('value'))[:30]}
            time.sleep(4)
            json.dump(meta, open(ruta_meta, 'w'), ensure_ascii=False, indent=1)
            if n >= MAX: break
        time.sleep(6)
        if n >= MAX: break
    print(tema, n, 'candidatas', flush=True)
    json.dump(meta, open(ruta_meta, 'w'), ensure_ascii=False, indent=1)
json.dump(meta, open(os.path.join(OUT, '_meta.json'), 'w'), ensure_ascii=False, indent=1)
