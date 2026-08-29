# Despliegue de GuacaGuia en Ubuntu VM

El objetivo es configurar el nuevo servidor Ubuntu e instalar todo lo necesario para alojar y mantener funcionando tu proyecto de forma permanente.

## User Review Required

> [!IMPORTANT]
> Necesitaré tu confirmación para proceder con este plan. Si apruebas, yo ejecutaré automáticamente la mayoría de los comandos usando SSH desde tu computadora hacia el servidor.

> [!WARNING]
> Dado que tu repositorio en GitHub puede ser privado o público, utilizaremos HTTPS para clonarlo. Si es privado, requerirás un token de acceso personal (PAT). Si es público, la descarga será inmediata. Por favor, confírmame en el chat si es público o privado.

## Open Questions

> [!WARNING]
> ¿Tu repositorio en GitHub (`https://github.com/correoedwinortiz-stack/guacaguia.git`) es público o privado?
> ¿Quieres que el servidor esté accesible públicamente en los puertos `3002` (HTTP) y `8082` (WebSocket)?

## Proposed Changes

La implementación se dividirá en las siguientes fases:

### Fase 1: Preparación del Servidor
- Ejecutar actualizaciones del sistema (`sudo apt update`).
- Instalar **Node.js** y **npm** (para correr tu aplicación).
- Instalar **PM2** de forma global (para mantener el proceso activo en segundo plano aunque cierres la terminal).

### Fase 2: Descarga del Código
- Clonar el repositorio `guacaguia` usando Git en la carpeta del usuario `ubuntu`.
- Instalar las dependencias del proyecto ejecutando `npm install`.

### Fase 3: Variables de Entorno (Transferencia)
- Copiar de manera segura tu archivo local `.env` (que contiene todas tus API keys de Gradium, Groq, AIHubMix, etc.) hacia el servidor remoto usando el comando `scp`.

### Fase 4: Despliegue y Ejecución
- Iniciar la aplicación usando PM2 (`pm2 start server.mjs --name guacaguia`).
- Configurar PM2 para que reinicie la app automáticamente si el servidor de Ubuntu se reinicia.
- Abrir los puertos `3002` y `8082` en el firewall (`ufw`) para que el panel y la web puedan ser accedidos desde internet.

## Verification Plan

### Manual Verification
- Comprobaremos el estado en PM2 (`pm2 status`).
- Revisaremos los logs de tu aplicación para confirmar que los servidores HTTP y WebSocket arrancaron sin errores.
- Te pediré que ingreses en tu navegador a `http://147.15.89.78:3002` para comprobar que la interfaz carga correctamente.
