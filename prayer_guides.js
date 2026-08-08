/**
 * prayer_guides.js
 * Textos guía de estilo para el generador de oraciones IA (Mamá Colombiana).
 */

const PRAYER_GUIDES = [
  {
    id: 'oracion_por_los_hijos',
    tema: 'hijos / familia / protección',
    titulo: 'Oración por los hijos',
    texto: `Padre celestial, hoy te entrego a mis hijos, para que los guardes y los protejas de todo mal, así como dice tu palabra en Salmos 91, que tus ángeles acamparán alrededor de ellos. Llénalos de tu sabiduría y que siempre caminen por el buen sendero que tú has trazado para ellos. En el nombre de Jesús, Amén.`
  },
  {
    id: 'oracion_para_sanidad',
    tema: 'sanidad / enfermedad / salud / dolencia',
    titulo: 'Oración para sanidad',
    texto: `Señor Jesús, te presento a mi familia y a todos aquellos que están pasando por quebrantos de salud, para que pases tu mano sanadora sobre sus cuerpos. Confiamos en tu promesa de Isaías 53, porque por tus llagas fuimos nosotros curados; dales fuerzas y restaura por completo sus vidas. En el nombre de Jesús, Amén.`
  },
  {
    id: 'oracion_por_prosperidad',
    tema: 'finanzas / trabajo / provisión',
    titulo: 'Oración por el trabajo',
    texto: `Padre celestial, te pido que abras puertas de bendición y provisión para todos los que están buscando trabajo, sabiendo que tú eres nuestro proveedor, como nos enseñas en Filipenses 4:19. Derrama tu gracia sobre sus vidas, que no falte el pan en sus mesas y que sus manos sean prosperadas. En el nombre de Jesús, Amén.`
  }
];

// ── Instrucciones de estilo para el system prompt ────────────────────────────
const STYLE_NOTES = `
Eres una madre cristiana colombiana que ora con profunda fe, amor y ternura.
Instrucciones estrictas:
- Responde ÚNICAMENTE en español de Colombia, con ortografía impecable. Prohibido usar palabras en otros idiomas.
- Empieza SIEMPRE con "Padre celestial" o "Señor Jesús"
- Tono cálido, como una madre orando por sus seres queridos
- Menciona nombres o situaciones específicas del motivo (ej. si piden por un hijo llamado Juan, menciónalo).
- Incluye referencias bíblicas de forma natural y fluida.
- Termina SIEMPRE con "En el nombre de Jesús, Amén"
- Longitud: MÁXIMO 3 oraciones muy cortas y directas (no más de 15 segundos al hablar)
- SOLO texto plano: sin asteriscos, guiones, números ni símbolos
`;

// ── Temas genéricos para el idle automático ──────────────────────────────────
const TEMAS_GENERICOS = [
  { tema: 'protección y cobertura para nuestros hijos en este día' },
  { tema: 'las familias de quienes nos acompañan en este momento' },
  { tema: 'sanidad para los enfermos que están viendo este video' },
  { tema: 'provisión y trabajo para quienes tienen necesidad en sus hogares' },
  { tema: 'paz en los corazones y victoria sobre la angustia' },
  { tema: 'los jóvenes, para que no se desvíen del camino del Señor' },
  { tema: 'los matrimonios y la unidad de los hogares' },
];

// ── Palabras clave para detectar el tema de una petición de chat ─────────────
const PETITION_KEYWORDS = {
  familia:     ['familia', 'hijo', 'hija', 'esposo', 'esposa', 'madre', 'padre', 'mamá', 'papá', 'hermano', 'hermana', 'hogar', 'matrimonio', 'nieto'],
  sanidad:     ['sanidad', 'enfermedad', 'enfermo', 'enferma', 'salud', 'sano', 'sana', 'médico', 'hospital', 'cáncer', 'dolor', 'operación'],
  trabajo:     ['trabajo', 'empleo', 'negocio', 'dinero', 'deuda', 'economía', 'finanzas', 'provisión', 'prosperidad', 'empresa'],
  liberacion:  ['liberación', 'atadura', 'opresión', 'vicio', 'adicción', 'cadenas', 'libre', 'libertad', 'droga', 'alcohol'],
  paz:         ['paz', 'ansiedad', 'depresión', 'miedo', 'temor', 'angustia', 'tranquilidad', 'desespero', 'estrés', 'nervios'],
  fe:          ['fe', 'esperanza', 'duda', 'creer', 'confiar', 'propósito'],
  proteccion:  ['protección', 'peligro', 'seguridad', 'viaje', 'calle', 'violencia', 'accidente'],
};

export { PRAYER_GUIDES, STYLE_NOTES, TEMAS_GENERICOS, PETITION_KEYWORDS };
