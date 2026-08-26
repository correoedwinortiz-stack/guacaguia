const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');
const https = require('https');
const http = require('http');
const os = require('os');

/**
 * Descarga un archivo desde una URL a un archivo temporal y retorna la ruta.
 */
function downloadFile(url) {
  return new Promise((resolve, reject) => {
    const tmpFile = path.join(os.tmpdir(), `manual_dl_${Date.now()}.pdf`);
    const file = fs.createWriteStream(tmpFile);
    const proto = url.startsWith('https') ? https : http;
    proto.get(url, (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} al descargar el PDF`));
      }
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve(tmpFile)));
    }).on('error', reject);
  });
}

/**
 * Procesa un PDF desde una URL o ruta local y genera manual_chunks.json.
 * @param {string} source - URL http/https o ruta local al PDF
 * @param {object} opts - { onLog: fn(msg), chunksPath: string }
 */
async function extractPdf(source, opts = {}) {
  const log = opts.onLog || console.log;
  const chunksPath = opts.chunksPath || path.join(__dirname, 'manual_chunks.json');

  let tmpFile = null;
  let pdfPath;

  if (source.startsWith('http://') || source.startsWith('https://')) {
    log(`📥 Descargando PDF desde: ${source}`);
    tmpFile = await downloadFile(source);
    pdfPath = tmpFile;
    log(`✅ PDF descargado (${(fs.statSync(pdfPath).size / 1024).toFixed(0)} KB)`);
  } else {
    pdfPath = path.isAbsolute(source) ? source : path.join(__dirname, source);
    if (!fs.existsSync(pdfPath)) throw new Error(`Archivo no encontrado: ${pdfPath}`);
  }

  try {
    const dataBuffer = fs.readFileSync(pdfPath);
    const parser = typeof pdf === 'function' ? pdf : pdf.default || pdf;
    const data = await parser(dataBuffer);
    const text = data.text;
    const lines = text.split('\n');

    let sections = [];
    let currentSection = { title: 'Inicio', content: '' };

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trim();
      if (line.length === 0) continue;
      const isHeaderRegex = /^(ARTÍCULO|CAPÍTULO|TITULO|SECCIÓN|CAPITULO)\s*\d+/i;
      const isAllCaps = (
        line === line.toUpperCase() &&
        line.length > 3 &&
        line.length < 80 &&
        !/^\d+$/.test(line)
      );
      if (isHeaderRegex.test(line) || isAllCaps) {
        if (currentSection.content.length > 0) sections.push(currentSection);
        currentSection = { title: line, content: line + '\n' };
      } else {
        currentSection.content += line + ' ';
      }
    }
    if (currentSection.content.length > 0) sections.push(currentSection);

    let finalChunks = [];
    let idCounter = 1;

    for (let i = 0; i < sections.length; i++) {
      let sec = sections[i];
      if (sec.content.length < 200 && i < sections.length - 1) {
        sections[i + 1].title = sec.title + ' | ' + sections[i + 1].title;
        sections[i + 1].content = sec.content + '\n' + sections[i + 1].content;
        continue;
      }
      if (sec.content.length > 2000) {
        let offset = 0;
        const chunkSize = 1800;
        const overlap = 300;
        let partNum = 1;
        while (offset < sec.content.length) {
          let end = Math.min(offset + chunkSize, sec.content.length);
          let chunkText = sec.content.substring(offset, end);
          finalChunks.push({ id: idCounter++, seccion: `${sec.title} (Parte ${partNum})`, texto: chunkText, chars: chunkText.length });
          offset += (chunkSize - overlap);
          partNum++;
        }
      } else {
        finalChunks.push({ id: idCounter++, seccion: sec.title, texto: sec.content, chars: sec.content.length });
      }
    }

    // Fallback a chunks fijos si la detección de estructura falla
    if (finalChunks.length < 10) {
      log('⚠️ Estructura no detectada, cayendo a chunks fijos...');
      finalChunks = [];
      idCounter = 1;
      let offset = 0;
      const chunkSize = 1800;
      const overlap = 300;
      const cleanText = text.replace(/\s+/g, ' ');
      while (offset < cleanText.length) {
        let end = Math.min(offset + chunkSize, cleanText.length);
        let chunkText = cleanText.substring(offset, end);
        finalChunks.push({ id: idCounter++, seccion: `Sección ${idCounter}`, texto: chunkText, chars: chunkText.length });
        offset += (chunkSize - overlap);
      }
    }

    fs.writeFileSync(chunksPath, JSON.stringify(finalChunks, null, 2));

    log(`✅ PDF leído: ${text.length} chars`);
    log(`✅ Secciones detectadas: ${sections.length}`);
    log(`✅ Chunks generados: ${finalChunks.length}`);
    log(`✅ Guardado: ${chunksPath}`);

    return { chunks: finalChunks.length, sections: sections.length, chars: text.length };
  } finally {
    if (tmpFile) {
      try { fs.unlinkSync(tmpFile); } catch (_) {}
    }
  }
}

// Ejecución directa desde CLI: node extract_pdf.js [url_o_ruta]
if (require.main === module) {
  const source = process.argv[2] || 'manual-de-convivencia-escuela-normal.pdf';
  extractPdf(source).catch(err => { console.error(err.message); process.exit(1); });
}

module.exports = { extractPdf };
