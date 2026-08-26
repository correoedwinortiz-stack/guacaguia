const fs = require('fs');
const path = require('path');

const stopwords = new Set([
  "el", "la", "los", "las", "un", "una", "unos", "unas", "y", "o", "pero", "si", 
  "de", "del", "a", "al", "en", "por", "con", "para", "sobre", "entre", "sin", "hacia",
  "que", "qué", "quien", "quién", "como", "cómo", "cuando", "cuándo", "donde", "dónde",
  "es", "son", "fue", "fueron", "ser", "estar", "tiene", "tienen", "hace", "hacen",
  "me", "te", "se", "nos", "os", "le", "les", "lo", "la", "mi", "tu", "su", "sus"
]);

const suffixes = [
  "ciones", "mente", "iendo", "ción", "ando", "ado", "ada", 
  "ones", "es", "os", "as", "er", "ar", "ir", "ón"
];

function lightStem(word) {
  let stemmed = word;
  for (let suf of suffixes) {
    if (stemmed.endsWith(suf)) {
      stemmed = stemmed.substring(0, stemmed.length - suf.length);
      break;
    }
  }
  return stemmed;
}

const synonymMap = {
  "camisa": ["uniforme", "presentacion", "vestimenta"],
  "ropa": ["uniforme", "presentacion", "vestimenta"],
  "color": ["uniforme", "presentacion"],
  "colores": ["uniforme", "presentacion"],
  "roja": ["uniforme"],
  "pantalon": ["uniforme"],
  "tenis": ["uniforme", "zapatos"],
  "cabello": ["presentacion", "corte", "peinado"],
  "pelo": ["presentacion", "corte", "peinado", "cabello"],
  "piercing": ["accesorios", "presentacion"],
  "arete": ["accesorios", "presentacion"],
  "maquillaje": ["presentacion"],
  "tarde": ["puntualidad", "retraso", "llegada"],
  "pelear": ["agresion", "conflicto", "violencia", "falta"],
  "pelea": ["agresion", "conflicto", "violencia", "falta"],
  "celular": ["tecnologia", "dispositivo", "electronico"],
  "telefono": ["tecnologia", "dispositivo", "electronico"],
  "falda": ["uniforme"],
  "sudadera": ["uniforme", "fisica"]
};

function processQuery(query) {
  const tokens = query.toLowerCase().replace(/[^\w\sáéíóúüñ]/g, '').split(/\s+/);
  const keywords = [];
  for (let token of tokens) {
    if (token.length > 2 && !stopwords.has(token)) {
      const stem = lightStem(token);
      keywords.push(stem);
      // Expansión de sinónimos para palabras clave comunes de estudiantes
      if (synonymMap[token]) {
        keywords.push(...synonymMap[token].map(lightStem));
      } else if (synonymMap[stem]) {
        keywords.push(...synonymMap[stem].map(lightStem));
      }
    }
  }
  return [...new Set(keywords)];
}

function tokenizeText(text) {
  return text.toLowerCase().replace(/[^\w\sáéíóúüñ]/g, '').split(/\s+/).filter(t => t.length > 0);
}

// Cargar chunks con recarga automática cuando manual_chunks.json cambia en disco
const CHUNKS_PATH = path.join(__dirname, 'manual_chunks.json');
let chunks = null;

function parseChunks(raw) {
  const parsed = JSON.parse(raw);
  parsed.forEach(c => {
    c.tokens = tokenizeText(c.texto);
    c.stemmedTokens = c.tokens.map(t => lightStem(t));
    c.wordCount = c.tokens.length || 1;
  });
  return parsed;
}

function loadChunks() {
  if (chunks) return chunks;
  try {
    chunks = parseChunks(fs.readFileSync(CHUNKS_PATH, 'utf8'));
    console.log(`[RAG] Chunks cargados: ${chunks.length}`);
  } catch (err) {
    console.error('[RAG] Error cargando manual_chunks.json:', err.message);
    chunks = [];
  }
  return chunks;
}

// Recarga automática: cuando extract_pdf.js escribe el nuevo JSON en disco,
// el RAG lo detecta y actualiza la memoria SIN reiniciar el servidor.
// Esto permite actualizar el Manual desde el panel de admin en Render sin downtime.
fs.watchFile(CHUNKS_PATH, { interval: 3000 }, () => {
  try {
    const nuevosChunks = parseChunks(fs.readFileSync(CHUNKS_PATH, 'utf8'));
    chunks = nuevosChunks;
    console.log(`[RAG] ✅ Manual recargado automáticamente: ${chunks.length} chunks activos`);
  } catch (err) {
    console.error('[RAG] Error al recargar manual_chunks.json:', err.message);
  }
});

function getOverlapRatio(tokensA, tokensB) {
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  let intersection = 0;
  for (let word of setA) {
    if (setB.has(word)) intersection++;
  }
  return intersection / Math.min(setA.size, setB.size);
}

function buscarContexto(motivo) {
  const allChunks = loadChunks();
  const keywords = processQuery(motivo);
  
  if (keywords.length === 0 || allChunks.length === 0) {
    return { contexto: "", chunksUsados: [], keywordsDetectadas: [] };
  }
  
  // Calcular IDF
  const N = allChunks.length;
  const idf = {};
  keywords.forEach(kw => {
    let docsWithKw = 0;
    allChunks.forEach(c => {
      if (c.stemmedTokens.includes(kw) || c.seccion.toLowerCase().includes(kw)) {
        docsWithKw++;
      }
    });
    idf[kw] = Math.log(N / (1 + docsWithKw));
  });
  
  // Scoring
  allChunks.forEach(c => {
    c.score = 0;
    keywords.forEach(kw => {
      let tfCount = 0;
      c.stemmedTokens.forEach(t => { if (t === kw) tfCount++; });
      let tf = tfCount / c.wordCount;
      
      // Bonus por título
      if (c.seccion.toLowerCase().includes(kw)) {
        tf *= 2; 
      }
      
      c.score += tf * idf[kw];
    });
  });
  
  // Ordenar
  const sortedChunks = [...allChunks].filter(c => c.score > 0).sort((a, b) => b.score - a.score);
  
  // Seleccionar top 3 con deduplicación
  const selected = [];
  for (let c of sortedChunks) {
    if (selected.length >= 3) break;
    
    // Verificar overlap con los ya seleccionados
    let isDuplicate = false;
    for (let sel of selected) {
      if (getOverlapRatio(c.stemmedTokens, sel.stemmedTokens) > 0.4) {
        isDuplicate = true;
        break;
      }
    }
    
    if (!isDuplicate) {
      selected.push(c);
    }
  }
  
  let contexto = selected.map(c => `${c.seccion}\n${c.texto}`).join("\n\n---\n\n");
  
  return {
    contexto,
    chunksUsados: selected.map(c => ({ id: c.id, seccion: c.seccion, score: c.score.toFixed(3) })),
    keywordsDetectadas: keywords
  };
}

module.exports = { buscarContexto };
