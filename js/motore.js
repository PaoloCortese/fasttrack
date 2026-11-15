// IL MOTORE DEI NUMERI di Fast Track. Li calcola il codice, mai l'intelligenza artificiale:
// sono gli errori di Gemini da non ripetere (basale cambiato senza motivo, obiettivo sotto il basale,
// calorie dell'attività contate due volte, una giornata a 880 kcal lodata come «ottimo deficit»).
// Le stesse regole stanno in AZienda (app/src/lib/salute.ts), dove Greg legge questo database:
// se ne cambi una qui, cambiala anche lì.
import { db, collection, doc, getDoc, getDocs, setDoc, query, where, orderBy, limit } from './firebase.js';

export const KCAL_PER_KG = 7700;
export const DEFICIT_STD = 500;          // kcal al giorno sotto il fabbisogno ≈ 0,45 kg a settimana
export const FATTORE_INIZIALE = 1.375;   // «leggermente attivo»: solo per partire, poi si ritara sul calo reale
export const MIN_GIORNI_RITARATURA = 5;  // una settimana registrata a metà non ritara (e lo si dice)
export const ORE_DIGIUNO = 16;
export const PASSI_OBIETTIVO = 8000;

const PROFILO_BASE = { altezzaCm: 178, annoNascita: 1963, sesso: 'M', protocollo: '16/8', finestra: '13:30–21:30', deficit: DEFICIT_STD };

// ---------- date in ora italiana (la vecchia Fast Track usava l'ora UTC: dopo mezzanotte sbagliava giorno) ----------
export function oggiRoma(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
export function oraRoma(d = new Date()) {
  return new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit' }).format(d);
}
export function addGiorni(iso, n) {
  const [y, m, g] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, g + n)).toISOString().slice(0, 10);
}
export function giornoSettimana(iso) {
  const [y, m, g] = iso.split('-').map(Number);
  return ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'][new Date(Date.UTC(y, m - 1, g)).getUTCDay()];
}
export function dataBreve(iso) { return `${giornoSettimana(iso)} ${iso.slice(8, 10)}/${iso.slice(5, 7)}`; }
export const r0 = x => Math.round(x);
export const r1 = x => Math.round(x * 10) / 10;
export const kcalTxt = n => Math.round(n).toLocaleString('it-IT');
export const kgTxt = n => (Math.round(n * 10) / 10).toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

// ---------- profilo ----------
export async function leggiProfilo() {
  const s = await getDoc(doc(db, 'profilo', 'paolo'));
  return { ...PROFILO_BASE, ...(s.exists() ? s.data() : {}) };
}
export async function salvaProfilo(campi) { await setDoc(doc(db, 'profilo', 'paolo'), campi, { merge: true }); }

/** Mifflin-St Jeor: cambia SOLO se cambia il peso di tendenza (circa 10 kcal per kg). */
export function bmrMifflin(kg, p, anno = Number(oggiRoma().slice(0, 4))) {
  const eta = anno - p.annoNascita;
  const valore = r0(10 * kg + 6.25 * p.altezzaCm - 5 * eta + (p.sesso === 'M' ? 5 : -161));
  return { valore, eta, formula: `10×${kgTxt(kg)} kg + 6,25×${p.altezzaCm} cm − 5×${eta} anni + ${p.sesso === 'M' ? 5 : -161}` };
}

// ---------- pesate e tendenza ----------
export async function pesate(da, a) {
  const s = await getDocs(query(collection(db, 'pesate'), where('data', '>=', da), where('data', '<=', a)));
  return s.docs.map(d => d.data()).filter(x => typeof x.kg === 'number').sort((x, y) => x.data.localeCompare(y.data));
}
/** Peso di tendenza = media delle pesate degli ultimi 7 giorni; se non ce ne sono, l'ultima disponibile. */
export async function pesoTendenza(data) {
  const da = addGiorni(data, -6);
  const v = await pesate(da, data);
  if (v.length) return { kg: r1(v.reduce((s, x) => s + x.kg, 0) / v.length), metodo: `media di ${v.length} pesat${v.length === 1 ? 'a' : 'e'} degli ultimi 7 giorni` };
  const s = await getDocs(query(collection(db, 'pesate'), where('data', '<', da), orderBy('data', 'desc'), limit(1)));
  if (!s.empty) { const x = s.docs[0].data(); return { kg: x.kg, metodo: `ultima pesata (${dataBreve(x.data)})` }; }
  return null;
}
/** Tendenza giorno per giorno (per il grafico): media mobile a 7 giorni delle pesate. */
export function serieTendenza(lista) {
  return lista.map(p => {
    const da = addGiorni(p.data, -6);
    const fin = lista.filter(x => x.data >= da && x.data <= p.data);
    return { data: p.data, kg: p.kg, tendenza: r1(fin.reduce((s, x) => s + x.kg, 0) / fin.length) };
  });
}

// ---------- i numeri del giorno ----------
export async function pastiDel(data) {
  const s = await getDocs(query(collection(db, 'pasti'), where('data', '==', data)));
  return s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => String(a.ora || '').localeCompare(String(b.ora || '')));
}
export async function giorno(data) {
  const s = await getDoc(doc(db, 'giorni', data));
  return s.exists() ? s.data() : null;
}

export function calcola(p, tendenza, pasti, g) {
  const kg = tendenza?.kg ?? 86.4;
  const basale = bmrMifflin(kg, p);
  let fabbisogno = p.fabbisogno, fonte = p.fabbisognoFonte || '';
  if (!fabbisogno) { fabbisogno = r0(basale.valore * FATTORE_INIZIALE); fonte = `stima di partenza: basale × ${String(FATTORE_INIZIALE).replace('.', ',')}; si ritara il sabato sul calo reale`; }
  const deficit = p.deficit || DEFICIT_STD;
  const grezzo = fabbisogno - deficit;
  const obiettivo = Math.max(basale.valore, grezzo);
  const mangiato = r0(pasti.reduce((s, x) => s + (Number(x.kcal) || 0), 0));
  const proteine = r0(pasti.reduce((s, x) => s + (Number(x.proteine) || 0), 0));
  return {
    tendenza: tendenza || { kg, metodo: 'nessuna pesata: valore di riserva' },
    basale, fabbisogno: { valore: fabbisogno, fonte }, deficit,
    obiettivo, obiettivoNota: grezzo < basale.valore ? `fermo al basale: ${kcalTxt(grezzo)} sarebbe sotto` : `${kcalTxt(fabbisogno)} − ${deficit}`,
    mangiato, proteine, residuo: obiettivo - mangiato,
    deficitOggi: fabbisogno - mangiato,   // l'attività NON si somma: il fabbisogno la comprende già
    giorno: g, pasti,
  };
}

export async function numeri(data = oggiRoma()) {
  const [p, t, pasti, g] = await Promise.all([leggiProfilo(), pesoTendenza(data), pastiDel(data), giorno(data)]);
  return { profilo: p, ...calcola(p, t, pasti, g) };
}

// ---------- digiuno 16/8 ----------
export async function statoDigiuno() {
  const s = await getDoc(doc(db, 'stato', 'digiuno'));
  return s.exists() ? s.data() : { inizio: null };
}

// ---------- i consigli del momento: regole scritte nel codice, gratis ----------
export function consigli(n, digiuno, adesso = new Date()) {
  const out = [];
  const ora = Number(new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', hour: 'numeric', hour12: false }).format(adesso));
  const passi = n.giorno?.passi ?? null;
  const inDigiuno = !!digiuno?.inizio;
  const oreDigiuno = inDigiuno ? (adesso.getTime() - digiuno.inizio) / 3600000 : 0;

  if (inDigiuno && oreDigiuno < ORE_DIGIUNO) {
    const manca = ORE_DIGIUNO - oreDigiuno;
    const apre = new Date(digiuno.inizio + ORE_DIGIUNO * 3600000);
    out.push({ tipo: 'digiuno', testo: `Sei a digiuno da ${Math.floor(oreDigiuno)} h: la finestra si apre alle ${oraRoma(apre)} (tra ${Math.floor(manca)} h ${Math.round((manca % 1) * 60)} min). Acqua, tè o caffè amaro vanno bene.` });
  } else if (inDigiuno) {
    out.push({ tipo: 'digiuno', testo: `16 ore fatte. Quando mangi, tocca «Apri la finestra»: hai ${kcalTxt(n.obiettivo)} kcal per oggi.` });
  }

  if (n.residuo < 0) {
    out.push({ tipo: 'allarme', testo: `Sei oltre di ${kcalTxt(-n.residuo)} kcal. Chiudi qui la giornata. Domani non compensare mangiando sotto il basale (${kcalTxt(n.basale.valore)}): torna al budget normale. Una camminata di 30–40 minuti stasera brucia circa 150–200 kcal.` });
  } else if (!inDigiuno && n.mangiato > 0 && n.residuo <= 350) {
    out.push({ tipo: 'ok', testo: `Restano ${kcalTxt(n.residuo)} kcal: basta uno spuntino proteico leggero (uno yogurt greco 0% ≈ 100 kcal) o un piatto di verdura, poi chiudi la finestra.` });
  } else if (!inDigiuno && n.residuo > 350) {
    const pasti = n.pasti.length;
    if (pasti === 0) out.push({ tipo: 'info', testo: `Finestra aperta, ${kcalTxt(n.obiettivo)} kcal a disposizione. Parti dalle proteine (pollo, pesce, uova, legumi) con verdura a volontà: tengono sazio più a lungo.` });
    else out.push({ tipo: 'info', testo: `Restano ${kcalTxt(n.residuo)} kcal. Per la cena: proteina magra (150 g di carne o 250 g di pesce), verdura a volontà e, se ci sta, 80 g di pasta o riso integrale (≈ 280 kcal).` });
  }

  if (ora >= 21 && n.mangiato > 0 && n.mangiato < n.basale.valore - 300 && n.residuo > 0) {
    out.push({ tipo: 'allarme', testo: `Oggi sei a ${kcalTxt(n.mangiato)} kcal, molto sotto il basale (${kcalTxt(n.basale.valore)}). Non è un successo: si perde muscolo e domani arriva la fame. Se puoi, aggiungi una proteina.` });
  }

  if (n.proteine > 0 && n.mangiato > 800 && n.proteine < 70) {
    out.push({ tipo: 'info', testo: `Proteine finora ${n.proteine} g: punta ad almeno 100–110 g al giorno, servono a non perdere muscolo mentre dimagrisci.` });
  }

  if (passi != null && passi < PASSI_OBIETTIVO) {
    const mancano = PASSI_OBIETTIVO - passi;
    out.push({ tipo: 'attivita', testo: `Passi: ${kcalTxt(passi)}. Ne mancano ${kcalTxt(mancano)} a 8.000, circa ${Math.round(mancano / 110)} minuti di camminata. L'attività aumenta il deficit: non ti dà calorie in più da mangiare.` });
  } else if (passi == null && ora >= 12) {
    out.push({ tipo: 'attivita', testo: `Passi di oggi non ancora arrivati: arrivano col Comando rapido la sera, oppure li scrivi tu in «Attività».` });
  } else if (passi != null) {
    out.push({ tipo: 'ok', testo: `${kcalTxt(passi)} passi: obiettivo raggiunto.` });
  }
  return out;
}

// ---------- diario di più giorni ----------
export async function diario(a, n) {
  const da = addGiorni(a, -(n - 1));
  const [pS, gS, wS] = await Promise.all([
    getDocs(query(collection(db, 'pasti'), where('data', '>=', da), where('data', '<=', a))),
    getDocs(query(collection(db, 'giorni'), where('data', '>=', da), where('data', '<=', a))),
    getDocs(query(collection(db, 'pesate'), where('data', '>=', da), where('data', '<=', a))),
  ]);
  const pasti = pS.docs.map(d => ({ id: d.id, ...d.data() }));
  const out = [];
  for (let i = 0; i < n; i++) {
    const d = addGiorni(da, i);
    const pp = pasti.filter(x => x.data === d);
    const g = gS.docs.find(x => x.id === d)?.data() || null;
    const w = wS.docs.find(x => x.data().data === d)?.data() || null;
    out.push({ data: d, kcal: r0(pp.reduce((s, x) => s + (Number(x.kcal) || 0), 0)), pasti: pp.length, sgarri: pp.filter(x => x.aderenza === 'sgarro').length,
      passi: g?.passi ?? null, kcalAttive: g?.kcalAttive ?? null, acquaL: g?.acquaL ?? null, chiusa: !!g?.chiusa, esito: g?.esito || null, pesata: w?.kg ?? null });
  }
  return out;
}

// ---------- il rito del sabato: ritaratura sul calo REALE ----------
export async function bilancioSettimana(fine = oggiRoma()) {
  const inizio = addGiorni(fine, -7);
  const giorni = await diario(addGiorni(fine, -1), 7);
  const completi = giorni.filter(g => g.chiusa && g.kcal > 0);
  const [tI, tF, p, prima] = await Promise.all([pesoTendenza(inizio), pesoTendenza(fine), leggiProfilo(), numeri(fine)]);
  const out = { periodo: `${dataBreve(inizio)} → ${dataBreve(addGiorni(fine, -1))}`, giorniCompleti: completi.length, tendenzaInizio: tI, tendenzaFine: tF, fabbisognoPrima: prima.fabbisogno.valore };
  let nuovo = prima.fabbisogno.valore, fonte = prima.fabbisogno.fonte;
  if (completi.length >= MIN_GIORNI_RITARATURA && tI && tF) {
    const media = completi.reduce((s, g) => s + g.kcal, 0) / completi.length;
    const deltaKg = tI.kg - tF.kg;
    const reale = r0(media + deltaKg * KCAL_PER_KG / 7);
    nuovo = r0((prima.fabbisogno.valore + reale) / 2);
    fonte = `ritarato il ${dataBreve(fine)}: mangiato in media ${kcalTxt(media)} kcal su ${completi.length} giorni, tendenza ${deltaKg >= 0 ? '−' : '+'}${kgTxt(Math.abs(deltaKg))} kg → fabbisogno reale ${kcalTxt(reale)}; media col precedente (${kcalTxt(prima.fabbisogno.valore)}) per non fare salti`;
    out.calcolo = { mediaMangiato: r0(media), caloKg: r1(deltaKg), fabbisognoReale: reale, deficitRealeGiorno: r0(deltaKg * KCAL_PER_KG / 7) };
  } else {
    out.nonRitarato = `Servono almeno ${MIN_GIORNI_RITARATURA} giornate chiuse e una pesata a inizio e fine settimana: ${completi.length} chiuse${!tI || !tF ? ', e manca una pesata' : ''}. Il fabbisogno resta ${kcalTxt(nuovo)} kcal.`;
  }
  const deficit = p.deficit || DEFICIT_STD;
  const obiettivo = Math.max(prima.basale.valore, nuovo - deficit);
  const pesoObiettivo = tF ? r1(tF.kg - deficit * 7 / KCAL_PER_KG) : null;
  await setDoc(doc(db, 'profilo', 'paolo'), { fabbisogno: nuovo, fabbisognoFonte: fonte, fabbisognoDal: fine, obiettivoPesoSettimana: pesoObiettivo }, { merge: true });
  await setDoc(doc(db, 'settimane', fine), { data: fine, ...out, fabbisogno: nuovo, fonte, basale: prima.basale, obiettivoKcal: obiettivo, pesoObiettivo, ts: Date.now() });
  return { ...out, fabbisognoNuovo: nuovo, fonte, basale: prima.basale, obiettivo, pesoObiettivo };
}
