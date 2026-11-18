# Queue-it replica waiting room

Local copies of the four Queue-it waiting room pages. They run the current Queue-it engine (4.5, loaded from `assets.queue-it.net`), and a floating panel lets you simulate states, model updates and themes.

| Page | What it replicates |
| --- | --- |
| `before.html` | Pre-queue page: countdown and the in-place switch into the queue |
| `queue.html` | Queue page |
| `after.html` | Post-queue page |
| `error.html?er=N` | Error page, `er=0` to `er=14` |

## Run

```sh
node server.js            # http://localhost:8080/
PORT=3000 node server.js  # different port
```

The pages also open straight from disk (`file://`). Importing a theme from a preview link needs the server, though. Queue-it preview pages don't send CORS headers, so `server.js` proxies them, and it only allows `https://*.queue-it.net`.

## The panel

Drag it by its header and resize it from the corner. Minimize it with **–** or **Alt+Shift+R**. Its position, size and tab are remembered.

- **States** (before/queue): every option from Queue-it's "Other information" preview window, wired to the real `PreviewQueueStateVM`. Extras on the queue page:
  - "almost there" redirect message
  - progress width and the "updating" animation
  - Queue ID dialog
  - cookies blocked
  - invite-only (e-mail error, code sent, code error)

  The before page adds countdown control and the before → queue transition, either by the countdown running out or by a server push.
- **Model** (before/queue): edit queue number, users ahead, wait, progress, forecast status and the dynamic message, then push. The data goes through `queueViewModel.refresh()`, so every `queueViewModel.modelUpdated(fn)` in your theme fires exactly as it would on a status poll. **Auto-run** steps the line down until it's the user's turn. A log shows each `modelUpdated` payload; the latest one is in `window.__lastModelUpdate`.
- **Message** (after): push or remove the post-queue dynamic message.
- **Error** (error): pick any error id; the page reloads as `error.html?er=N`. `body[data-errorid]` and `body[data-errortype]` match production, so `pageReady` scripts that branch on the error id can be tested.
- **Theme** (every page): the custom-theme settings.
  - **Import**: paste a preview link. All four previews are read, and their stylesheets, scripts, logo, panels, display settings and texts are applied to all pages. You can also paste a page's source, or copy and load the theme as JSON.
  - **General**: logo, favicon, title, culture, customer/event id.
  - **Styling**: default stylesheet on/off, stylesheet list, script list, and Live CSS (applies instantly).
  - **Panels**: the six iframe panels.
  - **Display**: element visibility. Only settings that affect the current page are shown.
  - **Texts**: headers and bodies per page, disclaimer, cookie texts.
  - **Tags**: for `queueUserInfoClient.getTag()`.

  Theme changes are saved in `localStorage` and shared by all four pages. **Save & reload** applies them the way a real page load would.

## Files

```
index.html                 landing page
before/queue/after/error.html
server.js                  static server + *.queue-it.net proxy (no dependencies)
files/replica/replica.js   theme state, model builders, preview importer
files/replica/panel.js     the floating panel (Shadow DOM, so theme CSS can't touch it)
files/style.css, script.js, test.js   your local theme (the default "Local theme")
files/top.html … side.html local panel iframes
files/temp.css             old visibility toggles; replaced by Theme › Display, not loaded by default
```

The Queue-it engine (`common_*.js`, `queueit_*.js`, `jquery-ui_*.js`, `style_*.css` and the default logo) is loaded from `https://assets.queue-it.net/static/QueueFront/`, so the pages need an internet connection. The file names include a version hash. To move to a newer engine, open a live waiting room, copy the new file names from its `<head>`, and update them in the four HTML pages and in `files/replica/replica.js` (`DEFAULT_CSS`, `DEFAULT_LOGO`).
