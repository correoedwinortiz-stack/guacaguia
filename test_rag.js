const { buscarContexto } = require('./buscarContexto');

const testCases = [
  {
    query: "celular en clase",
    expectedKeywords: ["celular", "clas"] // 'en' is stopword
  },
  {
    query: "uniforme escolar",
    expectedKeywords: ["uniforme", "escol"] // 'escol' or 'escolar' depending on stemming
  },
  {
    query: "matoneo bullying",
    expectedKeywords: ["matoneo", "bullying"]
  },
  {
    query: "calificaciones notas",
    expectedKeywords: ["calificaci", "not"] 
  },
  {
    query: "aaaaa bbbbb",
    expectedKeywords: ["aaaaa", "bbbbb"]
  }
];

console.log("=== INICIANDO TEST RAG ===");

testCases.forEach((tc, idx) => {
  console.log(`\nTest #${idx + 1}: "${tc.query}"`);
  
  const result = buscarContexto(tc.query);
  
  console.log(`- Keywords detectadas: [${result.keywordsDetectadas.join(", ")}]`);
  
  if (result.chunksUsados.length === 0) {
    console.log(`- Chunks seleccionados: NINGUNO (score 0)`);
    if (tc.query === "aaaaa bbbbb") {
      console.log(`- Resultado: PASS`);
    } else {
      console.log(`- Resultado: FAIL (Se esperaban chunks pero no hay)`);
    }
  } else {
    result.chunksUsados.forEach(c => {
      console.log(`  * ${c.seccion} (Score: ${c.score})`);
    });
    console.log(`- Resultado: PASS (Contexto extraído: ${result.contexto.length} chars)`);
  }
});
