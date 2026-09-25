import Papa from "papaparse";
import type { Book, YearSummary } from "@shared/schema";

interface GoodreadsRow {
  "Book Id": string;
  Title: string;
  Author: string;
  ISBN: string;
  ISBN13: string;
  "My Rating": string;
  "Average Rating": string;
  Publisher: string;
  Binding: string;
  "Number of Pages": string;
  "Year Published": string;
  "Original Publication Year": string;
  "Date Read": string;
  "Date Added": string;
  "Exclusive Shelf": string;
  "My Review": string;
}

function cleanIsbn(raw: string): string {
  return raw.replace(/[=""\s]/g, "").trim();
}

function parseDate(dateStr: string): string {
  if (!dateStr) return "";
  return dateStr.trim();
}

export function parseGoodreadsCsv(csvText: string): Book[] {
  const result = Papa.parse<GoodreadsRow>(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  return result.data.map((row) => ({
    bookId: row["Book Id"] || "",
    title: row["Title"] || "",
    author: row["Author"] || "",
    isbn: cleanIsbn(row["ISBN"] || ""),
    isbn13: cleanIsbn(row["ISBN13"] || ""),
    myRating: parseInt(row["My Rating"] || "0", 10) || 0,
    averageRating: parseFloat(row["Average Rating"] || "0") || 0,
    publisher: row["Publisher"] || "",
    binding: row["Binding"] || "",
    numberOfPages: parseInt(row["Number of Pages"] || "0", 10) || undefined,
    yearPublished: parseInt(row["Year Published"] || "0", 10) || undefined,
    originalPublicationYear: parseInt(row["Original Publication Year"] || "0", 10) || undefined,
    dateRead: parseDate(row["Date Read"] || ""),
    dateAdded: parseDate(row["Date Added"] || ""),
    exclusiveShelf: row["Exclusive Shelf"] || "",
    myReview: (row["My Review"] || "").trim(),
  }));
}

export function getReadBooks(books: Book[]): Book[] {
  return books.filter((b) => b.exclusiveShelf === "read" || b.dateRead);
}

export function getReadBooksWithDate(books: Book[]): Book[] {
  return books.filter((b) => (b.exclusiveShelf === "read" || b.dateRead) && b.dateRead);
}

export function getReadBooksWithoutDate(books: Book[]): Book[] {
  return books.filter((b) => b.exclusiveShelf === "read" && !b.dateRead)
    .sort((a, b) => (b.dateAdded || "").localeCompare(a.dateAdded || ""));
}

const YYYY_MM_DD = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/;
const MM_DD_YYYY = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

export function getYearFromDate(dateStr: string): number | null {
  if (!dateStr) return null;
  const trimmed = dateStr.trim();

  const matchYMD = trimmed.match(YYYY_MM_DD);
  if (matchYMD) {
    const year = parseInt(matchYMD[1], 10);
    if (year >= 1900 && year <= 2100) return year;
  }

  const matchMDY = trimmed.match(MM_DD_YYYY);
  if (matchMDY) {
    const year = parseInt(matchMDY[3], 10);
    if (year >= 1900 && year <= 2100) return year;
  }

  return null;
}

function getEffectiveDate(book: Book): string {
  return book.dateRead || book.dateAdded || "";
}

export function getYearSummaries(books: Book[]): YearSummary[] {
  const readBooks = getReadBooksWithDate(books);
  const yearMap = new Map<number, number>();

  for (const book of readBooks) {
    const year = getYearFromDate(book.dateRead || "");
    if (year) {
      yearMap.set(year, (yearMap.get(year) || 0) + 1);
    }
  }

  return Array.from(yearMap.entries())
    .map(([year, count]) => ({ year, count }))
    .sort((a, b) => b.year - a.year);
}

export function getBooksForYears(books: Book[], years: number[]): Book[] {
  const readBooks = getReadBooksWithDate(books);
  return readBooks
    .filter((book) => {
      const year = getYearFromDate(book.dateRead || "");
      return year !== null && years.includes(year);
    })
    .sort((a, b) => (b.dateRead || "").localeCompare(a.dateRead || ""));
}

export function formatDateGerman(dateStr: string): string {
  if (!dateStr) return "";
  const trimmed = dateStr.trim();

  const matchYMD = trimmed.match(YYYY_MM_DD);
  if (matchYMD) {
    return `${matchYMD[3].padStart(2, "0")}.${matchYMD[2].padStart(2, "0")}.${matchYMD[1]}`;
  }

  const matchMDY = trimmed.match(MM_DD_YYYY);
  if (matchMDY) {
    return `${matchMDY[2].padStart(2, "0")}.${matchMDY[1].padStart(2, "0")}.${matchMDY[3]}`;
  }

  return dateStr;
}

export function getStars(rating: number): string {
  return "★".repeat(rating);
}

export function getCoverUrl(isbn: string, isbn13: string): string | null {
  const id = isbn13 || isbn;
  if (!id) return null;
  return `https://covers.openlibrary.org/b/isbn/${id}-M.jpg?default=false`;
}

export function sanitizeReviewHtml(review: string): string {
  if (!review) return "";

  let text = review
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<b>(.*?)<\/b>/gi, "**BOLD_START**$1**BOLD_END**")
    .replace(/<strong>(.*?)<\/strong>/gi, "**BOLD_START**$1**BOLD_END**")
    .replace(/<i>(.*?)<\/i>/gi, "**ITALIC_START**$1**ITALIC_END**")
    .replace(/<em>(.*?)<\/em>/gi, "**ITALIC_START**$1**ITALIC_END**")
    .replace(/<[^>]+>/g, "");

  text = text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, " ");

  text = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  text = text
    .replace(/\*\*BOLD_START\*\*/g, "<strong>")
    .replace(/\*\*BOLD_END\*\*/g, "</strong>")
    .replace(/\*\*ITALIC_START\*\*/g, "<em>")
    .replace(/\*\*ITALIC_END\*\*/g, "</em>");

  return text;
}

export function reviewToPlainText(review: string): string {
  if (!review) return "";
  return review
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, " ");
}
