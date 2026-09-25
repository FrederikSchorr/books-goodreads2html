import type { Book } from "@shared/schema";
import { formatDateGerman, getStars, getYearFromDate, sanitizeReviewHtml } from "./csv-parser";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function sanitizeGenreHtml(html: string): string {
  return html
    .replace(/<(?!\/?b\b)[^>]*>/gi, "")
    .replace(/\n\n+/g, "</p><p>")
    .replace(/\n/g, "<br>");
}

function formatReviewForHtml(review: string): string {
  const sanitized = sanitizeReviewHtml(review);
  const paragraphs = sanitized.split(/\n\s*\n/).filter(p => p.trim());
  if (paragraphs.length <= 1) {
    return sanitized.split("\n").filter(l => l.trim()).join("<br>");
  }
  return paragraphs.map(p => {
    const lines = p.split("\n").map(l => l.trim()).filter(l => l);
    return `<p>${lines.join("<br>")}</p>`;
  }).join("");
}

function truncateDesc(text: string): string {
  const clean = text.replace(/<[^>]*>/g, "");
  if (clean.length <= 500) return escapeHtml(clean);
  const trimmed = clean.slice(0, 500);
  const lastSpace = trimmed.lastIndexOf(" ");
  return escapeHtml((lastSpace > 300 ? trimmed.slice(0, lastSpace) : trimmed) + " …");
}

function renderBookEntry(book: Book, descriptions?: Map<string, string>, covers?: Map<string, string>): string {
  const dateRaw = book.dateRead || book.dateAdded || "";
  const dateFormatted = formatDateGerman(dateRaw) + (!book.dateRead && book.dateAdded ? " (hinzugefügt)" : "");
  const stars = getStars(book.myRating);
  const review = book.myReview ? formatReviewForHtml(book.myReview) : "";

  const coverUrl = covers?.get(book.bookId);
  const coverHtml = coverUrl
    ? `<img src="${escapeHtml(coverUrl)}" alt="${escapeHtml(book.title)}" class="book-cover" />`
    : `<div class="no-cover">Kein Cover</div>`;

  let reviewContent = review
    ? review.replace(/^(\s*<p[^>]*>)/, `$1<span class="content-label">Review: </span>`).replace(/^(?!\s*<p)/, `<span class="content-label">Review: </span>`)
    : "";
  if (!review) {
    const cachedDesc = descriptions?.get(book.bookId);
    if (cachedDesc) {
      reviewContent = `<span class="content-label">Beschreibung: </span>${truncateDesc(cachedDesc)}`;
    }
  }

  return `
      <div class="book-entry">
        <div class="book-header-print">
          <div class="book-meta">
            <div class="book-title">${escapeHtml(book.title)}</div>
            <div class="book-author">${escapeHtml(book.author)}</div>
            <div class="book-date">${dateFormatted}</div>
            <div class="book-rating">${stars}</div>
          </div>
          <div class="book-cover-col">${coverHtml}</div>
        </div>
        <div class="book-review">${reviewContent || "&nbsp;"}</div>
      </div>`;
}

function renderYearCoverPage(
  yearLabel: string,
  bookCount: number,
  yearBooks: Book[],
  covers?: Map<string, string>,
  summary?: string,
): string {
  const ratingGroups: Map<number, Book[]> = new Map();
  for (const book of yearBooks) {
    const r = book.myRating || 0;
    if (!ratingGroups.has(r)) ratingGroups.set(r, []);
    ratingGroups.get(r)!.push(book);
  }
  const sortedRatings = Array.from(ratingGroups.keys()).sort((a, b) => b - a);

  const ratingRows = sortedRatings.map((rating) => {
    const booksInRating = ratingGroups.get(rating) || [];
    const clamped = Math.max(0, Math.min(5, rating));
    const stars = clamped > 0 ? "★".repeat(clamped) + "☆".repeat(5 - clamped) : "nicht bewertet";
    const coverThumbs = booksInRating.map((b) => {
      const coverUrl = covers?.get(b.bookId);
      if (coverUrl) {
        return `<img src="${escapeHtml(coverUrl)}" alt="${escapeHtml(b.title)}" class="cover-thumb" title="${escapeHtml(b.title)}" />`;
      }
      return `<div class="cover-thumb-placeholder" title="${escapeHtml(b.title)}">${escapeHtml(b.title.slice(0, 20))}</div>`;
    }).join("");
    return `
      <div class="rating-row">
        <div class="rating-stars">${stars}</div>
        <div class="rating-covers">${coverThumbs}</div>
      </div>`;
  }).join("");

  const highlightLabel = yearLabel === "Ohne Datum" ? "Highlights" : `Highlights in ${yearLabel}`;
  const summaryHtml = summary
    ? `<div class="year-summary"><p class="year-summary-heading">${escapeHtml(highlightLabel)}</p><p>${escapeHtml(summary)}</p></div>`
    : "";

  return `
    <section class="year-cover-page">
      <h2 class="year-heading">${escapeHtml(yearLabel)} <span class="year-count">(${bookCount} ${bookCount === 1 ? "Buch" : "Bücher"})</span></h2>
      <div class="rating-overview">
        ${ratingRows}
      </div>
      ${summaryHtml}
    </section>`;
}

export function generateBookListHtml(
  books: Book[],
  selectedYears: number[],
  descriptions?: Map<string, string>,
  covers?: Map<string, string>,
  undatedBooks?: Book[],
  summaries?: Map<string, string>,
  genreSummary?: string,
): string {
  const sortedYears = [...selectedYears].sort((a, b) => b - a);

  const yearGroups: Map<number, Book[]> = new Map();
  for (const year of sortedYears) {
    yearGroups.set(year, []);
  }
  for (const book of books) {
    const year = getYearFromDate(book.dateRead || "");
    if (year && yearGroups.has(year)) {
      yearGroups.get(year)!.push(book);
    }
  }

  const totalCount = books.length + (undatedBooks?.length || 0);
  const titleLabel = sortedYears.length === 0
    ? ""
    : sortedYears.length === 1
      ? `${sortedYears[0]}`
      : `${sortedYears[sortedYears.length - 1]}–${sortedYears[0]}`;

  const undatedCount = undatedBooks?.length || 0;
  const allCounts = sortedYears.map((y) => (yearGroups.get(y) || []).length);
  if (undatedCount > 0) allCounts.push(undatedCount);
  const maxCount = Math.max(...allCounts, 1);

  const chartRows = sortedYears.map((year) => {
    const count = (yearGroups.get(year) || []).length;
    const pct = Math.round((count / maxCount) * 100);
    return `
        <div class="chart-row">
          <div class="chart-year">${year}</div>
          <div class="chart-bar-wrap">
            <div class="chart-bar" style="width: ${pct}%">
              <span class="chart-count">${count}</span>
            </div>
          </div>
        </div>`;
  }).join("\n");

  const undatedRow = undatedCount > 0
    ? `<div class="chart-row">
          <div class="chart-year">?</div>
          <div class="chart-undated-label">${undatedCount} Bücher ohne Datum</div>
        </div>`
    : "";

  const totalGroups = sortedYears.length + (undatedCount > 0 ? 1 : 0);
  const isMultiYear = totalGroups > 1;
  const chart = isMultiYear ? `
    <div class="year-chart">
      ${chartRows}
      ${undatedRow}
    </div>` : "";

  const allBooks = [...books, ...(undatedBooks || [])];
  const sortedFiveStarBooks = allBooks
    .filter((b) => b.myRating === 5)
    .sort((a, b) => {
      const da = a.dateRead || a.dateAdded || "";
      const db = b.dateRead || b.dateAdded || "";
      return db.localeCompare(da);
    });
  const fiveStarPaired = sortedFiveStarBooks.map((book, idx) => ({
    book,
    size: Math.max(60, 90 - idx * 3),
  }));
  for (let i = fiveStarPaired.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [fiveStarPaired[i], fiveStarPaired[j]] = [fiveStarPaired[j], fiveStarPaired[i]];
  }

  const favoritesSection = isMultiYear && fiveStarPaired.length > 0
    ? (() => {
        const coverItems = fiveStarPaired.map(({ book: b, size }) => {
          const coverUrl = covers?.get(b.bookId);
          const h = Math.round(size * 1.5);
          if (coverUrl) {
            return `<img src="${escapeHtml(coverUrl)}" alt="${escapeHtml(b.title)}" title="${escapeHtml(b.title)}" class="fav-cover" style="width:${size}px;height:${h}px;" />`;
          }
          return `<div class="fav-cover-placeholder" style="width:${size}px;height:${h}px;" title="${escapeHtml(b.title)}">${escapeHtml(b.title.slice(0, 30))}</div>`;
        }).join("");
        return `
    <div class="favorites-section">
      <h2 class="section-heading">Lieblingsbücher</h2>
      <div class="favorites-covers">${coverItems}</div>
    </div>`;
      })()
    : "";

  const genreSection = isMultiYear && genreSummary
    ? `
    <div class="genre-section">
      <h2 class="section-heading">Genres</h2>
      <div class="genre-content">${sanitizeGenreHtml(genreSummary)}</div>
    </div>`
    : "";

  const sections = sortedYears.map((year) => {
    const yearBooks = yearGroups.get(year) || [];
    const coverPage = renderYearCoverPage(
      String(year),
      yearBooks.length,
      yearBooks,
      covers,
      summaries?.get(String(year)),
    );
    const entries = yearBooks.map(b => renderBookEntry(b, descriptions, covers)).join("\n");
    return `
      ${coverPage}
      <section class="year-section year-entries">
        ${entries}
      </section>`;
  }).join("\n");

  const undatedSection = undatedBooks && undatedBooks.length > 0
    ? (() => {
        const coverPage = renderYearCoverPage(
          "Ohne Datum",
          undatedBooks.length,
          undatedBooks,
          covers,
          undefined,
        );
        return `
          ${coverPage}
          <section class="year-section year-entries">
            ${undatedBooks.map(b => renderBookEntry(b, descriptions, covers)).join("\n")}
          </section>`;
      })()
    : "";

  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(titleLabel)} Bücher</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400..800;1,400..800&display=swap');

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: 'EB Garamond', Garamond, 'Times New Roman', serif;
      font-size: 9pt;
      line-height: 1.45;
      color: #1a1a1a;
      background: #fff;
      max-width: 800px;
      margin: 0 auto;
      padding: 40px 50px;
    }

    h1 {
      font-family: 'EB Garamond', Garamond, 'Times New Roman', serif;
      font-size: 16pt;
      font-weight: 600;
      color: #111;
      margin-bottom: 20px;
      padding-bottom: 12px;
      border-bottom: 2px solid #333;
    }

    .year-chart {
      margin-bottom: 20px;
    }

    .chart-row {
      display: flex;
      align-items: center;
      margin-bottom: 6px;
    }

    .chart-year {
      font-family: 'EB Garamond', Garamond, 'Times New Roman', serif;
      font-size: 11pt;
      font-weight: 700;
      color: #222;
      width: 60px;
      text-align: right;
      padding-right: 12px;
      flex-shrink: 0;
    }

    .chart-bar-wrap {
      flex: 1;
      min-width: 0;
    }

    .chart-bar {
      background: #f59e42;
      border-radius: 3px;
      min-width: 28px;
      padding: 4px 10px;
      box-sizing: border-box;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      color-adjust: exact;
    }

    .chart-bar-gray {
      background: #9ca3af;
    }

    .chart-undated-label {
      font-size: 9pt;
      color: #888;
      font-weight: 500;
      padding: 3px 0;
    }

    .chart-count {
      font-family: 'EB Garamond', Garamond, 'Times New Roman', serif;
      font-size: 9pt;
      font-weight: 700;
      color: #fff;
    }

    .year-section {
      margin-bottom: 24px;
    }

    .year-heading {
      font-family: 'EB Garamond', Garamond, 'Times New Roman', serif;
      font-size: 14pt;
      font-weight: 600;
      color: #222;
      margin-bottom: 16px;
      padding-bottom: 8px;
      border-bottom: 1px solid #999;
      page-break-after: avoid;
    }

    .year-count {
      font-weight: 400;
      font-size: 11pt;
      color: #666;
    }

    .section-heading {
      font-family: 'EB Garamond', Garamond, 'Times New Roman', serif;
      font-size: 13pt;
      font-weight: 600;
      color: #222;
      margin-top: 28px;
      margin-bottom: 14px;
      padding-bottom: 6px;
      border-bottom: 1px solid #bbb;
    }

    .favorites-section {
      margin-bottom: 8px;
    }

    .favorites-covers {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      align-items: flex-end;
      justify-content: center;
    }

    .fav-cover {
      object-fit: cover;
      border-radius: 3px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.18);
    }

    .fav-cover-placeholder {
      background: #f0f0f0;
      border-radius: 3px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 7pt;
      color: #999;
      text-align: center;
      padding: 4px;
      overflow: hidden;
    }

    .genre-section {
      margin-bottom: 8px;
    }

    .genre-content {
      font-size: 10pt;
      line-height: 1.55;
      color: #333;
    }

    .genre-content p, .genre-content br + br {
      margin-bottom: 8px;
    }

    .year-cover-page {
      page-break-before: always;
      margin-bottom: 24px;
    }

    .rating-overview {
      margin-top: 16px;
      margin-bottom: 20px;
    }

    .rating-row {
      display: flex;
      align-items: flex-start;
      margin-bottom: 10px;
      padding-bottom: 10px;
      border-bottom: 1px solid #eee;
    }

    .rating-row:last-child {
      border-bottom: none;
    }

    .rating-stars {
      font-size: 12pt;
      color: #d4a017;
      width: 90px;
      flex-shrink: 0;
      padding-top: 4px;
      letter-spacing: 1px;
    }

    .rating-covers {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      flex: 1;
    }

    .cover-thumb {
      width: 50px;
      height: 75px;
      object-fit: cover;
      border-radius: 2px;
      box-shadow: 0 1px 4px rgba(0,0,0,0.15);
    }

    .cover-thumb-placeholder {
      width: 50px;
      height: 75px;
      background: #f0f0f0;
      border-radius: 2px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 6pt;
      color: #999;
      text-align: center;
      padding: 2px;
      overflow: hidden;
    }

    .year-summary {
      margin-top: 16px;
      padding: 12px 16px;
      background: #fafafa;
      border-left: 3px solid #d4a017;
      font-size: 10pt;
      line-height: 1.5;
      color: #333;
      font-style: italic;
    }

    .year-summary p {
      margin: 0;
    }

    .year-summary-heading {
      font-size: 8pt;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #888;
      margin-bottom: 4px !important;
    }

    .year-entries {
      page-break-before: always;
    }

    .book-entry {
      display: grid;
      grid-template-columns: 20% 20% 60%;
      gap: 0 10px;
      margin-bottom: 18px;
      padding-bottom: 18px;
      border-bottom: 1px solid #e0e0e0;
    }

    .book-header-print {
      display: contents;
    }

    .book-entry:last-child {
      border-bottom: none;
    }

    .book-meta {
      grid-column: 1;
    }

    .book-cover-col {
      grid-column: 2;
      display: flex;
      align-items: flex-start;
      justify-content: center;
    }

    .no-cover {
      width: 100px;
      height: 150px;
      background: #f0f0f0;
      border-radius: 3px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #999;
      font-size: 9pt;
    }

    .book-title {
      font-size: 12pt;
      font-weight: 600;
      line-height: 1.3;
      color: #111;
      margin-bottom: 4px;
    }

    .book-author {
      font-size: 10pt;
      color: #444;
      margin-bottom: 4px;
    }

    .book-date {
      font-size: 10pt;
      color: #777;
      margin-bottom: 2px;
    }

    .book-rating {
      font-size: 10pt;
      color: #d4a017;
      letter-spacing: 1px;
      margin-bottom: 12px;
    }

    .book-cover {
      width: 100%;
      height: auto;
      max-height: 260px;
      object-fit: contain;
      border-radius: 3px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.15);
    }

    .book-review {
      grid-column: 3;
      font-size: 10pt;
      line-height: 1.5;
      color: #2a2a2a;
      min-height: 1em;
    }

    .book-review p {
      margin-bottom: 6px;
    }

    .book-review p:last-child {
      margin-bottom: 0;
    }

    .book-desc {
      color: #555;
      font-style: italic;
      margin-bottom: 4px;
    }

    .content-label {
      font-size: 9pt;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #888;
    }

    .book-review strong {
      font-weight: 600;
    }

    .book-review em {
      font-style: italic;
    }

    @media print {
      body {
        padding: 10px 10px;
        max-width: 100%;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
        color-adjust: exact;
      }
      .book-entry {
        page-break-inside: avoid;
      }
      .book-cover { max-width: 90px; max-height: 130px; }
      .chart-bar {
        background: #f59e42 !important;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .chart-count {
        color: #fff !important;
      }
    }

    @page {
      margin: 1.5cm;
    }
  </style>
</head>
<body>
  ${isMultiYear ? `<h1>${escapeHtml(titleLabel)} Bücherliste (${totalCount} Bücher)</h1>` : ""}
  ${chart}
  ${favoritesSection}
  ${genreSection}
  
  ${sections}
  ${undatedSection}
</body>
</html>`;
}
