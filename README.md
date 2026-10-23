# Local-First Task Manager

A small task manager that keeps its data on the device. Tasks live in [IndexedDB](https://developer.mozilla.org/docs/Web/API/IndexedDB_API). After the first visit, a service worker serves the app shell from cache, so the installed app still opens with no network.

**Live demo:** https://taha080.github.io/local-first-task-manager/

There is no account and no backend. Export a JSON file if you want a backup you can import later, including on another browser.

## Features

- Create, edit, complete, reopen, and delete tasks
- Filter by status (all, active, done) and by priority
- Optional due date, priority, notes, and tags
- Tasks are ordered with active work first, then soonest due date, then priority
- Overdue and due-today labels use the local calendar date
- JSON export and import, with validation that rejects a bad file before it touches the database
- Installable Progressive Web App (web app manifest and service worker)
- Works offline after the first successful load

## Tech stack

| Piece | Choice |
| --- | --- |
| Language | TypeScript |
| UI | HTML, CSS, and DOM APIs (no UI framework) |
| Build | [Vite](https://vite.dev/) |
| Storage | IndexedDB in the browser |
| Offline | Hand-written service worker, generated at build time with the hashed asset list |
| Install | Web app manifest |
| Tests | [Vitest](https://vitest.dev/) and [fake-indexeddb](https://github.com/dumbmatter/fakeIndexedDB) |
| Hosting | GitHub Pages, via GitHub Actions |

The app has no runtime dependencies. Vite, TypeScript, Vitest, and fake-indexeddb are development dependencies.

## Setup

You need Node.js 20 or newer.

```bash
git clone https://github.com/taha080/local-first-task-manager.git
cd local-first-task-manager
npm install
npm run dev
```

Open the URL Vite prints. Because the app is built for a project site, that URL includes the base path:

```text
http://localhost:5173/local-first-task-manager/
```

The dev server does not register a service worker. Offline behavior is part of the production build. To try that locally:

```bash
npm run build
npm run preview
```

Then open `http://localhost:4173/local-first-task-manager/`. In the browser devtools, switch the network to offline and reload. The shell should still load, and tasks you already saved should still be there.

## Usage

1. Type a title and, if you want, a due date, priority, tags, and notes. Choose **Add task**.
2. Use the checkbox to complete a task. Use it again to reopen it.
3. **Edit** loads the task back into the form. **Save changes** writes it. **Cancel** leaves the stored task alone.
4. **Delete** asks for confirmation, then removes the task from IndexedDB.
5. Filter with **All**, **Active**, and **Done**. The priority menu narrows the same list.
6. **Export** downloads a JSON backup of every task. **Import** checks the file and, if it is valid, replaces the tasks on this device. Import does not merge. A file that fails validation does not change what is already stored.
7. To install, use the browser's install or "Add to Home Screen" action after the production site has loaded. The installed app opens at the Pages URL and uses the same on-device database as the browser profile that installed it.

The header pill follows `navigator.onLine`. It is only a hint. The task list does not use the network either way.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Typecheck, then build `dist/` and the service worker |
| `npm run preview` | Serve the production build locally |
| `npm test` | Run the Vitest suite once |
| `npm run test:watch` | Run Vitest in watch mode |
| `npm run typecheck` | Typecheck without emitting files |
| `npm run icons` | Regenerate the PNG icons with Python 3 (optional; the PNGs are already in the repo) |

## Testing

```bash
npm test
```

Tests cover three areas:

- **Task rules** (`tests/task.test.ts`): creating and editing tasks, completion, status and priority filters, sort order, and due dates.
- **Import and export** (`tests/transfer.test.ts`): a round trip through the JSON format, and rejection of bad JSON, the wrong version, duplicate ids, impossible dates, and completion fields that disagree with the status.
- **Storage** (`tests/db.test.ts`): IndexedDB create, update, complete, delete, status index, and replace-all. A failed import must leave the previous rows in place.

`tests/precache.test.ts` checks that precache URLs stay under `/local-first-task-manager/` and that the generated service worker is syntactically valid.

Storage tests use fake-indexeddb, installed from `tests/setup.ts`, so they do not need a browser. The test database is deleted before each storage test.

## Project structure

```text
index.html                 Page structure
src/main.ts                Form, filters, import, and export
src/render.ts              Task list DOM
src/styles.css             Layout and theme
src/task.ts                Validation, sorting, and completion rules
src/db.ts                  IndexedDB schema and reads/writes
src/transfer.ts            JSON export and import validation
src/pwa/register.ts        Production service worker registration
src/pwa/precache.ts        Base-path precache URLs and cache names
src/pwa/service-worker.ts  Service worker source used by the build
src/types.ts               Shared types and limits
vite.config.ts             Base path, Vitest, and the service worker plugin
public/manifest.webmanifest
public/icons/              SVG favicon and PNG install icons
tests/                     Vitest suites
.github/workflows/pages.yml
```

## Data model

Each task stored in IndexedDB, and each task in an export file, has this shape:

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | 1–80 characters: letters, numbers, `_`, `-` |
| `title` | string | Required, trimmed, at most 200 characters |
| `notes` | string | May be empty, at most 5000 characters |
| `status` | `"active"` or `"completed"` | |
| `priority` | `"low"`, `"medium"`, or `"high"` | Defaults to medium in the form |
| `dueDate` | `YYYY-MM-DD` or `null` | Calendar date, not a timestamp |
| `tags` | string[] | At most 12 tags, 40 characters each, case-insensitive duplicates removed |
| `createdAt`, `updatedAt` | ISO-8601 UTC | `YYYY-MM-DDTHH:mm:ss.sssZ` |
| `completedAt` | that timestamp, or `null` | `null` when active, required when completed |

The database name is `local-first-task-manager`. Version 1 has one object store, `tasks`, keyed by `id`, with an index named `by-status`.

### Export file

```json
{
  "version": 1,
  "app": "local-first-task-manager",
  "exportedAt": "2026-10-23T12:00:00.000Z",
  "tasks": []
}
```

`version` must be `1` and `app` must be `local-first-task-manager`. Unknown extra fields are ignored. The importer rebuilds each task from the known fields only. A file may contain at most 5000 tasks and 2,000,000 characters. Any problem produces a list of errors and does not write.

## Offline and PWA

The production app is served from a subpath:

```text
https://taha080.github.io/local-first-task-manager/
```

Vite's `base` is `/local-first-task-manager/`, so script, style, icon, and manifest URLs include that prefix. A root-absolute URL such as `/sw.js` would point at `https://taha080.github.io/sw.js`, which is a different site, so the worker would never install.

The manifest uses relative `start_url`, `scope`, and icon paths (`./` and `icons/...`). Browsers resolve those against the manifest URL, which already lives under the project path.

The service worker is not a source file you edit by hand. The Vite build writes `dist/sw.js` beside `index.html` and fills it with the files that were just emitted, including the manifest and icons. Registration uses that same base:

```ts
navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, {
  scope: import.meta.env.BASE_URL,
});
```

The default scope of a worker is the directory it is served from. Here that directory is `/local-first-task-manager/`, which is exactly the project site. The fetch handler also ignores any path that does not start with that prefix. Several GitHub project sites share one origin, and this worker must not cache or intercept them.

On install, the worker precaches the shell (HTML, CSS, JS, manifest, icons) and stores the directory URL under the same body as `index.html`, so a reload of the Pages URL works offline. Navigation requests try the network first and fall back to the cache. Other same-origin GET requests are cache-first, then network. The cache name starts with `lftm-`. On activate, the worker deletes only older caches with that prefix.

The worker is registered in production builds only. The first online visit is what fills the cache. Later visits can be offline. Tasks themselves are not in the cache; they stay in IndexedDB, which the service worker does not read.

Installing needs a production visit over HTTPS (GitHub Pages provides that), a manifest with 192px and 512px icons, and a worker that handles `fetch`. Use **Add to Home Screen** or the install icon in the address bar.

## GitHub Pages

Pushes to `main` run `.github/workflows/pages.yml`. The workflow installs dependencies, runs the tests, builds `dist/`, and deploys that folder with `actions/configure-pages`, `actions/upload-pages-artifact`, and `actions/deploy-pages`.

In the repository settings, set **Pages → Build and deployment → Source** to **GitHub Actions**. The first run may ask you to approve the `github-pages` environment. After it succeeds, the site is at the live demo link above.

## License

[MIT](LICENSE). Copyright (c) 2026 Taha Ahsan.
