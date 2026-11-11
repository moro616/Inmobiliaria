import sys, zipfile, struct, os
src, www, out = sys.argv[1:4]
extra = sys.argv[4] if len(sys.argv) > 4 else None  # carpeta con archivos que reemplazan a los del APK por su ruta (p. ej. res/mipmap-hdpi-v4/ic_launcher.png)
cambiados_res = []
zin = zipfile.ZipFile(src)
zout = zipfile.ZipFile(out, 'w')
replaced = set()
for zi in zin.infolist():
    n = zi.filename
    if n.startswith('META-INF/') and n.rsplit('.', 1)[-1] in ('SF', 'RSA', 'DSA', 'EC', 'MF'): continue
    data = zin.read(n)
    if extra and os.path.exists(os.path.join(extra, n)): data = open(os.path.join(extra, n), 'rb').read(); cambiados_res.append(n)
    if n.startswith('assets/public/') and not n.endswith('/'):
        rel = n[len('assets/public/'):]
        p = os.path.join(www, rel)
        if os.path.exists(p):
            nd = open(p, 'rb').read()
            if nd != data: replaced.add(rel)
            data = nd
    z = zipfile.ZipInfo(n, date_time=zi.date_time)
    z.compress_type = zi.compress_type; z.external_attr = zi.external_attr; z.create_system = zi.create_system
    if z.compress_type == zipfile.ZIP_STORED:
        off = zout.fp.tell(); base = off + 30 + len(n.encode()) + 6
        pad = (4 - base % 4) % 4
        z.extra = struct.pack('<HHH', 0xD935, 2 + pad, 4) + b'\0' * pad
    zout.writestr(z, data)
# archivos nuevos de www que no estaban en el APK original
existentes = {zi.filename for zi in zin.infolist()}
nuevos = []
for raiz, _, archivos in os.walk(www):
    for a in sorted(archivos):
        ruta = os.path.join(raiz, a); rel = os.path.relpath(ruta, www).replace(os.sep, '/')
        n = 'assets/public/' + rel
        if n in existentes: continue
        data = open(ruta, 'rb').read()
        z = zipfile.ZipInfo(n, date_time=(1981, 1, 1, 1, 1, 2)); z.external_attr = 0o644 << 16
        if rel.rsplit('.', 1)[-1].lower() in ('ogg', 'webp', 'png', 'jpg', 'mp3', 'opus'):
            z.compress_type = zipfile.ZIP_STORED
            off = zout.fp.tell(); base = off + 30 + len(n.encode()) + 6
            pad = (4 - base % 4) % 4
            z.extra = struct.pack('<HHH', 0xD935, 2 + pad, 4) + b'\0' * pad
        else:
            z.compress_type = zipfile.ZIP_DEFLATED
        zout.writestr(z, data); nuevos.append(rel)
zout.close()
print('reemplazados:', len(replaced), 'recursos:', len(cambiados_res), 'nuevos:', nuevos)
