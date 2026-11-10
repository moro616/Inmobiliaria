/* Mi Fe Católica 3.0 — aplicación principal (Metrics Lab Agency). */
(function () {
  'use strict';
  const N = window.Nativo, L = window.Liturgia, R = window.MFC_ROSARIO, F = window.MFC_FUENTES, CFG = window.MFC_CONFIG;
  const $ = s => document.querySelector(s);
  const main = $('#main'), toastEl = $('#toast');
  const h = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
  const hoy = () => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate(), w: d.getDay() }; };
  const fechaLarga = (d = new Date()) => cap(new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }).format(d));

  /* ================= Estado guardado en el dispositivo ================= */
  const DEF = { tema: 'oscuro', letra: 'normal', velocidad: 1, favoritos: [], intenciones: [], rosario: { tipo: null, i: 0 }, coronilla: { i: 0 }, viacrucis: 0,
    camino: 1, novenas: {}, notas: [], frasesFav: [], lector: {}, lectorLetra: 1, lectorTema: 'sepia', bibliaTest: 'NT', mostrarTexto: true, letanias: false, recordatorios: { rosario: null, angelus: false, novena: false }, voz: 'natural', musica: true, volMusica: 0.35, ultimaRevision: 0, noticiasCache: {}, evangelioCache: null };
  let S;
  try { S = { ...DEF, ...JSON.parse(localStorage.getItem('mfc3') || '{}') }; } catch (e) { S = { ...DEF }; }
  try { // migración desde la versión 2.x
    const viejo = JSON.parse(localStorage.getItem('mfc-state') || 'null');
    if (viejo && !localStorage.getItem('mfc3')) {
      S.favoritos = viejo.favorites || []; if (viejo.intention) S.intenciones = [{ id: Date.now(), texto: viejo.intention, fecha: new Date().toISOString().slice(0, 10) }];
      S.letra = viejo.large ? 'grande' : 'normal'; S.tema = viejo.light ? 'claro' : 'oscuro';
    }
  } catch (e) { }
  const guardar = () => { try { localStorage.setItem('mfc3', JSON.stringify(S)); } catch (e) { } };

  /* ================= Oraciones (unificadas con su origen) ================= */
  const TRADICIONALES_EN_DEVOCIONES = ['senor-mio', 'comunion-espiritual', 'adoracion'];
  const ORACIONES = (() => {
    const out = [], ids = new Set();
    const add = (p, origen) => { if (ids.has(p.id)) return; ids.add(p.id); out.push({ ...p, origen }); };
    const base = (window.FE_DATA && window.FE_DATA.prayers) || [];
    base.forEach(p => {
      const esOriginal = /original/i.test(p.note || '') || (/redactada para esta aplicación/i.test(p.note || '') && !TRADICIONALES_EN_DEVOCIONES.includes(p.id));
      const q = { ...p }; if (TRADICIONALES_EN_DEVOCIONES.includes(p.id) || !esOriginal) delete q.note;
      add(q, esOriginal ? 'original' : 'tradicional');
    });
    (window.MFC_ORACIONES_EXTRA || []).forEach(p => add(p, 'tradicional'));
    (window.MFC_ORACIONES_ORIGINALES || []).forEach(p => add(p, 'original'));
    return out;
  })();
  const oracion = id => ORACIONES.find(p => p.id === id);
  const txt = id => (oracion(id) || {}).text || '';

  /* ================= Utilidades de interfaz ================= */
  function aviso(t) { toastEl.textContent = t; toastEl.classList.add('visible'); clearTimeout(aviso.t); aviso.t = setTimeout(() => toastEl.classList.remove('visible'), 3200); }
  const btn = (label, accion, cls = '') => `<button class="btn ${cls}" data-a="${h(accion)}">${label}</button>`;
  const titulo = (t, sub) => `<div class="titulo"><h1>${h(t)}</h1>${sub ? `<p>${sub}</p>` : ''}</div>`;
  const item = (ico, t, sub, accion) => `<button class="item" data-a="${h(accion)}"><span class="ico">${ico}</span><span class="txt"><strong>${h(t)}</strong>${sub ? `<small>${h(sub)}</small>` : ''}</span><span class="flecha">›</span></button>`;
  const pie = () => `<div class="footer">Mi Fe Católica ${h(CFG.version)} · Metrics Lab Agency<br>Hecho con respeto y cariño para la comunidad católica</div>`;
  function aplicarAjustes() {
    document.body.classList.toggle('claro', S.tema === 'claro');
    document.body.classList.toggle('letra-grande', S.letra === 'grande');
    document.body.classList.toggle('letra-muy-grande', S.letra === 'muy-grande');
    document.querySelector('meta[name=theme-color]').setAttribute('content', S.tema === 'claro' ? '#f6f1e5' : '#0a1428');
    N.estiloBarras(S.tema !== 'claro');
  }

  /* ================= Navegación con historial (botón atrás de Android) ================= */
  const RAICES = ['inicio', 'rosario', 'oraciones', 'explorar', 'ajustes'];
  let pila = [{ p: 'inicio' }];
  const actual = () => pila[pila.length - 1];
  function ir(p, arg, reemplazar) {
    detenerVoz();
    if (RAICES.includes(p)) pila = [{ p }]; else if (reemplazar) pila[pila.length - 1] = { p, arg }; else pila.push({ p, arg });
    render(); window.scrollTo(0, 0);
  }
  function atras() {
    detenerVoz();
    if (actual().p === 'historia') { cerrarHistoria(); return; }
    if (actual().p === 'lector') { pila.pop(); document.body.classList.remove('modo-rezo'); render(); return; }
    if (document.body.classList.contains('modo-rezo')) { salirRezo(); return; }
    if (pila.length > 1) { pila.pop(); render(); window.scrollTo(0, 0); return; }
    if (actual().p !== 'inicio') { ir('inicio'); return; }
    N.salir();
  }

  /* ================= Audio grabado (voz natural) y música de fondo ================= */
  const Sonido = (() => {
    const voz = typeof Audio !== 'undefined' ? new Audio() : null, musica = typeof Audio !== 'undefined' ? new Audio('audio/musica/meditacion.ogg') : null;
    if (musica) { musica.loop = true; musica.preload = 'none'; }
    let resolver = null;
    const tocar = (el, alFallar) => { try { const pr = el.play(); if (pr && pr.catch) pr.catch(alFallar); } catch (e) { alFallar(); } };
    const pausar = el => { try { el.pause(); } catch (e) { } };
    return {
      clip(id) { // reproduce audio/voz/<id>.ogg; resuelve true al terminar o false si falla
        return new Promise(ok => {
          if (!voz) return ok(false);
          resolver = ok; voz.onended = () => ok(true); voz.onerror = () => ok(false);
          voz.src = `audio/voz/${id}.ogg`; voz.playbackRate = 1;
          tocar(voz, () => ok(false));
        });
      },
      detenerClip() { if (voz) { pausar(voz); voz.removeAttribute('src'); try { voz.load(); } catch (e) { } } if (resolver) { resolver(false); resolver = null; } },
      musica(on) { if (!musica) return; if (on && S.musica) { musica.volume = S.volMusica; tocar(musica, () => { }); } else pausar(musica); },
      volumen(v) { if (musica) musica.volume = v; }
    };
  })();

  /* ================= Voz ================= */
  let hablando = false, sesionVoz = 0;
  // Grabaciones con voz natural incluidas en la app (js/datos/voz.js). Si existe la grabación, se usa en lugar de la voz del teléfono.
  const GRABADAS = new Set(window.MFC_VOZ || []);
  async function leer(texto, clip) {
    if (clip && GRABADAS.has(clip) && S.voz !== 'telefono') {
      await detenerVoz(); hablando = true; const ses = ++sesionVoz; marcarBotonVoz(true);
      const ok = await Sonido.clip(clip);
      if (ses === sesionVoz) { hablando = false; marcarBotonVoz(false); }
      if (ok || ses !== sesionVoz) return;
    }
    if (!N.Voz.disponible()) { aviso('La lectura en voz alta no está disponible en este equipo.'); return; }
    await detenerVoz(); hablando = true; const ses = ++sesionVoz; marcarBotonVoz(true);
    try { await N.Voz.hablar(texto, S.velocidad); } catch (e) { aviso('El teléfono no tiene una voz en español lista. Mirá Ajustes › Voz y audio.'); if (actual().p === 'ajustes') setTimeout(() => ir('voces'), 1800); }
    if (ses === sesionVoz) { hablando = false; marcarBotonVoz(false); }
  }
  async function detenerVoz() { sesionVoz++; hablando = false; rezoAuto = false; Sonido.detenerClip(); await N.Voz.detener(); marcarBotonVoz(false); actualizarPlay(); }
  function marcarBotonVoz(si) { document.querySelectorAll('[data-a^="leer"]').forEach(b => { if (b.dataset.lbl) b.innerHTML = si ? '⏹ Detener' : b.dataset.lbl; }); }
  const btnLeer = (accion, label = '🔊 Escuchar', cls = 'primario') => `<button class="btn ${cls}" data-a="${h(accion)}" data-lbl="${h(label)}">${label}</button>`;

  /* ================= Pantallas ================= */
  const P = {};

  P.inicio = () => {
    const t = hoy(), li = L.info(t.y, t.m, t.d), tipo = R.dias[t.w], g = R.grupos[tipo];
    const cel = li.celebracion;
    const ev = S.evangelioCache && S.evangelioCache.fecha === li.fecha ? S.evangelioCache : null;
    const upd = window.__actualizacion;
    return `${upd ? `<div class="card destacada"><span class="eyebrow">Nueva versión disponible</span><h3>Mi Fe Católica ${h(upd.versionName)}</h3><p class="small muted">${h(upd.notes || '').slice(0, 200)}</p>${btn('Ver actualización', 'ir:actualizar', 'primario ancho')}</div>` : ''}
    <div class="hero"><div class="hero-img" style="background-image:url(img/misterios/${tipo}-1.webp)" aria-hidden="true"></div><div class="hero-fecha">${h(fechaLarga())}</div><h1>Un momento con Dios cambia tu día</h1>
      <p>Hoy rezamos los <b>${h(g.nombre)}</b>.</p>${btn('📿 Rezar el Rosario de hoy', 'rezar:' + tipo, 'primario ancho')}</div>
    <div class="card liturgia-hoy" style="--lc:${li.colorHex}"><div class="dia-liturgico"><div class="franja" style="background:${li.colorHex}"></div><div>
      <span class="eyebrow">Calendario litúrgico · hoy</span><h3>${h(cel && cel.rango !== 'ML' ? cel.nombre : li.titulo)}</h3>
      <p class="small muted">${h(cel && cel.rango !== 'ML' ? li.titulo + ' · ' + cel.rangoNombre : (cel ? 'Memoria libre: ' + cel.nombre : li.tiempo))}<br>Color: ${h(li.color)} · Ciclo ${h(li.cicloDominical)}</p>
      ${btn('Ver calendario', 'ir:calendario', 'chico')}</div></div></div>
    <div class="card"><span class="eyebrow">📖 Palabra de Dios</span><h3>${ev ? h(ev.titulo) : 'Evangelio del día'}</h3>
      <p class="small muted">Las lecturas de la Misa se consultan en Vatican News, la fuente oficial de la Santa Sede.</p>${btn('📖 Leer el Evangelio de hoy', 'ir:lecturas', 'ancho')}</div>
    ${(() => { const [f, i] = fraseDelDia(); return f ? `<button class="frase" data-a="frase:${i}" style="background-image:linear-gradient(180deg,rgba(5,10,23,.2),rgba(5,10,23,.88)),url(img/misterios/${IMGS[i % IMGS.length]}.webp);margin-bottom:16px"><span class="eyebrow" style="color:#f3d98f">Frase del día</span><q>${h(f.t)}</q><small>${h(f.a)}</small></button>` : ''; })()}
    <h2 class="seccion">Palabras de los Papas</h2>${filaHistorias()}
    <h2 class="seccion">Tu espacio de fe</h2><div class="grilla">
      ${[['🙏', 'Oraciones', 'Clásicas y para cada momento', 'oraciones'], ['🕯', 'Novenas', 'Nueve días de oración', 'novenas'], ['📖', 'Biblia', 'Palabra de Dios', 'biblia'],
        ['💙', 'Divina Misericordia', 'Coronilla guiada', 'rezar:coronilla'], ['✝', 'Vía Crucis', '14 estaciones', 'viacrucis'], ['📰', 'Noticias', 'Papa, Iglesia y Argentina', 'noticias'],
        ['📅', 'Calendario', 'Santos y tiempos litúrgicos', 'calendario'], ['🎓', 'Formación', 'Aprender la fe', 'formacion'], ['🎶', 'Música', 'Para rezar y alabar', 'musica'], ['🕊️', 'Frases de los Papas', 'En formato historia', 'papas'], ['📺', 'Videos y radio', 'Misa y programas', 'medios'],
        ['✍️', 'Cuaderno espiritual', 'Tus anotaciones', 'cuaderno'], ['📚', 'Biblioteca', 'Libros para leer', 'biblioteca'], ['✨', 'Frases', 'Pensamientos de santos', 'frases'], ['🌿', '30 días', 'Camino de oración', 'camino'], ['💛', 'Mis intenciones', 'Mis pedidos a Dios', 'intenciones'], ['⭐', 'Favoritas', 'Oraciones guardadas', 'favoritos']]
        .map(([i, t, s, a], n) => `<button class="tile" style="--h:${[38, 268, 28, 212, 0, 200, 150, 248, 330, 300, 190, 22, 16, 45, 120, 48, 52][n % 17]}" data-a="${a.includes(':') ? a : 'ir:' + a}"><span class="sim">${i}</span><strong>${t}</strong><small>${s}</small></button>`).join('')}
    </div>${pie()}`;
  };

  /* ---------- Rosario: elección de misterios ---------- */
  P.rosario = () => {
    const t = hoy(), deHoy = R.dias[t.w], elegido = S.rosario.tipo || deHoy, prog = S.rosario.tipo ? S.rosario.i : 0;
    const total = secuenciaRosario(elegido).length;
    return `${titulo('Santo Rosario', 'Elegí los misterios y tocá <b>Comenzar</b>. Podés rezar mirando las cuentas o escuchar el Rosario completo.')}
    <div class="rosario-elegir">${Object.keys(R.grupos).map(k => `<button class="misterio-op ${k === elegido ? 'activo' : ''}" data-a="elegirmist:${k}">
      <img src="img/misterios/${k}-1.webp" alt="" loading="lazy">${k === deHoy ? '<b class="hoy">HOY</b>' : ''}<span><strong>${h(R.grupos[k].nombre.replace('Misterios ', ''))}</strong><small>${h(R.grupos[k].dias)}</small></span></button>`).join('')}</div>
    <div class="card"><span class="eyebrow">${h(R.grupos[elegido].nombre)}</span>
      <ol style="padding-left:1.2em;margin:.4em 0 .8em">${R.misterios[elegido].map(m => `<li>${h(m.t)}</li>`).join('')}</ol>
      ${prog > 0 && S.rosario.tipo === elegido ? `<p class="small muted">Vas por el paso ${prog + 1} de ${total}.</p><div class="progreso"><div style="width:${(prog + 1) / total * 100}%"></div></div>
        <div class="fila">${btn('▶ Continuar', 'rezar:' + elegido, 'primario')}${btn('↺ Empezar de nuevo', 'rezarnuevo:' + elegido)}</div>`
        : btn('📿 Comenzar el Rosario', 'rezar:' + elegido, 'primario ancho')}</div>
    <div class="lista">${item('💙', 'Coronilla de la Divina Misericordia', 'Con las mismas cuentas, ideal a las 15 h', 'rezar:coronilla')}${item('📜', 'Letanías de la Virgen', 'Para rezar al final del Rosario', 'oracion:letanias')}${item('❓', 'Cómo se reza el Rosario', 'Guía paso a paso', 'leccion:rosario-como')}</div>
    <div class="aviso">La voz usa el motor de texto a voz de Android. Mientras rezás, la pantalla se mantiene encendida para que la lectura no se corte.</div>${pie()}`;
  };

  /* ---------- Secuencias de oración ---------- */
  function secuenciaRosario(tipo) {
    const ms = R.misterios[tipo], s = [], ord = ['Primer', 'Segundo', 'Tercer', 'Cuarto', 'Quinto'], gr = R.grupos[tipo].nombre.replace('Misterios ', '').replace(/s$/, '').toLowerCase();
    const pn = txt('padrenuestro'), am = txt('avemaria'), gl = txt('gloria');
    s.push({ t: 'Señal de la Cruz', x: R.textos.senal, c: 'cruz', img: 0, au: 'senal' });
    s.push({ t: 'Ofrecimiento', x: R.textos.ofrecimiento, c: 'cruz', img: 0, au: 'ofrecimiento' });
    s.push({ t: 'Credo', x: txt('credo'), c: 'cruz', img: 0, au: 'credo' });
    s.push({ t: 'Padre Nuestro', x: pn, c: 'p0', img: 0, au: 'padrenuestro' });
    R.virtudes.forEach((v, i) => s.push({ t: `Ave María ${i + 1} de 3`, sub: 'Por ' + v, x: am, c: 'p' + (i + 1), img: 0, au: 'avemaria' }));
    s.push({ t: 'Gloria', x: gl, c: 'medalla', img: 0, au: 'gloria' });
    ms.forEach((m, k) => {
      const n = k + 1;
      s.push({ t: `${ord[k]} misterio ${gr}`, sub: m.t, x: `${ord[k]} misterio ${gr}: ${m.t}.\n${m.cita}. Fruto: ${m.fruto}.\n\n${m.m}`, c: 'L' + n, img: n, anuncio: true, au: `misterio-${tipo}-${n}` });
      s.push({ t: 'Padre Nuestro', sub: m.t, x: pn, c: 'L' + n, img: n, au: 'padrenuestro' });
      for (let j = 1; j <= 10; j++) s.push({ t: `Ave María ${j} de 10`, sub: m.t, x: am, c: `S${n}-${j}`, img: n, au: 'avemaria' });
      s.push({ t: 'Gloria', sub: m.t, x: gl, c: `S${n}-10`, img: n, hecho: true, au: 'gloria' });
      s.push({ t: 'Oh Jesús mío', sub: m.t, x: R.textos.jaculatoria + '\n\n' + R.textos.maria, c: `S${n}-10`, img: n, hecho: true, au: 'jaculatoria' });
    });
    s.push({ t: 'La Salve', x: txt('salve'), c: 'medalla', img: 5, fin: true, au: 'salve' });
    if (S.letanias) s.push({ t: 'Letanías de la Virgen', x: txt('letanias'), c: 'medalla', img: 5, fin: true, au: 'letanias' });
    s.push({ t: 'Oración final', x: R.textos.final, c: 'medalla', img: 5, fin: true, au: 'final' });
    s.push({ t: 'Señal de la Cruz', x: 'En el nombre del Padre, y del Hijo, y del Espíritu Santo. Amén.', c: 'cruz', img: 5, fin: true, au: 'senal-fin' });
    return s;
  }
  function secuenciaCoronilla() {
    const s = [], pe = 'Padre Eterno, te ofrezco el Cuerpo y la Sangre, el Alma y la Divinidad de tu amadísimo Hijo, nuestro Señor Jesucristo, como propiciación de nuestros pecados y los del mundo entero.';
    const pp = 'Por su dolorosa Pasión, ten misericordia de nosotros y del mundo entero.';
    s.push({ t: 'Señal de la Cruz', x: 'En el nombre del Padre, y del Hijo, y del Espíritu Santo. Amén.', c: 'cruz', au: 'senal-fin' });
    s.push({ t: 'Padre Nuestro', x: txt('padrenuestro'), c: 'p1', au: 'padrenuestro' }, { t: 'Ave María', x: txt('avemaria'), c: 'p2', au: 'avemaria' }, { t: 'Credo', x: txt('credo'), c: 'p3', au: 'credo' });
    for (let d = 1; d <= 5; d++) {
      s.push({ t: `Decena ${d} · Cuenta grande`, x: pe, c: 'L' + d, au: 'coronilla-padre-eterno' });
      for (let j = 1; j <= 10; j++) s.push({ t: `Decena ${d} · ${j} de 10`, x: pp, c: `S${d}-${j}`, au: 'coronilla-pasion' });
    }
    for (let i = 1; i <= 3; i++) s.push({ t: `Santo Dios (${i} de 3)`, x: 'Santo Dios, Santo Fuerte, Santo Inmortal, ten piedad de nosotros y del mundo entero.', c: 'medalla', fin: true, au: 'coronilla-santo-dios' });
    s.push({ t: 'Jesús, en Vos confío', x: 'Oh Sangre y Agua que brotaste del Corazón de Jesús como fuente de misericordia para nosotros, en Vos confío. Jesús, en Vos confío.', c: 'medalla', fin: true, au: 'coronilla-confio' });
    return s;
  }

  /* ---------- Dibujo del rosario (SVG) ---------- */
  const CX = 200, CY = 258, RX = 170, RY = 226;
  const ORDEN = ['cruz', 'p0', 'p1', 'p2', 'p3', 'medalla'];
  for (let m = 1; m <= 5; m++) { ORDEN.push('L' + m); for (let j = 1; j <= 10; j++) ORDEN.push(`S${m}-${j}`); }
  const POS = (() => {
    const pos = {}, lazo = ORDEN.slice(6), a0 = 101, a1 = 439, paso = (a1 - a0) / (lazo.length - 1);
    lazo.forEach((id, i) => { const a = (a0 + i * paso) * Math.PI / 180; pos[id] = { x: CX + RX * Math.cos(a), y: CY + RY * Math.sin(a), r: id[0] === 'L' ? 11 : 7.4 }; });
    pos.medalla = { x: CX, y: CY + RY + 10, r: 12 }; pos.p0 = { x: CX, y: 532, r: 11 };
    pos.p1 = { x: CX, y: 556, r: 7.4 }; pos.p2 = { x: CX, y: 575, r: 7.4 }; pos.p3 = { x: CX, y: 594, r: 7.4 }; pos.cruz = { x: CX, y: 634, r: 0 };
    return pos;
  })();
  function svgRosario(paso, imagen) {
    const ordenActual = ORDEN.indexOf(paso.c);
    const estado = id => {
      if (paso.fin && id !== 'cruz' && id !== 'medalla') return 'hecha';
      if (id === paso.c) return paso.hecho ? 'hecha-actual' : 'actual';
      return ORDEN.indexOf(id) < ordenActual ? 'hecha' : 'pend';
    };
    const lazoPath = ORDEN.slice(6).map((id, i) => `${i ? 'L' : 'M'}${POS[id].x.toFixed(1)} ${POS[id].y.toFixed(1)}`).join(' ') + ` L${POS.medalla.x} ${POS.medalla.y} Z`;
    let halo = '';
    const cuentas = ORDEN.filter(id => id !== 'cruz').map(id => {
      const p = POS[id], e = estado(id), act = e === 'actual' || e === 'hecha-actual', x = p.x.toFixed(1), y = p.y.toFixed(1);
      if (act) halo = `<circle class="halo" cx="${x}" cy="${y}" r="${p.r + 16}" fill="url(#gHalo)"/><circle class="onda" cx="${x}" cy="${y}" r="${p.r + 4}" fill="none" stroke="#fff3c4" stroke-width="1.5"/>`;
      const fill = act ? 'url(#gAct)' : e.startsWith('hecha') ? 'url(#gOro)' : 'url(#gPerla)';
      if (id === 'medalla') return `<g class="${act ? 'cuenta-actual' : ''}" filter="url(#sombra)"><path d="M${p.x} ${p.y - 15} C${p.x + 13} ${p.y - 12} ${p.x + 13} ${p.y + 12} ${p.x} ${p.y + 15} C${p.x - 13} ${p.y + 12} ${p.x - 13} ${p.y - 12} ${p.x} ${p.y - 15}Z" fill="${act ? 'url(#gAct)' : 'url(#gOro)'}" stroke="#7a5a18" stroke-width="1"/><path d="M${p.x} ${p.y - 7}V${p.y + 7}M${p.x - 5} ${p.y - 2}H${p.x + 5}" stroke="#5a410c" stroke-width="1.6" stroke-linecap="round"/></g>`;
      const r = act ? p.r + 2.5 : p.r;
      return `<g class="cuenta ${act ? 'cuenta-actual' : ''}" filter="url(#sombra)"><circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" stroke="${act ? '#fffbe9' : e.startsWith('hecha') ? '#8a6a24' : 'rgba(255,255,255,.55)'}" stroke-width="${act ? 1.6 : .8}"/><circle cx="${(p.x - r * .32).toFixed(1)}" cy="${(p.y - r * .36).toFixed(1)}" r="${(r * .32).toFixed(1)}" fill="#fff" opacity="${e === 'pend' ? .75 : .55}"/></g>`;
    }).join('');
    const c = POS.cruz, crAct = paso.c === 'cruz';
    const cruz = `<g class="${crAct ? 'cuenta-actual' : ''}" filter="url(#sombra)">
      ${crAct ? `<circle class="halo" cx="${c.x}" cy="${c.y - 4}" r="34" fill="url(#gHalo)"/>` : ''}
      <path d="M${c.x - 4} ${c.y - 30}h8v14h14v8h-14v36h-8v-36h-14v-8h14z" fill="${crAct ? 'url(#gAct)' : 'url(#gCruz)'}" stroke="#6b4f14" stroke-width="1" stroke-linejoin="round"/>
      <circle cx="${c.x}" cy="${c.y - 12}" r="2.4" fill="#fff6d6" opacity=".9"/></g>`;
    const img = imagen ? `<g class="kb"><image href="${imagen}" x="-6" y="-8" width="412" height="590" preserveAspectRatio="xMidYMid slice" mask="url(#mOval)"/></g>
      <ellipse cx="${CX}" cy="282" rx="204" ry="292" fill="url(#gLuz)" mask="url(#mOval)" style="mix-blend-mode:screen"/>` : '';
    return `<svg viewBox="0 0 400 668" role="img" aria-label="${h(paso.t)}. Tocá la imagen para avanzar." data-a="rezo:sig">
      <defs>
        <radialGradient id="gOro" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#fff6d8"/><stop offset=".45" stop-color="#e9c46a"/><stop offset="1" stop-color="#7d5c1c"/></radialGradient>
        <radialGradient id="gPerla" cx="35%" cy="30%" r="80%"><stop offset="0" stop-color="#ffffff" stop-opacity=".95"/><stop offset=".55" stop-color="#dfe3ee" stop-opacity=".7"/><stop offset="1" stop-color="#7f8aa6" stop-opacity=".75"/></radialGradient>
        <radialGradient id="gAct" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#ffffff"/><stop offset=".45" stop-color="#fff2c2"/><stop offset="1" stop-color="#f0bf3c"/></radialGradient>
        <radialGradient id="gHalo" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff6cf" stop-opacity=".95"/><stop offset=".35" stop-color="#f6d77d" stop-opacity=".55"/><stop offset="1" stop-color="#f6d77d" stop-opacity="0"/></radialGradient>
        <linearGradient id="gCruz" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff0bd"/><stop offset=".5" stop-color="#d9ac48"/><stop offset="1" stop-color="#8a6420"/></linearGradient>
        <radialGradient id="gOval" cx="50%" cy="50%" r="50%"><stop offset=".6" stop-color="#fff"/><stop offset=".86" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
        <radialGradient id="gLuz" cx="50%" cy="0%" r="70%"><stop offset="0" stop-color="#fff2c8" stop-opacity=".55"/><stop offset=".5" stop-color="#fff2c8" stop-opacity=".08"/><stop offset="1" stop-color="#fff2c8" stop-opacity="0"/></radialGradient>
        <mask id="mOval"><ellipse cx="${CX}" cy="282" rx="204" ry="292" fill="url(#gOval)"/></mask>
        <filter id="sombra" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="1.5" stdDeviation="1.6" flood-color="#000" flood-opacity=".55"/></filter>
        <filter id="brillo" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      </defs>
      ${img}
      <path d="${lazoPath}" fill="none" stroke="#1a1206" stroke-opacity=".45" stroke-width="3"/>
      <path d="${lazoPath}" fill="none" stroke="#e8c66e" stroke-opacity=".85" stroke-width="1.3"/>
      <path d="M${CX} ${POS.medalla.y + 14} V${c.y - 30}" stroke="#e8c66e" stroke-opacity=".85" stroke-width="1.3"/>
      ${halo}${cuentas}${cruz}
    </svg>`;
  }

  /* ---------- Modo rezo (pantalla completa) ---------- */
  let rezoTipo = null, rezoSec = [], rezoAuto = false;
  function estadoRezo() { return rezoTipo === 'coronilla' ? S.coronilla : S.rosario; }
  function entrarRezo(tipo, desdeCero) {
    rezoTipo = tipo === 'coronilla' ? 'coronilla' : tipo;
    if (rezoTipo !== 'coronilla') { if (S.rosario.tipo !== tipo || desdeCero) S.rosario = { tipo, i: 0 }; rezoSec = secuenciaRosario(tipo); }
    else { if (desdeCero) S.coronilla.i = 0; rezoSec = secuenciaCoronilla(); }
    const st = estadoRezo(); st.i = Math.max(0, Math.min(st.i, rezoSec.length - 1)); guardar();
    Repro.pausar(); pila.push({ p: 'rezo', arg: tipo }); document.body.classList.add('modo-rezo'); N.Pantalla.mantenerEncendida(true); Sonido.musica(true); renderRezo();
  }
  function salirRezo() {
    detenerVoz(); Sonido.musica(false); N.Pantalla.mantenerEncendida(false); document.body.classList.remove('modo-rezo');
    if (actual().p === 'rezo') pila.pop(); if (!pila.length) pila = [{ p: 'inicio' }]; render();
  }
  const ICO = {
    ant: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>', sig: '<svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>',
    play: '<svg viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5z" class="relleno"/></svg>', pausa: '<svg viewBox="0 0 24 24"><path d="M8 5v14M16 5v14" stroke-width="3.4"/></svg>',
    cerrar: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>'
  };
  function renderRezo() {
    const st = estadoRezo(), paso = rezoSec[st.i], total = rezoSec.length;
    const imagen = rezoTipo === 'coronilla' ? 'img/misterios/dolorosos-5.webp' : `img/misterios/${rezoTipo}-${paso.img || 1}.webp`;
    const cred = window.__creditos && window.__creditos[imagen.replace('img/misterios/', '').replace('.webp', '')];
    const nombre = rezoTipo === 'coronilla' ? 'Coronilla de la Divina Misericordia' : R.grupos[rezoTipo].nombre;
    const m = /^S(\d)-(\d+)$/.exec(paso.c), decena = m && !paso.hecho ? Number(m[2]) : 0;
    main.innerHTML = `<section class="rezo" aria-live="polite">
      <div class="rezo-fondo" style="background-image:url(${imagen})" aria-hidden="true"></div>
      <div class="rezo-top"><button class="btn-atras" data-a="rezo:salir" aria-label="Salir">${ICO.cerrar}</button>
        <div class="rezo-cab"><div class="eyebrow">${h(nombre)}</div><h2>${h(paso.t)}</h2>${paso.sub ? `<div class="sub">${h(paso.sub)}</div>` : ''}</div>
        <span class="rezo-cuenta">${st.i + 1}<small>/${total}</small></span></div>
      <div class="rezo-barra" aria-hidden="true"><div style="width:${((st.i + 1) / total * 100).toFixed(1)}%"></div></div>
      ${decena ? `<div class="decena" aria-hidden="true">${Array.from({ length: 10 }, (_, k) => `<i class="${k < decena ? 'si' : ''}"></i>`).join('')}</div>` : ''}
      <div class="rezo-lienzo">${svgRosario(paso, imagen)}</div>
      ${cred ? `<div class="credito-arte">${h(cred.autor)} · dominio público</div>` : ''}
      ${S.mostrarTexto ? `<div class="rezo-texto">${h(paso.x)}</div>` : ''}
      <div class="rezo-opciones">
        <button data-a="rezo:texto" class="${S.mostrarTexto ? 'activo' : ''}">📖 Texto</button>
        ${rezoTipo !== 'coronilla' ? `<button data-a="rezo:letanias" class="${S.letanias ? 'activo' : ''}">📜 Letanías</button>` : ''}
        <button data-a="rezo:musica" class="${S.musica ? 'activo' : ''}">🎵 Música</button>
        <button data-a="rezo:reiniciar">↺ Reiniciar</button></div>
      <div class="rezo-controles">
        <button class="redondo" data-a="rezo:ant" aria-label="Anterior">${ICO.ant}<span>Anterior</span></button>
        <button class="play" data-a="rezo:play" aria-label="${rezoAuto ? 'Pausar' : 'Escuchar'}">${rezoAuto ? ICO.pausa : ICO.play}<span>${rezoAuto ? 'Pausar' : 'Escuchar'}</span></button>
        <button class="redondo" data-a="rezo:sig" aria-label="Siguiente">${ICO.sig}<span>Siguiente</span></button></div>
    </section>`;
  }
  function actualizarPlay() {
    const b = document.querySelector('.rezo-controles .play'); if (!b) return;
    b.innerHTML = `${rezoAuto ? ICO.pausa : ICO.play}<span>${rezoAuto ? 'Pausar' : 'Escuchar'}</span>`; b.setAttribute('aria-label', rezoAuto ? 'Pausar' : 'Escuchar');
  }
  function moverRezo(d) {
    const st = estadoRezo(); const n = st.i + d;
    if (n < 0) return;
    if (n >= rezoSec.length) { st.i = rezoSec.length - 1; guardar(); rezoAuto = false; aviso(rezoTipo === 'coronilla' ? 'Terminaste la Coronilla. ¡Dios te bendiga!' : 'Terminaste el Rosario. ¡Que María te acompañe!'); renderRezo(); return; }
    st.i = n; guardar(); renderRezo();
  }
  async function narrarPaso(paso) {
    if (S.voz === 'natural' && paso.au && await Sonido.clip(paso.au)) return;
    if (!rezoAuto) return;
    await N.Voz.hablar(paso.x, S.velocidad);
  }
  async function reproducirRezo() {
    const ses = ++sesionVoz; rezoAuto = true; actualizarPlay();
    while (rezoAuto && ses === sesionVoz) {
      const st = estadoRezo(), paso = rezoSec[st.i];
      try { await narrarPaso(paso); } catch (e) { aviso('No se pudo usar la voz del teléfono. Probá con la voz grabada en Ajustes.'); rezoAuto = false; break; }
      if (!rezoAuto || ses !== sesionVoz) break;
      await new Promise(r => setTimeout(r, paso.anuncio ? 1300 : 650));
      if (!rezoAuto || ses !== sesionVoz) break;
      if (st.i >= rezoSec.length - 1) { rezoAuto = false; aviso('Terminaste. ¡Dios te bendiga!'); break; }
      st.i++; guardar(); renderRezo();
    }
    if (ses === sesionVoz) { rezoAuto = false; actualizarPlay(); }
  }

  /* ---------- Oraciones ---------- */
  let catSel = 'Todas', busqueda = '';
  P.oraciones = () => {
    const cats = ['Todas', 'Favoritas', ...new Set(ORACIONES.map(x => x.category))];
    const q = busqueda.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const lista = ORACIONES.filter(x => (catSel === 'Todas' || x.category === catSel || (catSel === 'Favoritas' && S.favoritos.includes(x.id)))
      && (!q || `${x.title} ${x.text}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(q)));
    return `${titulo('Oraciones', `${ORACIONES.length} oraciones para cada momento. Las tradicionales y las propias de la app están identificadas.`)}
      <input class="buscar" id="buscar" type="search" placeholder="🔎 Buscar una oración…" value="${h(busqueda)}" aria-label="Buscar oración">
      <div class="chips" style="margin-top:10px">${cats.map(c => `<button class="chip ${c === catSel ? 'activo' : ''}" data-a="cat:${h(c)}">${h(c)}</button>`).join('')}</div>
      <div class="lista" id="listaOraciones">${lista.length ? lista.map(p => item(S.favoritos.includes(p.id) ? '★' : '✝', p.title, `${p.category} · ${p.origen === 'tradicional' ? 'Tradicional' : 'Original de la app'}`, 'oracion:' + p.id)).join('') : '<div class="card">No hay oraciones con esa búsqueda.</div>'}</div>${pie()}`;
  };
  P.oracion = id => {
    const p = oracion(id); if (!p) return P.oraciones();
    const fav = S.favoritos.includes(id);
    return `<div class="titulo"><span class="eyebrow">${h(p.category)}</span><h1>${h(p.title)}</h1></div>
      <div class="card"><p class="texto-oracion">${h(p.text)}</p>
      <p class="nota">${p.origen === 'tradicional' ? 'Oración tradicional de la Iglesia.' : 'Oración original de Mi Fe Católica (no es un texto litúrgico oficial).'} ${h(p.note || '')}</p></div>
      <div class="fila">${btnLeer('leer:oracion:' + id)}${btn(fav ? '★ Guardada' : '☆ Guardar', 'fav:' + id)}${btn('↗ Compartir', 'compartir:' + id)}</div>${pie()}`;
  };
  P.favoritos = () => { const l = ORACIONES.filter(p => S.favoritos.includes(p.id));
    return `${titulo('Oraciones favoritas', 'Las oraciones que guardaste en este teléfono.')}<div class="lista">${l.length ? l.map(p => item('★', p.title, p.category, 'oracion:' + p.id)).join('') : '<div class="card">Todavía no guardaste oraciones. Abrí una oración y tocá «Guardar».</div>'}</div>${pie()}`; };

  /* ---------- Novenas ---------- */
  P.novenas = () => `${titulo('Novenas', 'Nueve días de oración por una intención. La app recuerda en qué día vas.')}
    <div class="lista">${window.MFC_NOVENAS.map(n => { const d = S.novenas[n.id]; return item('🕯', n.titulo, d ? `Vas por el día ${d} de 9` : n.fecha, 'novena:' + n.id); }).join('')}</div>
    <div class="aviso">Las reflexiones de cada día fueron escritas para Mi Fe Católica siguiendo la estructura tradicional de las novenas.</div>${pie()}`;
  P.novena = id => {
    const n = window.MFC_NOVENAS.find(x => x.id === id); if (!n) return P.novenas();
    const d = S.novenas[id] || 1, [tema, refl, orac] = n.dias[d - 1];
    return `<div class="titulo"><span class="eyebrow">${h(n.fecha)}</span><h1>${h(n.titulo)}</h1><p class="muted">${h(n.intro)}</p></div>
      <div class="chips">${n.dias.map((_, i) => `<button class="chip ${i + 1 === d ? 'activo' : ''}" data-a="novdia:${id}:${i + 1}">Día ${i + 1}</button>`).join('')}</div>
      <div class="card destacada"><span class="eyebrow">Día ${d} de 9 · ${h(tema)}</span>
        <p class="texto-oracion"><b>Por la señal de la Santa Cruz…</b>\n\n<b>Acto de contrición:</b> ${h(txt('acto'))}\n\n<b>Reflexión:</b> ${h(refl)}\n\n<b>Oración del día:</b> ${h(orac)}\n\n<b>Pedimos la gracia que deseamos alcanzar en esta novena…</b>\n\nPadre Nuestro, Ave María y Gloria.\n\n<b>Oración final:</b> ${h(n.final)}</p></div>
      <div class="fila">${btnLeer('leer:novena:' + id)}${d < 9 ? btn('Día siguiente ▶', `novdia:${id}:${d + 1}`) : btn('✓ Novena terminada', `novfin:${id}`)}</div>${pie()}`;
  };

  /* ---------- Vía Crucis ---------- */
  const ESTACIONES = ['Jesús es condenado a muerte', 'Jesús carga con la cruz', 'Jesús cae por primera vez', 'Jesús encuentra a su Madre', 'Simón de Cirene ayuda a Jesús a llevar la cruz',
    'La Verónica enjuga el rostro de Jesús', 'Jesús cae por segunda vez', 'Jesús consuela a las mujeres de Jerusalén', 'Jesús cae por tercera vez', 'Jesús es despojado de sus vestiduras',
    'Jesús es clavado en la cruz', 'Jesús muere en la cruz', 'Jesús es bajado de la cruz', 'Jesús es sepultado'];
  const MEDIT = ['Jesús acepta en silencio una condena injusta. Pidamos no juzgar con dureza y defender a los inocentes.', 'Jesús abraza la cruz por amor. Pidamos llevar nuestras cargas con confianza.',
    'Jesús cae bajo el peso. Pidamos levantarnos después de cada caída.', 'María y Jesús se encuentran en el dolor. Pidamos acompañar a las madres que sufren.',
    'Simón ayuda a cargar la cruz. Pidamos ser cirineos para quien lo necesita.', 'Verónica se anima a consolar. Pidamos valentía para hacer el bien.',
    'Jesús cae otra vez y sigue adelante. Pidamos perseverancia.', 'Jesús, en su dolor, piensa en los demás. Pidamos un corazón compasivo.',
    'Jesús cae por tercera vez. Pidamos esperanza cuando todo parece perdido.', 'Le quitan todo a Jesús. Pidamos por quienes son despojados de su dignidad.',
    'Jesús es clavado en la cruz y perdona. Pidamos la gracia del perdón.', 'Jesús entrega su vida por nosotros. Pidamos gratitud ante tanto amor.',
    'María recibe a su Hijo en brazos. Pidamos por los que lloran a sus seres queridos.', 'Jesús es puesto en el sepulcro. Pidamos esperar la Resurrección.'];
  P.viacrucis = () => { const i = S.viacrucis;
    return `${titulo('Vía Crucis', 'Acompañamos a Jesús en el camino de la cruz. Ideal para los viernes y la Cuaresma.')}
      <div class="progreso"><div style="width:${(i + 1) / 14 * 100}%"></div></div>
      <div class="card destacada"><span class="eyebrow">Estación ${i + 1} de 14</span><h2>${h(ESTACIONES[i])}</h2>
      <p class="texto-oracion">— Te adoramos, oh Cristo, y te bendecimos.\n— Porque por tu santa Cruz redimiste al mundo.\n\n${h(MEDIT[i])}\n\nPadre Nuestro, Ave María y Gloria.</p>
      <p class="nota">Meditaciones breves escritas para esta aplicación.</p></div>
      <div class="fila">${btn('◀ Anterior', 'via:-1')}${btnLeer('leer:via')}${btn('Siguiente ▶', 'via:1')}</div>${pie()}`; };

  /* ---------- 30 días ---------- */
  P.camino = () => { const l = window.MFC_LIBRE || [], d = Math.min(30, Math.max(1, S.camino)), e = l[d - 1] || {};
    return `${titulo('30 días de oración', 'Un breve camino diario con una oración y un gesto concreto. Textos originales de la app.')}
      <div class="progreso"><div style="width:${d / 30 * 100}%"></div></div>
      <div class="card destacada"><span class="eyebrow">Día ${d} de 30</span><h2>${h(e.titulo)}</h2><p class="texto-oracion">${h(e.oracion)}</p>
      <div class="aviso"><b>Para vivir hoy:</b> ${h(e.accion)}</div></div>
      <div class="fila">${btn('◀ Anterior', 'camino:-1')}${btnLeer('leer:camino')}${btn('Siguiente ▶', 'camino:1')}</div>${pie()}`; };

  /* ---------- Biblia y lecturas ---------- */
  P.lecturas = () => {
    const t = hoy(), li = L.info(t.y, t.m, t.d), ev = S.evangelioCache;
    setTimeout(cargarEvangelio, 50);
    return `${titulo('Lecturas del día', h(fechaLarga()))}
      <div class="card"><div class="dia-liturgico"><div class="franja" style="background:${li.colorHex}"></div><div>
        <h3>${h(li.celebracion && li.celebracion.rango !== 'ML' ? li.celebracion.nombre : li.titulo)}</h3>
        <p class="small muted">${h(li.tiempo)} · Ciclo dominical ${h(li.cicloDominical)} · Año ${h(li.cicloFerial)} · Color ${h(li.color)}</p></div></div></div>
      <div class="card destacada" id="evangelio"><span class="eyebrow">Vatican News</span><h3>${ev ? h(ev.titulo) : 'Evangelio y palabra del día'}</h3>
        <p class="small muted" id="evEstado">${ev ? 'Actualizado: ' + h(ev.fecha) : 'Buscando las lecturas de hoy…'}</p>
        ${btn('📖 Leer las lecturas y el Evangelio', 'url:' + (ev && ev.link ? ev.link : F.evangelio.web), 'primario ancho')}</div>
      <div class="lista">${item('🕰', 'Liturgia de las Horas', 'Oficio del día (sitio externo)', 'url:' + F.enlaces.horas.url)}${item('📖', 'Abrir la Biblia', 'El Libro del Pueblo de Dios', 'ir:biblia')}</div>
      <div class="aviso">Para respetar los derechos de autor, el texto de las lecturas se lee en la fuente oficial. La app calcula el tiempo litúrgico sin conexión.</div>${pie()}`;
  };
  async function cargarEvangelio() {
    const t = hoy(), fecha = `${t.y}-${String(t.m).padStart(2, '0')}-${String(t.d).padStart(2, '0')}`;
    if (S.evangelioCache && S.evangelioCache.fecha === fecha) return;
    try {
      const items = parsearRSS(await N.descargarTexto(F.evangelio.rss));
      const dia = String(t.d), meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
      const it = items.find(x => new RegExp(`\\b${dia}\\s+(de\\s+)?${meses[t.m - 1]}`, 'i').test(x.titulo)) || null;
      if (it) { S.evangelioCache = { fecha, titulo: it.titulo, link: it.link }; guardar();
        if (actual().p === 'lecturas') render(); }
      else { const e = $('#evEstado'); if (e) e.textContent = 'Todavía no está publicado el de hoy. Podés abrir la página de Vatican News.'; }
    } catch (e) { const el = $('#evEstado'); if (el) el.textContent = 'Sin conexión. Cuando tengas internet, podés abrir las lecturas en Vatican News.'; }
  }

  /* ---------- Calendario ---------- */
  let calMes = null, calSel = null;
  P.calendario = () => {
    const t = hoy(); if (!calMes) calMes = { y: t.y, m: t.m }; if (!calSel) calSel = { ...t };
    const dias = L.mes(calMes.y, calMes.m), primero = new Date(calMes.y, calMes.m - 1, 1).getDay();
    const fMes = new Date(calMes.y, calMes.m - 1, 1);
    const nombreMes = cap(new Intl.DateTimeFormat('es-AR', { month: 'long' }).format(fMes));
    const mesCorto = (y, m) => new Intl.DateTimeFormat('es-AR', { month: 'short' }).format(new Date(y, m - 1, 1)).replace('.', '').toUpperCase();
    const sel = L.info(calSel.y, calSel.m, calSel.d), prox = L.proximas(t.y, t.m, t.d, 6);
    const esMesActual = calMes.y === t.y && calMes.m === t.m;
    const coloresMes = [...new Set(dias.map(x => x.color))];
    const nomColor = { morado: 'Morado', blanco: 'Blanco', verde: 'Verde', rojo: 'Rojo', rosa: 'Rosa', negro: 'Negro' };
    return `${titulo('Calendario litúrgico', 'Tiempos, colores, solemnidades y santos, con las fiestas propias de la Argentina.')}
      <section class="cal-card">
        <div class="cal-nav">
          <button class="cal-flecha" data-a="calmes:-1" aria-label="Mes anterior"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></button>
          <div class="cal-mes"><h3>${h(nombreMes)}</h3><small>${calMes.y}</small></div>
          <button class="cal-flecha" data-a="calmes:1" aria-label="Mes siguiente"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg></button>
        </div>
        <div class="cal">${['D', 'L', 'M', 'M', 'J', 'V', 'S'].map((d, i) => `<div class="cab${i === 0 ? ' dom' : ''}">${d}</div>`).join('')}${'<span></span>'.repeat(primero)}
        ${dias.map((x, i) => { const d = i + 1, esHoy = esMesActual && d === t.d, esSel = calMes.y === calSel.y && calMes.m === calSel.m && d === calSel.d;
          const fiesta = x.celebracion && ['S', 'F'].includes(x.celebracion.rango), dom = (primero + i) % 7 === 0;
          return `<button class="dia ${esHoy ? 'hoy ' : ''}${esSel ? 'sel ' : ''}${fiesta ? 'fiesta ' : ''}${dom ? 'dom' : ''}" data-a="caldia:${d}" aria-label="${d}: ${h(x.celebracion ? x.celebracion.nombre : x.titulo)}"><b>${d}</b><span class="pt" style="background:${x.colorHex}"></span>${fiesta ? '<i class="estrella" aria-hidden="true">✦</i>' : ''}</button>`; }).join('')}</div>
        <div class="cal-leyenda">${coloresMes.map(c => `<span><i style="background:${dias.find(x => x.color === c).colorHex}"></i>${h(nomColor[c] || c)}</span>`).join('')}<span><b class="estrella">✦</b>Fiesta o solemnidad</span></div>
        ${esMesActual ? '' : `<button class="cal-hoy" data-a="calhoy">Volver a hoy</button>`}
      </section>
      <div class="dia-detalle" style="--lc:${sel.colorHex}">
        <div class="fecha-bloque"><small>${h(sel.diaSemana).slice(0, 3).toUpperCase()}</small><b>${calSel.d}</b><small>${mesCorto(calSel.y, calSel.m)}</small></div>
        <div class="dia-info"><span class="eyebrow">${sel.celebracion ? h(sel.celebracion.rangoNombre) : h(sel.tiempo)}</span>
          <h3>${h(sel.celebracion ? sel.celebracion.nombre : sel.titulo)}</h3>
          <p class="small muted">${h(sel.titulo)}</p>
          <div class="etiquetas"><span class="pill"><i class="pt-mini" style="background:${sel.colorHex}"></i>${h(cap(sel.color))}</span><span class="pill">${h(sel.tiempo)}</span></div></div>
      </div>
      <h2 class="seccion">Próximas fiestas</h2>
      <div class="agenda">${prox.map(x => { const [y, m, d] = x.fecha.split('-').map(Number);
        return `<button class="agenda-item" data-a="calir:${x.fecha}" style="--lc:${x.colorHex}"><span class="ag-fecha"><b>${d}</b><small>${mesCorto(y, m)}</small></span>
          <span class="ag-txt"><strong>${h(x.celebracion.nombre)}</strong><small>${h(x.celebracion.rangoNombre)} · ${h(x.diaSemana)}</small></span><span class="flecha">›</span></button>`; }).join('')}</div>
      <div class="aviso">Calculado en el teléfono, sin conexión. Las diócesis pueden tener celebraciones propias; ante cualquier duda, consultá a tu parroquia.</div>${pie()}`;
  };

  /* ---------- Noticias ---------- */
  let noticiaSec = 'todas';
  function parsearRSS(xml) {
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    return [...doc.querySelectorAll('item')].slice(0, 40).map(it => {
      const g = s => (it.querySelector(s) || {}).textContent || '';
      const tmp = document.createElement('div'); tmp.innerHTML = g('description');
      let desc = (tmp.textContent || '').replace(/\s+/g, ' ').trim(); if (desc.length > 220) desc = desc.slice(0, 217).replace(/\s\S*$/, '') + '…';
      const fecha = new Date(g('pubDate')); return { titulo: g('title').trim(), link: g('link').trim(), desc, fecha: isNaN(fecha) ? null : fecha.toISOString() };
    }).filter(x => /^https:\/\//.test(x.link) && x.titulo);
  }
  async function cargarNoticias(forzar) {
    const ahora = Date.now(); let cambios = false, errores = 0;
    await Promise.all(F.feeds.map(async f => {
      const c = S.noticiasCache[f.id];
      if (!forzar && c && ahora - c.t < 20 * 60 * 1000) return;
      try { S.noticiasCache[f.id] = { t: ahora, items: parsearRSS(await N.descargarTexto(f.rss)) }; cambios = true; } catch (e) { errores++; }
    }));
    if (cambios) guardar();
    if (actual().p === 'noticias') { render(); if (errores === F.feeds.length) aviso('Sin conexión: se muestran las últimas noticias guardadas.'); }
  }
  P.noticias = () => {
    setTimeout(() => cargarNoticias(false), 50);
    let todas = [];
    F.feeds.forEach(f => (S.noticiasCache[f.id] ? S.noticiasCache[f.id].items : []).forEach(it => todas.push({ ...it, fuente: f.nombre, seccion: f.seccion })));
    const vistos = new Set(); todas = todas.filter(x => !vistos.has(x.link) && vistos.add(x.link)).sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
    const secs = { todas: 'Todas', Argentina: 'Argentina 🇦🇷', 'El Papa': 'El Papa', Vaticano: 'Vaticano', Iglesia: 'Iglesia' };
    const filtradas = todas.filter(x => noticiaSec === 'todas' || (noticiaSec === 'Argentina' ? (x.seccion === 'Argentina' || F.palabrasArgentina.test(x.titulo + ' ' + x.desc)) : x.seccion === noticiaSec)).slice(0, 40);
    const fmt = iso => iso ? new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)) : '';
    return `${titulo('Noticias de la Iglesia', 'Titulares de Vatican News y Radio María Argentina. Tocá una noticia para leerla completa en su sitio.')}
      <div class="chips">${Object.entries(secs).map(([k, v]) => `<button class="chip ${k === noticiaSec ? 'activo' : ''}" data-a="notsec:${k}">${v}</button>`).join('')}</div>
      ${filtradas.length ? filtradas.map(n => `<button class="noticia" data-a="url:${h(n.link)}"><span class="meta">${h(n.fuente)} · ${h(fmt(n.fecha))}</span><h3>${h(n.titulo)}</h3>${n.desc ? `<p>${h(n.desc)}</p>` : ''}</button>`).join('')
        : `<div class="card">${todas.length ? 'No hay noticias en esta sección por ahora.' : 'Cargando noticias… Si no tenés conexión, probá más tarde.'}</div>`}
      <div class="fila" style="margin:6px 0 14px">${btn('↻ Actualizar', 'notact', 'chico')}</div>
      <h2>Medios de la Iglesia en la Argentina</h2><div class="lista">${item('📰', F.enlaces.aica.titulo, F.enlaces.aica.desc, 'url:' + F.enlaces.aica.url)}${item('⛪', F.enlaces.cea.titulo, F.enlaces.cea.desc, 'url:' + F.enlaces.cea.url)}${item('🌐', F.enlaces.vaticannews.titulo, F.enlaces.vaticannews.desc, 'url:' + F.enlaces.vaticannews.url)}${item('📜', F.enlaces.papa.titulo, F.enlaces.papa.desc, 'url:' + F.enlaces.papa.url)}</div>
      <div class="aviso">Mi Fe Católica muestra solo titulares, fecha y el resumen que publica cada medio, con enlace a la nota original. Los contenidos pertenecen a sus autores.</div>${pie()}`;
  };

  /* ---------- Medios ---------- */
  let medioTipo = 'Todos';
  /* ================= Música ================= */
  /* Pistas propias de la app: melodías de dominio público y composiciones originales (scripts/audio/synth.py).
   * Se pueden compartir libremente junto con la app. */
  const PISTAS = [
    { id: 'luz-de-maria', t: 'Luz de María', a: 'Original · Mi Fe Católica', s: 'Piano y cuerdas', img: 'gozosos-1' },
    { id: 'adoracion', t: 'Adoración', a: 'Original · Mi Fe Católica', s: 'Órgano para el silencio', img: 'luminosos-5' },
    { id: 'claustro', t: 'Silencio del claustro', a: 'Original · estilo gregoriano', s: 'Para rezar y meditar', img: 'dolorosos-1' },
    { id: 'canon-re', t: 'Canon en Re', a: 'J. Pachelbel (c. 1700)', s: 'Versión de meditación', img: 'gloriosos-4' },
    { id: 'himno-alegria', t: 'Himno de la alegría', a: 'L. van Beethoven (1824)', s: 'Piano, órgano y cuerdas', img: 'gloriosos-1' },
    { id: 'noche-de-paz', t: 'Noche de paz', a: 'F. X. Gruber (1818)', s: 'Villancico tradicional', img: 'gozosos-3' },
    { id: 'meditacion', t: 'Meditación', a: 'Original · Mi Fe Católica', s: 'La música del Rosario', img: 'luminosos-3' }
  ].map(p => ({ ...p, src: `audio/musica/${p.id}.ogg`, tapa: `img/misterios/${p.img}.webp` }));
  const fmtT = s => !isFinite(s) ? '0:00' : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  /* ---------- Reproductor global (sigue sonando mientras navegás) ---------- */
  const Repro = (() => {
    const a = typeof Audio !== 'undefined' ? new Audio() : null;
    let lista = [], i = -1, url = null;
    const el = id => document.getElementById(id);
    function ui() {
      const p = lista[i], mini = el('mini');
      if (mini) {
        mini.classList.toggle('oculto', !p);
        if (p) {
          el('miniTit').textContent = p.t; el('miniSub').textContent = p.a || '';
          el('miniTapa').style.backgroundImage = p.tapa ? `url("${p.tapa}")` : '';
          el('miniPlay').innerHTML = a.paused ? ICO.play : ICO.pausa; el('miniPlay').setAttribute('aria-label', a.paused ? 'Reproducir' : 'Pausar');
          el('miniBarra').style.width = (a.duration ? a.currentTime / a.duration * 100 : 0) + '%';
          document.body.classList.toggle('con-mini', true);
        } else document.body.classList.remove('con-mini');
      }
      const rp = el('rpPlay'); if (rp && p) { rp.innerHTML = a.paused ? ICO.play : ICO.pausa; }
      const rb = el('rpBarra'); if (rb && a.duration && !rb.matches(':active')) rb.value = a.currentTime / a.duration * 1000;
      const rt = el('rpTiempo'); if (rt) rt.textContent = isFinite(a.duration) && a.duration > 0 ? `${fmtT(a.currentTime)} / ${fmtT(a.duration)}` : (p ? fmtT(a.currentTime) : '');
      document.querySelectorAll('[data-pista]').forEach(b => b.classList.toggle('sonando', !!p && b.dataset.pista === p.id && !a.paused));
    }
    if (a) {
      ['play', 'pause', 'loadedmetadata'].forEach(ev => a.addEventListener(ev, ui));
      let ult = 0; a.addEventListener('timeupdate', () => { const n = Date.now(); if (n - ult > 500) { ult = n; ui(); } });
      a.addEventListener('ended', () => { if (i < lista.length - 1) tocar(lista, i + 1); else { a.currentTime = 0; ui(); } });
      a.addEventListener('error', () => { if (lista[i]) aviso('No se pudo reproducir «' + lista[i].t + '».'); });
    }
    async function tocar(l, k) {
      if (!a) return; lista = l; i = k; const p = l[k];
      if (url) { URL.revokeObjectURL(url); url = null; }
      let src = p.src;
      if (p.blobId) { const b = await MisCanciones.blob(p.blobId); if (!b) { aviso('No se encontró el archivo.'); return; } url = src = URL.createObjectURL(b); }
      Sonido.musica(false); await detenerVoz();
      a.src = src; a.volume = 1; try { await a.play(); } catch (e) { }
      ui();
    }
    return {
      tocar, ui,
      actual: () => lista[i],
      alternar() { if (!a || !lista[i]) return; if (a.paused) a.play().catch(() => { }); else a.pause(); },
      sig() { if (lista.length) tocar(lista, (i + 1) % lista.length); },
      ant() { if (!lista.length) return; if (a.currentTime > 4) { a.currentTime = 0; return; } tocar(lista, (i - 1 + lista.length) % lista.length); },
      ir(frac) { if (a && a.duration) a.currentTime = frac * a.duration; },
      pausar() { if (a) a.pause(); },
      cerrar() { if (a) { a.pause(); a.removeAttribute('src'); } lista = []; i = -1; ui(); }
    };
  })();

  /* ---------- Mis canciones (archivos del teléfono, guardados solo en el dispositivo) ---------- */
  const MisCanciones = (() => {
    let dbp = null, cache = null;
    const abrir = () => dbp || (dbp = new Promise((ok, ko) => {
      const r = indexedDB.open('mfc-musica', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('canciones', { keyPath: 'id' });
      r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error);
    }));
    const op = (modo, fn) => abrir().then(db => new Promise((ok, ko) => {
      const t = db.transaction('canciones', modo), r = fn(t.objectStore('canciones'));
      t.oncomplete = () => ok(r && r.result); t.onerror = () => ko(t.error); t.onabort = () => ko(t.error);
    }));
    return {
      lista: () => cache,
      async cargar() { try { const l = await op('readonly', st => st.getAll()); cache = l.map(({ id, nombre, fecha, tam }) => ({ id, nombre, fecha, tam })).sort((x, y) => x.id - y.id); } catch (e) { cache = []; } return cache; },
      async agregar(files) {
        let n = 0, saltados = 0;
        for (const [k, f] of [...files].entries()) {
          if (!(/^audio\//.test(f.type) || /\.(mp3|m4a|aac|ogg|opus|wav|flac)$/i.test(f.name)) || f.size > 80 * 1024 * 1024) { saltados++; continue; }
          try { await op('readwrite', st => st.put({ id: Date.now() + k, nombre: f.name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').slice(0, 120), fecha: new Date().toISOString().slice(0, 10), tam: f.size, blob: f })); n++; } catch (e) { saltados++; }
        }
        await this.cargar(); return { n, saltados };
      },
      async borrar(id) { await op('readwrite', st => st.delete(Number(id))); await this.cargar(); },
      async blob(id) { try { const r = await op('readonly', st => st.get(Number(id))); return r && r.blob; } catch (e) { return null; } }
    };
  })();
  const pistasMias = () => (MisCanciones.lista() || []).map(c => ({ id: 'mia-' + c.id, blobId: c.id, t: c.nombre, a: 'Mis canciones', tapa: '' }));

  /* ---------- Videos de YouTube (se ven completos dentro de la app) ---------- */
  function leerYouTube(texto) {
    try {
      const x = new URL(String(texto).trim()), host = x.hostname.replace(/^(www|m|music)\./, '');
      let v = null; const l = x.searchParams.get('list');
      if (host === 'youtu.be') v = x.pathname.slice(1).split('/')[0];
      else if (/^youtube(-nocookie)?\.com$/.test(host)) {
        if (x.pathname === '/watch') v = x.searchParams.get('v');
        else { const m = x.pathname.match(/^\/(shorts|embed|live|v)\/([\w-]+)/); if (m) v = m[2]; }
      } else return null;
      if (v && !/^[\w-]{6,20}$/.test(v)) v = null;
      const lista = l && /^[\w-]{10,64}$/.test(l) ? l : null;
      if (v) return { tipo: 'video', id: v, url: x.href };
      if (lista) return { tipo: 'lista', id: lista, url: x.href };
    } catch (e) { }
    return null;
  }
  const ytEmbed = v => v.tipo === 'lista' ? `https://www.youtube.com/embed/videoseries?list=${v.id}&rel=0&playsinline=1` : `https://www.youtube.com/embed/${v.id}?rel=0&playsinline=1&modestbranding=1`;
  const ytTapa = v => v.tapa || (v.tipo === 'video' ? `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg` : '');
  async function agregarVideo(texto) {
    const v = leerYouTube(texto);
    if (!v) { aviso('Ese enlace no es de YouTube. Copiá el link del video o de la playlist.'); return; }
    if ((S.videos || []).some(x => x.id === v.id)) { aviso('Ese video ya está en tu lista.'); S.videoSel = v.id; guardar(); render(); return; }
    v.titulo = v.tipo === 'lista' ? 'Playlist de YouTube' : 'Video de YouTube';
    try { const j = JSON.parse(await N.descargarTexto('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent(v.url), 10000)); if (j.title) v.titulo = String(j.title).slice(0, 140); if (j.author_name) v.autor = String(j.author_name).slice(0, 80); if (/^https:\/\//.test(j.thumbnail_url || '')) v.tapa = j.thumbnail_url; } catch (e) { }
    S.videos = [v, ...(S.videos || [])].slice(0, 200); S.videoSel = v.id; guardar(); Repro.pausar(); render(); aviso('Video agregado'); window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ---------- Spotify (reproductor oficial dentro de la app) ---------- */
  const MUSICA = [
    { cat: 'athenas', tipo: 'artist', id: '71IIrUaZMShJKwuwIZVVwu', t: 'Athenas', s: 'Artista · todas sus canciones', h: 330 },
    { cat: 'athenas', tipo: 'playlist', id: '5nPelpGdGjhebP6tY5Qb4u', t: 'Lo mejor de Athenas', s: 'Playlist oficial de Athenas', h: 330 },
    { cat: 'athenas', tipo: 'playlist', id: '1uOa7kU8YBNu89HGoTYHOo', t: 'Athenas · Música de adoración', s: 'Playlist oficial de Athenas', h: 268 },
    { cat: 'athenas', tipo: 'playlist', id: '3MGAzAmu4VQ7lR6HjdWwFX', t: 'Música católica alegre', s: 'Playlist de Athenas', h: 38 },
    { cat: 'athenas', tipo: 'playlist', id: '65qYXQ3yT8f1zpf7BU5qfQ', t: 'Athenas · Entre tus manos', s: 'Playlist de Athenas', h: 200 },
    { cat: 'alabanza', tipo: 'playlist', id: '1VfwAMYqbxxMY0TvJFvVgj', t: 'Top 50 canciones católicas', s: 'Las más escuchadas', h: 45 },
    { cat: 'alabanza', tipo: 'playlist', id: '6XXlzAvKk2l72UPCZ8t7dm', t: 'Canciones de Misa (Argentina)', s: 'Para la celebración', h: 212 },
    { cat: 'alabanza', tipo: 'playlist', id: '40ZvIDWgx2Gc5H0aFEXIWd', t: 'Athenas, Hakuna y Jésed', s: 'Música católica joven', h: 16 },
    { cat: 'oracion', tipo: 'playlist', id: '2UvXaPadYPoifQH4xf9gJC', t: 'Canto gregoriano', s: 'Monjes de Silos', h: 250 },
    { cat: 'oracion', tipo: 'playlist', id: '1Ff6fMK5IuULSr96OqloVx', t: 'Canto gregoriano de Silos', s: 'Monasterio de Santo Domingo de Silos', h: 220 },
    { cat: 'artistas', tipo: 'artist', id: '7Lemn0MD6Cb2QfmeZJ5BwS', t: 'Hakuna Group Music', s: 'Artista', h: 150 },
    { cat: 'artistas', tipo: 'artist', id: '3TXp4wMgvRheVQPf1PEV2P', t: 'Jésed', s: 'Artista', h: 0 },
    { cat: 'artistas', tipo: 'artist', id: '76sYe6qdnJ9ZPHCM5GtpHj', t: 'Siervas', s: 'Artista', h: 300 },
    { cat: 'artistas', tipo: 'artist', id: '7uuwLxz14KbMReX1HaSmyo', t: 'Ixcís', s: 'Artista', h: 180 },
    { cat: 'artistas', tipo: 'artist', id: '5aOjT1DbSYHA1jylD0zohr', t: 'Martín Valverde', s: 'Artista', h: 28 },
    { cat: 'artistas', tipo: 'artist', id: '7LDonbUd4pk78tBtFO039E', t: 'Hermana Glenda', s: 'Artista', h: 280 }
  ];
  const CAT_MUSICA = [['todo', 'Todo'], ['athenas', '🎤 Athenas'], ['alabanza', '🙌 Alabanza'], ['oracion', '🕯 Para orar'], ['artistas', '⭐ Artistas']];
  let musicaCat = 'todo', portadas = null;
  const spLink = m => `https://open.spotify.com/${m.tipo}/${m.id}`;
  async function cargarPortadas() {
    if (portadas) return; portadas = S.portadasMusica || {};
    let cambios = false;
    await Promise.all(MUSICA.filter(m => !portadas[m.id]).map(async m => {
      try { const j = JSON.parse(await N.descargarTexto('https://open.spotify.com/oembed?url=' + encodeURIComponent(spLink(m)), 10000)); if (/^https:\/\//.test(j.thumbnail_url || '')) { portadas[m.id] = j.thumbnail_url; cambios = true; } } catch (e) { }
    }));
    if (cambios) { S.portadasMusica = portadas; guardar(); document.querySelectorAll('[data-portada]').forEach(el => { const u = portadas[el.dataset.portada]; if (u) el.style.backgroundImage = `url("${u}")`; }); }
  }

  /* ---------- Pantalla de música ---------- */
  const TABS_MUSICA = [['app', '🎼', 'De la app'], ['mias', '📁', 'Mis canciones'], ['videos', '▶️', 'YouTube'], ['spotify', '🟢', 'Spotify']];
  P.musica = () => {
    const tab = S.musicaTab || 'app';
    if (tab === 'mias' && MisCanciones.lista() === null) MisCanciones.cargar().then(() => { if (actual().p === 'musica') render(); });
    let cuerpo = '';
    if (tab === 'app') {
      const p = Repro.actual() && !Repro.actual().blobId ? Repro.actual() : PISTAS[0];
      cuerpo = `<section class="rp" style="--tapa:url('${p.tapa}')"><div class="rp-fondo" style="background-image:url('${p.tapa}')" aria-hidden="true"></div>
          <div class="rp-tapa" style="background-image:url('${p.tapa}')"></div>
          <div class="rp-info"><span class="eyebrow">🎼 Música de Mi Fe Católica</span><h2>${h(p.t)}</h2><small>${h(p.a)} · ${h(p.s || '')}</small></div>
          <input type="range" id="rpBarra" min="0" max="1000" value="0" aria-label="Avance">
          <div class="rp-tiempo" id="rpTiempo">0:00 / 0:00</div>
          <div class="rp-ctrl"><button class="redondo" data-a="rp:ant" aria-label="Anterior">${ICO.ant}</button>
            <button class="play" id="rpPlay" data-a="rp:play:${p.id}" aria-label="Reproducir">${ICO.play}</button>
            <button class="redondo" data-a="rp:sig" aria-label="Siguiente">${ICO.sig}</button></div></section>
        <div class="pistas">${PISTAS.map((x, k) => `<button class="pista" data-a="pista:${k}" data-pista="${x.id}"><span class="pista-tapa" style="background-image:url('${x.tapa}')"><b class="eq" aria-hidden="true"><i></i><i></i><i></i></b></span>
          <span class="pista-txt"><strong>${h(x.t)}</strong><small>${h(x.a)}</small></span><span class="pista-ic" aria-hidden="true">▶</span></button>`).join('')}</div>
        <div class="aviso">Estas piezas son de la app: melodías de dominio público y composiciones originales, interpretadas digitalmente. Funcionan sin internet y podés compartir la app con quien quieras.</div>`;
    } else if (tab === 'mias') {
      const l = MisCanciones.lista();
      cuerpo = `${btn('➕ Agregar canciones del teléfono', 'misagregar', 'primario ancho')}<input type="file" id="archivoMusica" accept="audio/*" multiple hidden>
        <div class="lista" style="margin-top:14px">${l === null ? '<div class="card muted">Cargando…</div>' : l.length ? l.map((c, k) => `<div class="mia" data-pista="mia-${c.id}"><button class="pista" data-a="mia:${k}"><span class="pista-tapa mia-tapa"><i>🎵</i><b class="eq" aria-hidden="true"><i></i><i></i><i></i></b></span>
          <span class="pista-txt"><strong>${h(c.nombre)}</strong><small>${(c.tam / 1048576).toFixed(1)} MB · ${h(c.fecha)}</small></span></button><button class="mia-borrar" data-a="miaborrar:${c.id}" aria-label="Quitar ${h(c.nombre)}">🗑</button></div>`).join('')
          : '<div class="card vacio"><span>🎧</span><p><b>Todavía no agregaste canciones.</b><br>Podés sumar audios que tengas en el celular: grabaciones del coro de tu parroquia, cantos de tu grupo o música que hayas comprado.</p></div>'}</div>
        <div class="aviso">Las canciones se guardan solo en este teléfono, no se suben a ningún lado ni viajan con la app al compartirla.</div>`;
    } else if (tab === 'videos') {
      const vs = S.videos || [], sel = vs.find(v => v.id === S.videoSel) || vs[0];
      cuerpo = `${sel ? `<section class="yt"><div class="yt-marco"><iframe title="${h(sel.titulo)}" src="${ytEmbed(sel)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen loading="lazy"></iframe></div>
          <div class="yt-info"><strong>${h(sel.titulo)}</strong>${sel.autor ? `<small>${h(sel.autor)}</small>` : ''}</div>
          <div class="fila">${btn('↗ Abrir en YouTube', 'url:' + sel.url, 'chico')}${btn('Compartir', 'ytcomp:' + sel.id, 'chico')}</div></section>` : ''}
        <div class="card yt-agregar"><h3>Agregar un video o una playlist</h3><p class="small muted">En YouTube tocá <b>Compartir › Copiar enlace</b> y pegalo acá. Sirve para canciones de Athenas, videos del Papa, Misas y más.</p>
          <div class="yt-fila"><input class="buscar" id="ytUrl" type="url" inputmode="url" placeholder="https://youtu.be/…">${btn('📋', 'ytpegar', 'chico')}</div>${btn('➕ Agregar', 'ytadd', 'primario ancho')}
          <div class="fila" style="margin-top:10px">${btn('🔎 Buscar Athenas en YouTube', 'url:https://www.youtube.com/results?search_query=Athenas+m%C3%BAsica+cat%C3%B3lica', 'chico')}${btn('🔎 Videos del Papa', 'url:https://www.youtube.com/@VaticanNewsES/videos', 'chico')}</div></div>
        <div class="discos">${vs.map(v => `<div class="disco-v ${sel && v.id === sel.id ? 'activo' : ''}"><button class="disco" data-a="ytsel:${v.id}"><span class="tapa-disco yt-tapa" ${ytTapa(v) ? `style="background-image:url('${h(ytTapa(v))}')"` : ''}><i>▶</i></span><strong>${h(v.titulo)}</strong><small>${v.tipo === 'lista' ? 'Playlist' : 'Video'}${v.autor ? ' · ' + h(v.autor) : ''}</small></button><button class="mia-borrar" data-a="ytborrar:${v.id}" aria-label="Quitar">✕</button></div>`).join('')}</div>
        <div class="aviso">Los videos se ven completos dentro de la app, desde YouTube (necesita internet). Algunos canales no permiten verlos fuera de YouTube: en ese caso usá «Abrir en YouTube».</div>`;
    } else {
      const sel = MUSICA.find(m => m.id === S.musicaSel) || MUSICA[1], l = MUSICA.filter(m => musicaCat === 'todo' || m.cat === musicaCat);
      setTimeout(cargarPortadas, 50);
      const pt = m => (portadas || S.portadasMusica || {})[m.id];
      cuerpo = `<section class="reproductor"><div class="rep-cab"><span class="eyebrow">🟢 Spotify</span><strong>${h(sel.t)}</strong></div>
          <iframe class="spotify" title="Reproductor: ${h(sel.t)}" src="https://open.spotify.com/embed/${sel.tipo}/${sel.id}?utm_source=generator&theme=0" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>
          <div class="rep-pie"><span>Sin sesión de Spotify: fragmentos de 30 s.</span>${btn('Completa en Spotify ↗', 'url:' + spLink(sel), 'chico')}</div></section>
        <div class="chips">${CAT_MUSICA.map(([k, v]) => `<button class="chip ${musicaCat === k ? 'activo' : ''}" data-a="mcat:${k}">${v}</button>`).join('')}</div>
        <div class="discos">${l.map(m => `<button class="disco ${m.id === sel.id ? 'activo' : ''}" data-a="msel:${m.id}" style="--h:${m.h}">
          <span class="tapa-disco ${m.tipo === 'artist' ? 'redonda' : ''}" data-portada="${m.id}" ${pt(m) ? `style="background-image:url('${h(pt(m))}')"` : ''}><i>${m.tipo === 'artist' ? '🎤' : '🎵'}</i></span>
          <strong>${h(m.t)}</strong><small>${h(m.s)}</small></button>`).join('')}</div>`;
    }
    setTimeout(Repro.ui, 0);
    return `${titulo('Música', 'Para rezar, alabar y acompañar tu día.')}
      <div class="tabs-musica">${TABS_MUSICA.map(([k, i, v]) => `<button class="${tab === k ? 'activo' : ''}" data-a="mtab:${k}"><span>${i}</span>${v}</button>`).join('')}</div>
      ${cuerpo}${pie()}`;
  };

  /* ================= Frases de los Papas (formato historia) ================= */
  // Frases textuales con su fuente. Las imágenes son las pinturas de dominio público de la app.
  const PAPAS = [
    { id: 'juan23', n: 'San Juan XXIII', c: 'J23', y: '1958–1963', h: 30, f: [
      { t: 'Al volver a casa, encontraréis a los niños. Hacedles una caricia y decidles: esta es la caricia del Papa.', s: 'Discurso de la luna, 11 de octubre de 1962', img: 'gozosos-4' }] },
    { id: 'pablo6', n: 'San Pablo VI', c: 'P6', y: '1963–1978', h: 200, f: [
      { t: 'El hombre contemporáneo escucha más a gusto a los que dan testimonio que a los que enseñan, o si escuchan a los que enseñan, es porque dan testimonio.', s: 'Evangelii nuntiandi, 41 (1975)', img: 'luminosos-2' }] },
    { id: 'jp2', n: 'San Juan Pablo II', c: 'JP2', y: '1978–2005', h: 0, f: [
      { t: '¡No tengáis miedo! ¡Abrid, más todavía, abrid de par en par las puertas a Cristo!', s: 'Homilía de inicio de pontificado, 22 de octubre de 1978', img: 'gloriosos-1' },
      { t: 'El hombre no puede vivir sin amor. Él permanece para sí mismo un ser incomprensible, su vida está privada de sentido si no se le revela el amor.', s: 'Redemptor hominis, 10 (1979)', img: 'gozosos-2' },
      { t: '¡Duc in altum! ¡Rema mar adentro!', s: 'Novo millennio ineunte, 1 (2001)', img: 'luminosos-1' }] },
    { id: 'b16', n: 'Benedicto XVI', c: 'B16', y: '2005–2013', h: 270, f: [
      { t: 'No se comienza a ser cristiano por una decisión ética o una gran idea, sino por el encuentro con un acontecimiento, con una Persona, que da un nuevo horizonte a la vida y, con ello, una orientación decisiva.', s: 'Deus caritas est, 1 (2005)', img: 'luminosos-3' },
      { t: '¡No tengáis miedo de Cristo! Él no quita nada, y lo da todo.', s: 'Homilía de inicio de pontificado, 24 de abril de 2005', img: 'gloriosos-2' }] },
    { id: 'francisco', n: 'Francisco', c: 'F', y: '2013–2025', h: 140, f: [
      { t: 'Dios no se cansa nunca de perdonar, somos nosotros los que nos cansamos de acudir a su misericordia.', s: 'Evangelii gaudium, 3 (2013)', img: 'dolorosos-1' },
      { t: '¡No nos dejemos robar la esperanza!', s: 'Evangelii gaudium, 86 (2013)', img: 'gloriosos-3' },
      { t: 'Vive Cristo, esperanza nuestra, y Él es la más hermosa juventud de este mundo. Todo lo que Él toca se vuelve joven, se hace nuevo, se llena de vida.', s: 'Christus vivit, 1 (2019)', img: 'gloriosos-5' }] },
    { id: 'leon14', n: 'León XIV', c: 'L14', y: 'desde 2025', h: 45, f: [
      { t: '¡La paz esté con todos ustedes!', s: 'Primer saludo desde el balcón de San Pedro, 8 de mayo de 2025', img: 'gozosos-5' },
      { t: 'Dios nos quiere, Dios los ama a todos, y el mal no prevalecerá.', s: 'Primer saludo desde el balcón de San Pedro, 8 de mayo de 2025', img: 'luminosos-4' }] }
  ];
  const HISTORIAS = PAPAS.flatMap(p => p.f.map(f => ({ ...f, papa: p })));
  const DUR_HIST = 9000;
  let histTimer = null;
  const LLAVES = '<svg class="llaves" viewBox="0 0 48 48" aria-hidden="true"><g fill="none" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><g stroke="#e9edf5" transform="rotate(-40 24 24)"><circle cx="24" cy="9.5" r="5.2"/><path d="M24 14.7V41M24 33h-5.5M24 38h-4.5"/></g><g stroke="#f6dfa0" transform="rotate(40 24 24)"><circle cx="24" cy="9.5" r="5.2"/><path d="M24 14.7V41M24 33h5.5M24 38h4.5"/></g></g></svg>';
  const avatarPapa = p => `<span class="av-papa" style="--h:${p.h}">${LLAVES}<b>${h(p.c)}</b></span>`;
  // Música de fondo de las historias (de la app, no depende de la voz del teléfono)
  const musHist = typeof Audio !== 'undefined' ? Object.assign(new Audio('audio/musica/adoracion.ogg'), { loop: true, preload: 'none' }) : null;
  function musicaHistoria(on) { if (!musHist) return; if (on && S.musicaHist !== false) { musHist.volume = 0.45; const r = musHist.play(); if (r && r.catch) r.catch(() => { }); } else musHist.pause(); }
  const filaHistorias = () => `<div class="historias" role="list">${PAPAS.map(p => `<button class="hist-burbuja ${(S.histVistas || []).includes(p.id) ? 'vista' : ''}" role="listitem" data-a="historia:${HISTORIAS.findIndex(x => x.papa === p)}"><span class="aro">${avatarPapa(p)}</span><small>${h(p.n.replace('San ', ''))}</small></button>`).join('')}</div>`;
  P.papas = () => `${titulo('Frases de los Papas', 'Palabras que marcaron a la Iglesia, para rezar y compartir.')}
    ${filaHistorias()}
    <div class="lista">${HISTORIAS.map((x, k) => `<button class="frase-papa" data-a="historia:${k}" style="background-image:linear-gradient(90deg,rgba(5,10,23,.92),rgba(5,10,23,.55)),url(img/misterios/${x.img}.webp)">
      <q>${h(x.t)}</q><small>${h(x.papa.n)} · ${h(x.s)}</small></button>`).join('')}</div>
    <div class="aviso">Frases textuales tomadas de documentos y discursos publicados por la Santa Sede. Las pinturas son de dominio público.</div>${pie()}`;
  function detenerHistoria() { clearTimeout(histTimer); histTimer = null; }
  function renderHistoria(k) {
    detenerHistoria();
    k = Math.max(0, Math.min(HISTORIAS.length - 1, Number(k) || 0));
    const x = HISTORIAS[k], p = x.papa, delPapa = HISTORIAS.filter(y => y.papa === p), pos = delPapa.indexOf(x);
    S.histVistas = [...new Set([...(S.histVistas || []), p.id])]; guardar();
    document.body.classList.add('modo-rezo');
    main.innerHTML = `<section class="historia" data-k="${k}">
      <div class="hist-img" style="background-image:url(img/misterios/${x.img}.webp)" aria-hidden="true"></div>
      <div class="hist-barras">${delPapa.map((_, i) => `<i class="${i < pos ? 'llena' : i === pos ? 'activa' : ''}"><b style="animation-duration:${DUR_HIST}ms"></b></i>`).join('')}</div>
      <div class="hist-top">${avatarPapa(p)}<div><strong>${h(p.n)}</strong><small>${h(p.y)}</small></div><button class="btn-atras hist-son" data-a="hist:musica" aria-label="${S.musicaHist !== false ? 'Silenciar música' : 'Activar música'}">${S.musicaHist !== false ? '🔊' : '🔇'}</button><button class="btn-atras" data-a="hist:cerrar" aria-label="Cerrar">${ICO.cerrar}</button></div>
      <button class="hist-zona izq" data-a="hist:ant" aria-label="Anterior"></button><button class="hist-zona der" data-a="hist:sig" aria-label="Siguiente"></button>
      <div class="hist-texto"><span class="hist-comillas" aria-hidden="true">“</span><q>${h(x.t).split(' ').map((w, i) => `<span style="animation-delay:${(0.25 + i * 0.07).toFixed(2)}s">${w} </span>`).join('')}</q>
        <small>— ${h(p.n)}<br>${h(x.s)}</small></div>
      <div class="hist-acciones">${btn('↗ Compartir', 'hist:compartir:' + k, 'chico')}${btnLeer('leer:papa:' + k, '🔊 Escuchar', 'chico')}</div>
    </section>`;
    musicaHistoria(true);
    histTimer = setTimeout(() => { if (actual().p === 'historia') moverHistoria(1); }, DUR_HIST);
  }
  function moverHistoria(d) {
    const k = Number(actual().arg) + d;
    if (k < 0) return renderHistoria(0);
    if (k >= HISTORIAS.length) { cerrarHistoria(); aviso('¡Viste todas las frases! 🙏'); return; }
    pila[pila.length - 1] = { p: 'historia', arg: k }; renderHistoria(k);
  }
  function cerrarHistoria() { detenerHistoria(); musicaHistoria(false); detenerVoz(); document.body.classList.remove('modo-rezo'); if (actual().p === 'historia') pila.pop(); if (!pila.length) pila = [{ p: 'inicio' }]; render(); }

  P.medios = () => `${titulo('Videos, Misa y radio', 'Transmisiones y programas de canales católicos oficiales. Se abren en YouTube o en el sitio de cada medio.')}
    <div class="chips">${['Todos', 'En vivo', 'Videos', 'Audios'].map(t => `<button class="chip ${t === medioTipo ? 'activo' : ''}" data-a="medio:${t}">${t}</button>`).join('')}</div>
    <div class="lista">${F.medios.filter(m => medioTipo === 'Todos' || m.tipo === medioTipo).map(m => item(m.icono, m.titulo, `${m.tipo} · ${m.desc}`, 'url:' + m.url)).join('')}</div>
    <div class="aviso">No descargamos ni copiamos videos ni audios de terceros: se reproducen en sus plataformas oficiales.</div>${pie()}`;

  /* ---------- Formación ---------- */
  P.formacion = () => `${titulo('Formación católica', 'Lo esencial de la fe, explicado con sencillez.')}
    <div class="lista">${window.MFC_FORMACION.map(l => item(l.icono, l.titulo, l.intro.slice(0, 70) + '…', 'leccion:' + l.id)).join('')}
    ${item('📘', F.enlaces.catecismo.titulo, F.enlaces.catecismo.desc, 'url:' + F.enlaces.catecismo.url)}</div>${pie()}`;
  P.leccion = id => { const l = window.MFC_FORMACION.find(x => x.id === id); if (!l) return P.formacion();
    return `<div class="titulo"><span class="eyebrow">Formación</span><h1>${h(l.icono)} ${h(l.titulo)}</h1></div>
      <div class="card"><p>${h(l.intro)}</p><ul style="padding-left:1.1em">${l.puntos.map(p => `<li style="margin-bottom:.5em">${h(p)}</li>`).join('')}</ul></div>
      <div class="fila">${btnLeer('leer:leccion:' + id)}${btn('Catecismo oficial', 'url:' + F.enlaces.catecismo.url)}</div>${pie()}`; };

  /* ---------- Intenciones ---------- */
  P.intenciones = () => `${titulo('Mis intenciones', 'Anotá lo que querés poner en manos de Dios. Se guarda solo en este teléfono.')}
    <div class="card"><label class="lbl" for="nuevaInt">Nueva intención</label><textarea id="nuevaInt" rows="3" placeholder="Señor, te pido por…"></textarea>
      <div style="margin-top:10px">${btn('Guardar intención', 'intadd', 'primario ancho')}</div></div>
    <div class="lista">${S.intenciones.length ? S.intenciones.slice().reverse().map(i => `<div class="card"><p class="texto-oracion" style="${i.ok ? 'opacity:.7' : ''}">${h(i.texto)}</p>
      <div class="fila entre"><span class="small muted">${h(i.fecha)}${i.ok ? ' · 🙏 Gracia recibida' : ''}</span>
      <span class="fila">${btn(i.ok ? '↺' : '✓ Recibida', 'intok:' + i.id, 'chico')}${btn('🗑', 'intdel:' + i.id, 'chico')}</span></div></div>`).join('') : '<div class="card muted">Todavía no anotaste intenciones.</div>'}</div>
    <div class="aviso">Tus intenciones no se envían a ningún servidor. Si desinstalás la app o borrás sus datos, se pierden (podés hacer un respaldo en Ajustes).</div>${pie()}`;

  /* ---------- Explorar ---------- */
  P.explorar = () => `${titulo('Explorar', 'Todo lo que tiene Mi Fe Católica.')}
    <div class="lista">${[['📿', 'Santo Rosario', 'Visual y con voz', 'ir:rosario'], ['💙', 'Coronilla de la Divina Misericordia', '', 'rezar:coronilla'], ['🙏', 'Oraciones', `${ORACIONES.length} oraciones`, 'ir:oraciones'],
      ['🕯', 'Novenas', 'Inmaculada, Navidad, Luján y más', 'ir:novenas'], ['✝', 'Vía Crucis', '14 estaciones', 'ir:viacrucis'], ['📖', 'La Biblia', 'El Libro del Pueblo de Dios', 'ir:biblia'],
      ['📜', 'Lecturas del día', 'Evangelio y liturgia', 'ir:lecturas'], ['📅', 'Calendario litúrgico', 'Santos, fiestas y colores', 'ir:calendario'], ['📰', 'Noticias', 'Papa, Iglesia y Argentina', 'ir:noticias'],
      ['📺', 'Videos, Misa y radio', 'Canales oficiales', 'ir:medios'], ['🎓', 'Formación católica', 'Mandamientos, sacramentos y más', 'ir:formacion'], ['🌿', '30 días de oración', 'Camino diario', 'ir:camino'],
      ['🎶', 'Música', 'De la app, tus canciones, YouTube y Spotify', 'ir:musica'], ['🕊️', 'Frases de los Papas', 'Para rezar y compartir', 'ir:papas'], ['✍️', 'Cuaderno espiritual', 'Anotaciones personales', 'ir:cuaderno'], ['📚', 'Biblioteca', 'Lector estilo libro', 'ir:biblioteca'], ['✨', 'Galería de frases', 'Pensamientos de los santos', 'ir:frases'], ['💛', 'Mis intenciones', '', 'ir:intenciones'], ['⭐', 'Oraciones favoritas', '', 'ir:favoritos'], ['⛪', 'Iglesias cerca de mí', 'Abre el mapa', 'url:' + F.enlaces.parroquias.url]]
      .map(([i, t, s, a]) => item(i, t, s, a)).join('')}</div>${pie()}`;

  /* ---------- Ajustes ---------- */
  let estadoRec = null;
  const cabAjuste = (ico, t, sub) => `<div class="aj-cab"><span class="aj-ico" aria-hidden="true">${ico}</span><div><h3>${h(t)}</h3>${sub ? `<small>${h(sub)}</small>` : ''}</div></div>`;
  const interruptor = (id, ico, t, sub, on) => `<label class="interruptor" for="${id}"><span class="int-txt"><span class="int-ico" aria-hidden="true">${ico}</span><span><b>${h(t)}</b>${sub ? `<small>${h(sub)}</small>` : ''}</span></span><input type="checkbox" id="${id}" ${on ? 'checked' : ''}></label>`;
  function textoProximo(r) {
    const l = [];
    if (r.rosario) l.push(['Rosario', r.rosario]); if (r.angelus) l.push(['Ángelus', '12:00']); if (r.misericordia) l.push(['Misericordia', '15:00']);
    if (!l.length) return '';
    const ahora = new Date(), min = ahora.getHours() * 60 + ahora.getMinutes();
    const prox = l.map(([n, hm]) => { const [hh, mm] = hm.split(':').map(Number), t = hh * 60 + mm; return { n, hm, d: t > min ? t - min : t + 1440 - min, hoy: t > min }; }).sort((a, b) => a.d - b.d)[0];
    return `Próximo aviso: <b>${prox.hoy ? 'hoy' : 'mañana'} a las ${h(prox.hm)}</b> (${h(prox.n)})`;
  }
  P.ajustes = () => {
    const rr = S.recordatorios, e = estadoRec, alguno = rr.rosario || rr.angelus || rr.misericordia;
    const problemas = [];
    if (e && alguno && e.permiso !== 'granted') problemas.push(`<div class="alerta"><b>Las notificaciones están bloqueadas.</b> Sin ese permiso los recordatorios no pueden llegar.${btn('Permitir notificaciones', 'recpermiso', 'chico primario')}</div>`);
    if (e && alguno && e.exacto && e.exacto !== 'granted') problemas.push(`<div class="alerta"><b>Falta permitir «Alarmas y recordatorios».</b> Sin ese permiso Android puede atrasar o no mostrar el aviso.${btn('Abrir permiso', 'recexacto', 'chico primario')}</div>`);
    return `${titulo('Ajustes', 'Adaptá la app a tu gusto.')}
    <section class="card aj">${cabAjuste('🎨', 'Apariencia', 'Tamaño de letra y colores')}
      <label class="lbl">Tamaño de letra</label>
      <div class="segmentado letras">${[['normal', 'Normal', 'a1'], ['grande', 'Grande', 'a2'], ['muy-grande', 'Muy grande', 'a3']].map(([k, v, c]) => `<button class="${S.letra === k ? 'activo' : ''}" data-a="letra:${k}"><span class="aa ${c}">Aa</span>${v}</button>`).join('')}</div>
      <label class="lbl">Tema</label>
      <div class="temas">${[['oscuro', '🌙', 'Oscuro', 'Ideal de noche'], ['claro', '☀️', 'Claro', 'Para leer de día']].map(([k, i, v, s]) => `<button class="tema-op ${k} ${S.tema === k ? 'activo' : ''}" data-a="tema:${k}"><span class="tema-muestra"><i></i><i></i><i></i></span><b>${i} ${v}</b><small>${s}</small></button>`).join('')}</div>
    </section>
    <section class="card aj">${cabAjuste('🎙️', 'Voz y audio', 'Cómo se escucha el Rosario y las oraciones')}
      <label class="lbl">Voz para rezar el Rosario</label>
      <div class="voces">${[['natural', '🎙️', 'Voz grabada', 'Acento argentino, sin internet'], ['telefono', '📱', 'Voz del teléfono', 'La de Google, más clara']].map(([k, i, v, s]) => `<button class="voz-op ${S.voz === k ? 'activo' : ''}" data-a="voz:${k}"><span>${i}</span><b>${v}</b><small>${s}</small></button>`).join('')}</div>
      <div class="fila" style="margin:12px 0 4px">${btn('▶ Probar voz grabada', 'probarnat', 'chico')}${btnLeer('leer:prueba', '▶ Probar voz del teléfono', 'chico')}</div>
      ${interruptor('musica', '🎵', 'Música de fondo al rezar', 'Suave, mientras rezás el Rosario', S.musica)}
      <label class="lbl" for="volm">Volumen de la música</label>
      <div class="rango"><span aria-hidden="true">🔈</span><input id="volm" type="range" min="0.05" max="0.8" step="0.05" value="${S.volMusica}"><span aria-hidden="true">🔊</span></div>
      <label class="lbl" for="vel">Velocidad de la voz del teléfono: <b id="velTxt">${velTexto(S.velocidad)}</b></label>
      <div class="rango"><span aria-hidden="true">🐢</span><input id="vel" type="range" min="0.6" max="1.4" step="0.1" value="${S.velocidad}"><span aria-hidden="true">🐇</span></div>
      ${item('🛠️', 'La voz del teléfono no suena o se entiende mal', 'Cómo instalar o elegir la voz en español', 'ir:voces')}
    </section>
    <section class="card aj">${cabAjuste('🔔', 'Recordatorios diarios', 'Un aviso para no olvidarte de rezar')}
      ${interruptor('recRos', '📿', 'Rezar el Rosario', 'Todos los días a la hora que elijas', rr.rosario)}
      ${rr.rosario ? `<div class="horas"><div class="chips">${['07:00', '12:00', '18:00', '20:00', '21:00', '22:00'].map(x => `<button class="chip ${rr.rosario === x ? 'activo' : ''}" data-a="rechora:${x}">${x}</button>`).join('')}</div>
        <label class="lbl" for="recHora">Otra hora</label><input type="time" id="recHora" value="${h(rr.rosario)}"></div>` : ''}
      ${interruptor('recAng', '🔔', 'Ángelus', 'A las 12 del mediodía', rr.angelus)}
      ${interruptor('recMis', '💙', 'Hora de la Misericordia', 'A las 15 h', rr.misericordia)}
      ${alguno ? `<p class="proximo">${textoProximo(rr)}</p>` : ''}
      ${problemas.join('')}
      ${N.Recordatorios.disponible() ? `${btn('🔔 Enviar un aviso de prueba', 'recprueba', 'ancho')}
        <details class="ayuda-det"><summary>¿No te llegan los avisos?</summary>
          <ol><li>Tocá <b>Enviar un aviso de prueba</b> y bloqueá el teléfono: en 10 segundos tiene que llegar.</li>
          <li>En <b>Ajustes del teléfono › Apps › Mi Fe Católica › Notificaciones</b>, dejalas activadas.</li>
          <li>En <b>Ahorro de batería</b> elegí <b>Sin restricciones</b>.</li>
          <li>En Xiaomi, Redmi o POCO: activá también <b>Inicio automático</b> (Ajustes › Apps › Permisos › Inicio automático).</li>
          <li>En Samsung: en <b>Batería</b>, sacá la app de «Apps en suspensión».</li></ol></details>` : '<p class="small muted">Los recordatorios funcionan en la app instalada en Android.</p>'}
    </section>
    <section class="card aj">${cabAjuste('💾', 'Respaldo de mis datos', 'Favoritos, intenciones, notas y avances')}
      <p class="small muted">El respaldo puede contener datos personales: guardalo en un lugar seguro.</p>
      <div class="fila">${btn('📤 Crear respaldo', 'respaldo')}${btn('📥 Restaurar', 'restaurar')}</div><input type="file" id="archivoResp" accept="application/json,.json,text/plain" hidden></section>
    <section class="card aj">${cabAjuste('✝️', 'Acerca de', `Mi Fe Católica ${CFG.version}`)}
      <div class="lista" style="margin:0">${item('⬆️', 'Buscar actualizaciones', 'Versión instalada: ' + CFG.version, 'ir:actualizar')}${item('❓', 'Ayuda', 'Cómo usar la app', 'ir:ayuda')}${item('📄', 'Licencias y créditos', 'Textos, imágenes y voces', 'ir:licencias')}${item('🔒', 'Privacidad', 'Qué datos se guardan', 'ir:privacidad')}</div></section>${pie()}`;
  };
  function velTexto(v) { return v <= 0.75 ? 'muy pausada' : v <= 0.95 ? 'pausada' : v <= 1.05 ? 'normal' : v <= 1.25 ? 'ágil' : 'rápida'; }
  async function refrescarEstadoRec() {
    const e = await N.Recordatorios.estado();
    if (JSON.stringify(e) !== JSON.stringify(estadoRec)) { estadoRec = e; if (actual().p === 'ajustes') { const y = window.scrollY; render(); window.scrollTo(0, y); } }
  }
  P.voces = () => `${titulo('Voz del teléfono', 'Cómo lograr que la lectura en voz alta se escuche clara y en español.')}
    <div class="card"><ol class="pasos">
      <li><b>Instalá o actualizá «Servicios de voz de Google»</b> (gratis). Es la voz más clara en español.${btn('Abrir en Play Store', 'appstore:com.google.android.tts', 'chico primario')}</li>
      <li>Abrí los <b>Ajustes del teléfono</b> (el ícono de engranaje), tocá la <b>lupa</b> y escribí <b>«texto a voz»</b>. También podés llegar así:
        <details class="ayuda-det" open><summary>Xiaomi, Redmi o POCO</summary><p>Ajustes › <b>Ajustes adicionales</b> › <b>Idiomas e introducción de texto</b> › <b>Salida de texto a voz</b>.</p></details>
        <details class="ayuda-det"><summary>Samsung</summary><p>Ajustes › <b>Administración general</b> › <b>Salida de texto a voz</b>.</p></details>
        <details class="ayuda-det"><summary>Motorola y otros</summary><p>Ajustes › <b>Sistema</b> › <b>Idiomas y entrada</b> › <b>Salida de texto a voz</b> (o en <b>Accesibilidad</b>).</p></details></li>
      <li>En <b>Motor preferido</b> elegí <b>Servicios de voz de Google</b>.</li>
      <li>Tocá el engranaje ⚙️ al lado del motor › <b>Idioma</b> › <b>Español (Estados Unidos)</b>, que es el acento latinoamericano, y descargá la voz si te lo pide.</li>
      <li>Volvé a la app y probá:</li></ol>
      ${btnLeer('leer:prueba', '▶ Probar voz del teléfono', 'primario ancho')}</div>
    <div class="aviso">Por seguridad, Android no deja que una app abra directamente esos ajustes: hay que entrar a mano una sola vez. En algunos Xiaomi el motor que viene instalado no tiene español y lee las palabras como si fueran en inglés; con la voz de Google se soluciona.</div>${pie()}`;

  P.actualizar = () => {
    const u = window.__actualizacion;
    setTimeout(() => buscarActualizacion(true), 50);
    return `${titulo('Actualizaciones', 'Versión instalada: ' + h(CFG.version))}
      <div class="card" id="estadoAct">${u ? `<span class="eyebrow">Nueva versión</span><h2>Mi Fe Católica ${h(u.versionName)}</h2><p class="texto-oracion">${h(u.notes || '')}</p>
        ${btn('⬇ Descargar e instalar', 'instalar', 'primario ancho')}<p class="small muted" style="margin-top:10px">La app descarga el archivo, comprueba su huella digital (SHA-256) y recién entonces abre el instalador de Android. Tus datos se conservan.</p>`
        : CFG.updatesUrl ? '<p>Buscando…</p>' : '<p>Esta versión de prueba todavía no tiene configurado el servidor de actualizaciones.</p>'}</div>
      <div class="aviso">Android siempre pide confirmar la instalación. Las actualizaciones solo se aceptan si están firmadas con la misma clave que la app instalada.</div>${pie()}`;
  };
  async function buscarActualizacion(manual) {
    if (!CFG.updatesUrl) return;
    if (!manual && Date.now() - S.ultimaRevision < 12 * 3600 * 1000) return;
    S.ultimaRevision = Date.now(); guardar();
    try {
      const m = JSON.parse(await N.descargarTexto(CFG.updatesUrl));
      const info = await N.infoApp();
      const valido = m && m.app === 'com.metricslab.mifecatolica' && Number.isInteger(m.versionCode) && /^https:\/\//.test(m.apkUrl) && /^[a-f0-9]{64}$/i.test(m.sha256);
      if (valido && m.versionCode > (info.build || CFG.versionCode)) { window.__actualizacion = m; if (['inicio', 'actualizar'].includes(actual().p)) render(); }
      else if (manual) { const e = $('#estadoAct'); if (e) e.innerHTML = '<h3>✓ Tenés la última versión</h3>'; }
    } catch (e) { if (manual) { const el = $('#estadoAct'); if (el) el.innerHTML = '<p>No se pudo consultar el servidor de actualizaciones. Revisá tu conexión.</p>'; } }
  }
  async function instalarActualizacion() {
    const u = window.__actualizacion; if (!u) return;
    if (!N.Actualizador.disponible()) { N.abrirEnlace(u.apkUrl); return; }
    if (!(await N.Actualizador.puedeInstalar())) { aviso('Permití «Instalar apps desconocidas» para Mi Fe Católica y volvé a tocar Descargar.'); await N.Actualizador.abrirPermisoInstalar(); return; }
    const e = $('#estadoAct'); if (e) e.innerHTML = '<h3>Descargando…</h3><p>No cierres la app. Al terminar se verificará el archivo.</p>';
    try { await N.Actualizador.descargarEInstalar(u.apkUrl, u.sha256); if (e) e.innerHTML = '<h3>✓ Archivo verificado</h3><p>Confirmá la instalación en la ventana de Android.</p>'; }
    catch (err) { if (e) e.innerHTML = `<h3>No se pudo actualizar</h3><p>${h(err.message || err)}</p>`; }
  }

  P.ayuda = () => `${titulo('Ayuda', 'Cómo sacarle provecho a Mi Fe Católica.')}
    <div class="card"><h3>📿 Rosario</h3><p>Elegí los misterios y tocá Comenzar. Tocá la imagen o «Siguiente» para pasar cada cuenta. Con «Escuchar» la app reza en voz alta y avanza sola; «Pausar» la detiene. Si salís, la app recuerda dónde quedaste.</p></div>
    <div class="card"><h3>🔤 Letra más grande</h3><p>En Ajustes podés elegir letra Grande o Muy grande y el modo Claro u Oscuro.</p></div>
    <div class="card"><h3>🔊 La voz no se escucha</h3><p>Subí el volumen multimedia. Si sigue sin sonar, en Android andá a Ajustes › Accesibilidad › Texto a voz e instalá la voz en español.</p></div>
    <div class="card"><h3>📶 Sin internet</h3><p>Rosario, oraciones, novenas, Vía Crucis, formación y calendario funcionan sin conexión. Noticias, Biblia, lecturas y videos necesitan internet.</p></div>${pie()}`;
  P.privacidad = () => `${titulo('Privacidad', 'Tu oración es tuya.')}
    <div class="card"><p>Mi Fe Católica no tiene cuentas de usuario, no usa publicidad ni rastreadores y no envía tus datos a ningún servidor.</p>
    <p>Se guardan <b>solo en tu teléfono</b>: tus ajustes, favoritos, intenciones y el avance de tus oraciones.</p>
    <p>La app se conecta a internet únicamente para: mostrar titulares de noticias (Vatican News, Radio María Argentina), consultar el Evangelio del día, buscar actualizaciones de la app y abrir los sitios que vos elegís. Esos sitios tienen sus propias políticas de privacidad.</p>
    <p>Permisos: Internet; notificaciones (solo si activás recordatorios); instalar actualizaciones (solo cuando vos lo pedís).</p></div>${pie()}`;
  P.licencias = () => {
    const cr = window.__creditos || {};
    return `${titulo('Licencias y créditos', 'Usamos solo contenido propio, de dominio público o con licencia que lo permite.')}
    <div class="card"><h3>Textos</h3><p class="small">• Oraciones tradicionales de la Iglesia (dominio público), marcadas como «Tradicional».<br>• Oraciones, meditaciones, novenas, Vía Crucis, formación y el camino de 30 días: textos originales de Mi Fe Católica, marcados como tales. No son textos litúrgicos oficiales.<br>• Biblia, lecturas, Catecismo y noticias: se consultan en sus fuentes oficiales; la app no copia su contenido.</p></div>
    <div class="card"><h3>Pinturas de los misterios</h3><p class="small muted">Obras de maestros antiguos en dominio público, obtenidas de Wikimedia Commons. Reducidas y convertidas a WebP.</p>
      ${Object.entries(cr).map(([k, c]) => `<p class="small"><b>${h(k)}</b>: ${h(c.autor)}${c.fecha ? ' (' + h(c.fecha) + ')' : ''} — ${h(c.licencia)}. <a href="#" data-a="url:${h(c.fuente)}">Fuente</a></p>`).join('') || '<p class="small">Cargando créditos…</p>'}</div>
    <div class="card"><h3>Audio</h3><p class="small">• Narración del Rosario: voz neuronal «Daniela» (es_AR) del proyecto Piper, entrenada con el conjunto de datos OpenSLR 61 de Google (CC BY-SA 4.0). Los audios de la narración se distribuyen bajo CC BY-SA 4.0.<br>• Música de fondo «Meditación»: composición original de Mi Fe Católica, generada por síntesis.</p></div>
    <div class="card"><h3>Software</h3><p class="small">Capacitor (MIT) y complementos oficiales y comunitarios de Capacitor (MIT).</p></div>${pie()}`;
  };


  /* ================= Biblia estilo libro ================= */
  P.biblia = () => {
    const B = window.MFC_BIBLIA || [], t = S.bibliaTest, libros = B.filter(l => l.t === t);
    return `${titulo('La Biblia', 'El Libro del Pueblo de Dios (traducción argentina). Elegí un libro y un capítulo.')}
      <div class="segmentado">${[['AT', 'Antiguo Testamento'], ['NT', 'Nuevo Testamento']].map(([k, v]) => `<button class="${t === k ? 'activo' : ''}" data-a="btest:${k}">${v}</button>`).join('')}</div>
      ${libros.length ? `<div class="estante">${libros.map((l, i) => `<button class="lomo" style="--h:${(i * 37) % 360}" data-a="blibro:${B.indexOf(l)}"><span>${h(l.n)}</span><small>${l.caps.length} cap.</small></button>`).join('')}</div>`
        : `<div class="card">${btn('Abrir la Biblia', 'url:' + F.enlaces.biblia.url, 'primario ancho')}</div>`}
      <div class="lista">${item('📜', 'Lecturas de hoy', 'Evangelio del día', 'ir:lecturas')}${item('🙏', 'Oración antes de leer la Biblia', '', 'oracion:antes-biblia')}</div>
      <div class="aviso">El texto bíblico se lee en el sitio oficial de la Santa Sede (vatican.va), que tiene sus derechos. Desde el 1/1/2027 se sumará la Biblia de Mons. Straubinger completa dentro de la app, sin conexión y en este mismo formato de libro.</div>${pie()}`;
  };
  P.libro = i => {
    const l = (window.MFC_BIBLIA || [])[i]; if (!l) return P.biblia();
    return `<div class="portada"><span class="eyebrow">${l.t === 'AT' ? 'Antiguo Testamento' : 'Nuevo Testamento'}</span><h1>${h(l.n)}</h1><p>${h(l.largo || '')}<br>${l.caps.length} ${l.caps.length === 1 ? 'capítulo' : 'capítulos'}</p></div>
      <div class="capitulos">${l.caps.map(([c, u]) => `<button data-a="url:${h(u)}">${c}</button>`).join('')}</div>
      <div class="aviso">Cada capítulo se abre en vatican.va dentro de la app. Volvé con la ✕ de arriba.</div>${pie()}`;
  };

  /* ================= Biblioteca y lector estilo ebook ================= */
  const LIBROS = () => [
    { id: 'camino', titulo: '30 días de oración', autor: 'Mi Fe Católica', color: '#2f6b55', caps: (window.MFC_LIBRE || []).map(e => ({ t: `Día ${e.dia}. ${e.titulo}`, x: `${e.oracion}\n\nPara vivir hoy: ${e.accion}` })) },
    { id: 'frases', titulo: 'Pensamientos de los santos', autor: 'Selección de Mi Fe Católica', color: '#7a3b2e', caps: [{ t: 'Pensamientos de los santos', x: (window.MFC_FRASES || []).map(f => `«${f.t}»\n— ${f.a}`).join('\n\n') }] },
    { id: 'formacion', titulo: 'Catecismo breve', autor: 'Mi Fe Católica', color: '#24476e', caps: window.MFC_FORMACION.map(l => ({ t: l.titulo, x: l.intro + '\n\n' + l.puntos.join('\n\n') })) },
    { id: 'viacrucis', titulo: 'Vía Crucis', autor: 'Mi Fe Católica', color: '#5b2a4a', caps: ESTACIONES.map((e, i) => ({ t: `${i + 1}.ª estación: ${e}`, x: `— Te adoramos, oh Cristo, y te bendecimos.\n— Porque por tu santa Cruz redimiste al mundo.\n\n${MEDIT[i]}\n\nPadre Nuestro, Ave María y Gloria.` })) },
    ...window.MFC_NOVENAS.map(n => ({ id: 'nov-' + n.id, titulo: n.titulo, autor: 'Mi Fe Católica', color: '#6b5420', caps: [{ t: 'Introducción', x: n.intro + '\n\n' + n.fecha }, ...n.dias.map(([t, r, o], i) => ({ t: `Día ${i + 1}. ${t}`, x: `${r}\n\n${o}` })), { t: 'Oración final', x: n.final }] }))
  ];
  P.biblioteca = () => `${titulo('Biblioteca', 'Libros para leer y rezar, en formato de libro, sin conexión.')}
    <div class="estante">${LIBROS().map(b => `<button class="tapa" style="--c:${b.color}" data-a="leer-libro:${b.id}"><b>${h(b.titulo)}</b><small>${h(b.autor)}</small>${S.lector[b.id] ? '<i>Seguir leyendo</i>' : ''}</button>`).join('')}</div>
    <div class="lista">${item('📖', 'La Biblia', 'El Libro del Pueblo de Dios', 'ir:biblia')}${item('✨', 'Galería de frases', 'Pensamientos de los santos', 'ir:frases')}</div>
    <div class="aviso">Próximamente: más clásicos de la espiritualidad católica en dominio público, a medida que verifiquemos la licencia de cada traducción.</div>${pie()}`;
  let lectorLibro = null, lectorPag = 0, lectorTotal = 1;
  function abrirLector(id) {
    lectorLibro = LIBROS().find(b => b.id === id); if (!lectorLibro) return;
    pila.push({ p: 'lector', arg: id }); document.body.classList.add('modo-rezo'); renderLector();
  }
  function renderLector() {
    const b = lectorLibro, tema = S.lectorTema;
    main.innerHTML = `<section class="lector tema-${tema}" style="--lf:${S.lectorLetra}">
      <div class="lector-top"><button class="btn-atras" data-a="lector:salir" aria-label="Cerrar">✕</button><div class="lector-tit">${h(b.titulo)}</div>
        <button class="btn-atras" data-a="lector:menu" aria-label="Opciones">Aa</button></div>
      <div class="lector-menu oculto" id="lectorMenu">
        <div class="segmentado">${[['claro', 'Blanco'], ['sepia', 'Sepia'], ['noche', 'Noche']].map(([k, v]) => `<button class="${tema === k ? 'activo' : ''}" data-a="lector:tema:${k}">${v}</button>`).join('')}</div>
        <div class="fila"><button class="btn" data-a="lector:letra:-1">A−</button><button class="btn" data-a="lector:letra:1">A+</button><button class="btn" data-a="lector:indice">☰ Índice</button></div></div>
      <div class="lector-vista" id="lectorVista"><div class="lector-texto" id="lectorTexto">
        <div class="lector-portada"><span>${h(b.autor)}</span><h1>${h(b.titulo)}</h1><div class="orn">✦</div></div>
        ${b.caps.map((c, i) => `<h2 id="cap${i}">${h(c.t)}</h2><p>${h(c.x).replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>')}</p>`).join('')}
        <div class="orn fin">✦ Fin ✦</div></div></div>
      <div class="lector-pie"><button data-a="lector:pag:-1" aria-label="Página anterior">‹</button><span id="lectorNum"></span><button data-a="lector:pag:1" aria-label="Página siguiente">›</button></div>
    </section>`;
    requestAnimationFrame(() => { paginar(); const pos = S.lector[b.id]; irPagina(pos ? Math.round(pos * (lectorTotal - 1)) : 0); });
    const v = $('#lectorVista'); let x0 = null;
    v.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
    v.addEventListener('touchend', e => { if (x0 === null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 40) irPagina(lectorPag + (dx < 0 ? 1 : -1)); x0 = null; });
    v.addEventListener('click', e => { const w = v.clientWidth, x = e.clientX - v.getBoundingClientRect().left; if (x > w * 0.66) irPagina(lectorPag + 1); else if (x < w * 0.33) irPagina(lectorPag - 1); });
  }
  function paginar() {
    const v = $('#lectorVista'), t = $('#lectorTexto'); if (!v || !t) return;
    t.style.columnWidth = v.clientWidth + 'px'; t.style.height = v.clientHeight + 'px';
    lectorTotal = Math.max(1, Math.round(t.scrollWidth / (v.clientWidth + 0.01)) || 1);
  }
  function irPagina(n) {
    const v = $('#lectorVista'), t = $('#lectorTexto'); if (!v || !t) return;
    lectorPag = Math.max(0, Math.min(lectorTotal - 1, n));
    t.style.transform = `translateX(${-lectorPag * (v.clientWidth + 48)}px)`;
    const num = $('#lectorNum'); if (num) num.textContent = `${lectorPag + 1} de ${lectorTotal}`;
    S.lector[lectorLibro.id] = lectorTotal > 1 ? lectorPag / (lectorTotal - 1) : 0; guardar();
  }

  /* ================= Galería de frases ================= */
  const fraseDelDia = () => { const F2 = window.MFC_FRASES || []; const d = new Date(), n = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 864e5); return [F2[n % F2.length], n % F2.length]; };
  const IMGS = ['gozosos-1', 'luminosos-3', 'gloriosos-1', 'gozosos-3', 'luminosos-1', 'gloriosos-4', 'dolorosos-1', 'gozosos-2', 'luminosos-4', 'gloriosos-3', 'gloriosos-5', 'luminosos-5'];
  let temaFrase = 'Todos';
  P.frases = () => {
    const F2 = window.MFC_FRASES || [], temas = ['Todos', 'Favoritas', ...new Set(F2.map(f => f.tema))];
    const lista = F2.map((f, i) => ({ ...f, i })).filter(f => temaFrase === 'Todos' || f.tema === temaFrase || (temaFrase === 'Favoritas' && S.frasesFav.includes(f.i)));
    return `${titulo('Galería de frases', 'Pensamientos de los santos para meditar y compartir.')}
      <div class="chips">${temas.map(t => `<button class="chip ${t === temaFrase ? 'activo' : ''}" data-a="ftema:${h(t)}">${h(t)}</button>`).join('')}</div>
      <div class="galeria">${lista.map(f => `<button class="frase" data-a="frase:${f.i}" style="background-image:linear-gradient(180deg,rgba(5,10,23,.25),rgba(5,10,23,.88)),url(img/misterios/${IMGS[f.i % IMGS.length]}.webp)">
        <q>${h(f.t)}</q><small>${h(f.a)}${S.frasesFav.includes(f.i) ? ' ★' : ''}</small></button>`).join('') || '<div class="card">Todavía no marcaste frases favoritas.</div>'}</div>${pie()}`;
  };
  P.frase = i => { const f = (window.MFC_FRASES || [])[i]; if (!f) return P.frases();
    return `<div class="frase grande" style="background-image:linear-gradient(180deg,rgba(5,10,23,.15),rgba(5,10,23,.9)),url(img/misterios/${IMGS[i % IMGS.length]}.webp)"><q>${h(f.t)}</q><small>— ${h(f.a)}</small></div>
      <div class="fila">${btn(S.frasesFav.includes(+i) ? '★ Favorita' : '☆ Favorita', 'ffav:' + i)}${btn('↗ Compartir', 'fcomp:' + i)}${btn('🔊 Escuchar', 'fleer:' + i)}</div>
      <div class="fila" style="margin-top:10px">${btn('◀ Anterior', 'frase:' + ((+i - 1 + window.MFC_FRASES.length) % window.MFC_FRASES.length))}${btn('Siguiente ▶', 'frase:' + ((+i + 1) % window.MFC_FRASES.length))}</div>${pie()}`; };

  /* ================= Cuaderno espiritual ================= */
  const TIPOS_NOTA = [['oracion', '🙏 Oración'], ['gratitud', '💛 Gratitud'], ['palabra', '📖 Palabra de Dios'], ['proposito', '🎯 Propósito'], ['reflexion', '✍️ Reflexión']];
  let notaBusca = '';
  P.cuaderno = () => {
    const q = notaBusca.toLowerCase(), l = S.notas.filter(n => !q || (n.titulo + ' ' + n.texto).toLowerCase().includes(q)).sort((a, b) => b.id - a.id);
    return `${titulo('Cuaderno espiritual', 'Tus anotaciones: lo que Dios te dice, lo que agradecés, tus propósitos. Se guardan solo en este teléfono.')}
      ${btn('✍️ Nueva anotación', 'nota:nueva', 'primario ancho')}
      <input class="buscar" id="buscarNota" type="search" placeholder="🔎 Buscar en el cuaderno…" value="${h(notaBusca)}" style="margin:12px 0">
      <div class="lista">${l.length ? l.map(n => { const tp = (TIPOS_NOTA.find(x => x[0] === n.tipo) || TIPOS_NOTA[4])[1];
        return `<button class="nota-item" data-a="nota:${n.id}"><span class="meta">${h(tp)} · ${h(n.fecha)}</span><strong>${h(n.titulo || 'Sin título')}</strong><p>${h(n.texto.slice(0, 140))}${n.texto.length > 140 ? '…' : ''}</p></button>`; }).join('')
        : '<div class="card muted">Tu cuaderno está vacío. Podés anotar una frase que te tocó en Misa, una gracia recibida o un propósito para la semana.</div>'}</div>
      <div class="aviso">El cuaderno se incluye en el respaldo de Ajustes. No se envía a ningún servidor.</div>${pie()}`;
  };
  P.nota = id => {
    const n = id === 'nueva' ? { id: 'nueva', titulo: '', texto: '', tipo: 'reflexion' } : S.notas.find(x => String(x.id) === String(id));
    if (!n) return P.cuaderno();
    return `${titulo(id === 'nueva' ? 'Nueva anotación' : 'Anotación', id === 'nueva' ? fechaLarga() : h(n.fecha))}
      <div class="papel"><label class="lbl" for="notaTit">Título</label><input id="notaTit" class="buscar" value="${h(n.titulo)}" placeholder="Por ejemplo: Lo que me quedó del Evangelio">
      <label class="lbl">Tipo</label><div class="chips">${TIPOS_NOTA.map(([k, v]) => `<button class="chip ${n.tipo === k ? 'activo' : ''}" data-a="ntipo:${k}">${v}</button>`).join('')}</div>
      <label class="lbl" for="notaTxt">Escribí</label><textarea id="notaTxt" class="renglones" rows="12" placeholder="Señor, hoy…">${h(n.texto)}</textarea></div>
      <div class="fila" style="margin-top:12px">${btn('💾 Guardar', 'nguardar:' + n.id, 'primario')}${id !== 'nueva' ? btn('🗑 Borrar', 'nborrar:' + n.id) : ''}</div>${pie()}`;
  };
  let notaTipo = null;

  /* ================= Render y eventos ================= */
  function render() {
    aplicarAjustes();
    const { p, arg } = actual();
    if (p === 'historia') { renderHistoria(arg); return; }
    detenerHistoria();
    if (p === 'rezo') { renderRezo(); return; }
    if (p === 'lector') { if (!lectorLibro) lectorLibro = LIBROS().find(b => b.id === arg); renderLector(); return; }
    document.body.classList.remove('modo-rezo');
    const raiz = RAICES.includes(p) ? p : (['rosario'].includes(p) ? 'rosario' : (['oraciones', 'oracion', 'favoritos'].includes(p) ? 'oraciones' : (['ajustes', 'actualizar', 'ayuda', 'privacidad', 'licencias', 'voces'].includes(p) ? 'ajustes' : (p === 'inicio' ? 'inicio' : 'explorar'))));
    document.querySelectorAll('nav.bottom [data-a]').forEach(b => b.classList.toggle('activo', b.dataset.a === 'ir:' + raiz));
    $('#btnAtras').classList.toggle('oculto', pila.length <= 1);
    main.innerHTML = (P[p] || P.inicio)(arg);
    const b = $('#buscar'); if (b) b.addEventListener('input', e => { busqueda = e.target.value; const pos = e.target.selectionStart; render(); const nb = $('#buscar'); nb.focus(); nb.setSelectionRange(pos, pos); });
    const v = $('#vel'); if (v) v.addEventListener('input', e => { S.velocidad = Number(e.target.value); $('#velTxt').textContent = velTexto(S.velocidad); guardar(); });
    if (p === 'ajustes' && N.Recordatorios.disponible()) refrescarEstadoRec();
    ['recRos', 'recAng', 'recMis'].forEach(id => { const el = $('#' + id); if (el) el.addEventListener('change', () => cambiarRecordatorio(id, el.checked)); });
    const rh = $('#recHora'); if (rh) rh.addEventListener('change', async () => { S.recordatorios.rosario = rh.value || '20:00'; guardar(); await programarRecordatorios(); render(); aviso('Te vamos a avisar a las ' + S.recordatorios.rosario); });
    const mu = $('#musica'); if (mu) mu.addEventListener('change', () => { S.musica = mu.checked; guardar(); });
    const vm = $('#volm'); if (vm) vm.addEventListener('input', () => { S.volMusica = Number(vm.value); guardar(); Sonido.volumen(S.volMusica); });
    const bn = $('#buscarNota'); if (bn) bn.addEventListener('input', e => { notaBusca = e.target.value; const pos = e.target.selectionStart; render(); const nb = $('#buscarNota'); nb.focus(); nb.setSelectionRange(pos, pos); });
    const fi = $('#archivoResp'); if (fi) fi.addEventListener('change', restaurar);
    const rb = $('#rpBarra'); if (rb) rb.addEventListener('change', () => Repro.ir(rb.value / 1000));
    const am = $('#archivoMusica'); if (am) am.addEventListener('change', async () => { if (!am.files.length) return; aviso('Guardando canciones…'); const r = await MisCanciones.agregar(am.files); aviso(r.n ? `Se agregaron ${r.n} canción${r.n > 1 ? 'es' : ''}` + (r.saltados ? ` (${r.saltados} no eran audio)` : '') : 'No se pudo agregar: elegí archivos de audio (MP3, M4A, OGG…).'); render(); });
    const yu = $('#ytUrl'); if (yu) yu.addEventListener('keydown', e => { if (e.key === 'Enter') agregarVideo(yu.value); });
  }

  async function cambiarRecordatorio(id, on) {
    if (on && N.Recordatorios.disponible() && !(await N.Recordatorios.pedirPermiso())) { aviso('Sin permiso de notificaciones no se pueden activar los recordatorios.'); render(); return; }
    if (id === 'recRos') S.recordatorios.rosario = on ? (S.recordatorios.rosario || '20:00') : null;
    if (id === 'recAng') S.recordatorios.angelus = on;
    if (id === 'recMis') S.recordatorios.misericordia = on;
    guardar(); await programarRecordatorios(); render(); refrescarEstadoRec(); if (on) aviso('Recordatorio activado. ' + (id === 'recRos' ? 'Elegí la hora abajo.' : ''));
  }
  async function programarRecordatorios() {
    const r = S.recordatorios, l = [];
    if (r.rosario) { const [hh, mm] = r.rosario.split(':').map(Number); l.push({ id: 101, titulo: 'Es hora del Rosario 📿', texto: 'Un momento con María cambia tu día.', hora: hh, minuto: mm, pantalla: 'rosario' }); }
    if (r.angelus) l.push({ id: 102, titulo: 'Ángelus 🔔', texto: 'El Ángel del Señor anunció a María…', hora: 12, minuto: 0, pantalla: 'oracion:angelus' });
    if (r.misericordia) l.push({ id: 103, titulo: 'Hora de la Misericordia 💙', texto: 'Jesús, en Vos confío.', hora: 15, minuto: 0, pantalla: 'coronilla' });
    try { await N.Recordatorios.programar(l); } catch (e) { aviso('No se pudieron programar los recordatorios.'); }
  }

  async function respaldo() {
    const datos = { app: 'mi-fe-catolica', version: CFG.version, fecha: new Date().toISOString(), datos: { favoritos: S.favoritos, intenciones: S.intenciones, notas: S.notas, frasesFav: S.frasesFav, rosario: S.rosario, coronilla: S.coronilla, novenas: S.novenas, camino: S.camino, viacrucis: S.viacrucis, letra: S.letra, tema: S.tema, velocidad: S.velocidad } };
    const r = await N.compartir('Respaldo Mi Fe Católica', JSON.stringify(datos));
    aviso(r === 'copiado' ? 'Respaldo copiado al portapapeles' : r ? 'Elegí dónde guardar el respaldo (por ejemplo, Drive o tu correo)' : 'No se pudo crear el respaldo');
  }
  function restaurar(e) {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    if (f.size > 1024 * 1024) { aviso('El archivo es demasiado grande.'); return; }
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const j = JSON.parse(rd.result); if (j.app !== 'mi-fe-catolica' || !j.datos) throw 0;
        if (!confirm('¿Reemplazar tus favoritos, intenciones y avances por los del respaldo?')) return;
        const d = j.datos, ok = {};
        if (Array.isArray(d.favoritos)) ok.favoritos = d.favoritos.filter(x => typeof x === 'string').slice(0, 500);
        if (Array.isArray(d.intenciones)) ok.intenciones = d.intenciones.filter(x => x && typeof x.texto === 'string').slice(0, 1000).map(x => ({ id: Number(x.id) || Date.now(), texto: x.texto.slice(0, 4000), fecha: String(x.fecha || '').slice(0, 10), ok: !!x.ok }));
        if (Array.isArray(d.notas)) ok.notas = d.notas.filter(x => x && typeof x.texto === 'string').slice(0, 5000).map(x => ({ id: Number(x.id) || Date.now(), titulo: String(x.titulo || '').slice(0, 200), texto: x.texto.slice(0, 20000), tipo: String(x.tipo || 'reflexion').slice(0, 20), fecha: String(x.fecha || '').slice(0, 12) }));
        if (Array.isArray(d.frasesFav)) ok.frasesFav = d.frasesFav.filter(Number.isInteger);
        ['rosario', 'coronilla', 'novenas'].forEach(k => { if (d[k] && typeof d[k] === 'object') ok[k] = d[k]; });
        ['camino', 'viacrucis', 'velocidad'].forEach(k => { if (typeof d[k] === 'number') ok[k] = d[k]; });
        if (['normal', 'grande', 'muy-grande'].includes(d.letra)) ok.letra = d.letra; if (['claro', 'oscuro'].includes(d.tema)) ok.tema = d.tema;
        Object.assign(S, ok); guardar(); render(); aviso('Respaldo restaurado');
      } catch (err) { aviso('El archivo no es un respaldo válido de Mi Fe Católica.'); }
    };
    rd.readAsText(f);
  }

  document.addEventListener('click', async ev => {
    const el = ev.target.closest('[data-a]'); if (!el) return;
    if (el.tagName === 'A') ev.preventDefault();
    const a = el.dataset.a, [cmd, ...resto] = a.split(':'), arg = resto.join(':');
    switch (cmd) {
      case 'ir': ir(arg); break;
      case 'atras': atras(); break;
      case 'url': N.abrirEnlace(arg); break;
      case 'oracion': ir('oracion', arg); break;
      case 'leccion': ir('leccion', arg); break;
      case 'novena': ir('novena', arg); break;
      case 'rezar': entrarRezo(arg, false); break;
      case 'rezarnuevo': entrarRezo(arg, true); break;
      case 'elegirmist': S.rosario.tipo = arg; S.rosario.i = 0; guardar(); render(); break;
      case 'rezo': {
        if (arg === 'salir') salirRezo();
        else if (arg === 'sig' || arg === 'ant') { const auto = rezoAuto; await detenerVoz(); moverRezo(arg === 'sig' ? 1 : -1); if (auto) reproducirRezo(); }
        else if (arg === 'play') { if (rezoAuto) { await detenerVoz(); } else { await detenerVoz(); reproducirRezo(); } }
        else if (arg === 'musica') { S.musica = !S.musica; guardar(); Sonido.musica(S.musica); renderRezo(); aviso(S.musica ? 'Música de fondo activada' : 'Música de fondo desactivada'); }
        else if (arg === 'texto') { S.mostrarTexto = !S.mostrarTexto; guardar(); renderRezo(); }
        else if (arg === 'letanias') { S.letanias = !S.letanias; guardar(); rezoSec = secuenciaRosario(rezoTipo); estadoRezo().i = Math.min(estadoRezo().i, rezoSec.length - 1); renderRezo(); aviso(S.letanias ? 'Se agregaron las letanías al final' : 'Letanías quitadas'); }
        else if (arg === 'reiniciar') { await detenerVoz(); if (confirm('¿Volver a empezar desde el principio?')) { estadoRezo().i = 0; guardar(); renderRezo(); } }
        break;
      }
      case 'leer': {
        if (hablando) { detenerVoz(); break; }
        const [tipo, id] = [resto[0], resto.slice(1).join(':')];
        if (tipo === 'oracion') leer(oracion(id).title + '. ' + oracion(id).text, 'oracion-' + id);
        else if (tipo === 'novena') { const n = window.MFC_NOVENAS.find(x => x.id === id), d = S.novenas[id] || 1, [t, r, o] = n.dias[d - 1]; leer(`${n.titulo}. Día ${d}. ${t}. ${r} ${o} ${n.final}`, `novena-${id}-${d}`); }
        else if (tipo === 'via') leer(`Estación ${S.viacrucis + 1}. ${ESTACIONES[S.viacrucis]}. Te adoramos, oh Cristo, y te bendecimos. Porque por tu santa Cruz redimiste al mundo. ${MEDIT[S.viacrucis]}`, 'via-' + (S.viacrucis + 1));
        else if (tipo === 'camino') { const e = window.MFC_LIBRE[S.camino - 1]; leer(`${e.titulo}. ${e.oracion} Para vivir hoy: ${e.accion}`); }
        else if (tipo === 'leccion') { const l = window.MFC_FORMACION.find(x => x.id === id); leer(`${l.titulo}. ${l.intro} ${l.puntos.join('. ')}`); }
        else if (tipo === 'prueba') leer('Dios te salve, María, llena eres de gracia, el Señor es contigo. Amén.').then(() => { const i = N.Voz.idioma(); if (i) aviso('Voz usada: ' + i + '. ¿Se escuchó bien?'); });
        else if (tipo === 'papa') { detenerHistoria(); const x = HISTORIAS[Number(id)]; if (musHist) musHist.volume = 0.15; leer(`${x.t} ${x.papa.n}.`, 'papa-' + id).then(() => { if (musHist) musHist.volume = 0.45; }); }
        break;
      }
      case 'fav': { const i = S.favoritos.indexOf(arg); if (i >= 0) S.favoritos.splice(i, 1); else S.favoritos.push(arg); guardar(); render(); aviso(i >= 0 ? 'Quitada de favoritas' : 'Guardada en favoritas'); break; }
      case 'compartir': { const p = oracion(arg); const r = await N.compartir(p.title, `${p.title}\n\n${p.text}\n\n— Compartido desde Mi Fe Católica`); if (r === 'copiado') aviso('Texto copiado'); break; }
      case 'cat': catSel = arg; render(); break;
      case 'novdia': { const [id, d] = arg.split(':'); S.novenas[id] = Number(d); guardar(); render(); window.scrollTo(0, 0); break; }
      case 'novfin': delete S.novenas[arg]; guardar(); aviso('¡Terminaste la novena! Dios escuche tu oración.'); ir('novenas', null, true); break;
      case 'via': S.viacrucis = Math.max(0, Math.min(13, S.viacrucis + Number(arg))); guardar(); detenerVoz(); render(); window.scrollTo(0, 0); break;
      case 'camino': S.camino = Math.max(1, Math.min(30, S.camino + Number(arg))); guardar(); detenerVoz(); render(); break;
      case 'calmes': { let { y, m } = calMes; m += Number(arg); if (m < 1) { m = 12; y--; } if (m > 12) { m = 1; y++; } calMes = { y, m }; render(); break; }
      case 'calhoy': { const t = hoy(); calMes = { y: t.y, m: t.m }; calSel = { ...t }; render(); break; }
      case 'caldia': calSel = { y: calMes.y, m: calMes.m, d: Number(arg) }; render(); break;
      case 'calir': { const [y, m, d] = arg.split('-').map(Number); calMes = { y, m }; calSel = { y, m, d }; render(); window.scrollTo(0, 0); break; }
      case 'notsec': noticiaSec = arg; render(); break;
      case 'notact': aviso('Actualizando noticias…'); cargarNoticias(true); break;
      case 'medio': medioTipo = arg; render(); break;
      case 'intadd': { const t = ($('#nuevaInt').value || '').trim(); if (!t) { aviso('Escribí tu intención'); break; } S.intenciones.push({ id: Date.now(), texto: t.slice(0, 4000), fecha: new Date().toLocaleDateString('es-AR') }); guardar(); render(); aviso('Intención guardada 🙏'); break; }
      case 'intok': { const i = S.intenciones.find(x => String(x.id) === arg); if (i) i.ok = !i.ok; guardar(); render(); break; }
      case 'intdel': if (confirm('¿Borrar esta intención?')) { S.intenciones = S.intenciones.filter(x => String(x.id) !== arg); guardar(); render(); } break;
      case 'letra': S.letra = arg; guardar(); render(); break;
      case 'tema': S.tema = arg; guardar(); render(); break;
      case 'voces': { const ok = await N.Voz.abrirAjustesVoz(); if (!ok || actual().p !== 'voces') { if (actual().p !== 'voces') ir('voces'); else aviso('Abrí Ajustes del teléfono y buscá «Texto a voz».'); } break; }
      case 'mtab': S.musicaTab = arg; guardar(); render(); break;
      case 'rp': { const [que, id] = arg.split(':'); if (que === 'play') { const act = Repro.actual(); if (act && !act.blobId) Repro.alternar(); else Repro.tocar(PISTAS, Math.max(0, PISTAS.findIndex(x => x.id === id))); } else if (que === 'sig') { if (!Repro.actual()) Repro.tocar(PISTAS, 0); else Repro.sig(); } else Repro.ant(); setTimeout(() => { if (actual().p === 'musica' && (S.musicaTab || 'app') === 'app') render(); }, 120); break; }
      case 'pista': { const k = Number(arg), act = Repro.actual(); if (act && act.id === PISTAS[k].id) Repro.alternar(); else await Repro.tocar(PISTAS, k); if ((S.musicaTab || 'app') === 'app') { render(); } break; }
      case 'mia': { const l = pistasMias(), k = Number(arg), act = Repro.actual(); if (act && act.id === l[k].id) Repro.alternar(); else Repro.tocar(l, k); break; }
      case 'miaborrar': if (confirm('¿Quitar esta canción de la app? (El archivo original del teléfono no se borra.)')) { const act = Repro.actual(); if (act && act.blobId === Number(arg)) Repro.cerrar(); await MisCanciones.borrar(arg); render(); } break;
      case 'misagregar': { const f = $('#archivoMusica'); if (f) f.click(); break; }
      case 'ytadd': { const u = $('#ytUrl'); if (u && u.value.trim()) agregarVideo(u.value); else aviso('Pegá primero el enlace del video.'); break; }
      case 'ytpegar': { try { const t = await navigator.clipboard.readText(); if (t) { $('#ytUrl').value = t; agregarVideo(t); } else aviso('No hay nada copiado.'); } catch (e) { aviso('Mantené apretado el cuadro y elegí «Pegar».'); $('#ytUrl').focus(); } break; }
      case 'ytsel': S.videoSel = arg; guardar(); Repro.pausar(); render(); window.scrollTo({ top: 0, behavior: 'smooth' }); break;
      case 'ytborrar': S.videos = (S.videos || []).filter(v => v.id !== arg); if (S.videoSel === arg) S.videoSel = null; guardar(); render(); break;
      case 'ytcomp': { const v = (S.videos || []).find(x => x.id === arg); if (v) { const r = await N.compartir(v.titulo, `${v.titulo}\n${v.url}\n\nCompartido desde Mi Fe Católica 🙏`); if (r === 'copiado') aviso('Enlace copiado'); } break; }
      case 'mini': if (arg === 'play') Repro.alternar(); else if (arg === 'sig') Repro.sig(); else Repro.cerrar(); break;
      case 'historia': Repro.pausar(); pila.push({ p: 'historia', arg: Number(arg) }); renderHistoria(Number(arg)); break;
      case 'hist': {
        if (arg === 'cerrar') cerrarHistoria();
        else if (arg === 'musica') { S.musicaHist = S.musicaHist === false; guardar(); musicaHistoria(S.musicaHist); const b = document.querySelector('.hist-son'); if (b) b.textContent = S.musicaHist ? '🔊' : '🔇'; }
        else if (arg === 'sig' || arg === 'ant') { await detenerVoz(); moverHistoria(arg === 'sig' ? 1 : -1); }
        else if (arg.startsWith('compartir:')) { detenerHistoria(); const x = HISTORIAS[Number(arg.split(':')[1])]; const r = await N.compartir('Frase de ' + x.papa.n, `«${x.t}»\n— ${x.papa.n}, ${x.s}\n\nCompartido desde Mi Fe Católica 🙏`); if (r === 'copiado') aviso('Frase copiada'); }
        break;
      }
      case 'appstore': N.abrirTienda(arg); break;
      case 'mcat': { musicaCat = arg; const tmp = document.createElement('div'); tmp.innerHTML = P.musica(); ['.chips', '.discos'].forEach(q => { const d = main.querySelector(q), o = tmp.querySelector(q); if (d && o) d.innerHTML = o.innerHTML; }); break; } // sin recargar el reproductor
      case 'msel': S.musicaSel = arg; guardar(); render(); window.scrollTo({ top: 0, behavior: 'smooth' }); break;
      case 'probarnat': { if (hablando) { detenerVoz(); break; } await detenerVoz(); hablando = true; aviso('▶ Escuchando la voz grabada…'); const ok = await Sonido.clip('avemaria'); hablando = false; if (!ok) aviso('No se pudo reproducir el audio.'); break; }
      case 'rechora': S.recordatorios.rosario = arg; guardar(); await programarRecordatorios(); render(); aviso('Te vamos a avisar a las ' + arg); break;
      case 'recprueba': { if (!(await N.Recordatorios.pedirPermiso())) { aviso('Primero hay que permitir las notificaciones.'); refrescarEstadoRec(); break; } await N.Recordatorios.probar(10); aviso('Listo: en 10 segundos te llega un aviso de prueba'); break; }
      case 'recpermiso': { const ok = await N.Recordatorios.pedirPermiso(); if (ok) await programarRecordatorios(); else aviso('Activá las notificaciones desde Ajustes del teléfono › Apps › Mi Fe Católica.'); refrescarEstadoRec(); break; }
      case 'recexacto': await N.Recordatorios.pedirAlarmasExactas(); setTimeout(refrescarEstadoRec, 1500); break;
      case 'voz': S.voz = arg; guardar(); render(); break;
      case 'respaldo': respaldo(); break;
      case 'restaurar': $('#archivoResp').click(); break;
      case 'instalar': instalarActualizacion(); break;
      case 'btest': S.bibliaTest = arg; guardar(); render(); break;
      case 'blibro': ir('libro', Number(arg)); break;
      case 'leer-libro': abrirLector(arg); break;
      case 'lector': {
        const [op, v] = [resto[0], resto[1]];
        if (op === 'salir') { pila.pop(); document.body.classList.remove('modo-rezo'); render(); }
        else if (op === 'pag') irPagina(lectorPag + Number(v));
        else if (op === 'menu') $('#lectorMenu').classList.toggle('oculto');
        else if (op === 'tema') { S.lectorTema = v; guardar(); renderLector(); }
        else if (op === 'letra') { S.lectorLetra = Math.max(0.8, Math.min(1.8, +(S.lectorLetra + Number(v) * 0.1).toFixed(2))); guardar(); renderLector(); }
        else if (op === 'indice') { const caps = lectorLibro.caps; const elegido = prompt('Ir al capítulo (1 a ' + caps.length + '):\n' + caps.map((c, i) => (i + 1) + '. ' + c.t).slice(0, 40).join('\n'));
          const n = parseInt(elegido, 10); if (n >= 1 && n <= caps.length) { const el = $('#cap' + (n - 1)), v2 = $('#lectorVista'); if (el && v2) irPagina(Math.floor(el.offsetLeft / v2.clientWidth)); } }
        break;
      }
      case 'ftema': temaFrase = arg; render(); break;
      case 'frase': ir('frase', Number(arg), actual().p === 'frase'); break;
      case 'ffav': { const i = Number(arg), k = S.frasesFav.indexOf(i); if (k >= 0) S.frasesFav.splice(k, 1); else S.frasesFav.push(i); guardar(); render(); break; }
      case 'fcomp': { const f = window.MFC_FRASES[Number(arg)]; const r = await N.compartir('Frase', `«${f.t}»\n— ${f.a}\n\nCompartido desde Mi Fe Católica`); if (r === 'copiado') aviso('Frase copiada'); break; }
      case 'fleer': { const f = window.MFC_FRASES[Number(arg)]; leer(`${f.t} ${f.a}.`); break; }
      case 'nota': notaTipo = null; ir('nota', arg); break;
      case 'ntipo': notaTipo = arg; document.querySelectorAll('[data-a^="ntipo:"]').forEach(b => b.classList.toggle('activo', b.dataset.a === 'ntipo:' + arg)); break;
      case 'nguardar': {
        const tit = ($('#notaTit').value || '').trim().slice(0, 200), tx = ($('#notaTxt').value || '').trim().slice(0, 20000);
        if (!tx && !tit) { aviso('Escribí algo antes de guardar'); break; }
        if (arg === 'nueva') S.notas.push({ id: Date.now(), titulo: tit, texto: tx, tipo: notaTipo || 'reflexion', fecha: new Date().toLocaleDateString('es-AR') });
        else { const n = S.notas.find(x => String(x.id) === arg); if (n) { n.titulo = tit; n.texto = tx; if (notaTipo) n.tipo = notaTipo; } }
        guardar(); aviso('Guardado en tu cuaderno ✍️'); pila.pop(); render(); break;
      }
      case 'nborrar': if (confirm('¿Borrar esta anotación?')) { S.notas = S.notas.filter(x => String(x.id) !== arg); guardar(); pila.pop(); render(); } break;
    }
  });

  /* ================= Inicio ================= */
  N.alBotonAtras(atras);
  N.Recordatorios.alTocar(extra => { const p = extra.pantalla || 'inicio'; if (p === 'coronilla') entrarRezo('coronilla'); else if (p.startsWith('oracion:')) ir('oracion', p.slice(8)); else ir(p); });
  if (window.fetch) fetch('img/misterios/creditos.json').then(r => r.json()).then(j => { window.__creditos = j; }).catch(() => { });
  render();
  // Al abrir la app se vuelven a programar los avisos (por si el sistema los borró, por ejemplo tras una actualización).
  { const r = S.recordatorios; if (N.Recordatorios.disponible() && (r.rosario || r.angelus || r.misericordia)) setTimeout(() => programarRecordatorios(), 1500); }
  setTimeout(() => buscarActualizacion(false), 4000);
  if ('serviceWorker' in navigator && !N.esNativo && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => { });
  window.__MFC = { S, ir, ORACIONES, secuenciaRosario, secuenciaCoronilla, ESTACIONES, MEDIT, HISTORIAS }; // para pruebas automáticas
})();
