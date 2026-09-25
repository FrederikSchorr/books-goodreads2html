import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { Upload, FileText, Download, BookOpen, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import type { Book, YearSummary } from "@shared/schema";
import {
  parseGoodreadsCsv,
  getYearSummaries,
  getBooksForYears,
  getReadBooksWithoutDate,
  formatDateGerman,
  getStars,
  getYearFromDate,
  sanitizeReviewHtml,
} from "@/lib/csv-parser";
import { generateBookListHtml } from "@/lib/html-generator";

interface BookMetadata {
  coverUrl?: string | null;
  description?: string | null;
}

export default function Home() {
  const [books, setBooks] = useState<Book[]>([]);
  const [yearSummaries, setYearSummaries] = useState<YearSummary[]>([]);
  const [selectedYears, setSelectedYears] = useState<number[]>([]);
  const [step, setStep] = useState<"upload" | "select" | "preview">("upload");
  const [isGenerating, setIsGenerating] = useState(false);
  const [fileName, setFileName] = useState("");
  const [includeUndated, setIncludeUndated] = useState(false);
  const [metadata, setMetadata] = useState<Record<string, BookMetadata>>({});
  const [metadataLoading, setMetadataLoading] = useState(false);
  const [aiSummaries, setAiSummaries] = useState<Record<string, string>>({});
  const [summariesLoading, setSummariesLoading] = useState(false);
  const [genreSummary, setGenreSummary] = useState("");
  const [genreLoading, setGenreLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setFileName(file.name);

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const text = event.target?.result as string;
          const parsed = parseGoodreadsCsv(text);
          setBooks(parsed);
          setMetadata({});
          setAiSummaries({});
          setGenreSummary("");
          const summaries = getYearSummaries(parsed);
          setYearSummaries(summaries);

          if (summaries.length === 0) {
            toast({
              title: "Keine gelesenen Bücher gefunden",
              description: "Die CSV-Datei enthält keine Bücher mit Lesedatum.",
              variant: "destructive",
            });
            return;
          }

          setSelectedYears([]);
          setIncludeUndated(false);
          setStep("select");
          const undated = getReadBooksWithoutDate(parsed);
          const totalRead = summaries.reduce((s, y) => s + y.count, 0) + undated.length;
          toast({
            title: "CSV erfolgreich geladen",
            description: `${parsed.length} Bücher gefunden, davon ${totalRead} gelesen.`,
          });
        } catch {
          toast({
            title: "Fehler beim Lesen der CSV-Datei",
            description: "Bitte überprüfe das Format der Datei.",
            variant: "destructive",
          });
        }
      };
      reader.readAsText(file);
    },
    [toast]
  );

  const toggleYear = (year: number) => {
    setSelectedYears((prev) =>
      prev.includes(year) ? prev.filter((y) => y !== year) : [...prev, year]
    );
  };

  const undatedBooks = getReadBooksWithoutDate(books);

  const selectAllYears = () => {
    setSelectedYears(yearSummaries.map((y) => y.year));
    if (undatedBooks.length > 0) setIncludeUndated(true);
  };

  const deselectAllYears = () => {
    setSelectedYears([]);
    setIncludeUndated(false);
  };

  const filteredBooks =
    step === "preview" ? getBooksForYears(books, selectedYears) : [];
  const filteredUndated =
    step === "preview" && includeUndated ? undatedBooks : [];
  const allPreviewBooks = [...filteredBooks, ...filteredUndated];

  const filteredBookIds = allPreviewBooks.map((b) => b.bookId).join(",");

  useEffect(() => {
    if (step !== "preview" || allPreviewBooks.length === 0) return;

    const booksNeedingMetadata = allPreviewBooks.filter(
      (b) => !metadata[b.bookId]
    );
    if (booksNeedingMetadata.length === 0) return;

    setMetadataLoading(true);

    const requestBooks = booksNeedingMetadata.map((b) => ({
      bookId: b.bookId,
      isbn: b.isbn13 || b.isbn || "",
      title: b.title,
      author: b.author,
      needCover: true,
      needDescription: !b.myReview?.trim(),
    }));

    fetch("/api/batch-metadata", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ books: requestBooks }),
    })
      .then((r) => r.json())
      .then((data) => {
        setMetadata((prev) => ({ ...prev, ...data.results }));
      })
      .catch(() => {})
      .finally(() => setMetadataLoading(false));
  }, [step, filteredBookIds]);

  useEffect(() => {
    if (step !== "preview" || allPreviewBooks.length === 0) return;

    setSummariesLoading(true);
    const promises: Promise<void>[] = [];

    for (const year of selectedYears) {
      if (aiSummaries[String(year)]) continue;
      const yearBooks = filteredBooks.filter((b) => {
        const y = getYearFromDate(b.dateRead || "");
        return y === year;
      });
      if (yearBooks.length === 0) continue;
      const chronological = [...yearBooks].sort((a, b) =>
        (a.dateRead || a.dateAdded || "").localeCompare(b.dateRead || b.dateAdded || "")
      );
      promises.push(
        fetch("/api/year-summary", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            year,
            books: chronological.map((b) => ({
              title: b.title,
              author: b.author,
              myRating: b.myRating,
              myReview: b.myReview,
            })),
          }),
        })
          .then((r) => r.json())
          .then((data) => {
            if (data.summary) {
              setAiSummaries((prev) => ({ ...prev, [String(year)]: data.summary }));
            }
          })
          .catch(() => {})
      );
    }


    if (promises.length > 0) {
      Promise.all(promises).finally(() => setSummariesLoading(false));
    } else {
      setSummariesLoading(false);
    }

    const totalGroups = selectedYears.length + (includeUndated && filteredUndated.length > 0 ? 1 : 0);
    if (totalGroups > 1 && !genreSummary) {
      setGenreLoading(true);
      const sortedBooks = [...allPreviewBooks].sort((a, b) => {
        const da = a.dateRead ? new Date(a.dateRead).getTime() : 0;
        const db = b.dateRead ? new Date(b.dateRead).getTime() : 0;
        return db - da;
      });

      const fetchGenre = async (bookSlice: typeof sortedBooks, includeReviews: boolean) => {
        const r = await fetch("/api/genre-summary", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            books: bookSlice.map((b) => ({
              title: b.title,
              author: b.author,
              myRating: b.myRating,
              ...(includeReviews && b.myReview ? { myReview: b.myReview } : {}),
            })),
          }),
        });
        const data = await r.json();
        if (!r.ok || !data.genres) throw new Error(data.error || "No genres");
        return data.genres;
      };

      (async () => {
        try {
          const result = await fetchGenre(sortedBooks, true);
          setGenreSummary(result);
        } catch {
          try {
            const half = sortedBooks.slice(0, Math.ceil(sortedBooks.length * 0.5));
            const result = await fetchGenre(half, true);
            setGenreSummary(result);
          } catch {
            try {
              const quarter = sortedBooks.slice(0, Math.ceil(sortedBooks.length * 0.25));
              const result = await fetchGenre(quarter, true);
              setGenreSummary(result);
            } catch {
              console.error("Genre summary failed after all retries");
            }
          }
        }
        setGenreLoading(false);
      })();
    }
  }, [step, filteredBookIds]);

  const handleGenerate = async () => {
    if (selectedYears.length === 0 && !includeUndated) {
      toast({
        title: "Bitte wähle mindestens ein Jahr",
        description: "Wähle die Jahre aus, für die du die Bücherliste erstellen möchtest.",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);

    try {
      const booksForExport = getBooksForYears(books, selectedYears);
      const undatedForExport = includeUndated ? undatedBooks : [];

      const coverMap = new Map<string, string>();
      const descMap = new Map<string, string>();
      for (const [bookId, meta] of Object.entries(metadata)) {
        if (meta.coverUrl) coverMap.set(bookId, meta.coverUrl);
        if (meta.description) descMap.set(bookId, meta.description);
      }

      const allExportBooks = [...booksForExport, ...undatedForExport];
      const booksWithoutMeta = allExportBooks.filter(
        (b) => !metadata[b.bookId]
      );

      if (booksWithoutMeta.length > 0) {
        try {
          const requestBooks = booksWithoutMeta.map((b) => ({
            bookId: b.bookId,
            isbn: b.isbn13 || b.isbn || "",
            title: b.title,
            author: b.author,
            needCover: true,
            needDescription: !b.myReview?.trim(),
          }));
          const res = await fetch("/api/batch-metadata", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ books: requestBooks }),
          });
          const data = await res.json();
          for (const [bookId, meta] of Object.entries(data.results) as [string, BookMetadata][]) {
            if (meta.coverUrl) coverMap.set(bookId, meta.coverUrl);
            if (meta.description) descMap.set(bookId, meta.description);
          }
          setMetadata((prev) => ({ ...prev, ...data.results }));
        } catch {}
      }

      const summaryMap = new Map<string, string>();
      for (const [key, value] of Object.entries(aiSummaries)) {
        summaryMap.set(key, value);
      }

      const html = generateBookListHtml(booksForExport, selectedYears, descMap, coverMap, undatedForExport, summaryMap, genreSummary);

      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const yearLabel =
        selectedYears.length === 1
          ? `${selectedYears[0]}`
          : `${Math.min(...selectedYears)}-${Math.max(...selectedYears)}`;
      a.href = url;
      a.download = `${yearLabel}_Bücher.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      const totalExported = allExportBooks.length;
      toast({
        title: "HTML-Datei erstellt",
        description: `${totalExported} Bücher heruntergeladen. Öffne die Datei im Browser und drucke sie als PDF (Strg+P → „Als PDF speichern").`,
      });
    } catch {
      toast({
        title: "Fehler bei der Generierung",
        description: "Etwas ist schiefgelaufen.",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePreview = () => {
    if (selectedYears.length === 0 && !includeUndated) {
      toast({
        title: "Bitte wähle mindestens ein Jahr",
        variant: "destructive",
      });
      return;
    }
    setStep("preview");
  };

  const totalReadBooks = yearSummaries.reduce((s, y) => s + y.count, 0) + undatedBooks.length;
  const selectedBookCount = selectedYears.reduce((s, year) => {
    const summary = yearSummaries.find((y) => y.year === year);
    return s + (summary?.count || 0);
  }, 0) + (includeUndated ? undatedBooks.length : 0);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-8 sm:py-12">
        <header className="text-center mb-10">
          <div className="flex items-center justify-center gap-3 mb-3">
            <BookOpen className="w-8 h-8 text-primary" />
            <h1 className="text-3xl sm:text-4xl font-serif font-semibold tracking-tight">
              Goodreads Bücherliste
            </h1>
          </div>
          <p className="text-muted-foreground text-base max-w-lg mx-auto">
            Verwandle deinen Goodreads-Export in eine schön formatierte Bücherliste
            mit Covern und Reviews.
          </p>
        </header>

        {step === "upload" && (
          <div className="flex flex-col items-center">
            <Card
              className="w-full max-w-lg p-10 flex flex-col items-center gap-6 cursor-pointer border-dashed border-2 border-muted-foreground/20 transition-colors"
              onClick={() => fileInputRef.current?.click()}
              data-testid="upload-area"
            >
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Upload className="w-8 h-8 text-primary" />
              </div>
              <div className="text-center">
                <p className="font-medium text-lg mb-1">CSV-Datei hochladen</p>
                <p className="text-sm text-muted-foreground">
                  Exportiere deine Bibliothek von Goodreads als CSV und lade sie hier hoch.
                </p>
              </div>
              <Button data-testid="button-upload">
                <FileText className="w-4 h-4 mr-2" />
                Datei auswählen
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleFileUpload}
                data-testid="input-file"
              />
            </Card>
            <p className="text-xs text-muted-foreground mt-4 text-center max-w-md">
              Gehe zu Goodreads → My Books → Import and Export → Export Library,
              um deine CSV-Datei zu erhalten.
            </p>
          </div>
        )}

        {step === "select" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="text-xl font-semibold">
                  Jahre auswählen
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {totalReadBooks} gelesene Bücher in {yearSummaries.length} Jahren
                  {fileName && <> &middot; <span className="font-mono text-xs">{fileName}</span></>}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={selectAllYears}
                  data-testid="button-select-all"
                >
                  Alle
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={deselectAllYears}
                  data-testid="button-deselect-all"
                >
                  Keine
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              {yearSummaries.map((ys) => {
                const isSelected = selectedYears.includes(ys.year);
                const barMax = 52;
                const pct = Math.min(Math.round((ys.count / barMax) * 100), 100);
                return (
                  <div
                    key={ys.year}
                    className="flex items-center gap-3 cursor-pointer group"
                    onClick={() => toggleYear(ys.year)}
                    data-testid={`card-year-${ys.year}`}
                  >
                    <Checkbox
                      checked={isSelected}
                      className="shrink-0"
                      data-testid={`checkbox-year-${ys.year}`}
                    />
                    <span className="text-lg font-serif font-bold w-14 text-right tabular-nums shrink-0">
                      {ys.year}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div
                        className="rounded-sm px-2.5 py-1 transition-opacity"
                        style={{
                          width: `${Math.max(pct, 8)}%`,
                          backgroundColor: isSelected ? "#f59e42" : "#d4d4d8",
                        }}
                      >
                        <span className="text-white text-sm font-bold">{ys.count}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
              {undatedBooks.length > 0 && (
                <div
                  className="flex items-center gap-3 cursor-pointer group mt-3 pt-3 border-t border-border"
                  onClick={() => setIncludeUndated((v) => !v)}
                  data-testid="card-year-undated"
                >
                  <Checkbox
                    checked={includeUndated}
                    className="shrink-0"
                    data-testid="checkbox-year-undated"
                  />
                  <span className="text-base font-serif font-bold w-14 text-right shrink-0">
                    ?
                  </span>
                  <div className="flex-1 min-w-0">
                    <div
                      className="rounded-sm px-2.5 py-1"
                      style={{
                        width: `${Math.max(Math.min(Math.round((undatedBooks.length / 52) * 100), 100), 8)}%`,
                        backgroundColor: includeUndated ? "#f59e42" : "#d4d4d8",
                      }}
                    >
                      <span className="text-white text-sm font-bold">{undatedBooks.length}</span>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">Ohne Datum</span>
                </div>
              )}
            </div>

            {(selectedYears.length > 0 || includeUndated) && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t">
                <p className="text-sm text-muted-foreground">
                  <strong>{selectedBookCount}</strong> Bücher aus{" "}
                  <strong>{selectedYears.length}</strong>{" "}
                  {selectedYears.length === 1 ? "Jahr" : "Jahren"} ausgewählt
                </p>
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onClick={handlePreview}
                    data-testid="button-preview"
                  >
                    Vorschau
                  </Button>
                  <Button
                    onClick={handleGenerate}
                    disabled={isGenerating}
                    data-testid="button-generate"
                  >
                    {isGenerating ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Download className="w-4 h-4 mr-2" />
                    )}
                    HTML herunterladen
                  </Button>
                </div>
              </div>
            )}

            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setStep("upload");
                setBooks([]);
                setYearSummaries([]);
                setSelectedYears([]);
                setIncludeUndated(false);
                setFileName("");
                setMetadata({});
              }}
              className="text-muted-foreground"
              data-testid="button-new-upload"
            >
              Andere CSV-Datei laden
            </Button>
          </div>
        )}

        {step === "preview" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="text-xl font-semibold">
                  Vorschau
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {allPreviewBooks.length} Bücher
                  {(metadataLoading || summariesLoading || genreLoading) && (
                    <span className="ml-2 inline-flex items-center gap-1">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Daten werden geladen…
                    </span>
                  )}
                </p>
              </div>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setStep("select")}
                  data-testid="button-back"
                >
                  Zurück
                </Button>
                <Button
                  onClick={handleGenerate}
                  disabled={isGenerating}
                  data-testid="button-download"
                >
                  {isGenerating ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4 mr-2" />
                  )}
                  HTML herunterladen
                </Button>
              </div>
            </div>

            {(selectedYears.length + (filteredUndated.length > 0 ? 1 : 0)) > 1 && (
              <>
                <YearChart books={filteredBooks} years={selectedYears} undatedCount={filteredUndated.length} />
                <FavoritesSection books={allPreviewBooks} metadata={metadata} />
                <GenreSection genreSummary={genreSummary} loading={genreLoading} />
              </>
            )}

            <div className="space-y-8">
              {[...selectedYears].sort((a, b) => b - a).map((year) => {
                const yearBooks = filteredBooks.filter((b) => {
                  const y = getYearFromDate(b.dateRead || "");
                  return y === year;
                });
                if (yearBooks.length === 0) return null;
                return (
                  <section key={year}>
                    <h3 className="text-lg font-serif font-semibold border-b border-border pb-2 mb-0" data-testid={`preview-year-heading-${year}`}>
                      {year}{" "}
                      <span className="text-sm font-normal text-muted-foreground">
                        ({yearBooks.length} {yearBooks.length === 1 ? "Buch" : "Bücher"})
                      </span>
                    </h3>
                    <RatingOverview yearBooks={yearBooks} metadata={metadata} />
                    {aiSummaries[String(year)] && (
                      <div className="bg-muted/50 border border-border rounded-md p-4 my-3" data-testid={`preview-summary-${year}`}>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Highlights in {year}</p>
                        <p className="text-sm leading-relaxed">{aiSummaries[String(year)]}</p>
                      </div>
                    )}
                    {summariesLoading && !aiSummaries[String(year)] && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground my-3">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Highlights werden erstellt…
                      </div>
                    )}
                    {yearBooks.map((book, idx) => (
                      <BookPreviewCard key={`${book.bookId}-${idx}`} book={book} meta={metadata[book.bookId]} />
                    ))}
                  </section>
                );
              })}
              {filteredUndated.length > 0 && (
                <section>
                  <h3 className="text-lg font-serif font-semibold border-b border-border pb-2 mb-0" data-testid="preview-year-heading-undated">
                    Ohne Datum{" "}
                    <span className="text-sm font-normal text-muted-foreground">
                      ({filteredUndated.length} {filteredUndated.length === 1 ? "Buch" : "Bücher"})
                    </span>
                  </h3>
                  <RatingOverview yearBooks={filteredUndated} metadata={metadata} />
                  {filteredUndated.map((book, idx) => (
                    <BookPreviewCard key={`${book.bookId}-${idx}`} book={book} meta={metadata[book.bookId]} />
                  ))}
                </section>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function YearChart({ books, years, undatedCount }: { books: Book[]; years: number[]; undatedCount?: number }) {
  const sorted = [...years].sort((a, b) => b - a);
  const counts = sorted.map((year) => ({
    label: String(year),
    count: books.filter((b) => {
      const y = getYearFromDate(b.dateRead || b.dateAdded || "");
      return y === year;
    }).length,
  }));
  const max = Math.max(...counts.map((c) => c.count), 1);

  return (
    <div className="space-y-1.5" data-testid="year-chart">
      {counts.map(({ label, count }) => (
        <div key={label} className="flex items-center gap-3">
          <span className="text-lg font-serif font-bold w-14 text-right tabular-nums">
            {label}
          </span>
          <div className="flex-1 min-w-0">
            <div
              className="rounded-sm px-2.5 py-1"
              style={{
                width: `${Math.max(Math.round((count / max) * 100), 8)}%`,
                backgroundColor: "#f59e42",
              }}
            >
              <span className="text-white text-sm font-bold">{count}</span>
            </div>
          </div>
        </div>
      ))}
      {undatedCount != null && undatedCount > 0 && (
        <div className="flex items-center gap-3">
          <span className="text-lg font-serif font-bold w-14 text-right tabular-nums">?</span>
          <span className="text-sm text-muted-foreground font-medium">{undatedCount} Bücher ohne Datum</span>
        </div>
      )}
    </div>
  );
}

function FavoritesSection({ books, metadata }: { books: Book[]; metadata: Record<string, BookMetadata> }) {
  const fiveStarBooks = useMemo(() => {
    const sorted = books
      .filter((b) => b.myRating === 5)
      .sort((a, b) => {
        const da = a.dateRead || a.dateAdded || "";
        const db = b.dateRead || b.dateAdded || "";
        return db.localeCompare(da);
      });
    const sizes = sorted.map((_, idx) => Math.max(60, 90 - idx * 3));
    const paired = sorted.map((book, i) => ({ book, size: sizes[i] }));
    for (let i = paired.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [paired[i], paired[j]] = [paired[j], paired[i]];
    }
    return paired;
  }, [books]);

  if (fiveStarBooks.length === 0) return null;

  return (
    <div className="mt-6" data-testid="favorites-section">
      <h3 className="text-lg font-serif font-semibold border-b border-border pb-2 mb-3">
        Lieblingsbücher
      </h3>
      <div className="flex flex-wrap gap-2.5 items-end justify-center">
        {fiveStarBooks.map(({ book: b, size }, idx) => {
          const coverUrl = metadata[b.bookId]?.coverUrl;
          const h = Math.round(size * 1.5);
          return coverUrl ? (
            <img
              key={b.bookId}
              src={coverUrl}
              alt={b.title}
              title={b.title}
              className="object-cover rounded-sm shadow-md"
              style={{ width: `${size}px`, height: `${h}px` }}
              loading="lazy"
            />
          ) : (
            <div
              key={b.bookId}
              title={b.title}
              className="bg-muted rounded-sm flex items-center justify-center text-[8px] text-muted-foreground p-1 text-center leading-tight"
              style={{ width: `${size}px`, height: `${h}px` }}
            >
              {b.title.slice(0, 30)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function GenreSection({ genreSummary, loading }: { genreSummary: string; loading: boolean }) {
  if (!genreSummary && !loading) return null;

  return (
    <div className="mt-6" data-testid="genre-section">
      <h3 className="text-lg font-serif font-semibold border-b border-border pb-2 mb-3">
        Genres
      </h3>
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-3 h-3 animate-spin" />
          Genre-Zusammenfassung wird erstellt…
        </div>
      ) : (
        <div
          className="text-sm leading-relaxed space-y-2"
          dangerouslySetInnerHTML={{ __html: genreSummary.replace(/<(?!\/?b\b)[^>]*>/gi, "").replace(/\n\n+/g, "</p><p>").replace(/\n/g, "<br>") }}
        />
      )}
    </div>
  );
}

function truncateDescription(text: string): string {
  const clean = text.replace(/<[^>]*>/g, "");
  if (clean.length <= 500) return clean;
  const trimmed = clean.slice(0, 500);
  const lastSpace = trimmed.lastIndexOf(" ");
  return (lastSpace > 300 ? trimmed.slice(0, lastSpace) : trimmed) + " …";
}

function RatingOverview({ yearBooks, metadata }: { yearBooks: Book[]; metadata: Record<string, BookMetadata> }) {
  const ratingGroups: Map<number, Book[]> = new Map();
  for (const book of yearBooks) {
    const r = Math.max(0, Math.min(5, book.myRating || 0));
    if (!ratingGroups.has(r)) ratingGroups.set(r, []);
    ratingGroups.get(r)!.push(book);
  }
  const sortedRatings = Array.from(ratingGroups.keys()).sort((a, b) => b - a);

  return (
    <div className="my-4 space-y-2" data-testid="rating-overview">
      {sortedRatings.map((rating) => {
        const booksInRating = ratingGroups.get(rating) || [];
        const stars = rating > 0
          ? "★".repeat(rating) + "☆".repeat(5 - rating)
          : "nicht bewertet";
        return (
          <div key={rating} className="flex items-start gap-3">
            <span className="text-sm text-amber-500 dark:text-amber-400 tracking-wider whitespace-nowrap w-[80px] pt-1 shrink-0">{stars}</span>
            <div className="flex flex-wrap gap-1.5">
              {booksInRating.map((b) => {
                const coverUrl = metadata[b.bookId]?.coverUrl;
                return coverUrl ? (
                  <img
                    key={b.bookId}
                    src={coverUrl}
                    alt={b.title}
                    title={b.title}
                    className="w-[50px] h-[75px] object-cover rounded-sm shadow-sm"
                    loading="lazy"
                  />
                ) : (
                  <div
                    key={b.bookId}
                    title={b.title}
                    className="w-[50px] h-[75px] bg-muted rounded-sm flex items-center justify-center text-[8px] text-muted-foreground p-0.5 text-center leading-tight"
                  >
                    {b.title.slice(0, 20)}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BookPreviewCard({ book, meta }: { book: Book; meta?: BookMetadata }) {
  const coverUrl = meta?.coverUrl || null;
  const hasReview = !!book.myReview?.trim();

  const sanitizedReview = sanitizeReviewHtml(book.myReview);
  const reviewParagraphs = sanitizedReview
    ? sanitizedReview
        .split(/\n\s*\n/)
        .filter((p) => p.trim())
        .map((p) =>
          p.split("\n").map((l) => l.trim()).filter((l) => l).join("<br>")
        )
    : [];

  const descriptionText = !hasReview && meta?.description
    ? truncateDescription(meta.description)
    : null;

  return (
    <div
      className="grid gap-x-5 py-6 border-b border-border last:border-b-0"
      style={{
        gridTemplateColumns: "20% 20% 60%",
      }}
      data-testid={`book-card-${book.bookId}`}
    >
      <div>
        <h3 className="font-serif font-semibold text-sm leading-snug mb-1">
          {book.title}
        </h3>
        <p className="text-sm text-muted-foreground">{book.author}</p>
        <p className="text-xs text-muted-foreground/70 mt-1">
          {formatDateGerman(book.dateRead || book.dateAdded || "")}
          {!book.dateRead && book.dateAdded ? " (hinzugefügt)" : ""}
        </p>
        <p className="text-sm text-amber-500 dark:text-amber-400 mt-0.5 tracking-wider">
          {getStars(book.myRating)}
        </p>
      </div>

      <div className="flex items-start justify-center">
        {coverUrl ? (
          <img
            src={coverUrl}
            alt={book.title}
            className="w-full h-auto max-h-[260px] object-contain rounded-sm shadow-md"
            loading="lazy"
            data-testid={`cover-${book.bookId}`}
          />
        ) : (
          <div className="w-[100px] h-[150px] bg-muted rounded-sm flex items-center justify-center text-muted-foreground text-xs">
            Kein Cover
          </div>
        )}
      </div>

      <div className="text-sm leading-relaxed text-foreground/85 min-h-[1em]">
        {reviewParagraphs.length > 0 ? (
          <>
            {reviewParagraphs.map((p, i) => (
              <p
                key={i}
                className="mb-2 last:mb-0"
                dangerouslySetInnerHTML={{ __html: i === 0 ? `<span class="font-semibold text-xs uppercase tracking-wide" style="color:rgba(0,0,0,0.4)">Review: </span>${p}` : p }}
              />
            ))}
          </>
        ) : descriptionText ? (
          <p className="text-foreground/70">
            <span className="font-semibold text-foreground/60 text-xs uppercase tracking-wide">Beschreibung: </span>
            {descriptionText}
          </p>
        ) : null}
      </div>
    </div>
  );
}
