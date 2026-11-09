# Sketch to Schema

Turn a whiteboard photo, or a diagram drawn on screen, into a draft database schema, review it, and copy PostgreSQL DDL or DBML.

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

Everything on the page (the photo or drawing, board settings and the draft schema) is saved as a **project** in your browser, automatically as you work.

- **New** starts a blank project. Rename it in the box at the top.
- **Projects** lists your projects with a preview: open, duplicate, export or delete them, and search by name.
- **Export** saves the project as a `.s2s.json` file. Send it to a teammate, or keep it as a backup.
- **Import** opens a project file someone exported. It's added to your list as a new project.

Projects live in this browser only. Clearing site data, or a private window, removes them, so export anything you want to keep.

## Using it

- **Photo:** upload, drag in, or paste (Ctrl/⌘+V) a photo of the diagram.
- **Draw:** sketch on screen.
  - **Box** (B): drag to draw a table.
  - **Text** (T): click inside a box and type the table name; press Enter for each column on the next line, Esc to stop.
  - **Pen** (P): underline primary keys, or draw freehand.
  - **1 → many** (M): drag from the "one" table to the "many" table; it draws a bar and a crow's foot.
  - **Line** (L), **Eraser** (E), **Undo** (Ctrl/⌘+Z), **Clear**.
  - The drawing is saved with the project as you go.
- **During a meeting:**
  - **Board:** Standard, Wide or Large drawing space. Bigger boards raise the text size so it stays readable.
  - **Text:** Small, Medium or Large for new text.
  - **Zoom:** −, + and **Fit** (keys −, + and 0, or Ctrl/⌘ + scroll).
  - **Hand** (H): drag to move around a zoomed board. You can also hold Space and drag, or drag with the middle mouse button.
  - **Meeting mode:** hides everything except the board and its tools. Press Esc to leave.
  - **Full screen:** meeting mode with the browser's full screen. Good for screen sharing.
  - Extract sends only the part of the board you drew on, so big boards still read well.
- **Extract schema**, then check anything highlighted in amber. Editing a field or pressing **Looks right** clears its flag.
- Copy **PostgreSQL DDL** or **DBML** from Export.

Typed text in Draw mode is much easier for the models to read than mouse handwriting, so prefer the Text tool for names.

## Working on the code

### Run it locally

JavaScript modules don't load from a file opened by double-clicking (`file://`), so serve the folder:

```bash
python3 -m http.server 8000      # or: npm start
```

Then open http://localhost:8000. In the browser console, `s2s.state` shows the app state (draft, drawing, open project).

### Run the tests

The tests cover the logic that doesn't need a browser: reading model replies, building the draft, DDL/DBML export, and checking saved drawings. They need Node.js 20 or newer and nothing else:

```bash
node --test "tests/*.test.js"    # or: npm test
```

### Code layout

```
index.html                  page markup only
css/
  tokens.css                colors (light and dark), fonts, base styles: change the look here
  layout.css                page grid, panels, project bar, meeting mode
  components.css            buttons, toolbars, board, draft editor, export, projects dialog
js/
  main.js                   startup: loads the modules, opens the last project
  state.js                  shared app state + events (see the list at the top of the file)
  util.js                   small helpers ($, esc, uid, storage, messages)
  icons.js                  toolbar icons
  connection.js             AI connection panel: provider, key, model
  extract.js                the Extract button: sketch → provider → draft
  providers/
    index.js                list of providers (the Provider menu is built from it)
    prompt.js               the prompt, the reply's JSON shape, reply parsing
    http.js                 shared request helpers
    chat-completions.js     request format shared by OpenAI and DeepSeek
    openrouter.js  gemini.js  openai.js  anthropic.js  deepseek.js
  sketch/
    board.js                the canvas: Photo/Draw mode, zoom, board size, meeting mode, upload, image sent to the model
    draw-tools.js           drawing tools, text boxes, undo/clear, keyboard shortcuts
    shapes.js               drawing and hit-testing shapes; checking saved drawings
    image.js                canvas/photo → JPEG (for sending, saving and previews)
    example.js              the example whiteboard and its draft
  schema/
    model.js                model reply → draft tables; draft stats; checking saved drafts
    export.js               draft → PostgreSQL DDL and DBML
    editor.js               the draft editor UI
    export-panel.js         the Export panel (tabs, Copy)
  projects/
    db.js                   IndexedDB storage
    projects.js             autosave, project bar, Projects list, import/export
tests/                      node --test unit tests for the pure logic
```

### How the pieces talk

- **Shared state lives in `js/state.js`.** Modules read and change `state` there instead of keeping their own copies.
- **Modules announce changes with events** instead of calling each other. For example, the editor emits `draft:edited` after a field changes; the export panel listens and refreshes, and the projects module listens for `dirty` and autosaves.
- **Logic is kept apart from the page.** `schema/model.js`, `schema/export.js`, `providers/prompt.js` and `sketch/shapes.js` never touch the page, which is why they can be tested with plain Node.

### Common changes

- **Add an AI provider:** copy `js/providers/gemini.js` to a new file, change its fields and `extract()`, then add it to the list in `js/providers/index.js`. The Provider menu updates itself.
- **Change default models or hints:** edit that provider's file.
- **Change what the model is asked:** edit `PROMPT` (and `SCHEMA` if the shape changes) in `js/providers/prompt.js`, then run the tests.
- **Change the SQL or DBML output:** edit `js/schema/export.js` and add a test in `tests/export.test.js`.
- **Change colors or fonts:** edit `css/tokens.css`.
