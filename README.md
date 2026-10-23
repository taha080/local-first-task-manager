# Local-First Task Manager

A private task list that stays on this device and works offline.

**Live app:** [https://taha080.github.io/local-first-task-manager/](https://taha080.github.io/local-first-task-manager/)

## What it is

Local-First Task Manager is a browser app for a personal task list. Tasks are saved in this browser with [IndexedDB](https://developer.mozilla.org/docs/Web/API/IndexedDB_API). The published site is a static page on GitHub Pages. After the first successful visit, you can keep opening the app when the network is unavailable, and you can install it as a Progressive Web App.

There is no account and no backend. Task lists are not synced across browsers or devices. Each browser profile keeps its own database. To keep a backup, or to move the list to another browser, export a JSON file and import that file where you want it.

## Features

- Create, edit, complete, reopen, and delete tasks
- Filter by status (**All**, **Active**, **Done**) and by priority (**Any**, **High**, **Medium**, **Low**)
- Optional due date, priority, notes, and comma-separated tags
- Active tasks listed first, then the soonest due date, then priority
- Overdue and due-today labels based on the local calendar date
- JSON export and import, with validation that rejects a bad file before it touches the database
- Installable Progressive Web App (web app manifest and service worker)
- Offline use after the first successful load

## How it works

The page is HTML, CSS, and TypeScript, updated with the DOM APIs. [Vite](https://vite.dev/) builds the site. The app has no runtime dependencies. Vite, TypeScript, [Vitest](https://vitest.dev/), and [fake-indexeddb](https://github.com/dumbmatter/fakeIndexedDB) are development dependencies.

### IndexedDB

The database name is `local-first-task-manager`. Version 1 has one object store, `tasks`, keyed by `id`, and an index named `by-status`. Creating, editing, completing, deleting, and importing all read and write that store in the current browser profile. Task data stays on the device. The page does not send it to a server.

### Service worker and offline use

Offline support belongs to the production build. `npm run dev` leaves the service worker unregistered.

Vite’s `base` is `/local-first-task-manager/`, the same prefix as the GitHub Pages project URL. The build writes `dist/sw.js` beside `index.html`. The precache list is the built files plus the files in `public/` (the manifest and icons), excluding `sw.js` itself and any source maps. The page registers that worker in production only:

```ts
navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, {
  scope: import.meta.env.BASE_URL,
});
```

The worker’s scope is the directory it is served from: `/local-first-task-manager/`. A root URL such as `/sw.js` would point at `https://taha080.github.io/sw.js`, outside this project, so the worker is always addressed under the project path. Its fetch handler handles same-origin GET requests whose path starts with that prefix. Other project sites that share the GitHub Pages origin stay outside this worker.

On install, the worker precaches the app shell (HTML, CSS, JavaScript, the manifest, and the icons). It also stores the directory URL under the same response as `index.html`, so a reload of the Pages URL still opens the app offline. Navigation requests try the network first and fall back to the cache. Other same-origin GET requests under the project path are cache-first, then the network. Cache names start with `lftm-`. When a new build activates, the worker deletes older caches that use that prefix.

The first online visit fills the cache. Later visits can open the shell with no network. Tasks stay in IndexedDB. The service worker does not read the database.

The manifest uses relative `start_url`, `scope`, and icon paths (`./` and `icons/...`). Browsers resolve those against the manifest URL, which already lives under the project path. Installing needs a production visit over HTTPS, a manifest with 192px and 512px icons, and a worker that handles `fetch`. GitHub Pages provides HTTPS. Use the browser’s install control or **Add to Home Screen**. The installed app opens at the Pages URL and uses the same on-device database as the browser profile that installed it.

### Backup file, and no sync

Export and import share one JSON format. `version` must be `1` and `app` must be `local-first-task-manager`. Unknown extra fields are ignored. The importer rebuilds each task from the known fields only. A file may contain at most 5000 tasks and 2,000,000 characters. Any problem returns a list of errors and leaves the stored tasks unchanged. After you confirm, a valid import replaces every stored task in one transaction.

There is no sync protocol, account, or remote copy of the list. Two browsers stay independent until you move a file between them yourself.

## Run it locally

You need Node.js 20 or newer.

```bash
git clone https://github.com/taha080/local-first-task-manager.git
cd local-first-task-manager
npm install
npm run dev
```

Open the URL Vite prints. The dev server is configured for port 5173 and the project-site base path, so the usual address is:

```text
http://localhost:5173/local-first-task-manager/
```

To try the production build, including the service worker:

```bash
npm run build
npm run preview
```

Open `http://localhost:4173/local-first-task-manager/`. In the browser developer tools, set the network to offline and reload. The shell should still load, and tasks you already saved should still be there.

| Script | What it does |
| --- | --- |
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Typecheck, then build `dist/` and the service worker |
| `npm run preview` | Serve the production build locally |
| `npm test` | Run the Vitest suite once |
| `npm run test:watch` | Run Vitest in watch mode |
| `npm run typecheck` | Typecheck without emitting files |
| `npm run icons` | Regenerate the PNG icons with Python 3 (optional; the PNGs are already in the repo) |

## Usage

1. Enter a title. Due date, priority, tags, and notes are optional. Tags are comma-separated, for example `home, errands`. Priority defaults to Medium. Choose **Add task**.
2. Use the checkbox to complete a task. Use it again to reopen it.
3. **Edit** loads the task into the form. The heading changes to **Edit task** and the button changes to **Save changes**. **Cancel** clears the form and leaves the stored task as it is.
4. **Delete** asks you to confirm. The prompt says the delete cannot be undone. Confirming removes the task from IndexedDB.
5. Filter with **All**, **Active**, and **Done**. The priority menu (**Any**, **High**, **Medium**, or **Low**) narrows the same list.
6. **Export** downloads `tasks-YYYY-MM-DD.json`, using your local calendar date, with every task. **Import** checks the file. When the file is valid, the app asks you to confirm replacing every task on this device. A file that fails validation leaves the stored tasks unchanged.
7. To install, open the production site and use the browser’s install control or **Add to Home Screen**.

The header pill shows **Online** or **Offline** from `navigator.onLine`. It reports the browser’s network status. The task list is read from IndexedDB either way.

The list is ordered like this: active tasks come before completed ones; dated tasks come before tasks with no due date, soonest first; priority breaks the next ties (high, then medium, then low); then the most recently updated task; then title; then id.

## Project structure

```text
index.html                     Page structure
src/main.ts                    Form, filters, import, and export
src/render.ts                  Task list DOM
src/styles.css                 Layout and theme
src/task.ts                    Validation, sorting, and completion rules
src/db.ts                      IndexedDB schema and reads/writes
src/transfer.ts                JSON export and import validation
src/types.ts                   Shared types and limits
src/pwa/register.ts            Production service worker registration
src/pwa/precache.ts            Base-path precache URLs and cache names
src/pwa/service-worker.ts      Service worker source used by the build
vite.config.ts                 Base path, Vitest, and the service worker plugin
public/manifest.webmanifest    Install metadata
public/icons/                  SVG favicon and PNG install icons
scripts/generate-icons.py      Optional PNG icon generator
tests/                         Vitest suites
.github/workflows/pages.yml    GitHub Pages deploy
```

## Tests

```bash
npm test
```

Vitest runs in Node and picks up `tests/**/*.test.ts`. Storage tests load fake-indexeddb from `tests/setup.ts`, so they do not need a browser. The test database is deleted before each storage test.

- **Task rules** (`tests/task.test.ts`) cover creating and editing tasks, completion, status and priority filters, sort order, and due dates.
- **Import and export** (`tests/transfer.test.ts`) cover a round trip through the JSON format, and rejection of bad JSON, the wrong version, duplicate ids, impossible dates, and completion fields that disagree with the status.
- **Storage** (`tests/db.test.ts`) covers IndexedDB create, update, complete, delete, the `by-status` index, and replace-all. A failed import leaves the previous rows in place. A rejected edit is not written.
- **Precache** (`tests/precache.test.ts`) checks that precache URLs stay under `/local-first-task-manager/` and that the generated service worker is valid JavaScript.

## Task fields

Each task in IndexedDB, and each task in an export file, has this shape:

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | 1–80 characters: letters, numbers, `_`, and `-`. New tasks get a random UUID. |
| `title` | string | Required. Trimmed, with extra spaces collapsed, at most 200 characters. |
| `notes` | string | May be empty. At most 5000 characters. |
| `status` | `"active"` or `"completed"` | The **Done** filter shows completed tasks. |
| `priority` | `"low"`, `"medium"`, or `"high"` | The form defaults to medium. |
| `dueDate` | `YYYY-MM-DD` or `null` | A calendar date, with no time and no time zone. |
| `tags` | string[] | At most 12 tags, 40 characters each. Case-insensitive duplicates are dropped. |
| `createdAt`, `updatedAt` | ISO-8601 UTC | `YYYY-MM-DDTHH:mm:ss.sssZ` |
| `completedAt` | that timestamp, or `null` | `null` while the task is active. A timestamp is required once it is completed. |

An export file looks like this:

```json
{
  "version": 1,
  "app": "local-first-task-manager",
  "exportedAt": "2026-10-23T12:00:00.000Z",
  "tasks": []
}
```

An empty `tasks` array is valid and imports as an empty list.

## GitHub Pages

Pushes to `main`, and manual runs, use `.github/workflows/pages.yml`. The workflow runs `npm ci`, `npm test`, and `npm run build` on Node.js 22, then deploys the `dist/` folder with `actions/configure-pages`, `actions/upload-pages-artifact`, and `actions/deploy-pages`.

In the repository settings, set **Pages → Build and deployment → Source** to **GitHub Actions**. The first run may ask you to approve the `github-pages` environment. After a successful deploy, the site is at the live link above.

## License

[MIT](LICENSE). Copyright (c) 2026 Taha Ahsan.
