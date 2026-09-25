# Goodreads Book List Converter

## Overview

This is a client-side tool that converts Goodreads CSV exports into beautifully formatted HTML book lists with covers and reviews. The app is primarily in German ("Bücherliste"). Users upload their Goodreads CSV export file, select which years they want to include, preview the results, and download a standalone HTML file. The core logic (CSV parsing, HTML generation) runs entirely in the browser — the server is minimal and mostly serves the frontend.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend (React + Vite)
- **Location:** `client/src/`
- **Framework:** React with TypeScript, bundled by Vite
- **Routing:** `wouter` for client-side routing (single page app with just Home and 404)
- **UI Components:** shadcn/ui (new-york style) with Radix UI primitives, styled via Tailwind CSS
- **State Management:** React local state (`useState`) — no global store needed since this is a simple single-page tool
- **Data Fetching:** `@tanstack/react-query` is set up but the app is primarily client-side; no significant API calls
- **Key Client Libraries:**
  - `papaparse` — parses Goodreads CSV files in the browser
  - Custom HTML generator (`client/src/lib/html-generator.ts`) — builds a standalone HTML document from parsed book data
  - Book covers fetched from OpenLibrary API via ISBN

### Backend (Express)
- **Location:** `server/`
- **Framework:** Express.js running on Node with TypeScript (via `tsx`)
- **Purpose:** Minimal — serves the built frontend in production; provides Vite dev middleware in development
- **API Routes:** Defined in `server/routes.ts`:
  - `GET /api/cover` — fetches book cover URL by ISBN/title/author
  - `GET /api/description` — fetches book description by ISBN/title/author
  - `POST /api/batch-metadata` — batch cover/description fetching
  - `POST /api/year-summary` — generates AI reading year summary via Gemini
  - `POST /api/genre-summary` — generates AI genre analysis across all books via Gemini
- **AI Integration:** Gemini AI (via Replit AI Integrations) for generating year reading summaries and genre analysis. Uses `@google/genai` with `gemini-2.5-flash` model.
- **Storage:** In-memory storage (`MemStorage` class in `server/storage.ts`) with a basic User CRUD interface — not actively used by the app

### Shared Code
- **Location:** `shared/schema.ts`
- **Contains:** Zod schemas for `Book` type and `YearSummary` interface — shared between client and server

### Database
- **ORM:** Drizzle ORM configured for PostgreSQL (`drizzle.config.ts`)
- **Current state:** Schema file only defines Zod types (no Drizzle table definitions yet). The app currently uses in-memory storage. Database infrastructure is set up but not actively used.
- **Connection:** Expects `DATABASE_URL` environment variable for PostgreSQL
- **Migrations:** Output to `./migrations` directory, push via `npm run db:push`

### Build System
- **Dev:** `tsx server/index.ts` with Vite dev server middleware for HMR
- **Production build:** Custom build script (`script/build.ts`) that uses Vite for the client and esbuild for the server, outputting to `dist/`
- **Path aliases:** `@/` maps to `client/src/`, `@shared/` maps to `shared/`, `@assets/` maps to `attached_assets/`

### App Flow
1. User uploads a Goodreads CSV export file
2. `papaparse` parses the CSV client-side into `Book[]` objects
3. User selects which years to include
4. App generates a standalone HTML file with book covers (from OpenLibrary), ratings (as stars), and reviews
5. User downloads the generated HTML

## External Dependencies

- **OpenLibrary Covers API:** `https://covers.openlibrary.org/b/isbn/{ISBN}-M.jpg` — used to fetch book cover images by ISBN, no API key required
- **PostgreSQL:** Configured via `DATABASE_URL` environment variable, used with Drizzle ORM (currently not actively used by the application)
- **Google Fonts:** Loads Architects Daughter, DM Sans, Fira Code, and Geist Mono fonts
- **Replit Plugins:** `@replit/vite-plugin-runtime-error-modal`, `@replit/vite-plugin-cartographer`, `@replit/vite-plugin-dev-banner` — development-only Replit integrations