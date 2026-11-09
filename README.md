# Vuelta Rápida

Rally de mesa 2D visto desde arriba (estilo maqueta), para 1 o 2 jugadores en la misma computadora, con pantalla dividida.

**Pistas:** Bosque Mixto (asfalto + tierra, barro, vado), Montaña Nevada (nieve, hielo, bancos de nieve),
El Ocho (tierra, con puente), Circuito del Parque (asfalto, con boxes).
Grandes (~2 km): Gran Pradera (asfalto, boxes, lago), Cañadón Rojo (desierto, cañón de roca), Valle del Puente (cruce con puente).
Extra grandes (>3 km): Serpentina Nevada (escalera de horquillas, boxes), Rally de las Sierras (tierra, puente, chicanas).
En asfalto el auto casi no derrapa; en tierra, barro y nieve se dobla derrapando (contravolante).
Árboles y rocas dañan; fardos, conos, barriles y cubiertas se pueden empujar; el agua limpia el auto.

**Para jugar en una sola compu (1 o 2 jugadores, pantalla dividida):** abrí `index.html` con doble clic.

**Para jugar en red local (hasta 8 jugadores, cada uno en su compu):**
1. En una compu (la anfitriona), en esta carpeta, la primera vez: `npm install`. Después, cada vez: `npm start`.
2. El servidor muestra una dirección tipo `http://192.168.x.x:8080`. Abrila en el navegador de cada compu
   conectada a la misma red (Wi-Fi o cable). En la anfitriona también sirve `http://localhost:8080`.
3. En el menú elegí **Modo: En red** → Enter. El primero que entra es el anfitrión: elige pista y vueltas y larga.
   Controles: flechas o W A S D.
- Si el puerto 8080 está ocupado, el servidor usa el siguiente libre y lo muestra.
- Si macOS pregunta si `node` puede aceptar conexiones entrantes, respondé que sí (si no, las otras compus no entran).
- El servidor es el árbitro de la carrera: calcula la física y manda el estado a todos ~60 veces por segundo.

## Controles
| Jugador | Acelerar | Frenar / reversa | Izquierda | Derecha |
|---|---|---|---|---|
| J1 | W | S | A | D |
| J2 | ↑ | ↓ | ← | → |

`Esc` pausa · `M` silencio · `F3` telemetría (para ajustar la física)

**Controles editables:** en el menú, "Controles" (se guardan en el navegador).
**Piloto automático:** en el menú, "Piloto automático: J2" para correr contra la computadora o "J1 y J2" para mirar la línea ideal.

**Boxes** (Circuito del Parque): entrá a la calle de boxes (lado de afuera de la recta principal; el limitador te deja a 60 km/h) y frená dentro de un rectángulo amarillo. Mientras estés detenido ahí se repara el daño.

> Muchos teclados no registran más de 3 o 4 teclas apretadas a la vez. Si con 2 jugadores en el mismo teclado alguna tecla "no entra", es por eso (ghosting del teclado).

## Estructura
- `js/car.js`: física del auto y colisiones. Todos los parámetros de manejo están en `CAR_PARAMS`.
- `js/tracks.js`: definición de pistas (puntos, terrenos por tramo, manchas, bordes, objetos, público).
- `js/track.js`: genera la pista a partir de la definición; obstáculos y objetos empujables.
- `js/art.js`: arte estilo maqueta generado por código (texturas, escenario, autos).
- `index.html?preview=N`: vista completa de la pista N con marcas de posición, para diseñar pistas.
- `js/sim.js`: la carrera (física, vueltas, daño), compartida entre el modo local y el servidor.
- `js/net.js`: modo en red del lado del navegador (sala, envío de controles, interpolación).
- `server.js`: servidor de red local (archivos del juego + WebSocket).
- `js/input.js`: teclas por jugador (`PLAYER_DEFS`) y teclas personalizadas.
- `js/ai.js`: piloto automático (línea de carrera + velocidad por curva y terreno).
- `js/game.js`: estados, vueltas, daño, boxes y cámara.
- `js/render.js`: gráficos y HUD.
- `js/audio.js`: sonido sintetizado.
- `tools/sim.js`, `tools/bot.js`, `tools/terrain.js`, `tools/geom.js`: pruebas sin navegador (`node tools/terrain.js`).
