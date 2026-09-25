import { z } from "zod";

export const bookSchema = z.object({
  bookId: z.string(),
  title: z.string(),
  author: z.string(),
  isbn: z.string(),
  isbn13: z.string(),
  myRating: z.number(),
  averageRating: z.number(),
  publisher: z.string(),
  binding: z.string(),
  numberOfPages: z.number().optional(),
  yearPublished: z.number().optional(),
  originalPublicationYear: z.number().optional(),
  dateRead: z.string().optional(),
  dateAdded: z.string(),
  exclusiveShelf: z.string(),
  myReview: z.string(),
});

export type Book = z.infer<typeof bookSchema>;

export interface YearSummary {
  year: number;
  count: number;
}
