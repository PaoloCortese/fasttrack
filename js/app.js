// FAST TRACK 2 (15/11/2026) — l'app di tutti i giorni per dieta e attività di Paolo.
// Il motore è qui: calorie prese, calorie che restano, consigli per stare nel deficit del giorno, digiuno 16/8,
// peso e attività. Le calorie vengono da banche dati vere (Open Food Facts, i cibi di Paolo); nei casi limite
// l'app prepara la domanda per l'app Gemini e legge la risposta incollata. I conti li fa il codice (motore.js).
// I dati stanno nel database Salute: Greg (AZienda) li legge solo quando Paolo gli chiede una verifica.
import { html, render, useState, useEffect, useRef } from 'https://cdn.jsdelivr.net/npm/htm@3.1.1/preact/standalone.module.js';
import { auth, db, onAuthStateChanged, signInWithEmailAndPassword, signOut, collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, query, where, Bytes } from './firebase.js';
import * as M from './motore.js';

const VERSIONE = '2.0 · 15/11/2026';
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
function Digiuno({ stato, n, aggiorna }) {
  const [adesso, setAdesso] = useState(Date.now());
  const [ora, setOra] = useState('');
  useEffect(() => { const t = setInterval(() => setAdesso(Date.now()), 30000); return () => clearInterval(t); }, []);
  const quando = () => { // «alle 21:30» di oggi (o di ieri se è nel futuro)
    if (!ora) return Date.now();
    const [h, m] = ora.split(':').map(Number); const d = new Date(); d.setHours(h, m, 0, 0);
    if (d.getTime() > Date.now()) d.setDate(d.getDate() - 1); return d.getTime();
  };
  const inizia = async () => { await setDoc(doc(db, 'stato', 'digiuno'), { inizio: quando(), apertaAlle: null }); setOra(''); aggiorna(); };
  const apri = async () => {
    const fine = quando(); const ore = M.r1((fine - stato.inizio) / 3600000);
    await addDoc(collection(db, 'digiuni'), { inizio: stato.inizio, fine, ore, data: M.oggiRoma(new Date(stato.inizio)), completato: ore >= M.ORE_DIGIUNO });
    await setDoc(doc(db, 'stato', 'digiuno'), { inizio: null, apertaAlle: fine }); setOra(''); aggiorna();
  };
  if (stato?.inizio) {
    const ore = (adesso - stato.inizio) / 3600000; const pct = Math.min(100, ore / M.ORE_DIGIUNO * 100);
    const apre = new Date(stato.inizio + M.ORE_DIGIUNO * 3600000);
    return html`<section class="card"><div class="riga"><h3>🌙 Digiuno</h3><span class="pill ${ore >= M.ORE_DIGIUNO ? 'verde' : ''}">${Math.floor(ore)} h ${String(Math.floor((ore % 1) * 60)).padStart(2, '0')} min</span></div>
      <div class="barra"><div style=${`width:${pct}%`}></div></div>
      <p class="piccolo">Iniziato alle ${M.oraRoma(new Date(stato.inizio))} · 16 ore alle <b>${M.oraRoma(apre)}</b></p>
      <div class="azioni"><input class="ora" type="time" value=${ora} onInput=${e => setOra(e.target.value)} aria-label="Orario (vuoto = adesso)" /><button class="primario" onClick=${apri}>Apri la finestra</button></div></section>`;
  }
  return html`<section class="card"><div class="riga"><h3>🍽 Finestra aperta</h3>${stato?.apertaAlle ? html`<span class="pill">dalle ${M.oraRoma(new Date(stato.apertaAlle))}</span>` : null}</div>
    <p class="piccolo">Quando hai finito di mangiare, fai partire il digiuno (16 ore).</p>
    <div class="azioni"><input class="ora" type="time" value=${ora} onInput=${e => setOra(e.target.value)} aria-label="Orario (vuoto = adesso)" /><button class="primario" onClick=${inizia}>Inizia il digiuno</button></div></section>`;
}

function Budget({ n }) {
  const pct = Math.min(100, n.mangiato / n.obiettivo * 100); const oltre = n.residuo < 0;
  const [info, setInfo] = useState(false);
  return html`<section class="card budget">
    <p class="etichetta">${oltre ? 'Oltre il budget' : 'Restano'}</p>
    <p class="grande ${oltre ? 'rosso' : ''}">${M.kcalTxt(Math.abs(n.residuo))} <small>kcal</small></p>
    <div class="barra ${oltre ? 'rossa' : ''}"><div style=${`width:${pct}%`}></div></div>
    <div class="tre"><div><b>${M.kcalTxt(n.mangiato)}</b><span>mangiate</span></div><div><b>${M.kcalTxt(n.obiettivo)}</b><span>obiettivo</span></div><div><b>${M.kcalTxt(n.deficitOggi)}</b><span>deficit oggi</span></div></div>
    <button class="link" onClick=${() => setInfo(!info)} aria-expanded=${info}>${info ? 'Nascondi i conti' : 'Da dove vengono i numeri'}</button>
    ${info ? html`<ul class="conti">
      <li>Peso di tendenza <b>${M.kgTxt(n.tendenza.kg)} kg</b> (${n.tendenza.metodo})</li>
      <li>Metabolismo basale <b>${M.kcalTxt(n.basale.valore)}</b> kcal — Mifflin-St Jeor: ${n.basale.formula}</li>
      <li>Fabbisogno <b>${M.kcalTxt(n.fabbisogno.valore)}</b> kcal — ${n.fabbisogno.fonte}</li>
      <li>Obiettivo <b>${M.kcalTxt(n.obiettivo)}</b> = ${n.obiettivoNota}. Mai sotto il basale.</li>
      <li>L'attività non si aggiunge al budget: fa deficit in più.</li></ul>` : null}
  </section>`;
}

function Consigli({ lista }) {
  if (!lista.length) return null;
  const icona = { digiuno: '⏱', allarme: '⚠️', ok: '✅', info: '💡', attivita: '🚶' };
  return html`<section class="card"><h3>Consigli</h3><ul class="consigli">${lista.map(c => html`<li class=${c.tipo}><span aria-hidden="true">${icona[c.tipo] || '•'}</span><p>${c.testo}</p></li>`)}</ul></section>`;
}

// ---------- dove si prendono le calorie: banche dati vere, poi i propri cibi, Gemini solo nei casi limite ----------
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

// La domanda per l'app Gemini (casi limite): risposta su UNA riga che Fast Track sa leggere.
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

// Quanto ne hai mangiato: grammi (valori per 100 g) o pezzi (valore per pezzo).
function Quantita({ voce, onAggiungi, onAnnulla, salvabile }) {
  const haPezzo = voce.kcalPezzo != null, haG = voce.kcal100 != null;
  const [unita, setUnita] = useState(haPezzo ? 'pezzi' : 'g');
  const [q, setQ] = useState(haPezzo ? '1' : String(voce.porzioneG || 100));
  const [salva, setSalva] = useState(false);
  const n = numIt(q) || 0;
  const per = (v100, vPz) => unita === 'g' ? (v100 != null ? v100 * n / 100 : null) : (vPz != null ? vPz * n : null);
  const kcal = per(voce.kcal100, voce.kcalPezzo) || 0;
  const aggiungi = async () => {
    if (!n) return;
    if (salva) await addDoc(collection(db, 'preferiti'), { nome: voce.nome, kcal100: voce.kcal100 ?? null, prot100: voce.prot100 ?? null, carbo100: voce.carbo100 ?? null, grassi100: voce.grassi100 ?? null, kcalPezzo: voce.kcalPezzo ?? null, protPezzo: voce.protPezzo ?? null, pezzo: voce.pezzo || null, porzioneG: voce.porzioneG ?? null, codice: voce.codice || null, fonte: voce.fonte || '', usi: 1, ts: Date.now() });
    else if (voce.id) await setDoc(doc(db, 'preferiti', voce.id), { usi: (voce.usi || 0) + 1 }, { merge: true });
    const r = x => x != null ? Math.round(x) : null;
    onAggiungi({ descrizione: unita === 'g' ? `${voce.nome} ${String(q).replace('.', ',')} g` : `${voce.nome} ${String(q).replace('.', ',')} × ${voce.pezzo || 'pz'}`, kcal: Math.round(kcal),
      proteine: r(per(voce.prot100, voce.protPezzo)), carboidrati: r(per(voce.carbo100, voce.carboPezzo)), grassi: r(per(voce.grassi100, voce.grassiPezzo)),
      fonte: voce.id ? 'miei' : 'banca_dati' });
  };
  return html`<div class="quantita card">
    <p><b>${voce.nome}</b><br/><small>${haG ? `${M.kcalTxt(voce.kcal100)} kcal/100 g` : ''}${haG && haPezzo ? ' · ' : ''}${haPezzo ? `${M.kcalTxt(voce.kcalPezzo)} kcal per ${voce.pezzo || 'pezzo'}` : ''}${voce.prot100 != null ? ` · proteine ${String(voce.prot100).replace('.', ',')} g/100 g` : ''}</small></p>
    <div class="azioni"><input inputmode="decimal" value=${q} onInput=${e => setQ(e.target.value)} aria-label="Quantità" />
      ${haG && haPezzo ? html`<button class="secondario" onClick=${() => { setUnita(unita === 'g' ? 'pezzi' : 'g'); setQ(unita === 'g' ? '1' : '100'); }}>${unita === 'g' ? 'grammi' : (voce.pezzo || 'pezzi')} ⇄</button>` : html`<span class="unita">${unita === 'g' ? 'grammi' : (voce.pezzo || 'pezzi')}</span>`}</div>
    <p class="grande-medio">= ${M.kcalTxt(kcal)} kcal</p>
    ${salvabile ? html`<label class="spunta"><input type="checkbox" checked=${salva} onChange=${e => setSalva(e.target.checked)} /> ⭐ Salva tra i miei</label>` : null}
    <div class="azioni"><button class="primario" onClick=${aggiungi} disabled=${!n}>Aggiungi al pasto</button><button class="secondario" onClick=${onAnnulla}>Annulla</button></div>
  </div>`;
}

function IMiei({ onScegli }) {
  const [lista, setLista] = useState(null); const [filtro, setFiltro] = useState('');
  const carica = () => getDocs(collection(db, 'preferiti')).then(s => setLista(s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.usi || 0) - (a.usi || 0) || a.nome.localeCompare(b.nome))));
  useEffect(() => { carica(); }, []);
  if (!lista) return html`<p class="caricamento">Carico…</p>`;
  const f = filtro.trim().toLowerCase(); const v = f ? lista.filter(x => x.nome.toLowerCase().includes(f)) : lista;
  const togli = async (e, x) => { e.stopPropagation(); if (confirm(`Togliere «${x.nome}» dai tuoi cibi?`)) { await deleteDoc(doc(db, 'preferiti', x.id)); carica(); } };
  return html`${lista.length > 6 ? html`<input placeholder="Filtra i tuoi cibi" value=${filtro} onInput=${e => setFiltro(e.target.value)} aria-label="Filtra" />` : null}
    ${v.length ? html`<ul class="voci">${v.map(x => html`<li><button onClick=${() => onScegli(x)}><span>${x.nome}</span><small>${x.kcalPezzo != null ? `${M.kcalTxt(x.kcalPezzo)} kcal/${x.pezzo || 'pz'}` : `${M.kcalTxt(x.kcal100)} kcal/100 g`}</small></button><button class="x-piccola" aria-label="Togli ${x.nome}" onClick=${e => togli(e, x)}>×</button></li>`)}</ul>`
      : html`<p class="piccolo">Ancora nessuno. Si riempie da solo: quando cerchi un prodotto o scrivi un pasto a mano, spunta «⭐ Salva tra i miei».</p>`}`;
}

function Cerca({ onScegli }) {
  const [q, setQ] = useState(''); const [ris, setRis] = useState(null); const [att, setAtt] = useState(false); const [err, setErr] = useState('');
  const vai = async e => { e?.preventDefault(); if (q.trim().length < 2) return; setAtt(true); setErr('');
    try { setRis(await offCerca(q)); } catch (x) { setErr('Ricerca non riuscita: controlla la connessione.'); } setAtt(false); };
  return html`<form class="azioni" onSubmit=${vai}><input type="search" inputmode="search" placeholder="Nome o codice a barre" value=${q} onInput=${e => setQ(e.target.value)} aria-label="Cerca un prodotto" /><button class="primario" disabled=${att}>${att ? '…' : 'Cerca'}</button></form>
    <p class="piccolo">Banca dati Open Food Facts: valori dell'etichetta. Il codice a barre è il numero sotto le barre.</p>
    <${Errore} e=${err} />
    ${ris ? (ris.length ? html`<ul class="voci">${ris.map(x => html`<li><button onClick=${() => onScegli(x)}><span>${x.nome}</span><small>${M.kcalTxt(x.kcal100)} kcal/100 g</small></button></li>`)}</ul>`
      : html`<p class="piccolo">Niente trovato. Prova con meno parole o con la marca, oppure scrivilo a mano.</p>`) : null}`;
}

function DaGemini({ onAggiungi }) {
  const [t, setT] = useState(''); const [err, setErr] = useState(''); const [copiato, setCopiato] = useState(false);
  const apri = () => { try { navigator.clipboard.writeText(DOMANDA_GEMINI).then(() => setCopiato(true), () => setCopiato(false)); } catch {} window.open('https://gemini.google.com/app', '_blank'); };
  const incolla = async () => { try { setT(await navigator.clipboard.readText()); } catch { setErr('Tieni premuto nel riquadro e scegli «Incolla».'); } };
  const leggi = () => { const r = leggiGemini(t); if (!r) { setErr('Non trovo le kcal nella risposta: controlla di aver incollato la riga che inizia con FASTTRACK.'); return; } setErr(''); setT(''); onAggiungi(r); };
  return html`<ol class="passi">
      <li>Per i piatti difficili (ristorante, piatto misto, porzione incerta).</li>
      <li><button class="primario" onClick=${apri}>📋 Copia la domanda e apri Gemini</button>${copiato ? html` <small>copiata ✓</small>` : null}</li>
      <li>In Gemini allega la foto, incolla la domanda e invia.</li>
      <li>Copia la riga della risposta e incollala qui:</li></ol>
    <textarea rows="3" value=${t} onInput=${e => setT(e.target.value)} placeholder="FASTTRACK | descrizione: … | kcal: …" aria-label="Risposta di Gemini"></textarea>
    <div class="azioni"><button class="secondario" onClick=${incolla}>Incolla</button><button class="primario" onClick=${leggi} disabled=${!t.trim()}>Leggi la risposta</button></div>
    <${Errore} e=${err} />`;
}

function PastoSheet({ pasto, data, onClose, aggiorna }) {
  const nuovo = !pasto;
  const [modo, setModo] = useState('miei');
  const [scelta, setScelta] = useState(null);
  const [foto, setFoto] = useState([]);
  const [f, setF] = useState(() => pasto ? { descrizione: pasto.descrizione || '', kcal: String(pasto.kcal ?? ''), proteine: String(pasto.proteine ?? ''), carboidrati: String(pasto.carboidrati ?? ''), grassi: String(pasto.grassi ?? ''), ora: pasto.ora || M.oraRoma(), fonte: pasto.fonte || 'a_mano', sgarro: pasto.aderenza === 'sgarro' }
    : { descrizione: '', kcal: '', proteine: '', carboidrati: '', grassi: '', ora: M.oraRoma(), fonte: '', sgarro: false });
  const [voci, setVoci] = useState(0);
  const [salvaMiei, setSalvaMiei] = useState(false);
  const [lavoro, setLavoro] = useState(''); const [err, setErr] = useState('');
  const [archivio, setArchivio] = useState([]);
  const inFile = useRef();
  useEffect(() => { if (pasto?.foto?.length) Promise.all(pasto.foto.map(fotoUrl)).then(v => setArchivio(v.filter(Boolean))); }, []);
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  const somma = (a, b) => b == null ? a : String(Math.round((numIt(a) || 0) + b));
  const aggiungiVoce = v => {
    setF(x => ({ ...x, descrizione: x.descrizione ? `${x.descrizione} + ${v.descrizione}` : v.descrizione, kcal: somma(x.kcal, v.kcal), proteine: somma(x.proteine, v.proteine), carboidrati: somma(x.carboidrati, v.carboidrati), grassi: somma(x.grassi, v.grassi),
      fonte: x.fonte && x.fonte !== v.fonte ? 'misto' : v.fonte }));
    setVoci(n => n + 1); setScelta(null);
  };
  const aggiungiFoto = async e => {
    const files = [...(e.target.files || [])].slice(0, 3 - foto.length); e.target.value = '';
    for (const x of files) { const a = await rimpicciolisci(x, 800, 0.7); if (a) setFoto(v => [...v, a]); else setErr('Una foto non si legge.'); }
  };
  const salva = async () => {
    const kcal = numIt(f.kcal); if (kcal == null || kcal < 0 || kcal > 6000) { setErr('Mancano le kcal: scegli un cibo, cercalo o scrivile a mano.'); return; }
    if (!f.descrizione.trim()) { setErr('Scrivi cosa hai mangiato.'); return; }
    setLavoro('Salvo…'); setErr('');
    try {
      const n = k => numIt(f[k]) != null ? Math.round(numIt(f[k])) : null;
      const campi = { descrizione: f.descrizione.trim().slice(0, 300), kcal: Math.round(kcal), proteine: n('proteine'), carboidrati: n('carboidrati'), grassi: n('grassi'),
        ora: f.ora || M.oraRoma(), fonte: f.fonte || 'a_mano', aderenza: f.sgarro ? 'sgarro' : 'piano' };
      if (nuovo) {
        const ids = []; for (const a of foto) ids.push(await salvaFoto(a));
        await addDoc(collection(db, 'pasti'), { data, ...campi, foto: ids, ts: Date.now(), origine: 'fasttrack' });
        if (salvaMiei) await addDoc(collection(db, 'preferiti'), { nome: campi.descrizione, kcalPezzo: campi.kcal, protPezzo: campi.proteine, carboPezzo: campi.carboidrati, grassiPezzo: campi.grassi, kcal100: null, pezzo: 'porzione', fonte: 'a mano', usi: 1, ts: Date.now() });
      } else await updateDoc(doc(db, 'pasti', pasto.id), campi);
      aggiorna(); onClose();
    } catch (x) { setErr('Non salvato: ' + (x?.message || x)); setLavoro(''); }
  };
  const elimina = async () => { if (!confirm('Eliminare questo pasto?')) return; await deleteDoc(doc(db, 'pasti', pasto.id)); for (const id of pasto.foto || []) await deleteDoc(doc(db, 'foto', id)).catch(() => {}); aggiorna(); onClose(); };
  const MODI = [['miei', '⭐ I miei'], ['cerca', '🔎 Cerca'], ['mano', '✍️ A mano'], ['gemini', '🤖 Gemini']];

  return html`<${Sheet} titolo=${nuovo ? 'Nuovo pasto' : 'Modifica pasto'} onClose=${onClose}>
    ${nuovo ? html`<div class="segmenti" role="tablist">${MODI.map(([k, t]) => html`<button role="tab" aria-selected=${modo === k} class=${modo === k ? 'attivo' : ''} onClick=${() => { setModo(k); setScelta(null); }}>${t}</button>`)}</div>
      ${scelta ? html`<${Quantita} voce=${scelta} salvabile=${!scelta.id} onAggiungi=${aggiungiVoce} onAnnulla=${() => setScelta(null)} />`
        : modo === 'miei' ? html`<${IMiei} onScegli=${setScelta} />`
        : modo === 'cerca' ? html`<${Cerca} onScegli=${setScelta} />`
        : modo === 'gemini' ? html`<${DaGemini} onAggiungi=${aggiungiVoce} />`
        : html`<p class="piccolo">Scrivi cosa e le kcal qui sotto (es. dall'etichetta o dal menu).</p>`}
      ${voci ? html`<p class="stima">Nel pasto: ${voci} ${voci === 1 ? 'voce' : 'voci'}. Puoi aggiungerne altre dalle schede qui sopra.</p>` : null}`
    : archivio.length ? html`<div class="foto-riga">${archivio.map(u => html`<div class="mini"><img src=${u} alt="foto del pasto" /></div>`)}</div>` : null}
    <${Campo} etichetta="Cosa"><textarea rows="3" value=${f.descrizione} onInput=${e => set('descrizione', e.target.value)}></textarea><//>
    <div class="griglia">
      <${Campo} etichetta="kcal"><input inputmode="numeric" value=${f.kcal} onInput=${e => set('kcal', e.target.value)} /><//>
      <${Campo} etichetta="Ora"><input type="time" value=${f.ora} onInput=${e => set('ora', e.target.value)} /><//>
      <${Campo} etichetta="Proteine g"><input inputmode="decimal" value=${f.proteine} onInput=${e => set('proteine', e.target.value)} /><//>
      <${Campo} etichetta="Carboidrati g"><input inputmode="decimal" value=${f.carboidrati} onInput=${e => set('carboidrati', e.target.value)} /><//>
    </div>
    ${nuovo ? html`<div class="foto-riga">
        ${foto.map((u, i) => html`<div class="mini"><img src=${u} alt="foto ${i + 1}" /><button aria-label="Togli la foto" onClick=${() => setFoto(v => v.filter((_, j) => j !== i))}>×</button></div>`)}
        ${foto.length < 3 ? html`<button class="foto-add" onClick=${() => inFile.current.click()}>📷<span>Foto</span></button>` : null}
        <input ref=${inFile} type="file" accept="image/*" multiple hidden onChange=${aggiungiFoto} /></div>
      <p class="piccolo">La foto resta nel diario, così Greg la vede nelle verifiche.</p>` : null}
    <label class="spunta"><input type="checkbox" checked=${f.sgarro} onChange=${e => set('sgarro', e.target.checked)} /> È uno sgarro</label>
    ${nuovo && modo === 'mano' ? html`<label class="spunta"><input type="checkbox" checked=${salvaMiei} onChange=${e => setSalvaMiei(e.target.checked)} /> ⭐ Salva tra i miei (come porzione)</label>` : null}
    <${Errore} e=${err} />
    <div class="azioni"><button class="primario largo" disabled=${!!lavoro} onClick=${salva}>${lavoro || 'Salva il pasto'}</button></div>
    ${!nuovo ? html`<button class="link rosso" onClick=${elimina}>Elimina il pasto</button>` : null}
  <//>`;
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

function ChiudiSheet({ data, n, onClose, aggiorna }) {
  const chiudi = async esito => { await aggiornaGiorno(data, { chiusa: true, esito }); aggiorna(); onClose(); };
  return html`<${Sheet} titolo="Chiudi la giornata" onClose=${onClose}>
    <p>Mangiate <b>${M.kcalTxt(n.mangiato)}</b> kcal su ${M.kcalTxt(n.obiettivo)} · deficit di oggi <b>${M.kcalTxt(n.deficitOggi)}</b> kcal.</p>
    ${n.mangiato < n.basale.valore - 300 ? html`<p class="avviso">Sei molto sotto il basale: non è un successo, si perde muscolo. Se è un errore di registrazione, correggi prima di chiudere.</p>` : null}
    <p class="piccolo">Solo le giornate chiuse contano per il bilancio del sabato.</p>
    <div class="azioni"><button class="primario" onClick=${() => chiudi(n.residuo >= 0 ? 'rispettata' : 'sopra')}>Chiudi${n.residuo < 0 ? ' (sopra il budget)' : ''}</button><button class="secondario" onClick=${() => chiudi('sgarro')}>Chiudi come sgarro</button></div>
    ${n.giorno?.chiusa ? html`<button class="link" onClick=${async () => { await aggiornaGiorno(data, { chiusa: false }); aggiorna(); onClose(); }}>Riapri la giornata</button>` : null}
  <//>`;
}

function Oggi({ tick, aggiorna }) {
  const data = M.oggiRoma();
  const [n, setN] = useState(null); const [dig, setDig] = useState(null); const [err, setErr] = useState('');
  const [sheet, setSheet] = useState(null);
  useEffect(() => { Promise.all([M.numeri(data), M.statoDigiuno()]).then(([a, b]) => { setN(a); setDig(b); setErr(''); }).catch(e => setErr('Dati non raggiungibili: ' + (e?.message || e))); }, [tick]);
  if (err) return html`<${Errore} e=${err} />`;
  if (!n) return html`<p class="caricamento">Carico…</p>`;
  const g = n.giorno || {};
  const acqua = async () => { await aggiornaGiorno(data, { acquaL: M.r1((g.acquaL || 0) + 0.25) }); aggiorna(); };
  return html`
    <${Budget} n=${n} />
    <${Digiuno} stato=${dig} n=${n} aggiorna=${aggiorna} />
    <${Consigli} lista=${M.consigli(n, dig)} />
    <section class="card"><div class="riga"><h3>Pasti di oggi</h3><span class="pill">${n.pasti.length}</span></div>
      ${n.pasti.length ? html`<ul class="pasti">${n.pasti.map(p => html`<li><button onClick=${() => setSheet({ tipo: 'pasto', pasto: p })}>
          <span class="ora">${p.ora || ''}</span><span class="desc">${p.descrizione}${p.foto?.length ? ' 📷' : ''}${p.aderenza === 'sgarro' ? html` <em class="sgarro">sgarro</em>` : ''}</span><b>${M.kcalTxt(p.kcal)}</b></button></li>`)}</ul>`
        : html`<p class="piccolo">Ancora nessun pasto registrato.</p>`}
      <div class="azioni"><button class="primario largo" onClick=${() => setSheet({ tipo: 'pasto' })}>📷 Aggiungi un pasto</button></div>
    </section>
    <section class="card"><div class="riga"><h3>Attività</h3><button class="link" onClick=${() => setSheet({ tipo: 'attivita' })}>Modifica</button></div>
      <div class="tre"><div><b>${g.passi != null ? M.kcalTxt(g.passi) : '—'}</b><span>passi</span></div><div><b>${g.kcalAttive != null ? M.kcalTxt(g.kcalAttive) : '—'}</b><span>kcal attive</span></div><div><b>${g.acquaL != null ? String(g.acquaL).replace('.', ',') : '0'} L</b><span>acqua</span></div></div>
      <div class="azioni"><button class="secondario" onClick=${acqua}>💧 + 0,25 L</button></div>
      ${g.attivitaFonte ? html`<p class="piccolo">Fonte: ${g.attivitaFonte}</p>` : null}
    </section>
    <button class="${g.chiusa ? 'secondario' : 'primario'} largo" onClick=${() => setSheet({ tipo: 'chiudi' })}>${g.chiusa ? `✓ Giornata chiusa (${g.esito || ''})` : 'Chiudi la giornata'}</button>
    ${sheet?.tipo === 'pasto' ? html`<${PastoSheet} pasto=${sheet.pasto} data=${data} onClose=${() => setSheet(null)} aggiorna=${aggiorna} />` : null}
    ${sheet?.tipo === 'attivita' ? html`<${AttivitaSheet} data=${data} g=${n.giorno} onClose=${() => setSheet(null)} aggiorna=${aggiorna} />` : null}
    ${sheet?.tipo === 'chiudi' ? html`<${ChiudiSheet} data=${data} n=${n} onClose=${() => setSheet(null)} aggiorna=${aggiorna} />` : null}`;
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
  const chiusi7 = righe.slice(0, 7).filter(r => r.chiusa && r.kcal > 0);
  const media = chiusi7.length ? chiusi7.reduce((s, r) => s + r.kcal, 0) / chiusi7.length : null;
  let serie = 0; for (const r of righe) { if (r.data === M.oggiRoma() && !r.chiusa) continue; if (r.chiusa && r.esito === 'rispettata') serie++; else break; }
  return html`
    <section class="card"><div class="tre">
      <div><b>${media != null ? M.kcalTxt(media) : '—'}</b><span>media kcal (7 gg chiusi)</span></div>
      <div><b>${chiusi7.length}/7</b><span>giornate chiuse</span></div>
      <div><b>${serie}</b><span>di fila nel budget</span></div></div></section>
    <ul class="diario">${righe.map(r => {
      const pct = Math.min(100, r.kcal / n.obiettivo * 100); const sopra = r.kcal > n.obiettivo;
      return html`<li><button onClick=${() => setAperto(r.data)}>
        <span class="giorno">${M.dataBreve(r.data)}</span>
        <span class="mini-barra ${sopra ? 'rossa' : ''}"><span style=${`width:${pct}%`}></span></span>
        <span class="kcal">${r.kcal ? M.kcalTxt(r.kcal) : '—'}</span>
        <span class="extra">${r.passi != null ? `${M.kcalTxt(r.passi)} passi` : ''}${r.pesata ? ` · ${M.kgTxt(r.pesata)} kg` : ''}${r.chiusa ? (r.esito === 'rispettata' ? ' · ✓' : ` · ${r.esito}`) : ''}</span></button></li>`;
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
    await setDoc(doc(db, 'pesate', M.oggiRoma()), { data: M.oggiRoma(), kg: M.r1(v), fonte: 'Fast Track', ts: Date.now() }); setKg(''); setErr(''); aggiorna();
  };
  const bilancio = async () => { setLavoro(true); try { setBil(await M.bilancioSettimana()); aggiorna(); } catch (e) { setErr(String(e?.message || e)); } setLavoro(false); };
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
      <p class="piccolo">${sabato ? 'Oggi è sabato: pesati, poi fai il bilancio.' : 'Si fa il sabato, dopo la pesata.'} Il codice ritara il fabbisogno sul calo reale della tendenza (con almeno 5 giornate chiuse) e fissa l'obiettivo della settimana, mai sotto il basale.</p>
      <button class="${sabato ? 'primario' : 'secondario'} largo" disabled=${lavoro} onClick=${bilancio}>${lavoro ? 'Calcolo…' : 'Fai il bilancio'}</button>
      ${bil ? html`<ul class="conti">
        <li>Settimana ${bil.periodo}: ${bil.giorniCompleti} giornate chiuse</li>
        ${bil.calcolo ? html`<li>Mangiato in media <b>${M.kcalTxt(bil.calcolo.mediaMangiato)}</b> kcal · tendenza ${bil.calcolo.caloKg >= 0 ? '−' : '+'}${M.kgTxt(Math.abs(bil.calcolo.caloKg))} kg · deficit reale <b>${M.kcalTxt(bil.calcolo.deficitRealeGiorno)}</b> kcal al giorno</li>` : html`<li>${bil.nonRitarato}</li>`}
        <li>Fabbisogno: <b>${M.kcalTxt(bil.fabbisognoNuovo)}</b> kcal (prima ${M.kcalTxt(bil.fabbisognoPrima)})</li>
        <li>Obiettivo nuovo: <b>${M.kcalTxt(bil.obiettivo)}</b> kcal al giorno (basale ${M.kcalTxt(bil.basale.valore)})</li>
        ${bil.pesoObiettivo ? html`<li>Peso obiettivo per sabato prossimo: <b>${M.kgTxt(bil.pesoObiettivo)} kg</b> di tendenza</li>` : null}</ul>`
      : ultima ? html`<p class="piccolo">Ultimo bilancio ${M.dataBreve(ultima.data)}: obiettivo ${M.kcalTxt(ultima.obiettivoKcal)} kcal.</p>` : null}
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
      <li>Le calorie vengono dalle <b>etichette</b> (banca dati Open Food Facts, per nome o codice a barre) e dai <b>tuoi cibi</b> salvati. Nei casi limite l'app ti prepara la domanda per <b>Gemini</b>: incolli la risposta e la legge lei.</li>
      <li>Tutti i conti li fa il codice: obiettivo mai sotto il basale, l'attività non si somma al budget, ritaratura il sabato sul calo reale.</li>
      <li>Passi e calorie attive arrivano la sera col Comando rapido dell'iPhone.</li>
      <li>Per una verifica completa chiedi a <b>Greg</b> in AZienda: legge questo stesso diario.</li></ul></section>
    <button class="secondario largo" onClick=${() => signOut(auth)}>Esci</button>
    <p class="versione">Fast Track ${VERSIONE}</p>`;
}

// ---------- l'app ----------
const SCHEDE = [['oggi', 'Oggi', '◎'], ['diario', 'Diario', '☰'], ['peso', 'Peso', '⚖'], ['altro', 'Altro', '⋯']];
function App() {
  const [utente, setUtente] = useState(undefined);
  const [scheda, setScheda] = useState(() => { try { return localStorage.getItem('ft2_scheda') || 'oggi'; } catch { return 'oggi'; } });
  const [tick, setTick] = useState(0);
  const aggiorna = () => setTick(t => t + 1);
  useEffect(() => onAuthStateChanged(auth, u => setUtente(u || null)), []);
  useEffect(() => { try { localStorage.setItem('ft2_scheda', scheda); } catch {} }, [scheda]);
  useEffect(() => { const v = () => document.visibilityState === 'visible' && aggiorna(); document.addEventListener('visibilitychange', v); return () => document.removeEventListener('visibilitychange', v); }, []);
  if (utente === undefined) return html`<p class="caricamento">Fast Track…</p>`;
  if (!utente) return html`<${Login} />`;
  const Vista = { oggi: Oggi, diario: Diario, peso: Peso, altro: Altro }[scheda];
  const titolo = { oggi: new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Rome' }), diario: 'Diario', peso: 'Peso', altro: 'Altro' }[scheda];
  return html`<header class="testa"><h1>${titolo}</h1></header>
    <main class="contenuto"><${Vista} tick=${tick} aggiorna=${aggiorna} /></main>
    <nav class="schede" aria-label="Sezioni">${SCHEDE.map(([k, t, i]) => html`<button class=${scheda === k ? 'attiva' : ''} aria-current=${scheda === k ? 'page' : null} onClick=${() => setScheda(k)}><span aria-hidden="true">${i}</span>${t}</button>`)}</nav>`;
}

render(html`<${App} />`, document.getElementById('app'));
