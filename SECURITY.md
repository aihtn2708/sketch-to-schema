# Security

Sketch to Schema is a static site: HTML, CSS and JavaScript served by GitHub Pages, with no server of its own. Everything happens in the browser of the person using it.

## What leaves the browser

| What | Where it goes | When |
| --- | --- | --- |
| The sketch (as an image) and the extraction prompt | The AI provider chosen under AI connection | Only when you press **Extract schema** |
| The draft schema as text, and your question | The same provider | Only when you press **Ask** (a new question) |
| Your API key | Only to its own provider, in the request header | With each of those requests |

Nothing else is sent anywhere: projects, drawings, sample data, CSV imports, queries and tests stay in the browser (IndexedDB and local storage). The page loads no third-party code, fonts or images: the PostgreSQL engine and the fonts are served from this site.

Choose providers with this in mind: free OpenRouter models and Google's free tier may log or learn from what they receive. Don't sketch real customer data into a diagram you send to a free model.

## Controls

- **Content Security Policy** (a `<meta>` tag in `index.html`, since GitHub Pages can't set headers): scripts, styles, fonts, workers and images only from this site; network connections only to this site and the five AI provider endpoints; no plugins, no `<base>` changes, no form submissions. Inline scripts, inline event handlers, `eval` and inline style attributes are all blocked.
- **No third-party runtime code.** PGlite (PostgreSQL in WebAssembly) is in `js/vendor/pglite/` and the fonts are in `fonts/`, so a compromised CDN can't change what runs here. The checksums below let anyone confirm the engine files match the published npm package.
- **Output encoding.** Everything that comes from outside the code (model replies, imported projects, CSV files, query results, error messages) is escaped before it goes into the page (`esc` in `js/util.js`) or set with `textContent`. Model output is never run as code. SQL from Ask only runs when you press Run, inside the local mock database.
- **Imported files are untrusted.** Project files (`.s2s.json`) are rebuilt field by field: ids are reduced to plain characters (`safeId`), names and lists are capped, unknown fields are dropped, and the keys `__proto__`, `constructor` and the like can't be used. Imports over 50 MB (projects) or 20 MB (CSV) are refused.
- **API keys.** Sent only to their own provider over HTTPS, never written into project exports or logs. By default a key is kept for the current tab only (`sessionStorage`, gone when the tab closes); **Remember on this device** (opt-in) keeps it in `localStorage` until **Forget key**.
- **Mock database isolation.** PostgreSQL runs in a Web Worker with no network or file access. Every query runs in a transaction that is rolled back; **Stop** ends a runaway query.
- **CSV export** puts a `'` before cells starting with `=`, `+`, `@`, a tab, or `-` followed by text, so spreadsheets don't run them as formulas (CSV injection).
- **Framing.** The page won't start inside another site's frame (clickjacking), since GitHub Pages can't send `X-Frame-Options` or `frame-ancestors`.
- **Referrer policy** `no-referrer`; outbound links use `rel="noopener noreferrer"`.

`tests/security.test.js` covers the import cleaning, escaping, CSV export and input-size cases, and runs with the other tests (`npm test`).

## Audit, 11 November 2026

Reviewed against the OWASP Top 10 (2021), the parts of OWASP ASVS 4.0 that apply to a browser-only app (V5 validation and encoding, V8 data protection, V10 malicious code, V14 configuration), and the OWASP cheat sheets on CSP, third-party JavaScript and CSV injection.

| # | Severity | Finding | Status |
| --- | --- | --- | --- |
| 1 | High | **Stored XSS through an imported project file.** Table and column ids from a `.s2s.json` file were written into HTML attributes unescaped, so a crafted file shared with a colleague could run script on import and read a remembered API key. Confirmed with a test file against the deployed version. | Fixed: ids cleaned on import (`safeId`) and escaped in the editor; regression test added. |
| 2 | Medium | **No Content Security Policy**, so any injection would have had full access. | Fixed: strict CSP (see Controls). |
| 3 | Medium | **Third-party code at runtime**: the database engine came from cdn.jsdelivr.net and fonts from Google Fonts (which also shared visitors' IP addresses with Google). | Fixed: both served from this site; engine checksums below. |
| 4 | Medium | **API keys remembered in `localStorage` by default.** | Fixed: tab-only by default; remembering is opt-in (people who already had a key remembered keep that setting). |
| 5 | Low | **Prototype keys in imported data** (`__proto__`, `constructor`) could reshape internal objects, and flag names were checked with a plain object lookup. | Fixed: keys made safe; flags checked with `Object.hasOwn`. |
| 6 | Low | **CSV injection** in Export CSV. | Fixed. |
| 7 | Low | **Slow pattern (ReDoS)** in the number check: a 20,000-digit cell took 0.85 s and grows with the square of its length, so a crafted CSV could freeze the tab. | Fixed: rewritten; test added. |
| 8 | Low | **Clickjacking**: the page could be framed by another site. | Fixed: frame guard (`js/frame-guard.js`). |
| 9 | Low | **No size limits** on project imports and imported drawings. | Fixed: 50 MB project limit; lists and text capped. |
| 10 | Info | Repository and history scanned for keys and tokens: none found. All commits use the owner's identity. | No action. |

### Left for the site owner (can't be set from the code)

- **Shared origin on github.io.** Every GitHub Pages site under the same account shares the origin `https://<account>.github.io`, and with it local storage and IndexedDB. Any other Pages site on this account could read remembered keys and saved projects. Either keep no other Pages sites on this account, or serve this one from its own custom domain or subdomain (Settings → Pages → Custom domain).
- **Enforce HTTPS**: check that it's ticked in Settings → Pages.
- **Spend limits**: set a monthly limit on every paid provider key, and use a key made only for this tool.
- **The GitHub account**: two-factor authentication on, and only trusted people with write access (anyone who can push can change what the site runs).
- **Shared computers**: leave Remember off, and use **Forget key** (and delete projects) when done.

## Vendored engine: verify or update

PGlite 0.5.11 (Apache-2.0 and PostgreSQL License, see `js/vendor/pglite/LICENSE`). SHA-256 of the files served:

```
5bb49743e0a917c92828f7558be3df26f549d64c0bffc80de92f5fbb21f37a79  chunk-3OMHRXTA.js
161f0b0ea69bcae99be2a09ddec378ca6d3d8687effdc8ee5cf6096dda843706  chunk-7NIVBDG7.js
5ab11fd9fd74b259484f42a7855cd9569a5fe6ee1cf3c032238ac43a59511d97  chunk-F4GETNPB.js
e04c14da71c248d5e7e02f45df665b8e2b136526ee0bef419274bb2b345a1017  chunk-NNS5RQRF.js
a3239ef94a90d12af61de0f79e096a1f52ca484aa35aed476b02f101fed7de41  chunk-O56QGQDD.js
bff6d3144dd6ea2689b00d9d0eea1ea2267b9cc14505fb9107b6194c1832bdea  chunk-QY3QWFKW.js
b69e18e8f5bd18d0b024d88b63c45dec1720155ef1a9cf52095268ce31c548d9  chunk-R5JPZYG3.js
2c78b1ff62904e112b6c6628244858c7974d68b48d6d9330af8822244910844f  index.js
985d9b6f0715e9850efb5798ce51f64e7fd8629d70970fd1a61e75d7bae0bde7  initdb.wasm
47ff29bdadf0dfd8af60bb01313c7f918c22518ee48772fc40ed49028a81ccc4  pglite.data
6b290789f89aabf0052a975eee03cf97430f2a082938fe18137b246aaf1136b5  pglite.wasm
```

To check them: `npm pack @electric-sql/pglite@0.5.11`, unpack it, and run `sha256sum package/dist/<file>` for each file above.

To update: install the new version from npm, copy the same kinds of files from its `dist` folder (`index.js`, the `chunk-*.js` files it imports, `pglite.wasm`, `pglite.data`, `initdb.wasm`) into `js/vendor/pglite/`, update the version and checksums here, and run the browser tests. The fonts in `fonts/` come from the `@fontsource` packages (SIL Open Font License, see `fonts/OFL-*.txt`).

## Reporting a problem

Open a private security advisory on this repository (Security → Report a vulnerability), or contact the repository owner directly. Please don't open a public issue for a security problem.
