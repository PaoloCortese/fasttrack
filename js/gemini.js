// Foto (o descrizione) → stima delle calorie, con Gemini GRATUITO attraverso Firebase AI Logic
// (Gemini Developer API, piano senza fatturazione). Nessuna chiave nel codice: passa dal progetto Firebase.
// Nota (scelta di Paolo, 15/11/2026): sul piano gratuito Google può usare le richieste per migliorare i suoi modelli.
// Gemini STIMA soltanto: i conti del giorno (obiettivo, residuo, deficit) li fa motore.js.
import { getAI, getGenerativeModel, GoogleAIBackend, Schema } from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-ai.js';
import { app } from './firebase.js';

export const MODELLO = 'gemini-3.8-flash'; // 15/11/2026: Google indica questo per i nuovi utenti (2.5 non più disponibile)

const SCHEMA = Schema.object({
  properties: {
    descrizione: Schema.string({ description: 'cosa e quanto, breve, in italiano (es. «pasta integrale 90 g con ceci, insalata, 1 cucchiaio d\'olio»)' }),
    kcal: Schema.number({ description: 'kcal totali della porzione mangiata' }),
    proteine_g: Schema.number(), carboidrati_g: Schema.number(), grassi_g: Schema.number(),
    fonte: Schema.enumString({ enum: ['foto', 'etichetta', 'tabella_ufficiale', 'porzione_dichiarata'] }),
    affidabilita: Schema.enumString({ enum: ['alta', 'media', 'bassa'] }),
    domanda: Schema.string({ description: 'una sola domanda breve per precisare la porzione, solo se affidabilita è bassa; altrimenti stringa vuota' }),
  },
});

const ISTRUZIONI = `Sei un nutrizionista italiano. Stimi le calorie di ciò che Paolo mangia (63 anni, a dieta in deficit calorico).
Regole:
- Stima la porzione EFFETTIVAMENTE mostrata o descritta, in grammi, e le kcal totali.
- Se c'è un'ETICHETTA nutrizionale, usa i suoi valori (per la confezione o per la quantità che Paolo indica): fonte «etichetta».
- Per catene (McDonald's, Burger King, KFC, Old Wild West, Roadhouse…) usa i valori delle tabelle nutrizionali ufficiali italiane della catena: fonte «tabella_ufficiale».
- Se Paolo dichiara i grammi, usa quelli: fonte «porzione_dichiarata».
- Condimenti: conta l'olio quando è visibile o tipico del piatto (1 cucchiaio = 10 g = 90 kcal). Pizza, fritti e dolci: non sottostimare.
- Se la porzione è davvero incerta, dai la stima più probabile, affidabilita «bassa» e una sola domanda breve.
- Non dare consigli e non fare commenti: solo la stima.`;

let _model;
function modello() {
  if (!_model) {
    const ai = getAI(app, { backend: new GoogleAIBackend() });
    _model = getGenerativeModel(ai, { model: MODELLO, systemInstruction: ISTRUZIONI,
      generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA, temperature: 0.2, thinkingConfig: { thinkingLevel: 'LOW' } } }); // poco ragionamento: risposta in pochi secondi
  }
  return _model;
}

/** immagini: array di dataURL JPEG; testo: la nota di Paolo (anche da sola, senza foto). */
export async function stimaPasto(immagini = [], testo = '') {
  const parti = [{ text: (testo ? `Nota di Paolo: ${testo}` : 'Stima il pasto nelle foto.') }];
  for (const u of immagini) {
    const m = String(u).match(/^data:(image\/[a-z]+);base64,(.+)$/);
    if (m) parti.push({ inlineData: { mimeType: m[1], data: m[2] } });
  }
  // Il piano gratuito a volte risponde «troppa richiesta» (500/503/429): riprova da solo due volte prima di arrendersi.
  let r, ultimo;
  for (const attesa of [0, 2500, 6000]) {
    if (attesa) await new Promise(ok => setTimeout(ok, attesa));
    try { r = await modello().generateContent(parti); break; }
    catch (e) { ultimo = e; if (!/\[(500|503|429)|high demand|overloaded|RESOURCE_EXHAUSTED/i.test(String(e?.message || e))) throw e; }
  }
  if (!r) throw new Error('Gemini è sovraccarico in questo momento: riprova tra un minuto, o scrivi le kcal a mano. (' + String(ultimo?.message || ultimo).slice(0, 120) + ')');
  const j = JSON.parse(r.response.text());
  return {
    descrizione: String(j.descrizione || testo || '').slice(0, 300),
    kcal: Math.max(0, Math.round(Number(j.kcal) || 0)),
    proteine_g: j.proteine_g != null ? Math.round(j.proteine_g) : null,
    carboidrati_g: j.carboidrati_g != null ? Math.round(j.carboidrati_g) : null,
    grassi_g: j.grassi_g != null ? Math.round(j.grassi_g) : null,
    fonte: j.fonte || 'foto', affidabilita: j.affidabilita || 'media', domanda: j.domanda || '',
  };
}
