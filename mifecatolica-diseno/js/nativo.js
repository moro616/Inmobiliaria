/* Mi Fe Católica — Puente con las funciones nativas de Android (Capacitor).
 * Cada función tiene una alternativa para navegador, así la interfaz también se puede probar fuera del teléfono. */
(function (root) {
  'use strict';
  const Cap = root.Capacitor;
  const P = (Cap && Cap.Plugins) || {};
  const esNativo = !!(Cap && Cap.isNativePlatform && Cap.isNativePlatform());

  /* ---------- Voz (síntesis de texto) ---------- */
  // Se prueban varios idiomas en español, en orden de preferencia, y se recuerda el que funcionó.
  // es-US es la voz latinoamericana de los servicios de voz de Google, la más clara en la mayoría de los teléfonos.
  const PREF_IDIOMAS = ['es-US', 'es-419', 'es-MX', 'es-AR', 'es-ES'];
  let idiomas = null, idiomaOk = null;
  async function candidatos() {
    if (idiomaOk) return [idiomaOk];
    if (!idiomas) {
      idiomas = [];
      try { const r = await P.TextToSpeech.getSupportedLanguages(); idiomas = (r.languages || []).map(l => String(l).replace('_', '-')); } catch (e) { }
    }
    const low = idiomas.map(l => l.toLowerCase());
    const l = PREF_IDIOMAS.filter(p => low.includes(p.toLowerCase()));
    idiomas.filter(x => /^es\b|^es-/i.test(x) && !l.some(p => p.toLowerCase() === x.toLowerCase())).forEach(x => l.push(x));
    if (!l.length) l.push(...PREF_IDIOMAS);
    return l;
  }
  // Pequeños arreglos de pronunciación para el motor del teléfono.
  const prepararTexto = t => String(t || '')
    .replace(/[«»"“”]/g, '').replace(/\s*—\s*/g, ', ').replace(/\s*\n+\s*/g, '. ')
    .replace(/\bS\.\s?S\./g, 'Su Santidad').replace(/\bSto\./g, 'Santo').replace(/\bSta\./g, 'Santa').replace(/\bNtra\./g, 'Nuestra').replace(/\bSr\./g, 'Señor')
    .replace(/\bJn\b/g, 'Juan').replace(/\bLc\b/g, 'Lucas').replace(/\bMt\b/g, 'Mateo').replace(/\bMc\b/g, 'Marcos')
    .replace(/(\d+),\s?(\d+)-(\d+)/g, '$1, versículos $2 al $3').replace(/(\d+),\s?(\d+)/g, '$1, versículo $2')
    .replace(/\.\s*\./g, '.').replace(/\s+/g, ' ').trim();
  const Voz = {
    disponible() { return (esNativo && !!P.TextToSpeech) || ('speechSynthesis' in root); },
    idioma() { return idiomaOk; },
    /** Lee un texto y resuelve cuando termina (o cuando se detiene). velocidad: 1 = normal. */
    async hablar(texto, velocidad = 1) {
      texto = prepararTexto(texto);
      if (!texto) return;
      // El motor de Android suena apurado a 1.0: se usa una base un poco más pausada.
      const rate = Math.max(0.45, Math.min(1.6, velocidad * 0.9));
      if (esNativo && P.TextToSpeech) {
        // Android limita el largo por frase: se divide en partes por oraciones.
        const partes = texto.match(/[^.!?;:]{1,3500}[.!?;:]*/g) || [texto];
        let ultimoError = null;
        for (const parte of partes) {
          if (Voz._cancelado) break;
          let dicho = false;
          for (const lang of await candidatos()) {
            try {
              await P.TextToSpeech.speak({ text: parte.trim(), lang, rate, pitch: 1.0, volume: 1.0, category: 'playback', queueStrategy: 0 });
              idiomaOk = lang; dicho = true; break;
            } catch (e) { ultimoError = e; if (idiomaOk) { idiomaOk = null; } }
          }
          if (!dicho) throw new Error((ultimoError && ultimoError.message) || 'sin-voz');
        }
        return;
      }
      if (!('speechSynthesis' in root)) throw new Error('sin-voz');
      await new Promise((ok) => {
        const u = new SpeechSynthesisUtterance(texto);
        u.lang = 'es-AR'; u.rate = rate;
        const vs = speechSynthesis.getVoices();
        const v = vs.find(x => /es[-_](US|419|MX|AR)/i.test(x.lang)) || vs.find(x => /^es/i.test(x.lang));
        if (v) u.voice = v;
        u.onend = ok; u.onerror = ok;
        speechSynthesis.speak(u);
      });
    },
    async detener() {
      Voz._cancelado = true;
      try { if (esNativo && P.TextToSpeech) await P.TextToSpeech.stop(); } catch (e) { }
      try { if ('speechSynthesis' in root) speechSynthesis.cancel(); } catch (e) { }
      setTimeout(() => { Voz._cancelado = false; }, 50);
    },
    _cancelado: false,
    /** Intenta abrir el instalador de voces del sistema. Devuelve false si el teléfono no lo permite. */
    async abrirAjustesVoz() { try { if (esNativo && P.TextToSpeech && P.TextToSpeech.openInstall) { await P.TextToSpeech.openInstall(); return true; } } catch (e) { } return false; }
  };

  /* ---------- Pantalla encendida mientras se reza ---------- */
  const Pantalla = {
    async mantenerEncendida(si) {
      try { if (P.KeepAwake) await (si ? P.KeepAwake.keepAwake() : P.KeepAwake.allowSleep()); } catch (e) { }
    }
  };

  /* ---------- Enlaces externos ---------- */
  async function abrirEnlace(url) {
    let u;
    try { u = new URL(url); } catch (e) { return false; }
    if (u.protocol !== 'https:') return false; // solo HTTPS
    try {
      if (esNativo && P.Browser) { await P.Browser.open({ url: u.href, presentationStyle: 'fullscreen', toolbarColor: '#0c1830' }); return true; }
    } catch (e) { }
    const w = root.open(u.href, '_blank', 'noopener,noreferrer');
    if (!w) root.location.href = u.href;
    return true;
  }

  /* ---------- Descargas HTTP (noticias, versión) ---------- */
  async function descargarTexto(url, timeoutMs = 15000) {
    if (!/^https:\/\//.test(url)) throw new Error('solo-https');
    if (esNativo && P.CapacitorHttp) {
      const r = await P.CapacitorHttp.get({ url, responseType: 'text', connectTimeout: timeoutMs, readTimeout: timeoutMs,
        headers: { 'Accept': 'application/rss+xml, application/xml, application/json, text/xml, */*' } });
      if (r.status < 200 || r.status >= 300) throw new Error('HTTP ' + r.status);
      return typeof r.data === 'string' ? r.data : JSON.stringify(r.data);
    }
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const r = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.text();
    } finally { clearTimeout(t); }
  }

  /* ---------- Compartir ---------- */
  async function compartir(titulo, texto) {
    try {
      if (esNativo && P.Share) { await P.Share.share({ title: titulo, text: texto, dialogTitle: 'Compartir oración' }); return true; }
      if (navigator.share) { await navigator.share({ title: titulo, text: texto }); return true; }
      await navigator.clipboard.writeText(`${titulo}\n\n${texto}`); return 'copiado';
    } catch (e) { return false; }
  }

  /* ---------- Recordatorios diarios (notificaciones locales) ---------- */
  const Recordatorios = {
    disponible() { return esNativo && !!P.LocalNotifications; },
    async pedirPermiso() {
      if (!this.disponible()) return false;
      let p = await P.LocalNotifications.checkPermissions();
      if (p.display !== 'granted') p = await P.LocalNotifications.requestPermissions();
      return p.display === 'granted';
    },
    /** Estado para mostrar en Ajustes: permiso de notificaciones, alarmas exactas y avisos pendientes. */
    async estado() {
      if (!this.disponible()) return null;
      const e = { permiso: 'desconocido', exacto: 'granted', pendientes: [] };
      try { e.permiso = (await P.LocalNotifications.checkPermissions()).display; } catch (x) { }
      try { e.exacto = (await P.LocalNotifications.checkExactNotificationSetting()).exact_alarm; } catch (x) { }
      try { e.pendientes = (await P.LocalNotifications.getPending()).notifications.map(n => n.id); } catch (x) { }
      return e;
    },
    async pedirAlarmasExactas() { try { await P.LocalNotifications.changeExactNotificationSetting(); } catch (e) { } },
    async canal() { try { await P.LocalNotifications.createChannel({ id: 'oracion', name: 'Recordatorios de oración', description: 'Avisos diarios para rezar', importance: 5, visibility: 1, vibration: true }); } catch (e) { } },
    /** lista: [{id, titulo, texto, hora, minuto}] — reemplaza todos los recordatorios diarios de la app. */
    async programar(lista) {
      if (!this.disponible()) return false;
      const pend = await P.LocalNotifications.getPending();
      const viejos = pend.notifications.filter(n => n.id >= 100 && n.id < 190);
      if (viejos.length) await P.LocalNotifications.cancel({ notifications: viejos.map(n => ({ id: n.id })) });
      if (!lista.length) return true;
      await this.canal();
      await P.LocalNotifications.schedule({
        notifications: lista.map(r => ({ id: r.id, title: r.titulo, body: r.texto, channelId: 'oracion', smallIcon: 'ic_stat_cruz',
          schedule: { on: { hour: r.hora, minute: r.minuto }, allowWhileIdle: true }, extra: { pantalla: r.pantalla || 'inicio' } }))
      });
      return true;
    },
    /** Envía un aviso de prueba dentro de unos segundos. */
    async probar(segundos = 10) {
      if (!this.disponible()) return false;
      await this.canal();
      await P.LocalNotifications.schedule({ notifications: [{ id: 199, title: 'Mi Fe Católica 🙏', body: '¡Los recordatorios funcionan! Así te vamos a avisar para rezar.', channelId: 'oracion', smallIcon: 'ic_stat_cruz',
        schedule: { at: new Date(Date.now() + segundos * 1000), allowWhileIdle: true }, extra: { pantalla: 'inicio' } }] });
      return true;
    },
    alTocar(cb) { try { if (this.disponible()) P.LocalNotifications.addListener('localNotificationActionPerformed', a => cb(a.notification.extra || {})); } catch (e) { } }
  };

  /* ---------- Información de la app y botón atrás ---------- */
  async function infoApp() {
    try { if (esNativo && P.App) { const i = await P.App.getInfo(); return { version: i.version, build: Number(i.build) }; } } catch (e) { }
    return { version: root.MFC_CONFIG ? root.MFC_CONFIG.version : '3.0.0', build: root.MFC_CONFIG ? root.MFC_CONFIG.versionCode : 0 };
  }
  function alBotonAtras(cb) { try { if (esNativo && P.App) P.App.addListener('backButton', cb); } catch (e) { } }
  function salir() { try { if (esNativo && P.App) P.App.exitApp(); } catch (e) { } }

  /* ---------- Barras del sistema ---------- */
  async function estiloBarras(oscuro) {
    try { if (esNativo && P.StatusBar) await P.StatusBar.setStyle({ style: oscuro ? 'DARK' : 'LIGHT' }); } catch (e) { }
  }

  /* ---------- Actualizador nativo (descarga + verificación SHA-256 + instalador) ---------- */
  const Actualizador = {
    disponible() { return esNativo && !!P.Actualizador; },
    async descargarEInstalar(url, sha256) { return P.Actualizador.descargarEInstalar({ url, sha256 }); },
    async puedeInstalar() { try { return (await P.Actualizador.puedeInstalar()).permitido; } catch (e) { return false; } },
    async abrirPermisoInstalar() { try { await P.Actualizador.abrirPermisoInstalar(); } catch (e) { } }
  };

  root.Nativo = { esNativo, Voz, Pantalla, abrirEnlace, descargarTexto, compartir, Recordatorios, infoApp, alBotonAtras, salir, estiloBarras, Actualizador };
})(window);
