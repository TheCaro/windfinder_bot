#!/usr/bin/env node
// Windbot Wannsee – meldet in einer Telegram-Gruppe, wenn in den nächsten
// 72 Stunden Mittelwind über 10 kn am Wannsee vorhergesagt ist.
// Wetterdaten: Open-Meteo (kostenlos, ohne Anmeldung).
// Benötigt Node.js 18+ und keine weiteren Pakete.
//
//   node bot.js            Vorhersage prüfen und ggf. in die Gruppe schreiben
//   node bot.js --trocken  Nur anzeigen, was gesendet würde (ohne Telegram)
//   node bot.js --chats    Chat-IDs der Gruppen anzeigen, in denen der Bot ist

const fs = require('fs');
const path = require('path');

const CONFIG = {
  token: process.env.TELEGRAM_TOKEN,
  chatId: process.env.TELEGRAM_CHAT_ID,
  lat: 52.43,          // Wannsee
  lon: 13.17,
  schwelleKn: 10,      // Mittelwind muss darüber liegen
  vonStunde: 8,        // nur Stunden zwischen 8 und 20 Uhr berücksichtigen
  bisStunde: 20,
  updateAbKn: 3,       // gemeldeten Tag erneut melden, wenn er um so viel stärker wird
  stateDatei: path.join(__dirname, 'gemeldet.json'),
};

const RICHTUNGEN = ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'];

// ---------- Wetterdaten ----------

async function holeVorhersage() {
  const params = new URLSearchParams({
    latitude: CONFIG.lat,
    longitude: CONFIG.lon,
    hourly: 'wind_speed_10m,wind_gusts_10m,wind_direction_10m',
    wind_speed_unit: 'kn',
    timezone: 'Europe/Berlin',
    timeformat: 'unixtime',
    forecast_days: '4',
  });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!res.ok) throw new Error(`Open-Meteo antwortet mit HTTP ${res.status}`);
  return aufbereiten(await res.json(), Date.now() / 1000);
}

function aufbereiten(data, jetzt) {
  const h = data.hourly;
  return h.time
    .map((t, i) => {
      const lokal = new Date((t + data.utc_offset_seconds) * 1000); // UTC-Felder = Berliner Zeit
      return {
        unix: t,
        tag: lokal.toISOString().slice(0, 10),
        stunde: lokal.getUTCHours(),
        wind: h.wind_speed_10m[i],
        boeen: h.wind_gusts_10m[i],
        richtung: h.wind_direction_10m[i],
      };
    })
    .filter((s) => s.unix >= jetzt - 3600 && s.unix < jetzt + 72 * 3600 && s.wind != null);
}

// ---------- Auswertung ----------

function findeFenster(stunden) {
  const fenster = [];
  let akt = null;
  for (const s of stunden) {
    const windig =
      s.wind > CONFIG.schwelleKn && s.stunde >= CONFIG.vonStunde && s.stunde < CONFIG.bisStunde;
    if (!windig) { akt = null; continue; }
    if (akt && akt.tag === s.tag && akt.bis === s.stunde) {
      akt.bis++;
      akt.stunden.push(s);
    } else {
      akt = { tag: s.tag, von: s.stunde, bis: s.stunde + 1, stunden: [s] };
      fenster.push(akt);
    }
  }
  return fenster;
}

function tagName(tag) {
  return new Date(`${tag}T12:00:00Z`).toLocaleDateString('de-DE', {
    weekday: 'long', day: 'numeric', month: 'numeric', timeZone: 'UTC',
  });
}

function beschreibe(f) {
  const staerkste = f.stunden.reduce((a, b) => (b.wind > a.wind ? b : a));
  const maxBoe = Math.max(...f.stunden.map((s) => s.boeen));
  const richtung = RICHTUNGEN[Math.round(staerkste.richtung / 45) % 8];
  return `${f.von}–${f.bis} Uhr: bis ${Math.round(staerkste.wind)} kn aus ${richtung} (Böen ${Math.round(maxBoe)} kn)`;
}

function baueNachricht(fenster, state, heute) {
  for (const tag of Object.keys(state)) if (tag < heute) delete state[tag];

  const proTag = new Map();
  for (const f of fenster) {
    if (!proTag.has(f.tag)) proTag.set(f.tag, []);
    proTag.get(f.tag).push(f);
  }

  const bloecke = [];
  for (const [tag, liste] of proTag) {
    const maxWind = Math.max(...liste.flatMap((f) => f.stunden.map((s) => s.wind)));
    const gemeldet = state[tag];
    if (gemeldet != null && maxWind < gemeldet + CONFIG.updateAbKn) continue;
    const kopf = (gemeldet != null ? '⬆️ Mehr Wind: ' : '') + tagName(tag);
    bloecke.push(kopf + '\n' + liste.map((f) => '• ' + beschreibe(f)).join('\n'));
    state[tag] = maxWind;
  }
  if (!bloecke.length) return null;
  return `🌬️ Wind am Wannsee (Mittelwind über ${CONFIG.schwelleKn} kn)\n\n` + bloecke.join('\n\n');
}

// ---------- Zustand (schon gemeldete Tage) ----------

function ladeState() {
  try { return JSON.parse(fs.readFileSync(CONFIG.stateDatei, 'utf8')); } catch { return {}; }
}

function speichereState(state) {
  fs.writeFileSync(CONFIG.stateDatei, JSON.stringify(state, null, 2) + '\n');
}

// ---------- Telegram ----------

async function telegram(methode, body = {}) {
  if (!CONFIG.token) throw new Error('TELEGRAM_TOKEN fehlt.');
  const res = await fetch(`https://api.telegram.org/bot${CONFIG.token}/${methode}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`Telegram-Fehler: ${data.description}`);
  return data.result;
}

async function zeigeChats() {
  const updates = await telegram('getUpdates');
  const chats = new Map();
  for (const u of updates) {
    const c = (u.message || u.my_chat_member || u.channel_post)?.chat;
    if (c) chats.set(c.id, c.title || c.username || c.first_name);
  }
  if (!chats.size) {
    console.log('Keine Chats gefunden. Bot zur Gruppe hinzufügen, dort eine Nachricht schreiben und nochmal versuchen.');
  }
  for (const [id, name] of chats) console.log(`${id}\t${name}`);
}

// ---------- Ablauf ----------

async function main(args) {
  if (args.includes('--chats')) return zeigeChats();
  const trocken = args.includes('--trocken');
  if (!trocken && !CONFIG.chatId) {
    throw new Error('TELEGRAM_CHAT_ID fehlt (mit "node bot.js --chats" herausfinden).');
  }

  const heute = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
  const state = ladeState();
  const text = baueNachricht(findeFenster(await holeVorhersage()), state, heute);

  if (!text) console.log('Nichts Neues zu melden.');
  else if (trocken) { console.log(text); return; }
  else {
    await telegram('sendMessage', { chat_id: CONFIG.chatId, text });
    console.log('Gesendet:\n' + text);
  }
  speichereState(state);
}

if (require.main === module) {
  main(process.argv.slice(2)).catch((e) => { console.error(e.message); process.exit(1); });
}

module.exports = { aufbereiten, findeFenster, baueNachricht };
