# Mi Fe Católica 3.0.0 — indicaciones para continuar el trabajo

Este documento es para quien siga el trabajo (otra IA o un programador). Explica qué hay en este paquete,
qué está terminado, qué falta y cómo seguir.

## 1. Qué es la app

- App Android hecha con **Capacitor** (`appId`: `com.metricslab.mifecatolica`). Todo lo visible es HTML/CSS/JS
  sin framework, dentro de la carpeta `www/` del proyecto.
- El código fuente original está en el repositorio privado `moro616/mi-fe-catolica`. Este trabajo se hizo
  **sobre el APK**, reemplazando la carpeta `www/`; todavía no se volcó a ese repositorio.
- Plugins nativos que usa: text-to-speech, local-notifications, share, browser, app, status-bar, splash-screen,
  y uno propio llamado `Actualizador`.

## 2. Qué hay en este paquete

| Ruta | Qué es |
|---|---|
| `MiFeCatolica-3.0.0-final.apk` | La app compilada como quedó (firmada con clave de prueba). Sirve para instalar y probar, y como base de `scripts/repack.py` si no se tiene el proyecto original. |
| `www/` | Carpeta web completa y actualizada. Es lo que hay que copiar sobre `www/` del proyecto Capacitor. |
| `scripts/voz_nueva.py` | Graba la voz con Chatterbox, verifica cada frase con Whisper y regraba si no coincide. |
| `scripts/integrar_voz.py` | Convierte los WAV a Opus, los copia a `www/audio/voz/` y genera `www/js/datos/voz.js`. |
| `scripts/synth.py` | Genera las 6 piezas instrumentales de `www/audio/musica/`. |
| `scripts/repack.py` y `scripts/Firmar.java` | Reempaquetan y firman un APK de prueba sin el proyecto original. |
| `textos.json` | Todos los textos que la app lee en voz alta, con su identificador. |
| `_estado.json` | Lista exacta de audios grabados, excluidos y faltantes. |
| `_informe.json` | Resultado del control de calidad de cada audio grabado. |
| `ref-daniela.wav` | Muestra de 14 s que define el timbre de la voz (para que la voz nueva sea siempre la misma). |

## 3. Qué está terminado

- Rediseño visual completo (`www/css/app.css`, `www/index.html`).
- Calendario litúrgico tipo agenda, pantalla del Rosario rediseñada, Ajustes reorganizados.
- Sección **Música**: 7 piezas propias sin internet, «Mis canciones» (archivos del teléfono, en IndexedDB),
  YouTube (pegando el enlace) y Spotify (reproductor embebido). Mini reproductor fijo.
- **Frases de los Papas** en formato historia, con música de fondo.
- Sección **Vayan y anuncien** (`P.mision`, `GESTOS`, `anunciar` en `www/js/app.js`): lema «Bienvenidos todos · Vayan y anuncien»,
  gesto de servicio diario con racha semanal y botones para compartir la frase del día, el Evangelio y la invitación al Rosario.
- Recordatorios: aviso de prueba, detección de permisos, reprogramación al abrir la app.
- **Voz nueva grabada** (Chatterbox Multilingual, licencia MIT):
  - Rosario y Coronilla completos: 35 de 35 audios, incluidas las Letanías.
  - Frases de los Papas: 11 de 12.
  - Oraciones: 59 de 95.

## 4. Qué falta

### 4.1 Voz: 96 audios sin grabar

La lista exacta está en `_estado.json`, campo `faltan`:

- 36 oraciones (identificador `oracion-<id>`). Una de ellas, `oracion-reginacaeli`, se grabó pero se
  excluyó porque dos frases con «aleluya» salieron mal.
- 14 estaciones del Vía Crucis (`via-1` a `via-14`).
- 45 días de novenas (`novena-<id>-<día>`).
- 1 frase papal (`papa-4`, «¡Duc in altum!»): se excluyó porque la voz leyó mal el latín. Escribirla como
  suena, por ejemplo «Duk in áltum».

Donde no hay audio grabado, la app usa sola la voz del teléfono, así que nada queda roto.

**Cómo funciona el enganche (no hay que tocar código):**

1. Cada audio va en `www/audio/voz/<identificador>.ogg` (Opus mono; cualquier formato que reproduzca
   el WebView de Android sirve si se mantiene la extensión `.ogg`).
2. El identificador se agrega a la lista de `www/js/datos/voz.js` (`window.MFC_VOZ = [...]`).
   Los 35 audios del Rosario y la Coronilla no van en esa lista: la app los busca por nombre fijo.
3. El texto de cada identificador está en `textos.json`.

**Opción A — seguir con la misma voz (recomendado para que no cambie el timbre):**

```bash
python3.11 -m venv venv && . venv/bin/activate
pip install "torch==2.6.0" "torchaudio==2.6.0" "numpy<2" chatterbox-tts==0.1.7 faster-whisper num2words soundfile "setuptools<81"
python scripts/voz_nueva.py textos.json wav/ --ref ref-daniela.wav --grupos oraciones,via,nov,papas
python3 scripts/integrar_voz.py wav/ www/
```

- Saltea lo que ya existe en `wav/` y guarda cada frase aprobada en `wav/_cache/`, así que se puede cortar y retomar.
- En CPU tarda unos 7 minutos por minuto de voz; con placa gráfica (cambiar `device='cpu'` por `'cuda'`) es mucho más rápido.
- `integrar_voz.py` regenera `voz.js` solo con lo que encuentre en `wav/`: copiar antes a `wav/` los audios ya
  hechos, o agregar a mano los identificadores nuevos a la lista existente.

**Opción B — otro motor de voz (por ejemplo la API de voz de OpenAI):** es más rápido, pero la voz será
distinta a la del Rosario ya grabado. Si se elige este camino conviene regrabar también los 35 audios del
Rosario para que toda la app tenga una sola voz. Antes de mandar cada texto al motor hay que normalizarlo
igual que hace `normalizar()` en `voz_nueva.py`: citas bíblicas («Lucas 1, 26-38» → «Lucas, capítulo uno,
versículos veintiséis al treinta y ocho»), números en palabras y numerales de los Papas («Juan Pablo II» →
«Juan Pablo segundo»).

### 4.2 Voz: puntos a revisar con el oído

Nadie escuchó todavía estos audios; el control fue automático. Revisar:

- **Letanías** (`letanias.ogg`): el reconocedor transcribió «rueda por nosotros» en lugar de «ruega por
  nosotros» en varias invocaciones. Puede ser un error del reconocedor o una «g» poco clara.
- Misterios gozosos 2 a 5: marcados como dudosos, pero es falsa alarma (el reconocedor escribió los
  números en cifras).

### 4.3 Compilar la versión oficial

Los APK entregados están firmados con una **clave de prueba**. No sirven para Play Store y quien los
instale no podrá actualizar después a la versión oficial sin desinstalar. Para la versión real:

1. Copiar `www/` sobre la carpeta `www/` del proyecto `mi-fe-catolica`.
2. `npx cap sync android`.
3. Compilar y firmar con la clave de siempre.

### 4.4 Cambios nativos pendientes (requieren el proyecto original)

- **Voces del sistema:** agregar en `android/app/src/main/AndroidManifest.xml`, dentro de `<queries>`:
  `<intent><action android:name="android.speech.tts.engine.CHECK_TTS_DATA" /></intent>`
- **Aviso de actualizaciones:** publicar `version.json` en una URL HTTPS pública y cargarla en
  `www/config.js`, campo `updatesUrl` (hoy vacío, por eso la app no busca actualizaciones). El formato
  que espera está en `buscarActualizacion()` de `www/js/app.js`: `app`, `versionCode`, `versionName`,
  `apkUrl`, `sha256`, `notes`.
- Subir `versionCode` en cada versión.

### 4.5 Sin probar en un teléfono

Todo se verificó en un navegador de escritorio con tamaño de celular. Falta probar en un Android real:

- Reproductores de **YouTube** y **Spotify** dentro de la app (estaban bloqueados en el entorno de trabajo).
- **Recordatorios**: en Xiaomi hace falta «Inicio automático» y batería «Sin restricciones».
- «Mis canciones» con archivos grandes.

### 4.6 Contenido a verificar

- **Frases de los Papas** (`PAPAS` en `www/js/app.js`): se escribieron de memoria. Cotejar la redacción
  exacta y la fuente con vatican.va antes de publicar.
- **Listas de Spotify** (`MUSICA` en `www/js/app.js`): varias son de usuarios particulares y pueden
  desaparecer. Sin sesión de Spotify solo suenan fragmentos de 30 segundos.
- **Derechos de autor:** no incluir dentro de la app canciones de Athenas ni de otros artistas sin permiso
  escrito. Las 7 piezas de `audio/musica/` son propias o de dominio público.

## 5. Dónde está cada cosa en el código

Todo en `www/js/app.js`, que es un solo archivo con secciones marcadas por comentarios:

| Sección | Qué buscar |
|---|---|
| Pantallas | `P.<nombre> = () =>` (inicio, rosario, calendario, ajustes, musica, papas, voces…) |
| Rosario en pantalla completa | `svgRosario`, `renderRezo`, `secuenciaRosario`, `secuenciaCoronilla` |
| Lectura en voz alta | `leer(texto, clip)`, `Sonido.clip`, `GRABADAS` |
| Música | `PISTAS`, `Repro`, `MisCanciones`, `leerYouTube`, `MUSICA` |
| Historias | `PAPAS`, `HISTORIAS`, `renderHistoria` |
| Acciones de botones | el `switch (cmd)` dentro de `document.addEventListener('click', …)`; cada botón lleva `data-a="accion:argumento"` |

El puente con Android está en `www/js/nativo.js` (voz del teléfono, recordatorios, compartir, abrir enlaces).
