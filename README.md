# Sketch to Schema

Turn a whiteboard photo, or a diagram drawn on screen, into a draft database schema, review it, and copy PostgreSQL DDL or DBML. Then ask questions in plain language to get SQL, and test queries on a mock PostgreSQL database with generated sample data, all in the browser.

It's a static site: plain HTML, CSS and JavaScript modules, with no build step and no server. Each person adds their own API key (OpenRouter, Gemini, ChatGPT, Claude or DeepSeek), which stays in their browser and is sent only to the provider they pick. Work is saved as projects in the browser.

## Deploy on GitHub Pages (about 5 minutes)

1. Create a new repository on GitHub, e.g. `sketch-to-schema`.
2. Upload all the files and folders (`index.html`, `css/`, `js/`, …) to the repository root.
   - Web: **Add file → Upload files**, drag in the folders, then **Commit changes**.
   - Or from a terminal:
     ```bash
     git init && git add . && git commit -m "Sketch to Schema"
     git branch -M main
     git remote add origin https://github.com/<you>/sketch-to-schema.git
     git push -u origin main
     ```
3. Repository **Settings → Pages → Build and deployment**: Source **Deploy from a branch**, Branch **main**, folder **/ (root)**, then **Save**.
4. After a minute or two the site is live at `https://<you>.github.io/sketch-to-schema/`.

To update it later, commit your changes; Pages redeploys automatically.

> **Visibility:** on GitHub Free, Pro and Team plans a Pages site is public to anyone with the link. That's fine here because the page holds no keys or data; each visitor needs their own key to extract. Restricting who can open the site requires GitHub Enterprise Cloud.

## Each teammate: add a key (once per browser)

Open the site, pick a provider under **AI connection**, and paste a key. Keys stay in that browser and are sent only to the provider you pick. The **Model** box suggests models and accepts any model name the provider supports.

| Provider | Cost per extraction | Default model | Where to get a key |
|---|---|---|---|
| **OpenRouter (free models)** | $0 | a list of free vision models, tried in order | https://openrouter.ai/settings/keys |
| **Gemini (Google)** | free tier, or ~$0.001–0.003 | `gemini-3.1-flash-lite` | https://aistudio.google.com/apikey |
| **ChatGPT (OpenAI)** | ~$0.001 | `gpt-6-luna` | https://platform.openai.com/api-keys |
| **Claude (Anthropic)** | ~$0.001 | `claude-haiku-5-5` | https://platform.claude.com/settings/keys |
| **DeepSeek** | ~$0.001–0.002 | `deepseek-flash` | https://platform.deepseek.com/api_keys |

Notes:
- **OpenRouter:** free models allow 50 requests a day per account, or 1,000 a day once that account has bought $10 of credit (free models don't spend it). Free models change often; if extraction keeps failing, replace the model list with current free models that accept images: https://openrouter.ai/models?q=:free (filter Input → Image).
- **Free tiers keep data:** free OpenRouter models may log what they receive, and Google may use Gemini free-tier inputs to improve its products. Don't send confidential designs on free tiers.
- **DeepSeek:** if you get a connection error, DeepSeek may not accept requests from web pages. Use OpenRouter with the model `deepseek/deepseek-v4.1-flash` instead.
- **Paid providers:** set a monthly spend or usage limit in each provider's console.
- **Remember on this device** keeps keys in the browser's local storage. Untick it on shared computers, and use **Forget key** when you're done.

## Projects

Everything on the page (the photo or drawing, the draft schema, the diagram layout, the questions you asked, and the mock database's sample data and tests) is saved as a **project** in your browser, automatically as you work.

- **New** starts a blank project. Rename it in the box at the top.
- **Projects** lists your projects with a preview: open, duplicate, export or delete them, and search by name.
- **Export** saves the project as a `.s2s.json` file. Send it to a teammate, or keep it as a backup.
- **Import** opens a project file someone exported. It's added to your list as a new project.

Projects live in this browser only. Clearing site data, or a private window, removes them, so export anything you want to keep.

## Using it

The page has three tabs, one function at a time. It always opens on the first:

- **Sketch to schema:** the sketch, the draft schema and Export. The tab shows how many items are marked to check.
- **Ask in plain language:** SQL from a question.
- **Test on mock data:** the mock database, queries and tests. The tab shows how many tests there are, or how many failed.

The tabs stay at the top of the window as you scroll. **Run on mock data** on an Ask answer switches to Test on mock data.

- **AI connection** folds down to one status line once a key is saved. Click it to change the provider, key or model.
- **Photo:** upload, drag in, or paste (Ctrl/⌘+V) a photo of the diagram.
- **Draw:** sketch on screen.
  - **Box** (B): drag to draw a table.
  - **Text** (T): click inside a box and type the table name; press Enter for each column on the next line, Esc to stop.
  - **Pen** (P): underline primary keys, or draw freehand.
  - **1 → many** (M): drag from the "one" table to the "many" table; it draws a bar and a crow's foot.
  - **Line** (L), **Eraser** (E), **Undo** (Ctrl/⌘+Z), **Clear**.
  - The drawing is saved with the project as you go.
- **The board has no edges.** Keep drawing in any direction:
  - Drag a shape past the edge of the board and it scrolls with you.
  - **Hand** (H): drag to move around. You can also hold Space and drag, drag with the middle mouse button, or use the arrow keys.
  - **Zoom:** −, + and **Fit** (keys −, + and 0; Ctrl/⌘ + scroll or a trackpad pinch; two-finger pinch on a touch screen). Fit shows the whole drawing.
  - **Text:** Small, Medium or Large for new text.
- **During a meeting:**
  - **Meeting mode:** the board fills the window, and plain scrolling moves around it. Press Esc to leave.
  - **Full screen:** meeting mode with the browser's full screen. Good for screen sharing.
  - Extract sends only the part of the board you drew on, so a spread-out drawing still reads well.
- **Extract schema**, then check anything highlighted in amber. Editing a field or pressing **Looks right** clears its flag.
- **Draft schema** has two views:
  - **Editor:** edit tables and columns, and check flags. The arrow next to a table name collapses it to one line showing its columns and how many items it has to check; **Collapse all** and **Expand all** do every table. Collapsed tables are saved with the project.
  - **Diagram:** the draft as table cards with relationship lines, like dbdiagram.io. `*` marks the column holding the reference and `1` the column it points to; key icons mark primary keys and amber marks columns to check. Drag tables to move them (positions are saved with the project), drag the background to move around, Ctrl/⌘ + scroll to zoom, **Arrange** to lay everything out again, and double-click a table to edit it. **SVG** and **PNG** download the diagram.
- Copy **PostgreSQL DDL** or **DBML** from Export.
- **Ask in plain language:** type a question about the data, for example *inventory items that have had no transactions over the past two years*, pick the SQL dialect, and press **Ask** (or Ctrl/⌘+Enter). It uses the same AI connection as Extract.
  - The SQL is written from the current draft schema only. Any table or column it uses that isn't in the draft is listed as a warning, and anything the question needs but the schema doesn't have is listed under **Not in your schema**.
  - When the question compares groups of rows (with / without, both, either), a **Venn diagram** shows which part the query returns and names the matching join: for example "Only in A" is an anti-join (`NOT EXISTS`).
  - The chips under the box are starter questions made from the draft's relationships. They cost nothing until you press Ask.
  - Answers are saved with the project. Asking the same question again shows the saved answer without a request; **Ask again** gets a fresh one. If the draft changed since, the answer says so.

- **Test on mock data:** a real PostgreSQL database built from the draft schema, running inside your browser. Nothing is sent anywhere and no AI request is made.
  - **Sample data** is generated from each column's name and type: names, emails, cities, prices, quantities, and dates spread over the last three years. Foreign keys point at real parent rows, tables that point to another table get 4 times as many rows, and about 1 parent in 5 gets no child rows, so "with no …" questions have answers. Set **Rows per table** and press **New sample data** for a fresh set (**Undo** brings the old one back). Tables you edited or imported are kept; only generated tables get new rows.
  - The **Sample data** tab has two views:
    - **Table:** pick a table and edit it like a spreadsheet (100 rows a page). An empty cell is NULL; Enter and ↑ ↓ move between rows. Cells are checked as you type: values that don't fit the column's type, empty NOT NULL cells, repeated keys, and references to rows that don't exist are marked, and **Show next** jumps to them. Columns that point to another table suggest its values. **Add row** gives a whole-number key the next number; **Regenerate** replaces one table with new generated rows; **Export CSV** downloads the table. The label next to the table says whether its rows are Generated, Edited or Imported.
    - **SQL:** the same data as INSERT statements. Type here to use your own SQL instead (anything PostgreSQL accepts, such as UPDATEs or extra statements). The Table view then shows the result, read-only; **Use table editing** turns that result back into editable rows.
  - **Import CSV** (in the Sample data tab) or **Add tables from CSV** (under the draft tables) reads one or more CSV files. For each file, choose:
    - **An existing table:** columns are matched by name; replace the table's rows or add to them. Columns the file doesn't have are left empty.
    - **A new table:** it's added to the draft schema, named after the file. Column types (whole number, decimal, date, timestamp, true/false, UUID, text), the primary key (`id` or `<table>_id` with all-different values) and references (`<other table>_id`) are guessed from the data and marked to check, like Extract's guesses. Numbers with leading zeros, like zip codes, stay text.
    Comma, semicolon and tab separated files work, including Excel exports. The files never leave the browser, but a project Export includes the imported rows, and the page reminds you of that.
  - Sketched types are changed to ones PostgreSQL accepts (`datetime` → `timestamp`, `money` → `numeric(12,2)`); open **Schema used for the mock database** to see the result.
  - **Query:** write SQL and press **Run** (Ctrl/⌘+Enter). Click a table name to see its rows. Anything a query changes (INSERT, UPDATE, DELETE, even DROP) is undone after the run, so every run starts from the same data. **Stop** ends a query that takes too long.
  - **Save as test** keeps the query and its current result. **Run all tests** runs them again and shows which ones now give a different result and how (for example *Expected 4 rows, got 5. New: (Nobody Here, Hanoi).*). Row order only counts when the query has `ORDER BY`. If the new result is right, press **Accept new result**.
  - On an Ask answer, **Run on mock data** runs its SQL here, and **Save as test** then names the test after the question.
  - The first run downloads the database engine (about 5 MB, from cdn.jsdelivr.net) and takes a few seconds; after that the browser keeps it. If your network blocks that site, see *Mock database engine* below.

### Requests per day

Each Extract is 1 request (up to 4 for a very large diagram), and each new question is 1 request. Nothing else calls the AI: editing, the diagram, export, starter questions, saved answers and the whole mock database (data, queries, tests) are all free. The AI connection panel shows how many requests this browser has made today, so a team can see it staying well under 100 a day.

Typed text in Draw mode is much easier for the models to read than mouse handwriting, so prefer the Text tool for names.

## Working on the code

### Run it locally

JavaScript modules don't load from a file opened by double-clicking (`file://`), so serve the folder:

```bash
python3 -m http.server 8000      # or: npm start
```

Then open http://localhost:8000. In the browser console, `s2s.state` shows the app state (draft, drawing, open project).

### Run the tests

The tests cover the logic that doesn't need a browser: reading model replies, building the draft, DDL/DBML export, checking saved drawings, the Ask prompt, SQL check and Venn diagram, and the mock database's types, sample data and test comparison. They need Node.js 20 or newer and nothing else:

```bash
node --test "tests/*.test.js"    # or: npm test
```

### Code layout

```
index.html                  page markup only
css/
  tokens.css                colors (light and dark), fonts, base styles: change the look here
  layout.css                page grid, workspace tabs, panels, project bar, meeting mode
  components.css            buttons, toolbars, board, draft editor, export, projects dialog
js/
  main.js                   startup: loads the modules, opens the last project
  workspace.js              the three workspace tabs; emit("view", "design" | "ask" | "test") switches
  state.js                  shared app state + events (see the list at the top of the file)
  util.js                   small helpers ($, esc, uid, storage, messages)
  icons.js                  toolbar icons
  connection.js             AI connection panel: provider, key, model
  extract.js                the Extract button: sketch → provider → draft
  usage.js                  counts requests made today in this browser
  providers/
    index.js                list of providers (the Provider menu is built from it)
    prompt.js               the prompt, the reply's JSON shape, reply parsing, rescuing cut-off replies
    passes.js               reads large diagrams in several parts when a reply is cut off
    http.js                 shared request helpers (retries without settings a model rejects)
    chat-completions.js     request format shared by OpenAI and DeepSeek
    openrouter.js  gemini.js  openai.js  anthropic.js  deepseek.js
  sketch/
    board.js                the canvas: Photo/Draw mode, the open-ended board (pan/zoom), meeting mode, upload, image sent to the model
    draw-tools.js           drawing tools, text boxes, auto-scroll at edges, pinch, undo/clear, keyboard shortcuts
    shapes.js               drawing and hit-testing shapes; checking saved drawings
    image.js                canvas/photo → JPEG (for sending, saving and previews)
    example.js              the example whiteboard and its draft
  schema/
    model.js                model reply → draft tables; draft stats; checking saved drafts
    export.js               draft → PostgreSQL DDL and DBML
    editor.js               the draft editor UI
    export-panel.js         the Export panel (tabs, Copy)
  diagram/
    layout.js               card sizes, relationships, auto-arrange, connector paths (pure, tested)
    diagram.js              the Diagram view: drawing, dragging, zoom, SVG/PNG download
  query/
    prompt.js               Ask in plain language: schema text, prompt, answer shape, starter questions
    check.js                finds tables and columns in the SQL that aren't in the draft
    venn.js                 Venn diagram drawing and join names
    ask-panel.js            the Ask panel UI, history, reusing saved answers
  mock/
    setup.js                sketched types → PostgreSQL types; CREATE TABLE and foreign-key steps
    generate.js             sample data rows from column names and types (seeded, repeatable)
    rows.js                 sample data as rows: INSERT statements, lining up with the draft, cell checks, CSV out
    csv.js                  reading CSV files; guessing types, keys and references
    sample.js               the shared sample data and engine state (used by the panels below)
    compare.js              tests: result fingerprints, comparing results, explaining differences
    saved.js                the mock database's part of a project, and cleaning it on load
    db.js                   starts and talks to the worker; the engine's CDN address and version
    worker.js               runs PostgreSQL (PGlite) in a background worker
    mock-panel.js           the Test on mock data panel: status, query, tests
    data-view.js            the Sample data tab: Table and SQL views
    csv-import.js           the Import CSV dialog
  projects/
    db.js                   IndexedDB storage
    projects.js             autosave, project bar, Projects list, import/export
tests/                      node --test unit tests for the pure logic
```

### How the pieces talk

- **Shared state lives in `js/state.js`.** Modules read and change `state` there instead of keeping their own copies.
- **Modules announce changes with events** instead of calling each other. For example, the editor emits `draft:edited` after a field changes; the export panel listens and refreshes, and the projects module listens for `dirty` and autosaves.
- **Logic is kept apart from the page.** `schema/model.js`, `schema/export.js`, `providers/prompt.js`, `sketch/shapes.js`, `diagram/layout.js` and `query/prompt.js`, `check.js`, `venn.js` and `mock/setup.js`, `generate.js`, `rows.js`, `csv.js`, `compare.js` never touch the page, which is why they can be tested with plain Node.

### Common changes

- **Add an AI provider:** copy `js/providers/gemini.js` to a new file, change its fields, `extract()` and `ask()`, then add it to the list in `js/providers/index.js`. The Provider menu updates itself.
- **Change default models or hints:** edit that provider's file.
- **Large diagrams:** each request allows up to 16,000 reply tokens and asks the model to think as little as possible, since thinking uses the same reply space. If a reply is still cut off, the complete tables are kept and the model is asked for only the rest, up to 4 parts (`js/providers/passes.js`). If tables are still missing after that, a warning above the draft says so.
- **Change what the model is asked:** edit `PROMPT` (and `SCHEMA` if the shape changes) in `js/providers/prompt.js`, then run the tests.
- **Change how questions are answered:** edit `askPrompt` (and `ASK_SCHEMA` if the shape changes) in `js/query/prompt.js`, then run `tests/query.test.js`.
- **Change the SQL or DBML output:** edit `js/schema/export.js` and add a test in `tests/export.test.js`.
- **Change the sample data:** value rules (by column name and type) are in `js/mock/generate.js`, with tests in `tests/mock.test.js`; cell checks are in `js/mock/rows.js` (`tests/rows.test.js`).
- **Change how CSV files are read or guessed:** `js/mock/csv.js`, with tests in `tests/csv.test.js`.
- **Mock database engine:** PostgreSQL compiled to WebAssembly ([PGlite](https://pglite.dev)), loaded from cdn.jsdelivr.net at the version pinned in `js/mock/db.js`. To serve it from this site instead (for networks that block the CDN), copy every `.js` file (keep the `fs/` folder too) plus `pglite.wasm`, `pglite.data` and `initdb.wasm` from the `dist` folder of `@electric-sql/pglite` at that version into `js/vendor/pglite/` (about 17 MB; skip the `.map`, `.d.ts` and `.tar.gz` files), and set `PGLITE_URL` to `new URL("../vendor/pglite/index.js", import.meta.url).href`.
- **Change colors or fonts:** edit `css/tokens.css`. The Diagram view reads the same colors, so it follows.
- **Change how the diagram looks or is arranged:** card drawing is in `js/diagram/diagram.js`; sizes, arrangement and line routing are in `js/diagram/layout.js` (with tests in `tests/diagram.test.js`).
