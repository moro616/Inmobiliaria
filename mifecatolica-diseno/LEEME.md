# Mi Fe Católica — rediseño visual (3.0.0)

Archivos web modificados de la app (carpeta `www` del proyecto Capacitor):

- `index.html` — íconos SVG en la barra inferior, cruz y botón «Volver».
- `css/app.css` — hoja de estilos rediseñada (tarjetas, botones, barra flotante, interruptores, calendario).
- `js/nativo.js` — voz del teléfono (elige y prueba idiomas en español, voz más pausada, arreglos de pronunciación) y recordatorios (aviso de prueba, permiso de alarmas exactas, ícono propio).
- `js/app.js` — pantalla del Rosario rediseñada (pintura de fondo, cuentas de perla, cuenta actual con resplandor, barra de avance), Ajustes reorganizados, guía de voces, portada con imagen del misterio del día, mosaicos con color, calendario/agenda nuevo
  (fecha destacada, leyenda de colores litúrgicos, «Volver a hoy», próximas fiestas con fecha tipo agenda).

Para aplicarlo al proyecto: copiar estos tres archivos sobre `www/` y ejecutar `npx cap sync android`,
luego generar el APK/AAB firmado con la clave habitual.

Los audios de `audio/voz/` también se procesaron (12% más lentos, sin cambiar el tono, con volumen parejo); están en el zip `www-MiFeCatolica-diseno-v2.zip`.

Para que el botón «Instalar voces» abra el instalador nativo, agregar en `android/app/src/main/AndroidManifest.xml`, dentro de `<queries>`:

```xml
<intent><action android:name="android.speech.tts.engine.CHECK_TTS_DATA" /></intent>
```

## Música, historias de los Papas y videos

- `scripts/synth.py` genera las 6 piezas instrumentales de `audio/musica/` (melodías de dominio público y composiciones originales):
  `python3 scripts/synth.py salida/` y luego codificar a Opus con ffmpeg (`-c:a libopus -b:a 64k`, `loudnorm=I=-17`).
- Sección **Música**: reproductor propio con mini reproductor fijo, «Mis canciones» (archivos del teléfono en IndexedDB), YouTube (videos completos pegando el enlace) y Spotify.
- **Frases de los Papas** en formato historia, con fuente de cada frase.
