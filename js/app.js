// FAST TRACK 2 (15/11/2026) — l'app di tutti i giorni per dieta e attività di Paolo.
// Il motore è qui: calorie prese, calorie che restano, consigli per stare nel deficit del giorno, digiuno 16/8,
// peso e attività. Le calorie vengono da banche dati vere (Open Food Facts, i cibi di Paolo); nei casi limite
// l'app prepara la domanda per l'app Gemini e legge la risposta incollata. I conti li fa il codice (motore.js).
// I dati stanno nel database Salute: Greg (AZienda) li legge solo quando Paolo gli chiede una verifica.
import { html, render, useState, useEffect, useRef } from 'https://cdn.jsdelivr.net/npm/htm@3.1.1/preact/standalone.module.js';
import { auth, db, onAuthStateChanged, signInWithEmailAndPassword, signOut, collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, query, where, Bytes } from './firebase.js';
import * as M from './motore.js';

const VERSIONE = '2.6 · 15/11/2026';
const numIt = v => { const n = Number(String(v ?? '').trim().replace(/\s/g, '').replace(',', '.')); return isFinite(n) && String(v ?? '').trim() !== '' ? n : null; };

// ---------- foto del pasto: rimpicciolite sul telefono (800 px) e tenute nel diario ----------
function rimpicciolisci(file, lato, qualita) {
  return new Promise(res => {
    const url = URL.createObjectURL(file); const im = new Image();
    im.onload = () => {
      const k = Math.min(1, lato / Math.max(im.naturalWidth, im.naturalHeight));
      const c = document.createElement('canvas'); c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k);
      c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      res(c.toDataURL('image/jpeg', qualita));
    };
    im.onerror = () => { URL.revokeObjectURL(url); res(null); };
    im.src = url;
  });
}
async function salvaFoto(dataUrl) {
  const m = dataUrl.match(/^data:(image\/[a-z]+);base64,(.+)$/);
  const ref = await addDoc(collection(db, 'foto'), { data: M.oggiRoma(), ts: Date.now(), mime: m[1], bytes: Bytes.fromBase64String(m[2]), kb: Math.round(m[2].length * 0.75 / 1024) });
  return ref.id;
}
async function fotoUrl(id) {
  const s = await getDoc(doc(db, 'foto', id)); if (!s.exists()) return null;
  const f = s.data(); return `data:${f.mime};base64,${f.bytes.toBase64()}`;
}
async function aggiornaGiorno(data, campi) { await setDoc(doc(db, 'giorni', data), { data, aggiornato: Date.now(), ...campi }, { merge: true }); }

// ---------- componenti di base ----------
function Sheet({ titolo, onClose, children }) {
  useEffect(() => { const k = e => e.key === 'Escape' && onClose(); addEventListener('keydown', k); return () => removeEventListener('keydown', k); }, []);
  return html`<div class="velo" onClick=${e => e.target === e.currentTarget && onClose()}>
    <div class="sheet" role="dialog" aria-modal="true" aria-label=${titolo}>
      <div class="sheet-testa"><h2>${titolo}</h2><button class="x" aria-label="Chiudi" onClick=${onClose}>×</button></div>
      ${children}
    </div></div>`;
}
const Campo = ({ etichetta, children }) => html`<label class="campo"><span>${etichetta}</span>${children}</label>`;
const Errore = ({ e }) => e ? html`<p class="errore" role="alert">${e}</p>` : null;

// ---------- accesso ----------
function Login() {
  const [email, setEmail] = useState(''); const [pw, setPw] = useState(''); const [err, setErr] = useState(''); const [att, setAtt] = useState(false);
  const entra = async e => { e.preventDefault(); setErr(''); setAtt(true);
    try { await signInWithEmailAndPassword(auth, email.trim(), pw); } catch (x) { setErr('Accesso non riuscito: controlla email e password.'); setAtt(false); } };
  return html`<main class="login"><div class="logo">⏱</div><h1>Fast Track</h1><p class="sub">Dieta, digiuno e attività</p>
    <form onSubmit=${entra}>
      <${Campo} etichetta="Email"><input type="email" autocomplete="username" value=${email} onInput=${e => setEmail(e.target.value)} required /><//>
      <${Campo} etichetta="Password"><input type="password" autocomplete="current-password" value=${pw} onInput=${e => setPw(e.target.value)} required /><//>
      <${Errore} e=${err} />
      <button class="primario largo" disabled=${att}>${att ? 'Entro…' : 'Entra'}</button>
    </form><p class="nota">Si entra una volta per dispositivo.</p></main>`;
}

// ---------- OGGI ----------
function Pallino({ x }) {
  const segno = { verde: '✓', giallo: '!', rosso: '✕', vuoto: '–', futuro: '', oggi: '' }[x.stato];
  const testo = { verde: 'nel budget', giallo: 'poco sopra', rosso: 'sopra', vuoto: 'non registrato', futuro: 'da fare', oggi: 'oggi' }[x.stato];
  return html`<span class="pallino ${x.stato} ${x.oggi ? 'e-oggi' : ''}" role="img" aria-label=${`${x.giorno}: ${testo}${x.stato === 'verde' || x.stato === 'giallo' || x.stato === 'rosso' ? `, ${x.kcal} kcal` : ''}`}><span class="segno">${segno}</span><small>${x.giorno.slice(0, 2)}</small></span>`;
}
function rigaSfida(s) {
  if (s.sabato) return 'Oggi è sabato: pesati nella scheda Peso, il bilancio parte da solo.';
  if (s.recupero) return `−${M.kcalTxt(s.recupero.debito)} da recuperare · ${s.recupero.giorni > 1 ? `oggi e nei prossimi ${s.recupero.giorni - 1} giorni` : 'oggi'} ${M.kcalTxt(s.recupero.obiettivoGiorno)} kcal · ${s.recupero.minuti} min a piedi aiutano la bilancia`;
  if (s.saldo > 0) return `+${M.kcalTxt(s.saldo)} da parte${s.fila >= 2 ? ` · ${s.fila} giorni di fila nel budget` : ''}`;
  if (s.contati === 0) return 'Si parte: ogni giornata registrata mette o toglie dal salvadanaio.';
  return 'In pari con l\'obiettivo';
}
function Budget({ n, s, onSfida }) {
  const pct = Math.min(100, n.mangiato / n.obiettivo * 100); const oltre = n.residuo < 0;
  const [info, setInfo] = useState(false);
  return html`<section class="card budget">
    <p class="etichetta">${oltre ? 'Oltre il budget' : 'Restano'}</p>
    <p class="grande ${oltre ? 'rosso' : ''}">${M.kcalTxt(Math.abs(n.residuo))} <small>kcal</small></p>
    <div class="barra ${oltre ? 'rossa' : ''}"><div style=${`width:${pct}%`}></div></div>
    <div class="tre"><div><b>${M.kcalTxt(n.mangiato)}</b><span>mangiate</span></div><div><b>${M.kcalTxt(n.obiettivo)}</b><span>obiettivo${n.recuperoOggi ? html`<br/>(${M.kcalTxt(n.obiettivoBase)} − ${n.recuperoOggi} recupero)` : ''}</span></div><div><b>${s ? (s.saldo > 0 ? '+' : s.saldo < 0 ? '−' : '') + M.kcalTxt(Math.abs(s.saldo)) : '—'}</b><span>settimana</span></div></div>
    ${s ? html`<button class="fascia-sfida" onClick=${onSfida} aria-label="Apri la sfida della settimana">
      <span class="riga"><b>Sfida · sabato ${s.sabatoPesata.slice(8, 10)}${s.pesoObiettivo ? ` → ${M.kgTxt(s.pesoObiettivo)} kg` : ''}</b><span aria-hidden="true">›</span></span>
      <span class="pallini">${s.pallini.map(x => html`<${Pallino} x=${x} />`)}</span>
      <span class="riga-sfida">${rigaSfida(s)}</span>
      ${s.previsione ? html`<span class="riga-sfida">Se continui così: sabato <b>${M.kgTxt(s.previsione)} kg</b></span>` : null}
    </button>` : null}
    <button class="link" onClick=${() => setInfo(!info)} aria-expanded=${info}>${info ? 'Nascondi i conti' : 'Da dove vengono i numeri'}</button>
    ${info ? html`<ul class="conti">
      <li>Peso di tendenza <b>${M.kgTxt(n.tendenza.kg)} kg</b> (${n.tendenza.metodo})</li>
      <li>Metabolismo basale <b>${M.kcalTxt(n.basale.valore)}</b> kcal — Mifflin-St Jeor: ${n.basale.formula}</li>
      <li>Fabbisogno <b>${M.kcalTxt(n.fabbisogno.valore)}</b> kcal — ${n.fabbisogno.fonte}</li>
      <li>Obiettivo <b>${M.kcalTxt(n.obiettivoBase)}</b> = ${n.obiettivoNota}. Mai sotto il basale.</li>
      <li>L'attività non si aggiunge al budget: fa deficit in più.</li></ul>` : null}
  </section>`;
}

function SfidaSheet({ s, onClose }) {
  return html`<${Sheet} titolo="La sfida della settimana" onClose=${onClose}>
    <p class="piccolo">Da sabato ${M.dataBreve(s.inizio).slice(4)} a venerdì ${M.dataBreve(s.fine).slice(4)} · pesata sabato ${M.dataBreve(s.sabatoPesata).slice(4)}</p>
    <div class="pallini grandi">${s.pallini.map(x => html`<${Pallino} x=${x} />`)}</div>
    <ul class="conti">
      ${s.pesoObiettivo ? html`<li>Obiettivo di sabato: <b>${M.kgTxt(s.pesoObiettivo)} kg</b> di tendenza (partenza ${s.tendenzaInizio ? M.kgTxt(s.tendenzaInizio.kg) : '—'} kg${s.inGioco < 7 ? `, ${s.inGioco} giorni in gioco questa settimana` : ''}).</li>` : null}
      <li>${s.previsione ? html`Se continui così: <b>${M.kgTxt(s.previsione)} kg</b> sabato.` : 'La previsione compare dal terzo giorno registrato.'}</li>
      <li>Salvadanaio: <b>${s.saldo > 0 ? '+' : s.saldo < 0 ? '−' : ''}${M.kcalTxt(Math.abs(s.saldo))} kcal</b> (obiettivo ${M.kcalTxt(s.obiettivo)} meno quello che hai mangiato, giorno per giorno).</li>
      ${s.recupero ? html`<li><b>Come rientri:</b> ${s.recupero.giorni > 1 ? `oggi e nei prossimi ${s.recupero.giorni - 1} giorni` : 'oggi'} l'obiettivo scende a ${M.kcalTxt(s.recupero.obiettivoGiorno)} kcal (mai sotto il basale, ${M.kcalTxt(s.basale)}). ${s.recupero.minuti} minuti a piedi in più al giorno aiutano la bilancia.${s.recupero.siLasciaAndare ? ` Il resto (${M.kcalTxt(s.recupero.siLasciaAndare)} kcal) si lascia andare: conta il peso di sabato.` : ''}</li>` : null}
      ${s.lasciato ? html`<li>Lasciato andare questa settimana: ${M.kcalTxt(s.lasciato)} kcal. Va bene così.</li>` : null}
    </ul>
    <p class="piccolo">✓ nel budget · ! poco sopra (fino a 300) · ✕ sopra · – non registrato o manca un pasto (non conta). Le giornate contano da sole quando sono passate.</p>
  <//>`;
}

function Digiuno({ stato, aggiorna }) {
  const [adesso, setAdesso] = useState(Date.now());
  const [ora, setOra] = useState(''); const [chiediOra, setChiediOra] = useState(false);
  useEffect(() => { const t = setInterval(() => setAdesso(Date.now()), 30000); return () => clearInterval(t); }, []);
  const quando = () => { // «alle 21:30» di oggi (o di ieri se è nel futuro)
    if (!ora) return Date.now();
    const [h, m] = ora.split(':').map(Number); const d = new Date(); d.setHours(h, m, 0, 0);
    if (d.getTime() > Date.now()) d.setDate(d.getDate() - 1); return d.getTime();
  };
  const fine = () => { setOra(''); setChiediOra(false); aggiorna(); };
  const inizia = async () => { await setDoc(doc(db, 'stato', 'digiuno'), { inizio: quando(), apertaAlle: null }); fine(); };
  const apri = async () => {
    const t = quando(); const ore = M.r1((t - stato.inizio) / 3600000);
    await addDoc(collection(db, 'digiuni'), { inizio: stato.inizio, fine: t, ore, data: M.oggiRoma(new Date(stato.inizio)), completato: ore >= M.ORE_DIGIUNO });
    await setDoc(doc(db, 'stato', 'digiuno'), { inizio: null, apertaAlle: t }); fine();
  };
  const orario = chiediOra ? html`<input class="ora" type="time" value=${ora} onInput=${e => setOra(e.target.value)} aria-label="A che ora" />` : null;
  const linkOra = !chiediOra ? html`<button class="link" onClick=${() => setChiediOra(true)}>a che ora?</button>` : null;
  if (stato?.inizio) {
    const ore = (adesso - stato.inizio) / 3600000; const pct = Math.min(100, ore / M.ORE_DIGIUNO * 100);
    const apre = new Date(stato.inizio + M.ORE_DIGIUNO * 3600000);
    return html`<section class="card"><div class="riga"><h3>🌙 Digiuno</h3><span class="pill ${ore >= M.ORE_DIGIUNO ? 'verde' : ''}">${Math.floor(ore)} h ${String(Math.floor((ore % 1) * 60)).padStart(2, '0')} min</span></div>
      <div class="barra"><div style=${`width:${pct}%`}></div></div>
      <p class="piccolo">Iniziato alle ${M.oraRoma(new Date(stato.inizio))} · 16 ore alle <b>${M.oraRoma(apre)}</b>. Si chiude da solo al primo pasto che registri.</p>
      <div class="azioni">${orario}<button class="primario" onClick=${apri}>${chiediOra ? 'Aperta a quest\'ora' : 'Apro la finestra ora'}</button>${linkOra}</div></section>`;
  }
  return html`<section class="card"><div class="riga"><h3>🍽 Finestra aperta</h3>${stato?.apertaAlle ? html`<span class="pill">dalle ${M.oraRoma(new Date(stato.apertaAlle))}</span>` : null}</div>
    <p class="piccolo">Quando hai finito di mangiare, fallo partire. Se te ne dimentichi, domattina parte da solo dall'ultimo pasto.</p>
    <div class="azioni">${orario}<button class="primario" onClick=${inizia}>${chiediOra ? 'Iniziato a quest\'ora' : 'Inizia il digiuno ora'}</button>${linkOra}</div></section>`;
}

function Consiglio({ lista }) { // uno solo alla volta: il più utile
  if (!lista.length) return null;
  const ordine = { allarme: 0, digiuno: 1, info: 2, ok: 3, attivita: 4 };
  const c = [...lista].sort((a, b) => (ordine[a.tipo] ?? 9) - (ordine[b.tipo] ?? 9))[0];
  const icona = { digiuno: '⏱', allarme: '⚠️', ok: '✅', info: '💡', attivita: '🚶' };
  return html`<ul class="consigli solo"><li class=${c.tipo}><span aria-hidden="true">${icona[c.tipo] || '•'}</span><p>${c.testo}</p></li></ul>`;
}

// ---------- dove si prendono le calorie ----------
// Open Food Facts (gratuita, aperta, senza chiave): per nome o per codice a barre, valori dell'etichetta per 100 g.
const OFF_CAMPI = 'product_name,brands,code,nutriments,serving_size,serving_quantity';
function offVoce(p) {
  const n = p?.nutriments || {}; if (n['energy-kcal_100g'] == null) return null;
  const marca = Array.isArray(p.brands) ? p.brands[0] : String(p.brands || '').split(',')[0];
  const num = k => n[k] != null && isFinite(Number(n[k])) ? M.r1(Number(n[k])) : null;
  return { nome: [marca, p.product_name].filter(Boolean).join(' · ').trim() || 'Prodotto', kcal100: Math.round(Number(n['energy-kcal_100g'])),
    prot100: num('proteins_100g'), carbo100: num('carbohydrates_100g'), grassi100: num('fat_100g'),
    porzioneG: Number(p.serving_quantity) || null, codice: p.code || null, fonte: 'Open Food Facts' };
}
async function offCerca(q) {
  q = q.trim();
  if (/^\d{8,14}$/.test(q)) {
    const j = await (await fetch(`https://world.openfoodfacts.org/api/v2/product/${q}.json?fields=${OFF_CAMPI}`)).json();
    return j.status === 1 ? [offVoce(j.product)].filter(Boolean) : [];
  }
  const base = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=15&fields=${OFF_CAMPI}`;
  let j = await (await fetch(base + '&tagtype_0=countries&tag_contains_0=contains&tag_0=italy')).json();
  let v = (j.products || []).map(offVoce).filter(Boolean);
  if (!v.length) { j = await (await fetch(base)).json(); v = (j.products || []).map(offVoce).filter(Boolean); }
  // Prima i prodotti che contengono TUTTE le parole cercate (es. «yogurt greco 0» → prima gli 0%)
  const parole = q.toLowerCase().split(/\s+/).filter(Boolean);
  const punti = x => parole.filter(w => x.nome.toLowerCase().includes(w)).length;
  return v.map((x, i) => ({ x, i, p: punti(x) })).sort((a, b) => b.p - a.p || a.i - b.i).map(o => o.x).slice(0, 12);
}
// Numeri scritti all'italiana: «1.250» = 1250, «4,5» = 4,5
const numTesto = s => { if (s == null) return null; const t = String(s).trim().replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'); const n = Number(t); return isFinite(n) ? n : null; };

// Gemini incollato: l'alternativa gratuita (copia la domanda → app Gemini → incolla la riga di risposta).
const DOMANDA_GEMINI = `Ti mando la foto del mio pasto. Stima porzioni e calorie come un nutrizionista: conta l'olio se c'è (1 cucchiaio = 90 kcal), non sottostimare pizza, fritti e dolci; per le catene (McDonald's, Burger King, KFC…) usa le tabelle nutrizionali ufficiali italiane.
Rispondi SOLO con questa riga, senza altro testo:
FASTTRACK | descrizione: <cosa e quanto> | kcal: <numero> | proteine: <grammi> | carboidrati: <grammi> | grassi: <grammi>`;
function leggiGemini(t) {
  const prendi = chiave => { const m = t.match(new RegExp(chiave + '\\s*[:=]\\s*~?\\s*([\\d.,]+)', 'i')); return m ? numTesto(m[1]) : null; };
  let kcal = prendi('kcal');
  if (kcal == null) { const m = t.match(/([\d.,]{2,7})\s*kcal/i); if (m) kcal = numTesto(m[1]); }
  if (kcal == null) return null;
  const d = t.match(/descrizione\s*[:=]\s*([^|\n]+)/i);
  return { descrizione: (d ? d[1] : 'pasto stimato da Gemini').trim().slice(0, 200), kcal: Math.round(kcal), proteine: prendi('proteine'), carboidrati: prendi('carboidrati'), grassi: prendi('grassi'), fonte: 'gemini_app' };
}

// ---------- salvataggi comuni ----------
const tondo = x => x != null && isFinite(x) ? Math.round(x) : null;
/** Digiuno automatico (15/11): il primo pasto registrato chiude il digiuno e apre la finestra. */
async function chiudiDigiunoSeServe(data) {
  if (data !== M.oggiRoma()) return;
  const s = await M.statoDigiuno(); if (!s?.inizio) return;
  const fine = Date.now(); const ore = M.r1((fine - s.inizio) / 3600000);
  await addDoc(collection(db, 'digiuni'), { inizio: s.inizio, fine, ore, data: M.oggiRoma(new Date(s.inizio)), completato: ore >= M.ORE_DIGIUNO, chiusoDa: 'primo pasto' });
  await setDoc(doc(db, 'stato', 'digiuno'), { inizio: null, apertaAlle: fine });
}
/** La mattina, se il digiuno non è partito e oggi non hai ancora mangiato, parte da solo dall'ultimo pasto di ieri. */
async function digiunoDelMattino(stato, pastiOggi) {
  if (stato?.inizio || (pastiOggi || []).length) return false;
  const ieri = M.addGiorni(M.oggiRoma(), -1);
  const ult = (await M.pastiDel(ieri)).filter(p => p.fonte !== 'gemini_storico' && p.ora).map(p => p.ora).sort().pop();
  if (!ult) return false;
  const [h, m] = ult.split(':').map(Number); const d = new Date(); d.setDate(d.getDate() - 1); d.setHours(h, m, 0, 0);
  if (stato?.apertaAlle && stato.apertaAlle > d.getTime()) return false;
  await setDoc(doc(db, 'stato', 'digiuno'), { inizio: d.getTime(), apertaAlle: null, avviatoDa: 'mattino (ultimo pasto di ieri)' });
  return true;
}
/** E quando si chiude la giornata riparte, dall'ora dell'ultimo pasto di oggi. */
async function avviaDigiunoDaUltimoPasto(pasti) {
  const s = await M.statoDigiuno(); if (s?.inizio) return null;
  const ult = [...(pasti || [])].map(p => p.ora).filter(Boolean).sort().pop();
  let t = Date.now();
  if (ult) { const [h, m] = ult.split(':').map(Number); const d = new Date(); d.setHours(h, m, 0, 0); if (d.getTime() <= Date.now()) t = d.getTime(); }
  await setDoc(doc(db, 'stato', 'digiuno'), { inizio: t, apertaAlle: null, avviatoDa: 'chiusura giornata' });
  return t;
}
/** Salva un pasto fatto di una o più voci. Ritorna l'id (la ricevuta). */
async function salvaPasto(data, voci, extra = {}) {
  await chiudiDigiunoSeServe(data);
  const somma = k => { const v = voci.map(x => x[k]).filter(x => x != null); return v.length ? Math.round(v.reduce((a, b) => a + b, 0)) : null; };
  const fonti = [...new Set(voci.map(x => x.fonte).filter(Boolean))];
  const ref = await addDoc(collection(db, 'pasti'), { data, ora: M.oraRoma(), descrizione: voci.map(x => x.descrizione).join(' + ').slice(0, 300),
    kcal: somma('kcal') || 0, proteine: somma('proteine'), carboidrati: somma('carboidrati'), grassi: somma('grassi'),
    fonte: fonti.length === 1 ? fonti[0] : 'misto', aderenza: 'piano', foto: [], ts: Date.now(), origine: 'fasttrack', ...extra });
  return ref.id;
}
/** Tra i miei: se c'è già (stesso nome o stesso codice a barre) aumenta l'uso, altrimenti lo aggiunge. */
async function ricordaCibo(voce) {
  const s = await getDocs(collection(db, 'preferiti'));
  const nome = String(voce.nome || '').trim().toLowerCase();
  const gia = s.docs.find(d => { const x = d.data(); return (voce.codice && x.codice === voce.codice) || String(x.nome || '').trim().toLowerCase() === nome; });
  if (gia) { await setDoc(gia.ref, { usi: (gia.data().usi || 0) + 1, ...(voce.mini && !gia.data().mini ? { mini: voce.mini } : {}) }, { merge: true }); return; }
  await addDoc(collection(db, 'preferiti'), { kcal100: null, prot100: null, carbo100: null, grassi100: null, kcalPezzo: null, protPezzo: null, carboPezzo: null, grassiPezzo: null, pezzo: null, porzioneG: null, codice: null, fonte: '', ...voce, usi: 1, ts: Date.now() });
}
function ridimensiona(dataUrl, lato, qualita) {
  return new Promise(res => { const im = new Image(); im.onload = () => { const k = Math.min(1, lato / Math.max(im.naturalWidth, im.naturalHeight));
    const c = document.createElement('canvas'); c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); res(c.toDataURL('image/jpeg', qualita)); };
    im.onerror = () => res(null); im.src = dataUrl; });
}
const miniUrl = m => m ? `data:image/jpeg;base64,${typeof m.toBase64 === 'function' ? m.toBase64() : m}` : null;

// ---------- 📷 CHIEDI A GREG: la foto va al server di AZienda (a pagamento, ~1–2 centesimi) ----------
const URL_GREG = (location.hostname === 'localhost' || location.hostname === '127.0.0.1') ? 'http://localhost:4321/api/fasttrack/foto' : 'https://azienda-tau.vercel.app/api/fasttrack/foto';
async function chiediGreg(foto, tipo) {
  const t = await auth.currentUser.getIdToken();
  const r = await fetch(URL_GREG, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + t }, body: JSON.stringify({ images: [foto], tipo: tipo || '' }) });
  const j = await r.json().catch(() => ({ error: 'risposta non leggibile' }));
  if (!r.ok || j.error) throw new Error(j.error || 'errore ' + r.status);
  return j;
}
const FRASI_ATTESA = ['Riconosco i cibi…', 'Stimo le porzioni…', 'Faccio i conti con quello che ti resta…'];
const PORZIONI = [[0.5, '½'], [1, '1'], [1.5, '1½']];

function Porzioni({ f, setF }) {
  return html`<div class="porzioni" role="group" aria-label="Porzione">${PORZIONI.map(([v, t]) => html`<button class=${f === v ? 'attivo' : ''} aria-pressed=${f === v} onClick=${() => setF(v)}>${t}</button>`)}</div>`;
}
const Fiducia = ({ a }) => { const p = { alta: ['●●●', 'Sicuro'], media: ['●●○', 'Abbastanza sicuro'], bassa: ['●○○', 'Da verificare'] }[a] || ['●●○', 'Abbastanza sicuro'];
  return html`<span class="fiducia ${a === 'bassa' ? 'bassa' : ''}"><span aria-hidden="true">${p[0]}</span> ${p[1]}</span>`; };

function GregSheet({ greg, setGreg, n, aggiorna, onCorreggi }) {
  const [frase, setFrase] = useState(0); const [f, setF] = useState(1); const [lavoro, setLavoro] = useState(false); const [err, setErr] = useState('');
  useEffect(() => { if (greg.stato !== 'attesa') return; setFrase(0); const t = setInterval(() => setFrase(x => (x + 1) % FRASI_ATTESA.length), 4000); return () => clearInterval(t); }, [greg.stato, greg.ts]);
  const chiudi = () => setGreg(g => g.stato === 'attesa' ? { ...g, aperto: false } : null);
  const r = greg.risposta || {};
  const residuo = n ? n.residuo : null;
  const salvaFotoDiario = async () => { const a = await ridimensiona(greg.foto, 800, 0.72); return a ? [await salvaFoto(a)] : []; };
  const salvaPiatto = async () => {
    setLavoro(true); setErr('');
    try {
      const p = r.piatto || {}; const k = x => x != null ? Math.round(x * f) : null;
      const desc = p.descrizione + (f !== 1 ? ` (porzione ${f === 0.5 ? '½' : '1½'})` : '');
      const foto = await salvaFotoDiario();
      await salvaPasto(M.oggiRoma(), [{ descrizione: desc, kcal: k(p.kcal), proteine: k(p.proteine_g), carboidrati: k(p.carboidrati_g), grassi: k(p.grassi_g), fonte: 'greg_foto' }], { foto, affidabilita: p.affidabilita || null });
      const mini = await ridimensiona(greg.foto, 240, 0.7);
      await ricordaCibo({ nome: p.descrizione, kcalPezzo: p.kcal, protPezzo: p.proteine_g ?? null, carboPezzo: p.carboidrati_g ?? null, grassiPezzo: p.grassi_g ?? null, pezzo: 'porzione', fonte: 'Greg (foto)', mini: mini ? Bytes.fromBase64String(mini.split(',')[1]) : null });
      setGreg(null); aggiorna();
    } catch (e) { setErr('Non salvato: ' + (e?.message || e)); setLavoro(false); }
  };
  const prendi = async s => {
    setLavoro(true); setErr('');
    try {
      const foto = await salvaFotoDiario();
      await salvaPasto(M.oggiRoma(), [{ descrizione: `${s.nome}${s.porzione ? ` (${s.porzione})` : ''}`, kcal: tondo(s.kcal), proteine: tondo(s.proteine_g), carboidrati: tondo(s.carboidrati_g), grassi: tondo(s.grassi_g), fonte: 'greg_consiglio' }], { foto });
      setGreg(null); aggiorna();
    } catch (e) { setErr('Non salvato: ' + (e?.message || e)); setLavoro(false); }
  };
  const rimanda = tipo => avviaGreg(setGreg, greg.foto, tipo);
  const dataDa = g => { const o = M.oggiRoma(); if (!g || g === 'oggi') return o; if (g === 'ieri') return M.addGiorni(o, -1); return /^\d{4}-\d{2}-\d{2}$/.test(g) && g <= o ? g : o; };
  const salvaAttivita = async () => {
    setLavoro(true); setErr('');
    try {
      const a = r.attivita || {}; const c = {};
      if (a.passi) c.passi = Math.round(a.passi);
      if (a.kcal_attive) c.kcalAttive = Math.round(a.kcal_attive);
      if (a.km) c.km = M.r1(a.km);
      if (a.minuti) c.minuti = Math.round(a.minuti);
      if (!Object.keys(c).length) { setErr('Nella foto non vedo numeri da salvare.'); setLavoro(false); return; }
      await aggiornaGiorno(dataDa(a.giorno), { ...c, attivitaFonte: 'foto (' + (a.fonte || 'Greg') + ')' });
      setGreg(null); aggiorna();
    } catch (e) { setErr('Non salvato: ' + (e?.message || e)); setLavoro(false); }
  };
  const salvaPeso = async () => {
    setLavoro(true); setErr('');
    try {
      const kg = Number(r.peso?.kg); if (!(kg > 40 && kg < 200)) { setErr('Non leggo il peso: scrivilo nella scheda Peso.'); setLavoro(false); return; }
      const d = M.oggiRoma();
      await setDoc(doc(db, 'pesate', d), { data: d, kg: M.r1(kg), fonte: 'foto della bilancia', ts: Date.now() });
      await M.bilancioSeTocca(d).catch(() => null);
      setGreg(null); aggiorna();
    } catch (e) { setErr('Non salvato: ' + (e?.message || e)); setLavoro(false); }
  };
  let corpo;
  if (greg.stato === 'attesa') corpo = html`<div class="attesa"><img src=${greg.foto} alt="la tua foto" /><div class="velo-attesa"><p role="status">${FRASI_ATTESA[frase]}</p><div class="barra-attesa"><div></div></div>
      ${Date.now() - greg.ts > 20000 ? html`<p class="piccolo-bianco">Ci mette più del solito…</p>` : null}</div></div>
    <p class="piccolo">Puoi chiudere: la risposta la ritrovi in Oggi.</p>`;
  else if (greg.stato === 'errore') corpo = html`<img class="foto-risposta" src=${greg.foto} alt="la tua foto" /><p class="errore" role="alert">${greg.errore}</p>
    <div class="azioni"><button class="primario" onClick=${() => rimanda(greg.tipo)}>Riprova</button><button class="secondario" onClick=${() => { setGreg(null); onCorreggi(null); }}>Scrivi a mano</button></div>`;
  else if (r.tipo === 'piatto' && r.piatto) {
    const p = r.piatto; const kcal = Math.round((p.kcal || 0) * f);
    corpo = html`<div class="risposta-piatto"><img class="foto-risposta" src=${greg.foto} alt="la tua foto" />
        <div><p class="desc-grande">${p.descrizione}</p><p class="kcal-grande">~ ${M.kcalTxt(kcal)} kcal</p><${Fiducia} a=${p.affidabilita} /></div></div>
      ${p.domanda ? html`<p class="stima bassa">${p.domanda}</p>` : null}
      <p class="piccolo">Porzione</p><${Porzioni} f=${f} setF=${setF} />
      ${residuo != null ? html`<p class="dopo">Dopo questo restano <b>${M.kcalTxt(residuo - kcal)}</b> kcal</p>` : null}
      ${r.nota ? html`<p class="nota-greg">💬 ${r.nota}</p>` : null}
      <${Errore} e=${err} />
      <div class="fondo-sheet"><button class="primario largo" disabled=${lavoro} onClick=${salvaPiatto}>${lavoro ? 'Salvo…' : 'Salva il pasto'}</button></div>
      <div class="link-riga"><button class="link" onClick=${() => { const p2 = { descrizione: p.descrizione, kcal: kcal, proteine: tondo((p.proteine_g ?? 0) * f), carboidrati: tondo((p.carboidrati_g ?? 0) * f), grassi: tondo((p.grassi_g ?? 0) * f), fonte: 'greg_foto' }; setGreg(null); onCorreggi(p2, greg.foto); }}>✏️ Correggi</button>
        <button class="link" onClick=${() => rimanda('scelta')}>Era una vetrina o un menu?</button></div>`;
  } else if (r.tipo === 'scelta' && r.scelte?.length) {
    corpo = html`<p class="piccolo">Greg consiglia${residuo != null ? html` · te ne restano <b>${M.kcalTxt(residuo)}</b>` : ''}</p>
      <ul class="scelte">${r.scelte.map((s, i) => html`<li class=${i === 0 ? 'prima' : ''}><div class="riga"><b>${s.nome}</b><span>~ ${M.kcalTxt(s.kcal || 0)}</span></div>
        ${s.porzione ? html`<p class="piccolo">${s.porzione}${residuo != null ? ` · ne restano ${M.kcalTxt(residuo - (s.kcal || 0))}` : ''}</p>` : null}
        ${s.perche ? html`<p class="perche">${s.perche}</p>` : null}
        <button class=${i === 0 ? 'primario largo' : 'secondario largo'} disabled=${lavoro} onClick=${() => prendi(s)}>Prendo questa</button></li>`)}</ul>
      ${r.evita ? html`<p class="avviso">⚠ Meglio evitare: ${r.evita}</p>` : null}
      ${r.nota ? html`<p class="nota-greg">💬 ${r.nota}</p>` : null}
      <${Errore} e=${err} />
      <div class="link-riga"><button class="link" onClick=${() => rimanda('piatto')}>Era il mio piatto?</button></div>`;
  } else if (r.tipo === 'attivita' && r.attivita) {
    const a = r.attivita; const g = dataDa(a.giorno);
    corpo = html`<div class="risposta-piatto"><img class="foto-risposta" src=${greg.foto} alt="la tua foto" />
        <div><p class="desc-grande">Attività ${g === M.oggiRoma() ? 'di oggi' : 'del ' + M.dataBreve(g)}</p><p class="piccolo">${a.fonte || ''}</p></div></div>
      <div class="tre">${a.passi ? html`<div><b>${M.kcalTxt(a.passi)}</b><span>passi</span></div>` : null}${a.kcal_attive ? html`<div><b>${M.kcalTxt(a.kcal_attive)}</b><span>kcal attive</span></div>` : null}${a.km ? html`<div><b>${String(M.r1(a.km)).replace('.', ',')}</b><span>km</span></div>` : null}${a.minuti ? html`<div><b>${a.minuti}</b><span>minuti</span></div>` : null}</div>
      ${a.kcal_macchina ? html`<p class="piccolo">Il tapis roulant segna ${M.kcalTxt(a.kcal_macchina)} kcal: non le conto, di solito sono sovrastimate e l'attività non si aggiunge al budget.</p>` : null}
      ${r.nota ? html`<p class="nota-greg">💬 ${r.nota}</p>` : null}
      <${Errore} e=${err} />
      <div class="fondo-sheet"><button class="primario largo" disabled=${lavoro} onClick=${salvaAttivita}>${lavoro ? 'Salvo…' : "Salva nell'attività"}</button></div>`;
  } else if (r.tipo === 'peso' && r.peso) {
    corpo = html`<div class="risposta-piatto"><img class="foto-risposta" src=${greg.foto} alt="la tua foto" /><div><p class="desc-grande">Pesata di oggi</p><p class="kcal-grande">${M.kgTxt(Number(r.peso.kg) || 0)} kg</p></div></div>
      <p class="piccolo">${M.giornoSettimana(M.oggiRoma()) === 'sab' ? 'È sabato: salvandola parte il bilancio della settimana.' : 'La singola pesata oscilla: conta la tendenza.'}</p>
      <${Errore} e=${err} />
      <div class="fondo-sheet"><button class="primario largo" disabled=${lavoro} onClick=${salvaPeso}>${lavoro ? 'Salvo…' : 'Salva la pesata'}</button></div>`;
  } else corpo = html`<img class="foto-risposta" src=${greg.foto} alt="la tua foto" /><p>Greg non riesce a leggere la foto: rifalla con più luce, più vicino.</p>
    ${r.nota ? html`<p class="nota-greg">💬 ${r.nota}</p>` : null}`;
  return html`<${Sheet} titolo=${greg.stato === 'attesa' ? 'Greg guarda…' : r.tipo === 'scelta' ? 'Cosa prendere' : r.tipo === 'attivita' ? 'Attività' : r.tipo === 'peso' ? 'Bilancia' : 'Il tuo piatto'} onClose=${chiudi}>${corpo}<//>`;
}

/** Scatto → foto rimpicciolita → Greg. Il tasto non può partire due volte: una richiesta alla volta. */
let gregInCorso = false;
async function avviaGreg(setGreg, foto, tipo) {
  if (gregInCorso) return; gregInCorso = true;
  const ts = Date.now();
  setGreg({ stato: 'attesa', foto, tipo, ts, aperto: true });
  try { const risposta = await chiediGreg(foto, tipo); setGreg(g => g && g.ts === ts ? { ...g, stato: 'pronta', risposta } : g); }
  catch (e) { setGreg(g => g && g.ts === ts ? { ...g, stato: 'errore', errore: 'Greg non ha risposto: ' + (e?.message || e) + '. Non hai pagato nulla se non è arrivata risposta.' } : g); }
  finally { gregInCorso = false; }
}

function BloccoFoto({ setGreg, onVoce, onCerca, tick }) {
  const [frequenti, setFrequenti] = useState([]);
  useEffect(() => { getDocs(collection(db, 'preferiti')).then(s => setFrequenti(s.docs.map(d => ({ id: d.id, ...d.data() })).filter(x => x.mini).sort((a, b) => (b.usi || 0) - (a.usi || 0)).slice(0, 6))).catch(() => {}); }, [tick]);
  const scatto = async e => {
    const file = e.target.files && e.target.files[0]; e.target.value = ''; if (!file) return;
    const foto = await rimpicciolisci(file, 1024, 0.8); if (!foto) { alert('La foto non si legge.'); return; }
    avviaGreg(setGreg, foto, '');
  };
  return html`<section class="card blocco-foto">
    <div class="tasti-foto">
      <label class="tasto-foto"><input type="file" accept="image/*" capture="environment" onChange=${scatto} /><span aria-hidden="true">📷</span> Fotografa</label>
      <label class="tasto-rullino"><input type="file" accept="image/*" onChange=${scatto} /><span aria-hidden="true">🖼</span> Rullino</label>
    </div>
    <p class="sotto-foto">piatto, vetrina, menu, screenshot dei passi o bilancia · Greg ≈ 1–2 cent</p>
    ${frequenti.length ? html`<p class="piccolo">I tuoi piatti · gratis</p><div class="fotine">${frequenti.map(x => html`<button onClick=${() => onVoce(x)}><img src=${miniUrl(x.mini)} alt="" /><span>${x.nome.length > 22 ? x.nome.slice(0, 21) + '…' : x.nome}</span><small>${M.kcalTxt(x.kcalPezzo ?? x.kcal100 ?? 0)}</small></button>`)}</div>` : null}
    <button class="link" onClick=${onCerca}>🔎 Cerca o scrivi</button>
  </section>`;
}

// Quanto ne hai mangiato: grammi (valori per 100 g), pezzi (valore per pezzo) o porzione (½ · 1 · 1½).
function Quantita({ voce, onSalva, onAltro, onAnnulla, lavoro }) {
  const porzione = voce.pezzo === 'porzione' && voce.kcalPezzo != null;
  const haPezzo = voce.kcalPezzo != null, haG = voce.kcal100 != null;
  const [unita, setUnita] = useState(haPezzo ? 'pezzi' : 'g');
  const [q, setQ] = useState(haPezzo ? '1' : String(voce.porzioneG || 100));
  const n = porzione ? null : (numIt(q) || 0);
  const [fp, setFp] = useState(1);
  const fatt = porzione ? fp : n;
  const per = (v100, vPz) => porzione ? (vPz != null ? vPz * fp : null) : unita === 'g' ? (v100 != null ? v100 * n / 100 : null) : (vPz != null ? vPz * n : null);
  const kcal = per(voce.kcal100, voce.kcalPezzo) || 0;
  const voceFinale = () => ({ descrizione: porzione ? voce.nome + (fp !== 1 ? ` (porzione ${fp === 0.5 ? '½' : '1½'})` : '') : unita === 'g' ? `${voce.nome} ${String(q).replace('.', ',')} g` : `${voce.nome} ${String(q).replace('.', ',')} × ${voce.pezzo || 'pz'}`,
    kcal: Math.round(kcal), proteine: tondo(per(voce.prot100, voce.protPezzo)), carboidrati: tondo(per(voce.carbo100, voce.carboPezzo)), grassi: tondo(per(voce.grassi100, voce.grassiPezzo)),
    fonte: voce.id ? 'miei' : 'banca_dati', _voce: voce });
  return html`<div class="quantita">
    ${voce.mini ? html`<img class="foto-risposta" src=${miniUrl(voce.mini)} alt="" />` : null}
    <p><b>${voce.nome}</b><br/><small>${haG ? `${M.kcalTxt(voce.kcal100)} kcal/100 g` : ''}${haG && haPezzo ? ' · ' : ''}${haPezzo ? `${M.kcalTxt(voce.kcalPezzo)} kcal per ${voce.pezzo || 'pezzo'}` : ''}</small></p>
    ${porzione ? html`<${Porzioni} f=${fp} setF=${setFp} />` : html`<div class="azioni"><input inputmode="decimal" value=${q} onInput=${e => setQ(e.target.value)} aria-label="Quantità" />
      ${haG && haPezzo ? html`<button class="secondario" onClick=${() => { setUnita(unita === 'g' ? 'pezzi' : 'g'); setQ(unita === 'g' ? '1' : '100'); }}>${unita === 'g' ? 'grammi' : (voce.pezzo || 'pezzi')} ⇄</button>` : html`<span class="unita">${unita === 'g' ? 'grammi' : (voce.pezzo || 'pezzi')}</span>`}</div>`}
    <p class="grande-medio">= ${M.kcalTxt(kcal)} kcal</p>
    <div class="fondo-sheet"><button class="primario largo" disabled=${!fatt || lavoro} onClick=${() => onSalva(voceFinale())}>${lavoro ? 'Salvo…' : 'Salva il pasto'}</button></div>
    <div class="link-riga">${onAltro ? html`<button class="link" disabled=${!fatt} onClick=${() => onAltro(voceFinale())}>+ aggiungi altro al pasto</button>` : null}<button class="link" onClick=${onAnnulla}>Indietro</button></div>
  </div>`;
}

/** Cerca o scrivi: un solo campo. Prima i tuoi cibi (subito, mentre scrivi), poi le etichette (Open Food Facts). */
function PastoSheet({ pasto, data, onClose, aggiorna, iniziale, fotoIniziale }) {
  const nuovo = !pasto;
  const [modo, setModo] = useState(iniziale ? 'mano' : nuovo ? 'cerca' : 'modifica'); // cerca · mano · gemini · modifica
  const [q, setQ] = useState(''); const [miei, setMiei] = useState([]); const [off, setOff] = useState(null); const [cercando, setCercando] = useState(false);
  const [scelta, setScelta] = useState(null); const [voci, setVoci] = useState([]);
  const [f, setF] = useState(() => { const b = pasto || iniziale; return b ? { descrizione: b.descrizione || '', kcal: String(b.kcal ?? ''), proteine: String(b.proteine ?? ''), carboidrati: String(b.carboidrati ?? ''), grassi: String(b.grassi ?? ''), ora: pasto?.ora || M.oraRoma(), fonte: b.fonte || 'a_mano', sgarro: pasto?.aderenza === 'sgarro' }
    : { descrizione: '', kcal: '', proteine: '', carboidrati: '', grassi: '', ora: M.oraRoma(), fonte: 'a_mano', sgarro: false }; });
  const [salvaMiei, setSalvaMiei] = useState(false);
  const [lavoro, setLavoro] = useState(false); const [err, setErr] = useState('');
  const [archivio, setArchivio] = useState([]); const [gT, setGT] = useState('');
  useEffect(() => { if (pasto?.foto?.length) Promise.all(pasto.foto.map(fotoUrl)).then(v => setArchivio(v.filter(Boolean))); }, []);
  useEffect(() => { if (nuovo) getDocs(collection(db, 'preferiti')).then(s => setMiei(s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.usi || 0) - (a.usi || 0) || a.nome.localeCompare(b.nome)))); }, []);
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  const filtro = q.trim().toLowerCase(); const mieiVisti = filtro ? miei.filter(x => x.nome.toLowerCase().includes(filtro)) : miei.slice(0, 8);
  const cercaEtichette = async e => { e?.preventDefault(); if (q.trim().length < 2) return; setCercando(true); setErr('');
    try { setOff(await offCerca(q)); } catch { setErr('Ricerca non riuscita: controlla la connessione.'); } setCercando(false); };
  const ricorda = async v => { const x = v._voce; if (!x) return; if (x.id) await setDoc(doc(db, 'preferiti', x.id), { usi: (x.usi || 0) + 1 }, { merge: true }); else await ricordaCibo({ nome: x.nome, kcal100: x.kcal100, prot100: x.prot100, carbo100: x.carbo100, grassi100: x.grassi100, porzioneG: x.porzioneG, codice: x.codice, fonte: x.fonte }); };
  const salvaVoci = async tutte => {
    setLavoro(true); setErr('');
    try { for (const v of tutte) await ricorda(v); await salvaPasto(data, tutte.map(({ _voce, ...r }) => r)); aggiorna(); onClose(); }
    catch (x) { setErr('Non salvato: ' + (x?.message || x)); setLavoro(false); }
  };
  const salvaModulo = async () => {
    const kcal = numIt(f.kcal); if (kcal == null || kcal < 0 || kcal > 6000) { setErr('Scrivi le kcal (un numero).'); return; }
    if (!f.descrizione.trim()) { setErr('Scrivi cosa hai mangiato.'); return; }
    setLavoro(true); setErr('');
    try {
      const n = k => numIt(f[k]) != null ? Math.round(numIt(f[k])) : null;
      const campi = { descrizione: f.descrizione.trim().slice(0, 300), kcal: Math.round(kcal), proteine: n('proteine'), carboidrati: n('carboidrati'), grassi: n('grassi'), ora: f.ora || M.oraRoma(), fonte: f.fonte || 'a_mano', aderenza: f.sgarro ? 'sgarro' : 'piano' };
      if (modo === 'modifica') await updateDoc(doc(db, 'pasti', pasto.id), campi);
      else {
        const foto = fotoIniziale ? [await salvaFoto(await ridimensiona(fotoIniziale, 800, 0.72))] : [];
        await chiudiDigiunoSeServe(data);
        await addDoc(collection(db, 'pasti'), { data, ...campi, foto, ts: Date.now(), origine: 'fasttrack' });
        if (salvaMiei) await ricordaCibo({ nome: campi.descrizione, kcalPezzo: campi.kcal, protPezzo: campi.proteine, carboPezzo: campi.carboidrati, grassiPezzo: campi.grassi, pezzo: 'porzione', fonte: 'a mano' });
      }
      aggiorna(); onClose();
    } catch (x) { setErr('Non salvato: ' + (x?.message || x)); setLavoro(false); }
  };
  const elimina = async () => { if (!confirm('Eliminare questo pasto?')) return; await deleteDoc(doc(db, 'pasti', pasto.id)); for (const id of pasto.foto || []) await deleteDoc(doc(db, 'foto', id)).catch(() => {}); aggiorna(); onClose(); };
  const apriGemini = () => { try { navigator.clipboard.writeText(DOMANDA_GEMINI); } catch {} window.open('https://gemini.google.com/app', '_blank'); };
  const leggiG = () => { const r = leggiGemini(gT); if (!r) { setErr('Non trovo le kcal: incolla la riga che inizia con FASTTRACK.'); return; } setErr(''); setF(x => ({ ...x, descrizione: r.descrizione, kcal: String(r.kcal), proteine: r.proteine != null ? String(r.proteine) : '', carboidrati: r.carboidrati != null ? String(r.carboidrati) : '', grassi: r.grassi != null ? String(r.grassi) : '', fonte: 'gemini_app' })); setModo('mano'); };
  const voceRiga = (x, extra) => html`<li><button onClick=${() => setScelta(x)}>${x.mini ? html`<img class="mini-riga" src=${miniUrl(x.mini)} alt="" />` : null}<span>${x.nome}</span><small>${x.kcalPezzo != null ? `${M.kcalTxt(x.kcalPezzo)} kcal/${x.pezzo || 'pz'}` : `${M.kcalTxt(x.kcal100)} kcal/100 g`}</small></button>${extra || null}</li>`;
  const togli = async (e, x) => { e.stopPropagation(); if (confirm(`Togliere «${x.nome}» dai tuoi cibi?`)) { await deleteDoc(doc(db, 'preferiti', x.id)); setMiei(m => m.filter(y => y.id !== x.id)); } };

  const modulo = html`
    <${Campo} etichetta="Cosa"><textarea rows="3" value=${f.descrizione} onInput=${e => set('descrizione', e.target.value)}></textarea><//>
    <div class="griglia">
      <${Campo} etichetta="kcal"><input inputmode="numeric" value=${f.kcal} onInput=${e => set('kcal', e.target.value)} /><//>
      <${Campo} etichetta="Ora"><input type="time" value=${f.ora} onInput=${e => set('ora', e.target.value)} /><//>
      <${Campo} etichetta="Proteine g"><input inputmode="decimal" value=${f.proteine} onInput=${e => set('proteine', e.target.value)} /><//>
      <${Campo} etichetta="Carboidrati g"><input inputmode="decimal" value=${f.carboidrati} onInput=${e => set('carboidrati', e.target.value)} /><//>
    </div>
    <label class="spunta"><input type="checkbox" checked=${f.sgarro} onChange=${e => set('sgarro', e.target.checked)} /> È uno sgarro</label>
    ${modo === 'mano' ? html`<label class="spunta"><input type="checkbox" checked=${salvaMiei} onChange=${e => setSalvaMiei(e.target.checked)} /> ⭐ Ricordalo tra i miei piatti</label>` : null}
    <${Errore} e=${err} />
    <div class="fondo-sheet"><button class="primario largo" disabled=${lavoro} onClick=${salvaModulo}>${lavoro ? 'Salvo…' : 'Salva il pasto'}</button></div>`;

  let corpo;
  if (modo === 'modifica') corpo = html`${archivio.length ? html`<div class="foto-riga">${archivio.map(u => html`<div class="mini"><img src=${u} alt="foto del pasto" /></div>`)}</div>` : null}${modulo}<button class="link rosso" onClick=${elimina}>Elimina il pasto</button>`;
  else if (modo === 'mano') corpo = html`${fotoIniziale ? html`<img class="foto-risposta" src=${fotoIniziale} alt="" />` : null}${modulo}${!iniziale ? html`<button class="link" onClick=${() => setModo('cerca')}>‹ Torna a cerca</button>` : null}`;
  else if (modo === 'gemini') corpo = html`<ol class="passi"><li><button class="primario" onClick=${apriGemini}>📋 Copia la domanda e apri Gemini</button></li><li>In Gemini allega la foto, incolla e invia.</li><li>Copia la riga di risposta e incollala qui:</li></ol>
    <textarea rows="3" value=${gT} onInput=${e => setGT(e.target.value)} placeholder="FASTTRACK | descrizione: … | kcal: …" aria-label="Risposta di Gemini"></textarea>
    <div class="azioni"><button class="secondario" onClick=${async () => { try { setGT(await navigator.clipboard.readText()); } catch { setErr('Tieni premuto nel riquadro e scegli «Incolla».'); } }}>Incolla</button><button class="primario" disabled=${!gT.trim()} onClick=${leggiG}>Leggi la risposta</button></div>
    <${Errore} e=${err} /><button class="link" onClick=${() => setModo('cerca')}>‹ Torna a cerca</button>`;
  else if (scelta) corpo = html`<${Quantita} voce=${scelta} lavoro=${lavoro} onSalva=${v => salvaVoci([...voci, v])} onAltro=${v => { setVoci(x => [...x, v]); setScelta(null); setQ(''); setOff(null); }} onAnnulla=${() => setScelta(null)} /><${Errore} e=${err} />`;
  else corpo = html`
    ${voci.length ? html`<div class="nel-pasto"><p><b>Nel pasto:</b> ${voci.map(v => v.descrizione).join(' + ')} · <b>${M.kcalTxt(voci.reduce((s, v) => s + v.kcal, 0))} kcal</b></p>
      <button class="primario largo" disabled=${lavoro} onClick=${() => salvaVoci(voci)}>${lavoro ? 'Salvo…' : 'Salva il pasto'}</button></div>` : null}
    <form class="azioni" onSubmit=${cercaEtichette}><input type="search" inputmode="search" placeholder="Cosa hai mangiato? (o codice a barre)" value=${q} onInput=${e => { setQ(e.target.value); setOff(null); }} aria-label="Cerca un cibo" /></form>
    ${mieiVisti.length ? html`<p class="piccolo">${filtro ? 'Tra i tuoi' : 'I tuoi più usati'}</p><ul class="voci">${mieiVisti.map(x => voceRiga(x, html`<button class="x-piccola" aria-label="Togli ${x.nome}" onClick=${e => togli(e, x)}>×</button>`))}</ul>` : null}
    ${filtro.length >= 2 ? (off ? (off.length ? html`<p class="piccolo">Dalle etichette (Open Food Facts)</p><ul class="voci">${off.map(x => voceRiga(x))}</ul>` : html`<p class="piccolo">Nelle etichette non c'è.</p>`)
      : html`<button class="secondario largo" disabled=${cercando} onClick=${cercaEtichette}>${cercando ? 'Cerco…' : `🔎 Cerca «${q.trim()}» nelle etichette`}</button>`) : null}
    <${Errore} e=${err} />
    <div class="link-riga"><button class="link" onClick=${() => { setF(x => ({ ...x, descrizione: x.descrizione || q })); setModo('mano'); }}>✍️ Scrivi tu le kcal</button><button class="link" onClick=${() => setModo('gemini')}>Gratis, via Gemini</button></div>`;
  return html`<${Sheet} titolo=${modo === 'modifica' ? 'Modifica pasto' : 'Cosa hai mangiato?'} onClose=${onClose}>${corpo}<//>`;
}

function AttivitaSheet({ data, g, onClose, aggiorna }) {
  const [v, setV] = useState({ passi: g?.passi ?? '', kcalAttive: g?.kcalAttive ?? '', km: g?.km ?? '', minuti: g?.minuti ?? '' });
  const salva = async () => {
    const c = {}; for (const k of ['passi', 'kcalAttive', 'km', 'minuti']) { const n = numIt(v[k]); if (n != null) c[k] = k === 'km' ? M.r1(n) : Math.round(n); }
    await aggiornaGiorno(data, { ...c, attivitaFonte: 'Fast Track (a mano)' }); aggiorna(); onClose();
  };
  return html`<${Sheet} titolo="Attività di oggi" onClose=${onClose}>
    <p class="piccolo">Di solito arrivano da sole la sera col Comando rapido. Qui puoi scriverle o correggerle.</p>
    <div class="griglia">
      <${Campo} etichetta="Passi"><input inputmode="numeric" value=${v.passi} onInput=${e => setV({ ...v, passi: e.target.value })} /><//>
      <${Campo} etichetta="kcal attive"><input inputmode="numeric" value=${v.kcalAttive} onInput=${e => setV({ ...v, kcalAttive: e.target.value })} /><//>
      <${Campo} etichetta="km"><input inputmode="decimal" value=${v.km} onInput=${e => setV({ ...v, km: e.target.value })} /><//>
      <${Campo} etichetta="Minuti tapis roulant / camminata"><input inputmode="numeric" value=${v.minuti} onInput=${e => setV({ ...v, minuti: e.target.value })} /><//>
    </div>
    <button class="primario largo" onClick=${salva}>Salva</button><//>`;
}

function Oggi({ tick, aggiorna, greg, setGreg }) {
  const data = M.oggiRoma();
  const [n0, setN] = useState(null); const [dig, setDig] = useState(null); const [s, setS] = useState(null); const [err, setErr] = useState('');
  const [sheet, setSheet] = useState(null);
  useEffect(() => { (async () => {
    try {
      const [a, b, c] = await Promise.all([M.numeri(data), M.statoDigiuno(), M.sfida(data)]);
      if (await digiunoDelMattino(b, a.pasti)) { aggiorna(); return; }
      setN(a); setDig(b); setS(c); setErr('');
    } catch (e) { setErr('Dati non raggiungibili: ' + (e?.message || e)); }
  })(); }, [tick]);
  if (err) return html`<${Errore} e=${err} />`;
  if (!n0) return html`<p class="caricamento">Carico…</p>`;
  // UN NUMERO SOLO: se c'è un recupero in corso, l'obiettivo di oggi è già ridotto (mai sotto il basale)
  const ob = s?.recupero ? s.recupero.obiettivoGiorno : n0.obiettivo;
  const n = { ...n0, obiettivoBase: n0.obiettivo, obiettivo: ob, residuo: ob - n0.mangiato, recuperoOggi: n0.obiettivo - ob };
  const ieri = s?.pallini.find(x => x.data === M.addGiorni(data, -1));
  const consigli = M.consigli(n, dig);
  if (ieri && ieri.stato === 'vuoto' && ieri.kcal > 0) consigli.unshift({ tipo: 'allarme', testo: `Ieri risultano solo ${M.kcalTxt(ieri.kcal)} kcal: manca un pasto? Aggiungilo da Diario, sennò la giornata non conta.` });
  const g = n.giorno || {};
  const acqua = async () => { await aggiornaGiorno(data, { acquaL: M.r1((g.acquaL || 0) + 0.25) }); aggiorna(); };
  const salvaVoceRapida = async v => { setSheet({ tipo: 'salvo' }); await setDoc(doc(db, 'preferiti', v._voce.id), { usi: (v._voce.usi || 0) + 1 }, { merge: true }); const { _voce, ...r } = v; await salvaPasto(data, [r]); setSheet(null); aggiorna(); };
  return html`
    <${Budget} n=${n} s=${s} onSfida=${() => setSheet({ tipo: 'sfida' })} />
    ${greg && !greg.aperto ? html`<button class="banner-greg" onClick=${() => setGreg(x => ({ ...x, aperto: true }))}>${greg.stato === 'attesa' ? '📷 Greg sta guardando la foto…' : '📷 Greg ha risposto · apri'}</button>` : null}
    <${BloccoFoto} setGreg=${setGreg} tick=${tick} onVoce=${x => setSheet({ tipo: 'voce', voce: x })} onCerca=${() => setSheet({ tipo: 'pasto' })} />
    <${Consiglio} lista=${consigli} />
    <section class="card"><h3>Pasti di oggi</h3>
      ${n.pasti.length ? html`<ul class="pasti">${n.pasti.map(p => html`<li><button onClick=${() => setSheet({ tipo: 'pasto', pasto: p })}>
          <span class="ora">${p.ora || ''}</span><span class="desc">${p.descrizione}${p.foto?.length ? ' 📷' : ''}${p.aderenza === 'sgarro' ? html` <em class="sgarro">sgarro</em>` : ''}</span><b>${M.kcalTxt(p.kcal)}</b></button></li>`)}</ul>`
        : html`<p class="piccolo">Ancora nessun pasto: fotografa o tocca un tuo piatto qui sopra.</p>`}
    </section>
    <${Digiuno} stato=${dig} aggiorna=${aggiorna} />
    <section class="card"><div class="riga"><h3>Attività</h3><button class="link" onClick=${() => setSheet({ tipo: 'attivita' })}>Modifica</button></div>
      <div class="tre"><div><b>${g.passi != null ? M.kcalTxt(g.passi) : '—'}</b><span>passi</span></div><div><b>${g.kcalAttive != null ? M.kcalTxt(g.kcalAttive) : '—'}</b><span>kcal attive</span></div><div><b>${g.acquaL != null ? String(g.acquaL).replace('.', ',') : '0'} L</b><span>acqua</span></div></div>
      <div class="azioni"><button class="secondario" onClick=${acqua}>💧 + 0,25 L</button></div>
    </section>
    ${greg && greg.aperto ? html`<${GregSheet} greg=${greg} setGreg=${setGreg} n=${n} aggiorna=${aggiorna} onCorreggi=${(v, foto) => setSheet({ tipo: 'pasto', iniziale: v || { descrizione: '', kcal: '', fonte: 'a_mano' }, foto })} />` : null}
    ${sheet?.tipo === 'voce' ? html`<${Sheet} titolo="Il tuo piatto" onClose=${() => setSheet(null)}><${Quantita} voce=${sheet.voce} onSalva=${salvaVoceRapida} onAnnulla=${() => setSheet(null)} /><//>` : null}
    ${sheet?.tipo === 'salvo' ? html`<p class="caricamento">Salvo…</p>` : null}
    ${sheet?.tipo === 'pasto' ? html`<${PastoSheet} pasto=${sheet.pasto} iniziale=${sheet.iniziale} fotoIniziale=${sheet.foto} data=${data} onClose=${() => setSheet(null)} aggiorna=${aggiorna} />` : null}
    ${sheet?.tipo === 'attivita' ? html`<${AttivitaSheet} data=${data} g=${n.giorno} onClose=${() => setSheet(null)} aggiorna=${aggiorna} />` : null}
    ${sheet?.tipo === 'sfida' && s ? html`<${SfidaSheet} s=${s} onClose=${() => setSheet(null)} />` : null}`;
}

// ---------- DIARIO ----------
function GiornoSheet({ data, onClose, aggiorna }) {
  const [pasti, setPasti] = useState(null); const [mod, setMod] = useState(null);
  const carica = () => M.pastiDel(data).then(setPasti);
  useEffect(() => { carica(); }, []);
  return html`<${Sheet} titolo=${M.dataBreve(data)} onClose=${onClose}>
    ${!pasti ? html`<p class="caricamento">Carico…</p>` : pasti.length ? html`<ul class="pasti">${pasti.map(p => html`<li><button onClick=${() => setMod(p)}><span class="ora">${p.ora || ''}</span><span class="desc">${p.descrizione}</span><b>${M.kcalTxt(p.kcal)}</b></button></li>`)}</ul>` : html`<p class="piccolo">Nessun pasto.</p>`}
    <button class="secondario largo" onClick=${() => setMod('nuovo')}>+ Aggiungi un pasto a questo giorno</button>
    ${mod ? html`<${PastoSheet} pasto=${mod === 'nuovo' ? null : mod} data=${data} onClose=${() => setMod(null)} aggiorna=${() => { carica(); aggiorna(); }} />` : null}
  <//>`;
}

function Diario({ tick, aggiorna }) {
  const [righe, setRighe] = useState(null); const [n, setN] = useState(null); const [aperto, setAperto] = useState(null);
  useEffect(() => { Promise.all([M.diario(M.oggiRoma(), 14), M.numeri()]).then(([d, x]) => { setRighe(d.reverse()); setN(x); }); }, [tick]);
  if (!righe) return html`<p class="caricamento">Carico…</p>`;
  const conta = r => M.giornoConta(r, M.oggiRoma(), n.basale.valore);
  const chiusi7 = righe.slice(0, 8).filter(conta).slice(0, 7);
  const media = chiusi7.length ? chiusi7.reduce((s, r) => s + r.kcal, 0) / chiusi7.length : null;
  let serie = 0; for (const r of righe) { if (r.data >= M.oggiRoma()) continue; if (conta(r) && r.kcal <= n.obiettivo) serie++; else break; }
  return html`
    <section class="card"><div class="tre">
      <div><b>${media != null ? M.kcalTxt(media) : '—'}</b><span>media kcal (ultimi giorni registrati)</span></div>
      <div><b>${chiusi7.length}/7</b><span>giornate registrate</span></div>
      <div><b>${serie}</b><span>di fila nel budget</span></div></div></section>
    <ul class="diario">${righe.map(r => {
      const pct = Math.min(100, r.kcal / n.obiettivo * 100); const sopra = r.kcal > n.obiettivo;
      return html`<li><button onClick=${() => setAperto(r.data)}>
        <span class="giorno">${M.dataBreve(r.data)}</span>
        <span class="mini-barra ${sopra ? 'rossa' : ''}"><span style=${`width:${pct}%`}></span></span>
        <span class="kcal">${r.kcal ? M.kcalTxt(r.kcal) : '—'}</span>
        <span class="extra">${r.passi != null ? `${M.kcalTxt(r.passi)} passi` : ''}${r.pesata ? ` · ${M.kgTxt(r.pesata)} kg` : ''}${r.soloStorico ? ' · stima Gemini' : ''}</span></button></li>`;
    })}</ul>
    ${aperto ? html`<${GiornoSheet} data=${aperto} onClose=${() => setAperto(null)} aggiorna=${aggiorna} />` : null}`;
}

// ---------- PESO ----------
function Grafico({ serie }) {
  if (serie.length < 2) return html`<p class="piccolo">Il grafico compare dalla seconda pesata.</p>`;
  const W = 340, H = 160, P = 24;
  const kg = serie.flatMap(s => [s.kg, s.tendenza]); const min = Math.floor(Math.min(...kg) - 0.5), max = Math.ceil(Math.max(...kg) + 0.5);
  const t0 = Date.parse(serie[0].data), t1 = Date.parse(serie[serie.length - 1].data) || t0 + 1;
  const x = d => P + (Date.parse(d) - t0) / Math.max(1, t1 - t0) * (W - 2 * P);
  const y = v => H - P - (v - min) / Math.max(0.1, max - min) * (H - 2 * P);
  const linea = serie.map((s, i) => `${i ? 'L' : 'M'}${x(s.data).toFixed(1)},${y(s.tendenza).toFixed(1)}`).join(' ');
  return html`<svg class="grafico" viewBox="0 0 ${W} ${H}" role="img" aria-label="Andamento del peso: punti = pesate, linea = tendenza">
    <text x="2" y=${y(max) + 4} class="asse">${max}</text><text x="2" y=${y(min) + 4} class="asse">${min}</text>
    <line x1=${P} x2=${W - P} y1=${y(max)} y2=${y(max)} class="griglia-l" /><line x1=${P} x2=${W - P} y1=${y(min)} y2=${y(min)} class="griglia-l" />
    <path d=${linea} class="tendenza" />
    ${serie.map(s => html`<circle cx=${x(s.data)} cy=${y(s.kg)} r="3.5" class="punto"><title>${M.dataBreve(s.data)}: ${M.kgTxt(s.kg)} kg</title></circle>`)}
  </svg>`;
}

function Peso({ tick, aggiorna }) {
  const [lista, setLista] = useState(null); const [kg, setKg] = useState(''); const [err, setErr] = useState('');
  const [bil, setBil] = useState(null); const [ultima, setUltima] = useState(null); const [lavoro, setLavoro] = useState(false);
  const [prof, setProf] = useState(null);
  useEffect(() => {
    M.pesate(M.addGiorni(M.oggiRoma(), -90), M.oggiRoma()).then(setLista);
    M.leggiProfilo().then(setProf);
    getDocs(query(collection(db, 'settimane'), where('data', '>=', M.addGiorni(M.oggiRoma(), -14)))).then(s => { const v = s.docs.map(d => d.data()).sort((a, b) => b.data.localeCompare(a.data)); setUltima(v[0] || null); });
  }, [tick]);
  const salva = async () => {
    const v = numIt(kg); if (v == null || v < 40 || v > 200) { setErr('Scrivi il peso in kg, es. 86,4'); return; }
    await setDoc(doc(db, 'pesate', M.oggiRoma()), { data: M.oggiRoma(), kg: M.r1(v), fonte: 'Fast Track', ts: Date.now() }); setKg(''); setErr('');
    setLavoro(true); try { const b = await M.bilancioSeTocca(M.oggiRoma()); if (b) setBil(b); } catch (e) { setErr('Bilancio non riuscito: ' + (e?.message || e)); } setLavoro(false);
    aggiorna();
  };
  const sabato = M.giornoSettimana(M.oggiRoma()) === 'sab';
  if (!lista) return html`<p class="caricamento">Carico…</p>`;
  const serie = M.serieTendenza(lista);
  const ult = serie[serie.length - 1];
  return html`
    <section class="card"><h3>Pesata di oggi</h3>
      <div class="azioni"><input inputmode="decimal" placeholder="kg, es. 86,4" value=${kg} onInput=${e => setKg(e.target.value)} aria-label="Peso in kg" /><button class="primario" onClick=${salva}>Salva</button></div>
      <${Errore} e=${err} />
      ${ult ? html`<p class="piccolo">Ultima: ${M.kgTxt(ult.kg)} kg (${M.dataBreve(ult.data)}) · tendenza <b>${M.kgTxt(ult.tendenza)} kg</b>. La singola pesata oscilla di ±1 kg: conta la tendenza.</p>` : null}
      ${prof?.obiettivoPesoSettimana ? html`<p class="piccolo">Obiettivo per sabato: <b>${M.kgTxt(prof.obiettivoPesoSettimana)} kg</b> di tendenza.</p>` : null}
    </section>
    <section class="card"><h3>Ultimi 90 giorni</h3><${Grafico} serie=${serie} /><p class="legenda"><span class="l-punto"></span> pesate <span class="l-linea"></span> tendenza (media di 7 giorni)</p></section>
    <section class="card ${sabato ? 'evidenza' : ''}"><h3>Bilancio della settimana</h3>
      ${lavoro ? html`<p class="piccolo">Faccio il bilancio…</p>` : null}
      ${bil ? html`<ul class="conti">
        ${bil.sfida?.obiettivo ? html`<li>${bil.sfida.presa ? '✓ Obiettivo preso' : 'Obiettivo non preso'}: ${bil.sfida.arrivato ? M.kgTxt(bil.sfida.arrivato) : '—'} kg su ${M.kgTxt(bil.sfida.obiettivo)} · salvadanaio ${bil.sfida.salvadanaio > 0 ? '+' : ''}${M.kcalTxt(bil.sfida.salvadanaio)}</li>` : null}
        <li>Settimana ${bil.periodo}: ${bil.giorniCompleti} giornate registrate</li>
        ${bil.calcolo ? html`<li>Mangiato in media <b>${M.kcalTxt(bil.calcolo.mediaMangiato)}</b> kcal · tendenza ${bil.calcolo.caloKg >= 0 ? '−' : '+'}${M.kgTxt(Math.abs(bil.calcolo.caloKg))} kg · deficit reale <b>${M.kcalTxt(bil.calcolo.deficitRealeGiorno)}</b> kcal al giorno</li>` : html`<li>${bil.nonRitarato}</li>`}
        <li>Fabbisogno: <b>${M.kcalTxt(bil.fabbisognoNuovo || bil.fabbisogno)}</b> kcal (prima ${M.kcalTxt(bil.fabbisognoPrima)})</li>
        <li>Obiettivo della nuova settimana: <b>${M.kcalTxt(bil.obiettivo || bil.obiettivoKcal)}</b> kcal al giorno (basale ${M.kcalTxt(bil.basale.valore)})</li>
        ${bil.pesoObiettivo ? html`<li>Peso obiettivo per sabato prossimo: <b>${M.kgTxt(bil.pesoObiettivo)} kg</b> di tendenza</li>` : null}</ul>`
      : ultima ? html`<p class="piccolo">Ultimo bilancio ${M.dataBreve(ultima.data)}: obiettivo ${M.kcalTxt(ultima.obiettivoKcal)} kcal${ultima.pesoObiettivo ? `, sabato ${M.kgTxt(ultima.pesoObiettivo)} kg` : ''}.</p>`
      : html`<p class="piccolo">Parte da solo quando salvi la pesata del sabato (o della domenica, se il sabato salti).</p>`}
    </section>
    <section class="card"><h3>Pesate</h3><ul class="semplice">${[...lista].reverse().slice(0, 20).map(p => html`<li><span>${M.dataBreve(p.data)}</span><b>${M.kgTxt(p.kg)} kg</b><small>${p.fonte || ''}</small></li>`)}</ul></section>`;
}

// ---------- ALTRO ----------
function Altro({ tick, aggiorna }) {
  const [p, setP] = useState(null); const [msg, setMsg] = useState('');
  const vecchi = (() => { try { return JSON.parse(localStorage.getItem('fastTrackData') || 'null'); } catch { return null; } })();
  let importato = false; try { importato = localStorage.getItem('ft2_importato') === '1'; } catch {}
  useEffect(() => { M.leggiProfilo().then(setP); }, [tick]);
  if (!p) return html`<p class="caricamento">Carico…</p>`;
  const salva = async () => {
    const c = { deficit: Math.round(numIt(p.deficit) ?? 500), altezzaCm: Math.round(numIt(p.altezzaCm) ?? 178), annoNascita: Math.round(numIt(p.annoNascita) ?? 1963), finestra: String(p.finestra || '') };
    if (c.deficit < 0 || c.deficit > 1000) { setMsg('Il deficit va tra 0 e 1.000 kcal.'); return; }
    await M.salvaProfilo(c); setMsg('Salvato.'); aggiorna();
  };
  const importa = async () => {
    let w = 0, d = 0;
    for (const x of vecchi?.weightHistory || []) {
      if (!x?.date || !x?.weight) continue;
      const ref = doc(db, 'pesate', x.date); if ((await getDoc(ref)).exists()) continue;
      await setDoc(ref, { data: x.date, kg: M.r1(Number(x.weight)), fonte: 'vecchia Fast Track', ts: Date.now() }); w++;
    }
    for (const x of vecchi?.fastingHistory || []) {
      if (!x?.date) continue;
      await addDoc(collection(db, 'digiuni'), { data: x.date, ore: M.r1((Number(x.duration) || 0) / 3600000), completato: !!x.completed, fonte: 'vecchia Fast Track' }); d++;
    }
    try { localStorage.setItem('ft2_importato', '1'); } catch {}
    setMsg(`Importate ${w} pesate e ${d} digiuni dalla vecchia Fast Track.`); aggiorna();
  };
  return html`
    <section class="card"><h3>I numeri</h3>
      <p class="piccolo">Fabbisogno: <b>${p.fabbisogno ? M.kcalTxt(p.fabbisogno) + ' kcal' : 'stima di partenza (basale × 1,375)'}</b>${p.fabbisognoFonte ? html`<br/>${p.fabbisognoFonte}` : ''}</p>
      <div class="griglia">
        <${Campo} etichetta="Deficit al giorno (kcal)"><input inputmode="numeric" value=${p.deficit} onInput=${e => setP({ ...p, deficit: e.target.value })} /><//>
        <${Campo} etichetta="Finestra 16/8"><input value=${p.finestra} onInput=${e => setP({ ...p, finestra: e.target.value })} /><//>
        <${Campo} etichetta="Altezza (cm)"><input inputmode="numeric" value=${p.altezzaCm} onInput=${e => setP({ ...p, altezzaCm: e.target.value })} /><//>
        <${Campo} etichetta="Anno di nascita"><input inputmode="numeric" value=${p.annoNascita} onInput=${e => setP({ ...p, annoNascita: e.target.value })} /><//>
      </div>
      <button class="primario largo" onClick=${salva}>Salva</button>
      ${msg ? html`<p class="piccolo" role="status">${msg}</p>` : null}
    </section>
    ${vecchi && !importato ? html`<section class="card evidenza"><h3>Dati della vecchia Fast Track</h3>
      <p class="piccolo">Su questo telefono ci sono ${(vecchi.weightHistory || []).length} pesate e ${(vecchi.fastingHistory || []).length} digiuni completati della versione precedente.</p>
      <button class="secondario largo" onClick=${importa}>Importali nel database</button></section>` : null}
    <section class="card"><h3>Come funziona</h3><ul class="conti">
      <li><b>📷 Fotografa</b>: piatto, vetrina o menu vanno a <b>Greg</b> (circa 1–2 centesimi a foto). Il piatto stimato resta tra i tuoi con la fotina: la volta dopo lo tocchi e non paghi.</li>
      <li><b>🔎 Cerca o scrivi</b> è gratis: prima i tuoi cibi, poi le <b>etichette</b> (Open Food Facts, per nome o codice a barre). C'è anche Gemini incollato, gratuito.</li>
      <li>Tutti i conti li fa il codice: obiettivo mai sotto il basale, l'attività non si somma al budget, ritaratura il sabato sul calo reale.</li>
      <li>Passi e calorie attive arrivano la sera col Comando rapido dell'iPhone.</li>
      <li>Per una verifica completa chiedi a <b>Greg</b> in AZienda: legge questo stesso diario.</li></ul></section>
    <button class="secondario largo" onClick=${() => signOut(auth)}>Esci</button>
    <p class="versione">Fast Track ${VERSIONE}</p>`;
}

// ---------- 💬 GREG: il tutor, dentro Fast Track (stessa chat di AZienda; i dati clinici restano sul Mac) ----------
const URL_CHAT_GREG = URL_GREG.replace('/foto', '/greg');
function mdLite(t) {
  const e = String(t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const righe = e.split('\n'); let out = '', lista = false;
  for (const r of righe) {
    const x = r.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|\s)\*(\S[^*]*?)\*(?=\s|$)/g, '$1<i>$2</i>');
    if (/^\s*[-•]\s+/.test(r)) { if (!lista) { out += '<ul>'; lista = true; } out += '<li>' + x.replace(/^\s*[-•]\s+/, '') + '</li>'; }
    else { if (lista) { out += '</ul>'; lista = false; } if (/^#{1,4}\s/.test(r)) out += '<p><b>' + x.replace(/^#+\s/, '') + '</b></p>'; else if (r.trim()) out += '<p>' + x + '</p>'; }
  }
  return out + (lista ? '</ul>' : '');
}
function GregChat({ onClose }) {
  const [msgs, setMsgs] = useState(null); const [t, setT] = useState(''); const [att, setAtt] = useState(false); const [err, setErr] = useState('');
  const fondo = useRef();
  const scorri = () => setTimeout(() => fondo.current?.scrollIntoView({ block: 'end' }), 30);
  useEffect(() => { (async () => { try { const tok = await auth.currentUser.getIdToken(); const r = await fetch(URL_CHAT_GREG, { headers: { authorization: 'Bearer ' + tok } }); const j = await r.json(); if (j.error) throw new Error(j.error); setMsgs(j.messaggi || []); scorri(); } catch (e) { setErr('Chat non raggiungibile: ' + (e?.message || e)); setMsgs([]); } })(); }, []);
  const invia = async e => {
    e?.preventDefault(); const m = t.trim(); if (!m || att) return;
    setT(''); setErr(''); setAtt(true); setMsgs(v => [...(v || []), { ruolo: 'paolo', testo: m, ts: Date.now() }]); scorri();
    try {
      const tok = await auth.currentUser.getIdToken();
      const r = await fetch(URL_CHAT_GREG, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + tok }, body: JSON.stringify({ message: m }) });
      const j = await r.json().catch(() => ({ error: 'risposta non leggibile' }));
      if (!r.ok || j.error) throw new Error(j.error || 'errore ' + r.status);
      setMsgs(v => [...v, { ruolo: 'greg', testo: j.reply, ts: Date.now(), ricevute: j.ricevute }]);
    } catch (x) { setErr('Greg non ha risposto: ' + (x?.message || x)); }
    setAtt(false); scorri();
  };
  return html`<div class="velo" onClick=${e => e.target === e.currentTarget && onClose()}>
    <div class="sheet chat" role="dialog" aria-modal="true" aria-label="Chat con Greg">
      <div class="sheet-testa"><h2>💬 Greg <small>il tuo tutor</small></h2><button class="x" aria-label="Chiudi" onClick=${onClose}>×</button></div>
      <div class="chat-corpo">
        ${msgs === null ? html`<p class="caricamento">Carico la chat…</p>` : !msgs.length ? html`<p class="piccolo">Chiedimi come va la settimana, cosa mangiare al prossimo pasto, come rientrare dopo uno sgarro, o raccontami come stai. Leggo i tuoi numeri di Fast Track; referti e terapie li vedo sul Mac.</p>` : null}
        ${(msgs || []).map(m => html`<div class=${'bolla ' + (m.ruolo === 'paolo' ? 'mia' : 'sua')}>${m.ruolo === 'paolo' ? html`<p>${m.testo}</p>` : html`<div dangerouslySetInnerHTML=${{ __html: mdLite(m.testo) }}></div>`}${m.foto ? html`<small>📷 ×${m.foto}</small>` : null}</div>`)}
        ${att ? html`<div class="bolla sua"><p class="piccolo" role="status">Greg sta scrivendo…</p></div>` : null}
        <${Errore} e=${err} />
        <div ref=${fondo}></div>
      </div>
      <form class="chat-scrivi" onSubmit=${invia}>
        <textarea rows="2" value=${t} onInput=${e => setT(e.target.value)} onKeyDown=${e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && matchMedia('(pointer:fine)').matches) invia(e); }} placeholder="Scrivi a Greg (o detta col microfono della tastiera)" aria-label="Messaggio a Greg"></textarea>
        <button class="primario" disabled=${att || !t.trim()}>Invia</button>
      </form>
    </div></div>`;
}

// ---------- l'app ----------
const SCHEDE = [['oggi', 'Oggi', '◎'], ['diario', 'Diario', '☰'], ['peso', 'Peso', '⚖'], ['altro', 'Altro', '⋯']];
function App() {
  const [utente, setUtente] = useState(undefined);
  const [scheda, setScheda] = useState(() => { try { return localStorage.getItem('ft2_scheda') || 'oggi'; } catch { return 'oggi'; } });
  const [tick, setTick] = useState(0);
  const [greg, setGreg] = useState(null);
  const [chat, setChat] = useState(false);
  const aggiorna = () => setTick(t => t + 1);
  useEffect(() => onAuthStateChanged(auth, u => setUtente(u || null)), []);
  useEffect(() => { try { localStorage.setItem('ft2_scheda', scheda); } catch {} }, [scheda]);
  useEffect(() => { const v = () => document.visibilityState === 'visible' && aggiorna(); document.addEventListener('visibilitychange', v); return () => document.removeEventListener('visibilitychange', v); }, []);
  if (utente === undefined) return html`<p class="caricamento">Fast Track…</p>`;
  if (!utente) return html`<${Login} />`;
  const Vista = { oggi: Oggi, diario: Diario, peso: Peso, altro: Altro }[scheda];
  const titolo = { oggi: new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Rome' }), diario: 'Diario', peso: 'Peso', altro: 'Altro' }[scheda];
  return html`<header class="testa"><h1>${titolo}</h1><button class="tasto-greg" onClick=${() => setChat(true)} aria-label="Parla con Greg">💬 Greg</button></header>
    ${chat ? html`<${GregChat} onClose=${() => { setChat(false); aggiorna(); }} />` : null}
    <main class="contenuto"><${Vista} tick=${tick} aggiorna=${aggiorna} greg=${greg} setGreg=${setGreg} /></main>
    <nav class="schede" aria-label="Sezioni">${SCHEDE.map(([k, t, i]) => html`<button class=${scheda === k ? 'attiva' : ''} aria-current=${scheda === k ? 'page' : null} onClick=${() => setScheda(k)}><span aria-hidden="true">${i}</span>${t}</button>`)}</nav>`;
}

render(html`<${App} />`, document.getElementById('app'));
