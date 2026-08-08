# ============================================================
#  PASO 1 (ejecutar UNA SOLA VEZ): Clonar la voz de mamá
#  en Gradium y obtener el voice_id
# ============================================================
#
#  Requisitos:
#    pip install gradium python-dotenv
#
#  Uso:
#    python clonar_voz.py
# ============================================================

import asyncio
import json
import sys
import os
import asyncio
from dotenv import load_dotenv

# Forzar UTF-8 en la consola para soportar los emojis
if sys.stdout.encoding.lower() != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

load_dotenv()

GRADIUM_KEY = os.getenv("GRADIUM_API_KEY")
VOICE_PATH  = os.getenv("VOICE_SAMPLE_PATH", "./voz_mama.wav")

if not GRADIUM_KEY or "tu_" in GRADIUM_KEY:
    print("❌  Falta GRADIUM_API_KEY en el archivo .env")
    print("    Regístrate gratis en https://gradium.ai  (no requiere tarjeta)")
    sys.exit(1)

if not os.path.exists(VOICE_PATH):
    print(f"❌  No se encontró el audio: {VOICE_PATH}")
    print(f"    Copia el archivo de audio de tu mamá y ajusta VOICE_SAMPLE_PATH en .env")
    sys.exit(1)

async def main():
    import gradium

    print("🔗  Conectando con Gradium...")
    client = gradium.client.GradiumClient(api_key=GRADIUM_KEY)

    print(f"🎙️  Subiendo voz desde: {VOICE_PATH}")
    print("    (solo se necesitan 10 segundos de audio limpio)")

    voice = await gradium.voices.create(
        client,
        audio_file=VOICE_PATH,
        name="Voz de Mamá",
        description="Voz clonada de mamá para generador de oraciones",
    )

    voice_id = voice.get("uid") or voice.get("voice_uid") or voice.get("id")

    print("\n✅  ¡Voz clonada con éxito!")
    print(f"\n    Voice ID: {voice_id}")
    print(f"\n    Copia este ID y agrégalo a tu .env como:")
    print(f"    GRADIUM_VOICE_ID={voice_id}\n")

    # Guardar automáticamente en .env si existe
    env_path = ".env"
    if os.path.exists(env_path):
        with open(env_path, "r") as f:
            content = f.read()
        
        if "GRADIUM_VOICE_ID=" in content:
            # Reemplazar línea existente
            lines = content.splitlines()
            lines = [f"GRADIUM_VOICE_ID={voice_id}" if l.startswith("GRADIUM_VOICE_ID=") else l for l in lines]
            content = "\n".join(lines)
        else:
            content += f"\nGRADIUM_VOICE_ID={voice_id}\n"
        
        with open(env_path, "w") as f:
            f.write(content)
        print("    ✅  También se guardó automáticamente en tu .env")
    
    print("\n    Ahora ejecuta: node oraciones.js\n")

if __name__ == "__main__":
    asyncio.run(main())
