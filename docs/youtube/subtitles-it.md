# Italian subtitles plan

Decision (Sep 29): one English channel, Italian subtitles on every video and Short. Evidence: R13 in
[research.md](research.md).

## Steps for each video

1. **The script is the source.** After editing, update the script file so it matches what was said
   (cut sentences out, fix changed numbers).
2. **English captions.** Upload the video as private. In YouTube Studio → Subtitles → English → Add →
   **Auto-sync**, paste the spoken text from the script. YouTube adds the timings. Check the first and
   last minute, then download the English `.srt`.
3. **Italian draft.** Claude translates the `.srt` line by line, keeping every timing and every line
   break position, and following the glossary below. The draft goes in the video's folder or next to
   the edit project, not in the repo.
4. **Review.** You read the Italian file once with the video playing. If a native speaker can read
   it, better; ask for 10 minutes, not a full edit. Fix anything that sounds translated.
5. **Upload** the Italian `.srt` (Subtitles → Add language → Italian → Upload file → With timing).
6. **Title and description in Italian.** Studio → Subtitles → Italian → "Title & description". The
   Italian description keeps the same chapters and links; the chapter names are translated.
7. Tick "Sottotitoli in italiano" in the checklist in [format.md](format.md#what-each-video-must-pass-before-publishing).

Shorts: the same steps. Burned-in on-screen text stays in English (it's part of the picture); the
subtitles translate the voice.

## Style rules

These are common subtitling practice (general knowledge), not a YouTube requirement:

- At most **2 lines**, about **42 characters** per line.
- Each subtitle on screen **1 to 7 seconds**; aim for no more than about 17 characters per second.
- Split lines at natural pauses, never between an article and its noun.
- Use "tu", as the app does ("Collega e identifica", "Ripristina il mio firmware").
- Numbers: decimal comma in sentences ("3,3 V", "8,7 mA"); keep code, register values and
  formulas exactly as shown on screen ("0x76", "0xD0", `Wire.begin(22, 21)`).
- When the voice reads on-screen code, don't translate the code; translate only the explanation.

## Glossary

**Rule:** a label that appears in the app is written exactly as the Italian app shows it
(`shared/i18n/it/*.ts`). An Italian viewer who downloads BoardPilot must find the same words.

| English (as spoken) | Italian (subtitle) | Where it comes from |
|---|---|---|
| Debug a problem | Risolvi un problema | `shared/i18n/it` |
| Connect and identify | Collega e identifica | `shared/i18n/it` |
| Test hardware | Testa l’hardware | `shared/i18n/it` |
| New project | Nuovo progetto | `shared/i18n/it` |
| Flash firmware | Carica firmware | `shared/i18n/it` |
| Parts library | Libreria componenti | `shared/i18n/it` |
| Real board | Scheda reale | `shared/i18n/it` |
| Restore my firmware | Ripristina il mio firmware | `shared/i18n/it` |
| Show on the 3D board | Mostra sulla scheda 3D | `shared/i18n/it` |
| Install the diagnostic agent | Installa l’agente diagnostico | `shared/i18n/it/flows.ts` |
| Debug: sensor not responding | Debug: il sensore non risponde | `shared/i18n/it/flows.ts` |
| Values look wrong | I valori sembrano sbagliati | `shared/i18n/it/flows.ts` |
| Check power and pull-ups | Controlla alimentazione e pull-up | `shared/i18n/it/flows.ts` |
| Swap test: SDA and SCL exchanged | Test di scambio: SDA e SCL invertiti | `shared/i18n/it/flows.ts` |
| SDA and SCL are crossed | SDA e SCL sono invertiti | `shared/i18n/it/flows.ts` |
| Read the chip ID | Leggi l’ID del chip | `shared/i18n/it/flows.ts` |
| This is a different chip | Questo è un chip diverso | `shared/i18n/it/flows.ts` |
| Debug: board keeps resetting | Debug: la scheda continua a riavviarsi | `shared/i18n/it/flows.ts` |
| The power supply dips too low | L’alimentazione scende troppo | `shared/i18n/it/flows.ts` |
| Garbage on serial | Caratteri strani sulla seriale | `shared/i18n/it/flows.ts` |
| board | scheda | app |
| resistor | resistenza | `shared/i18n/it/lessons.ts` |
| wire | filo | common use |
| Why doesn't it work? (series) | Perché non funziona? | new, use every time |
| Embedded for software developers (series) | Embedded per sviluppatori software | new, use every time |

**Kept in English** (Italian makers use them as they are): I2C, SPI, UART, SDA, SCL, pull-up,
pull-down, GPIO, ADC, PWM, firmware, flash (the memory), watchdog, brownout (add "calo di tensione"
the first time), breakout, jumper, datasheet, bit, byte, register names, library names.

If a term is missing, look it up in `shared/i18n/it` first; if it's not there, add it to this table
the first time you use it, so every video uses the same word.
