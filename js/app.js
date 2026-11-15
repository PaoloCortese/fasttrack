// FAST TRACK 2 (15/11/2026) — l'app di tutti i giorni per dieta e attività di Paolo.
// Il motore è qui: calorie prese, calorie che restano, consigli per stare nel deficit del giorno, digiuno 16/8,
// peso e attività. Le foto dei piatti le stima Gemini (gratuito); i conti li fa il codice (motore.js).
// I dati stanno nel database Salute: Greg (AZienda) li legge solo quando Paolo gli chiede una verifica.
import { html, render, useState, useEffect, useRef } from 'https://cdn.jsdelivr.net/npm/htm@3.1.1/preact/standalone.module.js';
import { auth, db, onAuthStateChanged, signInWithEmailAndPassword, signOut, collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, query, where, Bytes } from './firebase.js';
import * as M from './motore.js';
import { stimaPasto } from './gemini.js';

const VERSIONE = '2.0 · 15/11/2026';
const numIt = v => { const n = Number(String(v ?? '').trim().replace(/\s/g, '').replace(',', '.')); return isFinite(n) && String(v ?? '').trim() !== '' ? n : null; };

// ---------- foto: rimpicciolite sul telefono (per Gemini 1280 px, per l'archivio 800 px) ----------
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

function PastoSheet({ pasto, data, onClose, aggiorna }) {
  const nuovo = !pasto;
  const [foto, setFoto] = useState([]);           // [{stima, archivio}]
  const [nota, setNota] = useState('');
  const [f, setF] = useState(() => pasto ? { descrizione: pasto.descrizione || '', kcal: String(pasto.kcal ?? ''), proteine: String(pasto.proteine ?? ''), carboidrati: String(pasto.carboidrati ?? ''), grassi: String(pasto.grassi ?? ''), ora: pasto.ora || M.oraRoma(), fonte: pasto.fonte || 'stima', sgarro: pasto.aderenza === 'sgarro' }
    : { descrizione: '', kcal: '', proteine: '', carboidrati: '', grassi: '', ora: M.oraRoma(), fonte: 'stima', sgarro: false });
  const [stima, setStima] = useState(null); const [lavoro, setLavoro] = useState(''); const [err, setErr] = useState('');
  const [archivio, setArchivio] = useState([]);
  const inFile = useRef();
  useEffect(() => { if (pasto?.foto?.length) Promise.all(pasto.foto.map(fotoUrl)).then(v => setArchivio(v.filter(Boolean))); }, []);
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  const aggiungiFoto = async e => {
    const files = [...(e.target.files || [])].slice(0, 3 - foto.length); e.target.value = '';
    const nuove = [];
    for (const x of files) { const s = await rimpicciolisci(x, 1280, 0.8), a = await rimpicciolisci(x, 800, 0.7); if (s && a) nuove.push({ stima: s, archivio: a }); else setErr('Una foto non si legge.'); }
    setFoto(v => [...v, ...nuove]);
  };
  const chiediStima = async () => {
    setErr(''); setLavoro('Gemini sta guardando…');
    try {
      const r = await stimaPasto(foto.map(x => x.stima), nota);
      setStima(r);
      setF(x => ({ ...x, descrizione: r.descrizione, kcal: String(r.kcal), proteine: r.proteine_g != null ? String(r.proteine_g) : '', carboidrati: r.carboidrati_g != null ? String(r.carboidrati_g) : '', grassi: r.grassi_g != null ? String(r.grassi_g) : '', fonte: r.fonte }));
    } catch (x) { setErr('Gemini non ha risposto (' + (x?.message || x) + '). Puoi scrivere le kcal a mano.'); }
    setLavoro('');
  };
  const salva = async () => {
    const kcal = numIt(f.kcal); if (kcal == null || kcal < 0 || kcal > 6000) { setErr('Scrivi le kcal (un numero).'); return; }
    if (!f.descrizione.trim()) { setErr('Scrivi cosa hai mangiato.'); return; }
    setLavoro('Salvo…'); setErr('');
    try {
      const campi = { descrizione: f.descrizione.trim().slice(0, 300), kcal: Math.round(kcal), proteine: numIt(f.proteine) != null ? Math.round(numIt(f.proteine)) : null,
        carboidrati: numIt(f.carboidrati) != null ? Math.round(numIt(f.carboidrati)) : null, grassi: numIt(f.grassi) != null ? Math.round(numIt(f.grassi)) : null,
        ora: f.ora || M.oraRoma(), fonte: f.fonte, aderenza: f.sgarro ? 'sgarro' : 'piano' };
      if (nuovo) {
        const ids = []; for (const x of foto) ids.push(await salvaFoto(x.archivio));
        await addDoc(collection(db, 'pasti'), { data, ...campi, foto: ids, ts: Date.now(), origine: 'fasttrack', affidabilita: stima?.affidabilita || null });
      } else await updateDoc(doc(db, 'pasti', pasto.id), campi);
      aggiorna(); onClose();
    } catch (x) { setErr('Non salvato: ' + (x?.message || x)); setLavoro(''); }
  };
  const elimina = async () => { if (!confirm('Eliminare questo pasto?')) return; await deleteDoc(doc(db, 'pasti', pasto.id)); for (const id of pasto.foto || []) await deleteDoc(doc(db, 'foto', id)).catch(() => {}); aggiorna(); onClose(); };

  return html`<${Sheet} titolo=${nuovo ? 'Nuovo pasto' : 'Modifica pasto'} onClose=${onClose}>
    ${nuovo ? html`<div class="foto-riga">
        ${foto.map((x, i) => html`<div class="mini"><img src=${x.archivio} alt="foto ${i + 1}" /><button aria-label="Togli la foto" onClick=${() => setFoto(v => v.filter((_, j) => j !== i))}>×</button></div>`)}
        ${foto.length < 3 ? html`<button class="foto-add" onClick=${() => inFile.current.click()}>📷<span>Foto</span></button>` : null}
        <input ref=${inFile} type="file" accept="image/*" multiple hidden onChange=${aggiungiFoto} />
      </div>
      <${Campo} etichetta="Nota per la stima (facoltativa)"><input value=${nota} onInput=${e => setNota(e.target.value)} placeholder="es. 90 g di pasta, mezza porzione" /><//>
      <button class="secondario largo" disabled=${!!lavoro || (!foto.length && !nota.trim())} onClick=${chiediStima}>✨ Stima le calorie</button>`
    : archivio.length ? html`<div class="foto-riga">${archivio.map(u => html`<div class="mini"><img src=${u} alt="foto del pasto" /></div>`)}</div>` : null}
    ${stima ? html`<p class="stima ${stima.affidabilita}">Stima ${stima.affidabilita === 'alta' ? 'affidabile' : stima.affidabilita === 'bassa' ? 'incerta' : 'media'} (${stima.fonte.replace('_', ' ')})${stima.domanda ? html`<br/><b>${stima.domanda}</b> Correggi qui sotto.` : ''}</p>` : null}
    <${Campo} etichetta="Cosa"><textarea rows="2" value=${f.descrizione} onInput=${e => set('descrizione', e.target.value)}></textarea><//>
    <div class="griglia">
      <${Campo} etichetta="kcal"><input inputmode="numeric" value=${f.kcal} onInput=${e => set('kcal', e.target.value)} /><//>
      <${Campo} etichetta="Ora"><input type="time" value=${f.ora} onInput=${e => set('ora', e.target.value)} /><//>
      <${Campo} etichetta="Proteine g"><input inputmode="decimal" value=${f.proteine} onInput=${e => set('proteine', e.target.value)} /><//>
      <${Campo} etichetta="Carboidrati g"><input inputmode="decimal" value=${f.carboidrati} onInput=${e => set('carboidrati', e.target.value)} /><//>
    </div>
    <label class="spunta"><input type="checkbox" checked=${f.sgarro} onChange=${e => set('sgarro', e.target.checked)} /> È uno sgarro</label>
    <${Errore} e=${err} />
    <div class="azioni"><button class="primario largo" disabled=${!!lavoro} onClick=${salva}>${lavoro || 'Salva'}</button></div>
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
      <li>Le calorie dalle foto le stima <b>Gemini</b> (gratuito). Sul piano gratuito Google può usare le richieste per migliorare i suoi modelli.</li>
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
