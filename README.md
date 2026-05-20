# MediaManager

Self-hosted media library manager for movies and TV shows. Scrapes metadata and artwork from TMDB, TVDB, and Fanart.tv; downloads subtitles from SubDL or OpenSubtitles; extracts technical information via MediaInfo; generates Kodi/Jellyfin-compatible NFO files; and renames files using Radarr/Sonarr-style templates — all from a single web UI.

---

## Features

- **Metadata** — Scrape and edit titles, plots, ratings, cast, crew, genres, and studios from TMDB and TVDB
- **Artwork** — Fetch posters, backdrops, logos, clearart, and disc art from TMDB, TVDB, and Fanart.tv; upload your own or paste a URL
- **Subtitles** — Search and download subtitles via SubDL (30/day free) or OpenSubtitles (5/day free)
- **Technical info** — Full MediaInfo extraction: codecs, resolution, HDR format, audio tracks, subtitle tracks, bitrate
- **File renaming** — Radarr/Sonarr-compatible token templates with preview, dry-run, and undo
- **NFO generation** — Writes Kodi/Jellyfin `.nfo` files next to your media automatically after every metadata save
- **Task queue** — Background jobs via BullMQ/Redis with real-time updates in the UI

---

## Stack

| Layer | Technology |
|---|---|
| Backend | Node.js · Fastify · TypeScript |
| Database | PostgreSQL · Drizzle ORM |
| Queue | BullMQ · Redis |
| Frontend | React · Vite · Tailwind CSS · TanStack Query |
| Reverse proxy | nginx (production) |
| Container | Docker · GitHub Container Registry |

---

## Quick start (Docker)

### 1. Prerequisites

- Docker and Docker Compose
- API keys for at least TMDB (required for movie metadata) and TVDB (required for TV metadata). Free tiers are sufficient.

### 2. Configure

```bash
cp .env.example .env
```

Edit `.env` and fill in the required values:

```dotenv
# Required
POSTGRES_PASSWORD=change-me
JWT_SECRET=change-me

# At minimum one metadata scraper
TMDB_API_KEY=your_tmdb_key
TVDB_API_KEY=your_tvdb_key

# Subtitle provider — SubDL is preferred (30/day free)
SUBDL_API_KEY=your_subdl_key

# Path to your media files on the host machine
MEDIA_PATH=/path/to/your/media
```

| Variable | Where to get it |
|---|---|
| `TMDB_API_KEY` | [themoviedb.org/settings/api](https://www.themoviedb.org/settings/api) — use the v3 Read Access Token |
| `TVDB_API_KEY` | [thetvdb.com/dashboard/account/apikey](https://www.thetvdb.com/dashboard/account/apikey) |
| `FANART_API_KEY` | [fanart.tv/get-an-api-key](https://fanart.tv/get-an-api-key/) — optional, adds logos and clearart |
| `SUBDL_API_KEY` | [subdl.com/setting](https://subdl.com/setting) — free registration |
| `OPENSUBTITLES_API_KEY` | [opensubtitles.org/en/consumers](https://www.opensubtitles.org/en/consumers) — fallback, 5/day free |

### 3. Run

```bash
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

The UI is available at **http://localhost:8080** (or whatever `PORT` you set in `.env`).

To pin a specific release instead of `latest`:

```bash
IMAGE_TAG=v1.2.3 docker compose -f docker-compose.prod.yml up -d
```

---

## Development setup

### Prerequisites

- Node.js 20+
- Docker (for Postgres and Redis)

### 1. Install dependencies

```bash
npm install
```

### 2. Start infrastructure

```bash
docker compose up -d postgres redis
```

### 3. Configure

```bash
cp .env.example backend/.env
# Edit backend/.env — set DATABASE_URL, REDIS_URL, and at least one API key
```

### 4. Run migrations

```bash
npm run db:migrate --workspace=backend
```

### 5. Start dev servers

```bash
npm run dev
```

This starts the backend on **http://localhost:3001** and the Vite dev server on **http://localhost:5173**. API calls from the frontend are proxied to the backend automatically.

---

## Usage

### Adding libraries

Go to **Settings → Libraries** and add a path to your movie or TV folder. A scan runs immediately and on every subsequent manual trigger. The scanner reads existing `.nfo` files and local artwork, so pre-organised libraries are imported without a rescrape.

### Scraping metadata

Open any movie or show from the grid and click **Rescrape**. For movies, MediaManager matches against TMDB by title and year. For shows, it uses TVDB. If the auto-match confidence is too low the item stays unmatched — use the TMDB/TVDB ID fields in the metadata editor to set an exact ID, then rescrape.

### Renaming files

Go to **Rename**, choose Movies or Episodes, select files, and build a template using the token buttons. The default templates follow Radarr/Sonarr conventions:

**Movies:**
```
{Movie Title} ({Release Year})/{Movie Title} ({Release Year}) {Quality Full}.{ext}
```

**Episodes:**
```
{Series Title}/Season {Season:00}/{Series Title} - S{Season:00}E{Episode:00} - {Episode Title}.{ext}
```

Always use **Preview** before executing. **Dry Run** confirms the template resolves correctly without touching the filesystem. Completed batches appear in the undo journal below the preview table.

### Subtitles

Open a movie or episode, go to the **Subtitles** tab, pick a language, and click **Search**. Results come from SubDL if configured, otherwise OpenSubtitles. Click **Get** next to a result to queue the download — the row updates automatically when the file lands on disk.

---

## Updating

```bash
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

Database migrations run automatically on startup.

---

## Environment variable reference

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | — | Postgres connection string |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection string |
| `PORT` | `3001` | Backend listen port |
| `HOST` | `0.0.0.0` | Backend listen host |
| `CACHE_DIR` | `./cache` | Artwork and proxy image cache |
| `UPLOAD_DIR` | `./uploads` | Uploaded file staging area |
| `MEDIA_PATH` | `/media` | Host path mounted into the container for media access |
| `POSTGRES_PASSWORD` | `mediamanager` | Postgres password (prod compose only) |
| `JWT_SECRET` | — | Secret for future auth — set to a random string |
| `TMDB_API_KEY` | — | TMDB v3 API key |
| `TVDB_API_KEY` | — | TVDB v4 API key |
| `FANART_API_KEY` | — | Fanart.tv API key |
| `SUBDL_API_KEY` | — | SubDL API key |
| `OPENSUBTITLES_API_KEY` | — | OpenSubtitles API key |
| `OPENSUBTITLES_USERNAME` | — | OpenSubtitles username |
| `OPENSUBTITLES_PASSWORD` | — | OpenSubtitles password |
