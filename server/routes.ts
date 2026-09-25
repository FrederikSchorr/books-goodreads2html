import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { GoogleGenAI } from "@google/genai";

const coverCache = new Map<string, string | null>();
const descriptionCache = new Map<string, string | null>();

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) return null;
  return res.json();
}

function cleanTitle(title: string): string {
  return title.replace(/\s*\(.*?\)\s*/g, "").replace(/[:;,!?]/g, "").trim();
}

function findThumbnail(data: any, preferTitle?: string): string | null {
  if (!data?.items) return null;
  if (preferTitle) {
    const clean = preferTitle.replace(/\s*\(.*?\)\s*/g, "").toLowerCase().trim();
    for (const item of data.items) {
      const t = (item?.volumeInfo?.title || "").toLowerCase().trim();
      const thumb = item?.volumeInfo?.imageLinks?.thumbnail;
      if (thumb && t === clean) return thumb.replace("http://", "https://");
    }
  }
  for (const item of data.items) {
    const thumb = item?.volumeInfo?.imageLinks?.thumbnail;
    if (thumb) return thumb.replace("http://", "https://");
  }
  return null;
}

function findGoogleDescription(data: any): string | null {
  if (!data?.items) return null;
  for (const item of data.items) {
    const desc = item?.volumeInfo?.description;
    if (desc) return desc;
  }
  return null;
}

async function findCover(isbn: string, title: string, author: string): Promise<string | null> {
  const cacheKey = `${isbn}|${title}|${author}`;
  if (coverCache.has(cacheKey)) return coverCache.get(cacheKey)!;

  let coverUrl: string | null = null;

  if (isbn) {
    try {
      const olUrl = `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg?default=false`;
      const olRes = await fetch(olUrl, { method: "HEAD", redirect: "manual" });
      if (olRes.status === 200 && olRes.headers.get("content-type")?.startsWith("image")) {
        coverUrl = olUrl;
      } else if (olRes.status >= 300 && olRes.status < 400) {
        const loc = olRes.headers.get("location") || "";
        if (loc && !loc.includes("no-image") && !loc.includes("default")) {
          const followRes = await fetch(loc, { method: "HEAD" });
          if (followRes.ok && followRes.headers.get("content-type")?.startsWith("image")) {
            coverUrl = olUrl;
          }
        }
      }
    } catch {}

    if (!coverUrl) {
      try {
        const data = await fetchJson(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`);
        const thumb = findThumbnail(data);
        if (thumb) coverUrl = thumb;
      } catch {}
    }
  }

  if (!coverUrl && title && author) {
    const cleaned = cleanTitle(title);
    const q = `intitle:${cleaned} inauthor:${author}`;
    try {
      const data = await fetchJson(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}`);
      const thumb = findThumbnail(data, title);
      if (thumb) coverUrl = thumb;
    } catch {}

    if (!coverUrl && cleaned.length > 40) {
      const shortTitle = cleaned.includes(" ") ? cleaned.split(/\s+/).slice(0, 5).join(" ") : cleaned;
      const q2 = `intitle:${shortTitle} inauthor:${author}`;
      try {
        const data = await fetchJson(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q2)}`);
        const thumb = findThumbnail(data, title);
        if (thumb) coverUrl = thumb;
      } catch {}
    }

    if (!coverUrl) {
      const q3 = `"${cleaned}" ${author}`;
      try {
        const data = await fetchJson(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q3)}`);
        const thumb = findThumbnail(data, title);
        if (thumb) coverUrl = thumb;
      } catch {}
    }
  }

  coverCache.set(cacheKey, coverUrl);
  return coverUrl;
}

async function findDescription(isbn: string, title: string, author: string): Promise<string | null> {
  const cacheKey = `${isbn}|${title}|${author}`;
  if (descriptionCache.has(cacheKey)) return descriptionCache.get(cacheKey)!;

  let desc: string | null = null;

  if (isbn) {
    try {
      const olData = await fetchJson(`https://openlibrary.org/isbn/${isbn}.json`);
      if (olData) {
        const d = typeof olData.description === "string" ? olData.description : olData.description?.value;
        if (d) desc = d;
      }
    } catch {}

    if (!desc) {
      try {
        const data = await fetchJson(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`);
        const gDesc = findGoogleDescription(data);
        if (gDesc) desc = gDesc;
      } catch {}
    }
  }

  if (!desc && title && author) {
    const q = `intitle:${cleanTitle(title)} inauthor:${author}`;
    try {
      const data = await fetchJson(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}`);
      const gDesc = findGoogleDescription(data);
      if (gDesc) desc = gDesc;
    } catch {}
  }

  descriptionCache.set(cacheKey, desc);
  return desc;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.get("/api/cover", async (req, res) => {
    const isbn = (req.query.isbn as string) || "";
    const title = (req.query.title as string) || "";
    const author = (req.query.author as string) || "";

    if (!isbn && !title) {
      return res.json({ url: null });
    }

    const url = await findCover(isbn, title, author);
    res.json({ url });
  });

  app.get("/api/description", async (req, res) => {
    const isbn = (req.query.isbn as string) || "";
    const title = (req.query.title as string) || "";
    const author = (req.query.author as string) || "";

    if (!isbn && !title) {
      return res.json({ description: null });
    }

    const description = await findDescription(isbn, title, author);
    res.json({ description });
  });

  app.post("/api/year-summary", async (req, res) => {
    try {
      const { year, books } = req.body as {
        year: number | string;
        books: Array<{ title: string; author: string; myRating: number; myReview: string }>;
      };

      if (!books || books.length === 0) {
        return res.json({ summary: "" });
      }

      const ai = new GoogleGenAI({
        apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY,
        httpOptions: {
          apiVersion: "",
          baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
        },
      });

      const bookList = books.map((b, i) => {
        const rating = b.myRating > 0 ? `${b.myRating}/5 Sterne` : "nicht bewertet";
        const review = b.myReview?.trim() ? `Review: ${b.myReview.trim().slice(0, 300)}` : "";
        return `${i + 1}. "${b.title}" von ${b.author} (${rating})${review ? "\n   " + review : ""}`;
      }).join("\n");

      const yearLabel = typeof year === "number" ? `${year}` : "ohne bestimmtes Jahr";
      const prompt = `Du analysierst das persönliche Lesejahr einer Person. Schreibe eine kurze, persönliche Zusammenfassung (4-6 Sätze, auf Deutsch) über die folgenden ${books.length} Bücher, die ${yearLabel} gelesen wurden.

Fokus:
- Gehe auf 2-3 herausragende Highlights ein und nenne sie beim Titel. Was hat den Leser besonders begeistert?
- Erkenne thematische Muster oder Genre-Schwerpunkte und beschreibe sie stellvertretend anhand konkreter Bücher.
- Falls es einen erkennbaren inhaltlichen roten Faden gibt (z.B. "Das Jahr stand im Zeichen von..."), beschreibe ihn.
- Beachte die zeitliche Abfolge: Hat sich der Lesegeschmack im Laufe des Jahres verändert? Gibt es Phasen? Die Bücher sind chronologisch geordnet.
- Sprich den Leser direkt mit "du/dein" an.

Regeln:
- Kein Markdown, nur Fließtext.
- Persönlich und lebendig schreiben, nicht wie eine Buchrezension sondern wie ein Rückblick auf das Lesejahr.

Bücher (chronologisch):
${bookList}`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-pro",
        contents: prompt,
      });

      const summary = response.text?.trim() || "";
      res.json({ summary });
    } catch (error) {
      console.error("Error generating year summary:", error);
      res.json({ summary: "" });
    }
  });

  app.post("/api/genre-summary", async (req, res) => {
    try {
      const { books } = req.body as {
        books: Array<{ title: string; author: string; myRating: number; myReview: string }>;
      };

      if (!books || books.length === 0) {
        return res.json({ genres: "" });
      }

      const ai = new GoogleGenAI({
        apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY,
        httpOptions: {
          apiVersion: "",
          baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
        },
      });

      const bookList = books.map((b, i) => {
        const rating = b.myRating > 0 ? `${b.myRating}/5` : "";
        return `${i + 1}. "${b.title}" von ${b.author}${rating ? ` (${rating})` : ""}`;
      }).join("\n");

      const prompt = `Du analysierst das persönliche Leseverhalten einer Person anhand ihrer Bücherliste mit Bewertungen. Identifiziere 5-6 Genre-Kategorien oder thematische Muster und beschreibe, wie stark sich der Leser für jedes Genre interessiert.

WICHTIG: Es geht NICHT darum, die Genres literarisch zu beschreiben. Es geht darum, das Leseverhalten zu analysieren:
- Wie viel liest die Person in diesem Genre?
- Wie bewertet sie diese Bücher? (Gibt es auffällige Muster bei den Sternen?)
- Was fällt auf? (z.B. "wird von dir oft mit 5 Sternen belohnt", "du bewertest hier sehr differenziert und kritisch", "wenn du zu einem Spannungsroman greifst, trifft er meist genau deinen Geschmack")

Sprich den Leser direkt mit "du/dein" an. Schreibe auf Deutsch.

Format für jede Kategorie:
- Nummerierte Überschrift mit <b> HTML-Tag, z.B.: <b>1. Historische Fiktion & fiktionale Biografien (oft mit starkem Frauenfokus)</b>
- Danach ein persönlicher Absatz (2-3 Sätze), der beschreibt wie sehr sich der Leser für dieses Genre interessiert und wie er es bewertet.
- Dann konkrete Beispiele: „Buchtitel" (Autor) mit Bewertung, z.B.: Beispiele (oft 4-5 Sterne): „The Rose Code", „The Personal Librarian".
- Optional: Wenn es im selben Genre schlecht bewertete Bücher gibt, erwähne den Kontrast, z.B.: Kritischer bewertet (1-2 Sterne): „Buchtitel" hat dir eher nicht gefallen.

Regeln:
- KEIN Markdown, KEINE #-Überschriften, KEINE Aufzählungszeichen mit - oder *.
- Nur <b> HTML-Tags für Hervorhebungen, sonst reiner Text.
- Kategorien mit Leerzeilen trennen.

Bücher:
${bookList}`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-pro",
        contents: prompt,
      });

      const genres = response.text?.trim() || "";
      res.json({ genres });
    } catch (error: any) {
      console.error("Error generating genre summary:", error?.message || error);
      res.status(500).json({ genres: "", error: error?.message || "Genre summary generation failed" });
    }
  });

  app.post("/api/batch-metadata", async (req, res) => {
    const books: Array<{ bookId: string; isbn: string; title: string; author: string; needCover: boolean; needDescription: boolean }> = req.body.books || [];

    const results: Record<string, { coverUrl?: string | null; description?: string | null }> = {};

    const CONCURRENCY = 5;
    for (let i = 0; i < books.length; i += CONCURRENCY) {
      const batch = books.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map(async (b) => {
        const entry: { coverUrl?: string | null; description?: string | null } = {};
        if (b.needCover) {
          entry.coverUrl = await findCover(b.isbn, b.title, b.author);
        }
        if (b.needDescription) {
          entry.description = await findDescription(b.isbn, b.title, b.author);
        }
        results[b.bookId] = entry;
      }));
    }

    res.json({ results });
  });

  return httpServer;
}
