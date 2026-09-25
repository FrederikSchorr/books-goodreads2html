# Goodreads2PDF – Bücherliste-Generator

Ein Tool, das den CSV-Export deiner [Goodreads](https://www.goodreads.com/)-Bibliothek in eine schön gestaltete, eigenständige HTML-Bücherliste mit Covern, Sternebewertungen und Rezensionen verwandelt — inklusive optionaler KI-generierter Lesejahres- und Genre-Zusammenfassungen.

Die gesamte CSV-Verarbeitung und HTML-Erzeugung läuft clientseitig im Browser. Der Server ist bewusst schlank gehalten und übernimmt nur das Nachladen von Buchcovern/Beschreibungen sowie die optionalen KI-Zusammenfassungen.

## Funktionen

- **CSV-Import**: Goodreads-Export direkt im Browser einlesen (`papaparse`), keine Daten verlassen deinen Rechner außer für Cover-/KI-Abfragen
- **Jahresauswahl**: Bücher nach Lesejahr filtern, inklusive Sammelgruppe für Bücher ohne Datum
- **Cover & Beschreibungen**: automatischer Abruf über die OpenLibrary-Covers-API anhand der ISBN
- **KI-Zusammenfassungen** (optional): Lesejahres- und Genre-Analysen via Google Gemini, mit automatischem Fallback bei großen Bibliotheken (schrittweise Reduktion der Buchmenge bei Timeout/Fehler)
- **Export**: fertige, eigenständige HTML-Datei zum Download — keine externen Abhängigkeiten zur Laufzeit nötig

## Tech-Stack

| Bereich   | Technologie |
|-----------|-------------|
| Frontend  | React, TypeScript, Vite, Tailwind CSS, shadcn/ui (Radix UI) |
| Backend   | Express.js (TypeScript, via `tsx`) |
| KI        | Google Gemini (`@google/genai`, Modell `gemini-2.5-flash`) |
| Datenbank | PostgreSQL via Drizzle ORM (vorbereitet, aktuell nicht aktiv genutzt) |

## Projektstruktur

```
client/          React-Frontend (Seiten, Komponenten, HTML-Generator)
server/          Express-Server, API-Routen, KI-Integration
shared/          Gemeinsame Typen/Schemas (Zod) für Client & Server
script/          Build-Skripte für die Produktion
```

## Voraussetzungen

- Node.js 20+
- Ein Google Gemini API-Key, falls du die KI-Zusammenfassungen nutzen willst (ohne Key funktioniert der Rest der App weiterhin)

## Installation & lokaler Start

```bash
npm install
npm run dev
```

Die App läuft danach standardmäßig auf `http://localhost:5000`.

## Umgebungsvariablen

Lege für die lokale Entwicklung eine `.env`-Datei an (wird von `.gitignore` ausgeschlossen und nie eingecheckt):

| Variable | Zweck | Erforderlich |
|----------|-------|--------------|
| `AI_INTEGRATIONS_GEMINI_API_KEY` | API-Key für Google Gemini (Jahres-/Genre-Zusammenfassungen) | Optional — ohne Key schlagen nur die KI-Endpunkte fehl |
| `AI_INTEGRATIONS_GEMINI_BASE_URL` | Basis-URL für die Gemini-API | Optional, nur falls ein abweichender Endpunkt genutzt wird |
| `SESSION_SECRET` | Secret für Express-Sessions | Ja, für den Serverstart |
| `DATABASE_URL` | PostgreSQL-Verbindung (Drizzle ORM) | Optional — die App nutzt aktuell In-Memory-Storage |

Auf Replit werden `AI_INTEGRATIONS_GEMINI_*`-Variablen automatisch von der Gemini-Integration bereitgestellt. Außerhalb von Replit musst du sie selbst setzen bzw. einen eigenen Gemini-API-Key hinterlegen.

**Wichtig:** Committe niemals echte `.env`-Dateien, API-Keys oder persönliche Goodreads-Exporte in dieses Repository. Verwende ausschließlich Umgebungsvariablen/Secrets für Zugangsdaten.

## Build & Produktion

```bash
npm run build
npm start
```

## Scripts

| Befehl | Beschreibung |
|--------|--------------|
| `npm run dev` | Startet den Entwicklungsserver (Express + Vite-Middleware, HMR) |
| `npm run build` | Baut Client (Vite) und Server (esbuild) nach `dist/` |
| `npm start` | Startet die Produktionsversion aus `dist/` |
| `npm run check` | TypeScript-Typprüfung |
| `npm run db:push` | Schema-Änderungen via Drizzle in die Datenbank pushen |

## Datenschutz

Alle hochgeladenen Goodreads-CSV-Dateien und generierten Bücherlisten werden ausschließlich im Browser bzw. temporär auf dem Server für die aktuelle Anfrage verarbeitet und nicht dauerhaft gespeichert oder versioniert. Lade keine echten personenbezogenen Exporte in dieses Repository hoch.

## Lizenz

MIT
