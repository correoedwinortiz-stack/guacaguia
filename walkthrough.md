# Migración del Sistema de Oraciones: Edición Mamá Colombiana

He completado exitosamente la migración del motor de oraciones para usar el personaje de la "Mamá Colombiana" con los archivos MP4 separados mediante un sistema de Chroma Key por WebGL.

## Cambios Implementados

### 1. `prayer-player.html` (El Reproductor)
- Implementado el shader de WebGL para Chroma Key que se adapta a las animaciones de la mamá.
- Se ha integrado el soporte para múltiples archivos MP4 independientes en lugar de usar saltos de tiempo en un solo archivo de vídeo.
- El cliente (navegador/OBS) intercepta las notificaciones `prayer_animation` desde el servidor y carga el vídeo correspondiente (p. ej. `Manos al pecho.mp4`) en tiempo real y sin parpadeos visuales en el flujo de la transmisión.
- Se implementó la lógica en el `prayer-player.html` para manejar el *Modo Música*. Cuando se emite alabanza o adoración desde el panel, el personaje entra en un ciclo reproduciendo aleatoriamente gestos apropiados a la temática (cantando, aplaudiendo, balanceándose).

### 2. `admin_mama.html` (El Panel de Control)
- Adaptado y simplificado a partir del sistema original.
- Botones mapeados específicamente a los nuevos nombres de animaciones: `Súplica`, `Respiración calmada`, `Aplaudiendo al ritmo`, etc.
- Interfaz para gestión de listas de música (alabanza y adoración).
- Integración de los ajustes de tolerancia de Chroma Key en vivo.

### 3. `server.mjs` y `prayer-engine-mama.mjs` (El Motor de Lógica)
- Se ha reescrito la capa lógica utilizando módulos ES6 (`.mjs`).
- El servidor Node intercepta eventos del chat de TikTok (Likes, Follows, "Hola", etc.) y manda comandos de respuesta rápida (ej. saludar de mano y un breve clip de voz TTS).
- El servidor `server.mjs` transmite la música por streaming, o usa URL relativas, manteniendo intacta la lógica del proyecto original, pero delegando la animación continua al cliente.

## Verificación

He iniciado el servidor en segundo plano utilizando `node server.mjs`. El servidor está activo en el puerto `3002`.

Puedes comprobar que todo funciona:
1. Abre tu navegador y dirígete a `http://localhost:3002/admin` para abrir el panel de control.
2. Abre otra pestaña en `http://localhost:3002/player` (o en OBS).
3. Prueba desencadenando una "Simulación de Oración" desde el panel de control para ver al motor Groq/Gradium crear y reproducir la oración.
4. Prueba cambiar al modo de "Alabanza" y observarás al personaje reproducir animaciones continuas mientras suena la música, bajando su volumen cuando se solicite una oración.

¿Te gustaría que revise algún detalle visual, ajuste alguna temporización de los saludos, o está listo para poner en producción?
