# Architecture and decisions

Upgrade is a single-user app that runs entirely in the browser. This page explains how it is put together and why.

## Layout

```
index.html                  markup, CSP, script order
css/styles.css              all styles (design tokens at the top, in :root)
js/data/content.js          lessons, prompts, breathwork and meditation scripts
js/data/exercises.js        exercise catalog (generated)
js/data/strength-standards.js  strength reference tables (generated)
js/app.js                   state, storage, rendering, every view
```

The scripts are classic `<script>` tags loaded in order. Data files declare top-level constants; `app.js` uses them. `tests/source.mjs` reads the same order from `index.html`, so the tests and the page can't drift apart.

## Decisions

### 1. Plain HTML, CSS and JavaScript, no framework, no build step
The app began as a single-file prototype and grew feature by feature. A framework migration would mean rewriting about 2,600 lines of working view code, and that alone would not give the person using it anything new. With no build step, the deployed files are exactly the files in the repo: `index.html` opens directly, and GitHub Pages serves the repository as it is.

**Trade-off:** views build DOM with string templates and `innerHTML`. That is fast to write but easy to get wrong, so every piece of user text goes through `esc()`, and an end-to-end test loads HTML into every stored field and checks that none of it renders as markup.

### 2. Local-first storage in `localStorage`, no backend
The data is personal: journal entries, mood and sleep. Keeping it on the device means no accounts, no server to run, and nothing to leak. The store is one JSON document (`upgrade.store.v1`) holding the profile, habits, books and one object per day.

**Risks and how they are handled:**

| Risk | Mitigation |
|---|---|
| Browser refuses to save (quota, private mode) | `saveLocal()` catches the error, shows a toast and a red footer state, and asks for an export |
| Two tabs overwrite each other | A tab listens for the `storage` event and adopts the newer copy before its next save |
| Browser evicts site data (Safari clears unvisited sites) | `navigator.storage.persist()` on boot, plus a footer reminder to export after 14 days without a backup |
| Moving to a new device | Export downloads JSON; Import merges it (newest copy of each day wins; the backup's profile and goals win) |

**Trade-off:** there is no automatic sync between devices. Adding it would need a backend and authentication, which is a product decision rather than a refactor (see "Next steps" in the README).

### 3. Content-Security-Policy
`index.html` declares `script-src 'self'` and `connect-src 'none'`. The app never makes network requests, so the policy states that outright. If an escaping bug ever slipped through, injected scripts still could not run or send data anywhere. Inline styles are allowed because the views set them directly.

### 4. Testing strategy
- **`tests/harness.mjs` (jsdom, about 3 s).** Boots the app with seeded data and walks every view and tab. It checks the domain logic (streaks, training volume, PR detection, strength percentiles, meditation timer math, journal search) and checks that every change reaches `localStorage`. A negative control turns saving off and confirms the suite fails.
- **`tests/e2e.mjs` (Playwright).** Runs real Chromium at 1440 px and 400 px against the app served over HTTP, so the CSP is enforced. It covers navigation, overflow, persistence across reloads, two-tab safety, export and import (including a malformed file), stored-HTML escaping, save-failure messaging and the backup reminder. Set `APP_URL` to run the same checks against the live site.

### 5. Generated data
The exercise catalog comes from [free-exercise-db](https://github.com/yuhonas/free-exercise-db), and the strength tables are built from the published standards at strengthlevel.com. Both are produced by scripts in `scripts/` and committed as data files, so the app needs no network at runtime.
