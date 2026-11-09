# Sketch to Schema

Turn a whiteboard photo, or a diagram drawn on screen, into a draft database schema, review it, and copy PostgreSQL DDL or DBML.

It's a single static page (`index.html`). There's no server: each person adds their own API key (OpenRouter, Gemini, ChatGPT, Claude or DeepSeek), which stays in their browser and is sent only to the provider they pick. Work is saved as projects in the browser.

## Deploy on GitHub Pages (about 5 minutes)

1. Create a new repository on GitHub, e.g. `sketch-to-schema`.
2. Upload `index.html` (and this README) to the repository root.
   - Web: **Add file → Upload files**, then **Commit changes**.
   - Or from a terminal:
     ```bash
     git init && git add . && git commit -m "Sketch to Schema"
     git branch -M main
     git remote add origin https://github.com/<you>/sketch-to-schema.git
     git push -u origin main
     ```
3. Repository **Settings → Pages → Build and deployment**: Source **Deploy from a branch**, Branch **main**, folder **/ (root)**, then **Save**.
4. After a minute or two the site is live at `https://<you>.github.io/sketch-to-schema/`.

To update it later, replace `index.html` and commit; Pages redeploys automatically.

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
