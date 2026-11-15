# Fast Track 2

L'app di tutti i giorni per dieta, digiuno 16/8 e attività di Paolo, riscritta il 15/11/2026.

- **Pubblicata** su GitHub Pages: https://paolocortese.github.io/fasttrack/ (si installa sull'iPhone con Condividi → Aggiungi alla schermata Home).
- **Nessun passaggio di compilazione:** moduli JavaScript (`js/`), Preact + htm e Firebase da CDN con versione fissa.
- **Dati:** database Firebase `azienda-salute` (separato da ADV HUB), accesso con email e password, regole che lasciano entrare solo l'utente di Paolo. Questo repo è pubblico ma contiene solo codice: nessun dato.
- **Da dove vengono le calorie** (deciso il 15/11): ⭐ *I miei* (i cibi abituali, collezione `preferiti`), 🔎 *Cerca* su **Open Food Facts** (per nome o codice a barre, valori dell'etichetta, gratuito e senza chiave), ✍️ *A mano*. Nei casi limite 🤖 l'app copia una domanda per l'**app Gemini**: Paolo allega la foto lì e incolla la riga `FASTTRACK | … | kcal: …`, che l'app legge. Nessuna chiamata automatica a Gemini (il piano gratuito dell'API era sovraccarico).
- **Il motore** (`js/motore.js`): peso di tendenza, basale Mifflin-St Jeor, obiettivo mai sotto il basale, attività che non si somma al budget, ritaratura del sabato sul calo reale, consigli del momento. Le stesse regole stanno in AZienda (`app/src/lib/salute.ts`), dove **Greg** legge questo database per le verifiche: se ne cambi una, cambiala in tutti e due.
- **Passi e calorie attive** arrivano la sera dal Comando rapido dell'iPhone, attraverso AZienda (`/api/salute`).
