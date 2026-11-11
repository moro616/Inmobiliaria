// Genera íconos de la app y pantallas de arranque a partir del logo SVG. Uso: node gen_iconos.js logo.svg carpeta_res_original carpeta_salida
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
(async () => {
  const [,, svgPath, resOrig, out] = process.argv;
  const svg = fs.readFileSync(svgPath, 'utf8');
  const defs = svg.match(/<defs>[\s\S]*?<\/defs>/)[0];
  const cuerpo = svg.replace(/^[\s\S]*?<\/defs>/, '').replace(/<\/svg>\s*$/, '');
  const arte = cuerpo.replace(/<rect width="512" height="512" rx="112" fill="url\(#bg\)"\/>/, '')
    .replace('<path d="M0 372 Q256 330 512 372 V512 H0Z" fill="#0b1630" clip-path="url(#marco)"/>', '<path d="M-700 400 Q256 318 1212 400 V1400 H-700Z" fill="#0b1630"/>');
  const circ = '<clipPath id="circ"><circle cx="256" cy="256" r="256"/></clipPath>';
  const S = (inner, extra = '') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" ${extra}>${defs}${inner}</svg>`;
  const variantes = {
    cuadrado: S(cuerpo),
    redondo: S(`${circ}<g clip-path="url(#circ)"><rect width="512" height="512" fill="url(#bg)"/><g transform="translate(256 256) scale(.84) translate(-256 -262)">${arte}</g></g>`),
    adaptable: S(`<rect width="512" height="512" fill="url(#bg)"/><g transform="translate(256 256) scale(.6) translate(-256 -262)">${arte}</g>`),
  };
  const b = await chromium.launch(); const pg = await (await b.newContext({ deviceScaleFactor: 1 })).newPage();
  const render = async (html, w, h, dest, transp) => { await pg.setViewportSize({ width: w, height: h }); await pg.setContent(`<body style="margin:0;${transp ? '' : 'background:#081022'}">${html}</body>`); fs.mkdirSync(path.dirname(dest), { recursive: true }); await pg.screenshot({ path: dest, omitBackground: !!transp, clip: { x: 0, y: 0, width: w, height: h } }); };
  const img = (v, px) => `<div style="width:${px}px;height:${px}px">${variantes[v].replace('<svg ', `<svg width="${px}" height="${px}" `)}</div>`;
  for (const dir of fs.readdirSync(resOrig)) {
    for (const f of fs.readdirSync(path.join(resOrig, dir))) {
      const src = path.join(resOrig, dir, f), dest = path.join(out, 'res', dir, f);
      if (!/^(ic_launcher(_round|_foreground)?|splash)\.png$/.test(f)) continue;
      const buf = fs.readFileSync(src); const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
      if (f === 'ic_launcher.png') await render(img('cuadrado', w), w, h, dest, true);
      else if (f === 'ic_launcher_round.png') await render(img('redondo', w), w, h, dest, true);
      else if (f === 'ic_launcher_foreground.png') await render(img('adaptable', w), w, h, dest, false);
      else { const lado = Math.round(Math.min(w, h) * 0.5);
        await render(`<div style="width:${w}px;height:${h}px;display:grid;place-items:center;background:#0b1630">${img('redondo', lado)}</div>`, w, h, dest, false); }
    }
  }
  await render(img('cuadrado', 512), 512, 512, path.join(out, 'icono-512.png'), true);
  await b.close(); console.log('ok');
})();
