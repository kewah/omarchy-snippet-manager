# Project: Omarchy Snippet Manager

Omarchy overlay plugin (`kewah.snippet-manager`) for searching, creating, editing, copying, and pasting personal plain-text snippets.

## Tech Stack

- QML / Qt Quick and Quickshell (`qs`), as shipped with Omarchy
- ES5 JavaScript in `lib/` (imported by both QML and Node — no compile step)
- Node.js `node:test` + `node:assert/strict` for JS tests
- npm `package.json` for lint, format, tests, and git hooks only (no bundler, no TypeScript)
- Bash helpers (`set -euo pipefail` or equivalent `errexit`/`nounset`/`pipefail`)
- Runtime tools: `jq`, `flock`, `wl-copy`, `wtype`, `omarchy`, `omarchy-shell`

## Commands

```
npm test              # lint + JS tests + shell tests
npm run lint          # eslint . (Prettier as an ESLint rule; pre-commit eslint --fix on staged JS)
npm run format        # prettier --write
npm run test:js       # node --test tests/**/*.test.js
npm run test:shell    # catalog/transfer/install shell tests
npm run test:smoke    # overlay runtime smoke (needs Omarchy shell + qs)
npm run validate      # omarchy plugin validate on a copy without node_modules
```

Interactive overlay (requires installed Omarchy shell modules and `qs`):

```
bash tests/snippet-overlay/manual-harness.sh
```

Local enable (after a directory symlink at `~/.config/omarchy/plugins/kewah.snippet-manager/`):

```
npm run validate
omarchy-shell shell rescanPlugins
omarchy plugin enable kewah.snippet-manager
```

Merge user menu/bind fragments (does not enable the plugin):

```
bin/snippet-install \
  --menu-file "$HOME/.config/omarchy/extensions/omarchy-menu.jsonc" \
  --bind-file "$HOME/.config/hypr/bindings.lua"
```

## Code Conventions

Formatting and ES5 syntax in `lib/` are owned by Prettier and ESLint (`npm run lint` / `npm run format`). Dual-load so QML and Node share the same file is `local/require-qml-dual-export`. Catalog, transfer, and install Result returns are `local/require-result-return`. Keep the rules below — tools cannot encode all of them.

- Catalog, transfer, and install APIs return `{ ok: true, value }` or `{ ok: false, error: { code, message } }`. Do not throw for expected domain failures. Project convention (not Omarchy); applies to those exported APIs, not `OverlayModel.transition` (`{ state, effects }`) or overlay helpers.
- Overlay business logic lives in `lib/SnippetOverlayModel.js`. `Snippets.qml` orchestrates Process I/O, focus, and key routing. `ui/*.qml` is presentational: properties in, signals out, no catalog mutations.
- QML uses Omarchy tokens from `qs.Commons` / `qs.Ui`: `Color.menu.*`, `Border.surfaceSpec`, `Style.*`. Do not hardcode colors, spacing, or fonts those tokens already cover.
- Tests colocate by capability: `tests/snippet-catalog/`, `tests/snippet-overlay/`, `tests/snippet-transfer/`, `tests/omarchy-integration/`. JS tests use `node:test`; shell tests print TAP-style `ok`/`not ok` lines.
- Conventional Commits: `type: summary` where type is feat, fix, test, docs, refactor, or chore. Imperative mood; the subject states why, not a file list.
- Filenames follow role: PascalCase for QML types and JS imported by QML (`SnippetSearchView.qml`, `SnippetCatalog.js` — QML type names must start with uppercase); kebab-case for `bin/` CLIs, test dirs, and scripts (`snippet-store`, `tests/snippet-overlay/`).

## Boundaries

- Do not add TypeScript, a bundler, or a compile step. Overlay JS in `lib/` stays QML-loadable source; the plugin loader never builds the tree.
- `package.json` is dev tooling only (lint, tests, hooks). Do not introduce runtime npm dependencies that the overlay would need at load time.
- Do not run `omarchy plugin validate .` on a working tree that contains `node_modules` — npm bin links are symlinks, and Omarchy refuses any symlink inside a plugin folder. Use `npm run validate` instead.
- Do not put search, validation, or persistence logic in QML delegates.
- Do not write `/usr/share/omarchy/` or any path that resolves there. `bin/snippet-install` merges user config only.
- Do not call `omarchy plugin enable` from installer code. Document local enable; do not perform it.
- Do not add `hl.unbind(...)` or steal Super+X clipboard binds. The locked bind is `SUPER + CTRL + M`.
- Plugin `manifest.json` `id` must stay `kewah.snippet-manager` (must not start with `omarchy.`).
- Catalog on disk is schemaVersion `1` only. Reject unknown schemas; do not silently migrate.
- Preserve snippet `content` bytes exactly (Unicode, multiline, CRLF). Trim titles; do not trim content.
- Never commit secrets or `.env` files.

## Patterns

Result type, ES5, and Node/QML dual export — follow `lib/SnippetCatalog.js`:

```javascript
function success(value) {
  return { ok: true, value: value }
}

function failure(code, message) {
  return { ok: false, error: { code: code, message: message } }
}

function parseCatalog(raw) {
  // ...
}

if (typeof module !== "undefined") {
  module.exports = {
    parseCatalog: parseCatalog,
    serializeCatalog: serializeCatalog,
    createSnippet: createSnippet,
    getSnippet: getSnippet,
    updateSnippet: updateSnippet,
    deleteSnippet: deleteSnippet,
    searchSnippets: searchSnippets,
  }
}
```

Overlay loop — follow `Snippets.qml`: `applyEvent` calls `OverlayModel.transition(state, event, SnippetCatalog)`, assigns `result.state`, then `executeEffects(result.effects)` (`READ_STORE`, `GENERATE_CREATE_ID`, `WRITE_STORE`, `DISPATCH_TRANSFER`, `DISMISS`).

## Project Map

### Overlay

Quickshell overlay UI. Start: `Snippets.qml`, `lib/SnippetOverlayModel.js`, `ui/`. Tests: `tests/snippet-overlay/`.

### Catalog

Parse/CRUD/search and on-disk store. Start: `lib/SnippetCatalog.js`, `bin/snippet-store`. Tests: `tests/snippet-catalog/`.

### Transfer

Copy/paste helper. Start: `lib/SnippetTransfer.js`, `bin/snippet-transfer`. Tests: `tests/snippet-transfer/`.

### Install

User menu/bind merge (not plugin enable). Start: `lib/OmarchyInstall.js`, `bin/snippet-install`, `contrib/`. Tests: `tests/omarchy-integration/`.

### Plugin contract

`manifest.json`. Tests: `tests/omarchy-integration/plugin.test.js`.
