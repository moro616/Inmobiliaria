# Mi Fe Católica — rediseño visual (3.0.0)

Archivos web modificados de la app (carpeta `www` del proyecto Capacitor):

- `index.html` — íconos SVG en la barra inferior, cruz y botón «Volver».
- `css/app.css` — hoja de estilos rediseñada (tarjetas, botones, barra flotante, interruptores, calendario).
- `js/app.js` — portada con imagen del misterio del día, mosaicos con color, calendario/agenda nuevo
  (fecha destacada, leyenda de colores litúrgicos, «Volver a hoy», próximas fiestas con fecha tipo agenda).

Para aplicarlo al proyecto: copiar estos tres archivos sobre `www/` y ejecutar `npx cap sync android`,
luego generar el APK/AAB firmado con la clave habitual.
