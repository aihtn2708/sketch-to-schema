# Sketch to Schema

Turn a whiteboard photo, or a diagram drawn on screen, into a draft database schema, review it, and copy PostgreSQL DDL or DBML.

It's a single static page (`index.html`). There's no server: each person adds their own API key, which stays in their browser and is sent only to the provider they pick.

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

Open the site and fill in **AI connection**.

| Provider | Cost | Where to get a key |
|---|---|---|
| **OpenRouter (free models)** | $0 | https://openrouter.ai/settings/keys |
| **Claude API** | ~$0.001 per extraction with Haiku | https://platform.claude.com/settings/keys |

OpenRouter notes:
- Free models allow **50 requests a day per account**, or **1,000 a day** once that account has bought $10 of credit (free models don't spend it). 20 requests a minute either way. Limits reset at 00:00 UTC.
- In OpenRouter **Settings → Privacy**, check the setting for free models whose providers may train on inputs. If it's off, fewer free vision models are available.
- Free models may log what they receive. Don't send confidential designs.
- Free models change often. If extraction keeps failing, open **Model settings** on the page and replace the model list with current free models that accept images: https://openrouter.ai/models?q=:free (filter Input → Image). `openrouter/free` at the end picks any free model that can read images.

Claude API notes:
- Set a monthly spend limit in the Claude Console.
- The page calls the API directly from the browser (`anthropic-dangerous-direct-browser-access`), which is safe here because each person uses their own key on their own device.

**Remember on this device** keeps the key in the browser's local storage. Untick it on shared computers, and use **Forget key** when you're done.

## Using it

- **Photo:** upload, drag in, or paste (Ctrl/⌘+V) a photo of the diagram.
- **Draw:** sketch on screen.
  - **Box** (B): drag to draw a table.
  - **Text** (T): click inside a box and type the table name; press Enter for each column on the next line, Esc to stop.
  - **Pen** (P): underline primary keys, or draw freehand.
  - **1 → many** (M): drag from the "one" table to the "many" table; it draws a bar and a crow's foot.
  - **Line** (L), **Eraser** (E), **Undo** (Ctrl/⌘+Z), **Clear**.
  - The drawing is saved in your browser as you go.
- **Extract schema**, then check anything highlighted in amber. Editing a field or pressing **Looks right** clears its flag.
- Copy **PostgreSQL DDL** or **DBML** from Export.

Typed text in Draw mode is much easier for the models to read than mouse handwriting, so prefer the Text tool for names.
