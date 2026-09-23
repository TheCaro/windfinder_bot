[README.md](https://github.com/user-attachments/files/32575383/README.md)
# Windbot Wannsee 🌬️

Schreibt in eure Telegram-Gruppe, sobald in den nächsten 3 Tagen am Wannsee
**Mittelwind über 10 Knoten** vorhergesagt ist (zwischen 8 und 20 Uhr).
Komplett kostenlos: Telegram-Bot, Wetterdaten von Open-Meteo, Hosting über GitHub Actions.

Beispielnachricht:

```
🌬️ Wind am Wannsee (Mittelwind über 10 kn)

Freitag, 25.9.
• 12–17 Uhr: bis 16 kn aus W (Böen 26 kn)
```

- Jeder Tag wird nur **einmal** gemeldet.
- Wird die Vorhersage für einen schon gemeldeten Tag um 3 kn oder mehr stärker, kommt ein Update („⬆️ Mehr Wind“).
- Geprüft wird zweimal täglich, gegen 7 und 17 Uhr.

## Einrichtung (ca. 10 Minuten)

### 1. Telegram-Bot anlegen
1. In Telegram **@BotFather** öffnen und `/newbot` schicken.
2. Einen Namen (z. B. „Wannsee Wind“) und einen Benutzernamen, der auf `bot` endet, vergeben.
3. BotFather schickt einen **Token** (sieht aus wie `123456:ABC-...`). Den Token geheim halten.
4. Den Bot wie ein normales Mitglied zur Gruppe hinzufügen.

### 2. Chat-ID der Gruppe herausfinden
In der Gruppe irgendeine Nachricht schreiben, z. B. `/start@DeinBotName`. Dann im Browser öffnen:

```
https://api.telegram.org/bot<TOKEN>/getUpdates
```

Dort nach `"chat":{"id":-100…` suchen. Diese Zahl, **inklusive Minus**, ist die Chat-ID.
(Alternativ mit Node.js: `TELEGRAM_TOKEN=… node bot.js --chats`)

### 3. Auf GitHub hochladen (kostenloser Account reicht)
1. Auf github.com ein neues Repository anlegen, z. B. `windbot`. Es darf privat sein.
2. Alle Dateien aus diesem Ordner hochladen, **inklusive** des Ordners `.github/workflows/`.
   Über „Add file → Upload files“ geht das per Drag & Drop.
3. **Settings → Secrets and variables → Actions → New repository secret**, zweimal:
   - `TELEGRAM_TOKEN` = der Token von BotFather
   - `TELEGRAM_CHAT_ID` = die Chat-ID aus Schritt 2
4. **Actions**-Tab öffnen → „Windbot Wannsee“ → **Run workflow**. Damit testet ihr sofort.
   Ist gerade Wind angesagt, kommt jetzt eine Nachricht in die Gruppe.

Danach läuft der Bot von selbst.

## Anpassen

Oben in `bot.js` im Block `CONFIG`:

| Einstellung | Bedeutung | Standard |
|---|---|---|
| `schwelleKn` | Mittelwind muss darüber liegen | 10 |
| `vonStunde` / `bisStunde` | Nur Stunden in diesem Zeitraum zählen | 8 / 20 |
| `updateAbKn` | Ab so viel Mehr-Wind erneut melden | 3 |
| `lat` / `lon` | Ort | Wannsee |

Die Uhrzeiten der Prüfung stehen in `.github/workflows/windbot.yml` (in UTC).

## Hinweise
- Die Werte kommen von **Open-Meteo**, nicht von Windfinder. Beide rechnen mit ähnlichen Wettermodellen, trotzdem können die Zahlen um ein paar Knoten abweichen.
- GitHub pausiert geplante Workflows, wenn in einem Repository **60 Tage lang nichts passiert**. Da der Bot bei jeder Meldung `gemeldet.json` aktualisiert, passiert das normalerweise nicht. Nach einer langen Flaute kann es trotzdem nötig sein, im Actions-Tab einmal auf „Enable workflow“ zu klicken.
- GitHub startet geplante Läufe manchmal mit etwas Verspätung.
- Lokal testen ohne zu senden: `node bot.js --trocken` (braucht Node.js 18+).
