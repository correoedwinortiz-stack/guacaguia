const { MsEdgeTTS, OUTPUT_FORMAT } = require("msedge-tts");
const fs = require('fs');

async function test() {
  const tts = new MsEdgeTTS();
  await tts.setMetadata("es-CO-SalomeNeural", OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  
  const { audioStream } = await tts.toStream("Hola esto es una prueba usando Node nativo");
  const writeStream = fs.createWriteStream('test_stream.wav');
  audioStream.pipe(writeStream);
  
  await new Promise((resolve, reject) => {
    writeStream.on('finish', resolve);
    writeStream.on('error', reject);
  });
  console.log("Stream Success");
}
test().catch(console.error);
