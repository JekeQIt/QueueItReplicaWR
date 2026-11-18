/*
 * Queue-it replica waiting room - floating control panel.
 *
 * Rendered inside a Shadow DOM so theme CSS cannot style it (and its CSS cannot leak into the page).
 * Tabs depend on the page:
 *   before -> States (pre-queue + transition), Model (modelUpdated), Theme
 *   queue  -> States ("Other information" preview states + extras), Model (modelUpdated), Theme
 *   after  -> Message, Theme
 *   error  -> Error (all er= states), Theme
 * Shortcut: Alt+Shift+R minimizes / restores the panel.
 */
(function (window, document) {
  "use strict";
  var R = window.Replica;
  if (!R || window.__qitReplicaPanel) return;
  window.__qitReplicaPanel = true;

  var $ = window.jQuery;
  var vm = window.queueViewModel;
  var PSVM = window.PreviewQueueStateVM;
  var S = R.sim;
  var UI_KEY = "qit-replica:ui:v1";
  var FLASH_KEY = "qit-replica:flash";

  // ------------------------------------------------------------------ utils
  function load(key, fallback) {
    try {
      var v = JSON.parse(window.localStorage.getItem(key));
      return v && typeof v === "object" ? v : fallback;
    } catch (e) {
      return fallback;
    }
  }
  function save(key, v) {
    try {
      window.localStorage.setItem(key, JSON.stringify(v));
    } catch (e) {}
  }
  var ui = load(UI_KEY, {});
  ui.tabs = ui.tabs || {};
  function saveUi() {
    save(UI_KEY, ui);
  }

  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v == null || v === false) return;
        if (k === "class") el.className = v;
        else if (k === "text") el.textContent = v;
        else if (k === "html") el.innerHTML = v;
        else if (k.indexOf("on") === 0 && typeof v === "function") el.addEventListener(k.slice(2), v);
        else if (k === "value") el.value = v;
        else if (k === "checked") el.checked = !!v;
        else el.setAttribute(k, v === true ? "" : v);
      });
    }
    for (var i = 2; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  }
  function append(el, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) return c.forEach(function (x) { append(el, x); });
    el.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  function pageId() {
    return document.body.getAttribute("data-pageid");
  }
  function now() {
    return new Date().toLocaleTimeString();
  }
  function help(text) {
    return h("span", { class: "help", title: text, tabindex: "0", "aria-label": text }, "?");
  }
  function section(title, hint) {
    var s = h("section", { class: "sec" });
    if (title) s.appendChild(h("h3", null, title));
    if (hint) s.appendChild(h("p", { class: "hint" }, hint));
    return s;
  }
  function row() {
    var r = h("div", { class: "row" });
    for (var i = 0; i < arguments.length; i++) append(r, arguments[i]);
    return r;
  }
  function button(label, onclick, cls, title) {
    return h("button", { type: "button", class: "btn " + (cls || ""), onclick: onclick, title: title }, label);
  }
  function check(label, checked, onchange, tip, disabled) {
    var input = h("input", { type: "checkbox", checked: checked, disabled: disabled });
    input.addEventListener("change", function () { onchange(input.checked, input); });
    var lab = h("label", { class: "check" + (disabled ? " disabled" : "") }, input, h("span", null, label));
    if (tip) lab.appendChild(help(tip));
    lab.input = input;
    return lab;
  }
  // Two-way binding between a checkbox and a knockout observable.
  function obsCheck(label, obs, tip, extra) {
    var c = check(label, !!obs(), function (v) { obs(v); }, tip);
    obs.subscribe(function (v) { c.input.checked = !!v; if (extra) extra(v); });
    return c;
  }
  function field(label, input, tip) {
    return h("label", { class: "field" }, h("span", { class: "flabel" }, label, tip ? help(tip) : null), input);
  }
  function textInput(value, oninput, attrs) {
    var i = h("input", Object.assign({ type: "text", value: value == null ? "" : value }, attrs || {}));
    i.addEventListener("input", function () { oninput(i.value, i); });
    return i;
  }
  function numberInput(value, oninput, attrs) {
    var i = h("input", Object.assign({ type: "number", value: value }, attrs || {}));
    i.addEventListener("input", function () { oninput(i.value === "" ? "" : Number(i.value), i); });
    return i;
  }
  function textArea(value, oninput, attrs) {
    var t = h("textarea", Object.assign({ spellcheck: "false" }, attrs || {}));
    t.value = value == null ? "" : value;
    t.addEventListener("input", function () { oninput(t.value, t); });
    return t;
  }
  function select(options, value, onchange) {
    var s = h("select");
    options.forEach(function (o) {
      var opt = h("option", { value: o[0] }, o[1]);
      if (String(o[0]) === String(value)) opt.selected = true;
      s.appendChild(opt);
    });
    s.addEventListener("change", function () { onchange(s.value, s); });
    return s;
  }
  function radioGroup(name, options, value, onchange) {
    var wrap = h("div", { class: "radios", role: "radiogroup" });
    options.forEach(function (o) {
      var r = h("input", { type: "radio", name: name, value: o[0], checked: String(o[0]) === String(value) });
      r.addEventListener("change", function () { if (r.checked) onchange(o[0]); });
      wrap.appendChild(h("label", { class: "check" }, r, h("span", null, o[1])));
    });
    wrap.set = function (v) {
      Array.prototype.forEach.call(wrap.querySelectorAll("input"), function (r) { r.checked = r.value === String(v); });
    };
    return wrap;
  }

  // ------------------------------------------------------------------ shell
  var CSS = [
    ":host{all:initial}",
    "*{box-sizing:border-box}",
    ".qp{--bg:#ffffff;--fg:#1d2330;--muted:#5d6678;--line:#e3e6ec;--soft:#f4f6f9;--accent:#1f6feb;--accent-fg:#fff;--warn:#b54708;--ok:#067647;--err:#b42318;",
    "position:fixed;display:flex;flex-direction:column;width:var(--w,360px);height:var(--h,auto);max-height:calc(100vh - 16px);min-width:280px;min-height:160px;",
    "background:var(--bg);color:var(--fg);border:1px solid #c9ced8;border-radius:10px;box-shadow:0 12px 32px rgba(16,24,40,.22),0 2px 6px rgba(16,24,40,.12);",
    "font:12px/1.45 system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;overflow:hidden;resize:both;text-align:left;letter-spacing:normal;text-transform:none}",
    ".head{display:flex;align-items:center;gap:8px;padding:8px 8px 8px 12px;background:#1d2330;color:#fff;cursor:move;user-select:none;touch-action:none}",
    ".head strong{font-size:13px;font-weight:600}",
    ".badge{font-size:11px;padding:1px 7px;border-radius:999px;background:rgba(255,255,255,.16)}",
    ".head .sp{flex:1}",
    ".nav{display:flex;gap:2px}",
    ".nav a{color:#cfd6e4;text-decoration:none;font-size:11px;padding:2px 6px;border-radius:5px}",
    ".nav a:hover{background:rgba(255,255,255,.14);color:#fff}",
    ".nav a.on{background:#fff;color:#1d2330;font-weight:600}",
    ".icon{background:transparent;border:0;color:#fff;width:24px;height:24px;border-radius:6px;cursor:pointer;font-size:16px;line-height:1;display:grid;place-items:center}",
    ".icon:hover{background:rgba(255,255,255,.16)}",
    ".tabs{display:flex;border-bottom:1px solid var(--line);background:var(--soft);padding:0 6px}",
    ".tabs button{flex:1;border:0;background:none;padding:8px 6px;font:inherit;font-weight:600;color:var(--muted);cursor:pointer;border-bottom:2px solid transparent}",
    ".tabs button[aria-selected=true]{color:var(--accent);border-bottom-color:var(--accent)}",
    ".subtabs{display:flex;flex-wrap:wrap;gap:4px;padding:8px 10px 0}",
    ".subtabs button{border:1px solid var(--line);background:#fff;border-radius:999px;padding:3px 9px;font:inherit;cursor:pointer;color:var(--muted)}",
    ".subtabs button[aria-selected=true]{background:var(--accent);border-color:var(--accent);color:#fff}",
    ".body{flex:1;overflow:auto;overscroll-behavior:contain}",
    ".pane{padding:4px 12px 12px}",
    ".sec{padding:10px 0;border-bottom:1px solid var(--line)}",
    ".sec:last-child{border-bottom:0}",
    "h3{margin:0 0 6px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);font-weight:700}",
    ".hint{margin:0 0 8px;color:var(--muted)}",
    ".row{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin:6px 0}",
    ".check{display:flex;align-items:flex-start;gap:7px;padding:3px 0;cursor:pointer}",
    ".check input{margin:2px 0 0;flex:none;accent-color:var(--accent)}",
    ".check.disabled{opacity:.5;cursor:not-allowed}",
    ".check.sub{margin-left:20px}",
    ".help{display:inline-grid;place-items:center;width:15px;height:15px;margin-left:4px;border-radius:50%;background:#e4e7ee;color:#475067;font-size:10px;font-weight:700;cursor:help;flex:none}",
    ".field{display:flex;flex-direction:column;gap:3px;margin:7px 0}",
    ".flabel{font-weight:600;color:#344054;display:flex;align-items:center}",
    ".grid2{display:grid;grid-template-columns:1fr 1fr;gap:0 10px}",
    "input[type=text],input[type=number],input[type=url],select,textarea{width:100%;font:inherit;color:var(--fg);background:#fff;border:1px solid #cdd2db;border-radius:6px;padding:5px 7px}",
    "textarea{min-height:64px;resize:vertical;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11.5px}",
    "textarea.tall{min-height:150px}",
    "input:focus,select:focus,textarea:focus,button:focus-visible{outline:2px solid var(--accent);outline-offset:1px}",
    "input[type=range]{flex:1;accent-color:var(--accent)}",
    ".btn{font:inherit;font-weight:600;padding:5px 10px;border-radius:6px;border:1px solid #cdd2db;background:#fff;color:var(--fg);cursor:pointer}",
    ".btn:hover{background:var(--soft)}",
    ".btn.primary{background:var(--accent);border-color:var(--accent);color:var(--accent-fg)}",
    ".btn.primary:hover{filter:brightness(1.08)}",
    ".btn.danger{color:var(--err)}",
    ".btn:disabled{opacity:.5;cursor:not-allowed}",
    ".stack{display:flex;flex-direction:column;gap:6px}",
    ".pill{position:fixed;display:none;align-items:center;gap:6px;padding:6px 11px;border-radius:999px;border:0;background:#1d2330;color:#fff;font:600 12px/1 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;box-shadow:0 6px 18px rgba(16,24,40,.3);cursor:pointer;touch-action:none}",
    ".pill .dot{width:8px;height:8px;border-radius:50%;background:#32d583}",
    ".min .qp{display:none}.min .pill{display:flex}",
    ".foot{padding:6px 12px;border-top:1px solid var(--line);background:var(--soft);color:var(--muted);min-height:28px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
    ".foot.ok{color:var(--ok)}.foot.err{color:var(--err)}.foot.warn{color:var(--warn)}",
    ".log{max-height:180px;overflow:auto;background:#0f1520;color:#d5dbe6;border-radius:6px;padding:6px 8px;font:11px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre-wrap;word-break:break-word}",
    ".kv{display:grid;grid-template-columns:auto 1fr;gap:2px 10px;margin:4px 0;color:var(--muted)}",
    ".kv b{color:var(--fg);font-weight:600}",
    ".note{background:#fffaeb;border:1px solid #fedf89;color:#7a2e0e;border-radius:6px;padding:6px 8px;margin:6px 0}",
    ".okbox{background:#ecfdf3;border:1px solid #abefc6;color:#05603a;border-radius:6px;padding:6px 8px;margin:6px 0;white-space:pre-wrap}",
    ".errbox{background:#fef3f2;border:1px solid #fecdca;color:#912018;border-radius:6px;padding:6px 8px;margin:6px 0;white-space:pre-wrap}",
    ".sticky{position:sticky;bottom:0;background:linear-gradient(transparent,#fff 30%);padding:12px 0 2px;display:flex;gap:6px;justify-content:flex-end}",
    ".dirty{color:var(--warn);font-weight:600;margin-right:auto;align-self:center}",
    "details{margin:6px 0}summary{cursor:pointer;font-weight:600;color:#344054}",
    ".errlist{display:flex;flex-direction:column;gap:2px;max-height:260px;overflow:auto;border:1px solid var(--line);border-radius:6px;padding:4px}",
    ".errlist a{display:block;padding:4px 6px;border-radius:5px;color:var(--fg);text-decoration:none}",
    ".errlist a:hover{background:var(--soft)}",
    ".errlist a.on{background:#e8f0fe;color:#174ea6;font-weight:600}",
    ".errlist small{color:var(--muted);font-weight:400}",
    "code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;background:var(--soft);padding:0 3px;border-radius:3px}",
    "@media (max-width:600px){.qp{max-height:60vh}}",
  ].join("\n");

  var host = h("div", { id: "qit-replica-panel" });
  host.style.cssText = "all:initial;position:fixed;top:0;left:0;width:0;height:0;z-index:2147483000;";
  var root = host.attachShadow({ mode: "open" });
  var wrap = h("div", { class: ui.minimized ? "min" : "" });
  root.appendChild(h("style", null, CSS));
  root.appendChild(wrap);

  var panel = h("div", { class: "qp", role: "dialog", "aria-label": "Replica waiting room controls" });
  var pill = h("button", { class: "pill", type: "button", title: "Show replica controls (Alt+Shift+R)" }, h("span", { class: "dot" }), "Replica");
  wrap.appendChild(panel);
  wrap.appendChild(pill);

  var head = h("div", { class: "head" });
  var pageBadge = h("span", { class: "badge" });
  var nav = h("nav", { class: "nav", "aria-label": "Waiting room pages" });
  var minBtn = h("button", { class: "icon", type: "button", title: "Minimize (Alt+Shift+R)", "aria-label": "Minimize panel" }, "–");
  head.appendChild(h("strong", null, "Replica"));
  head.appendChild(pageBadge);
  head.appendChild(h("span", { class: "sp" }));
  head.appendChild(nav);
  head.appendChild(minBtn);
  var tabsBar = h("div", { class: "tabs", role: "tablist" });
  var body = h("div", { class: "body" });
  var foot = h("div", { class: "foot", role: "status", "aria-live": "polite" });
  panel.appendChild(head);
  panel.appendChild(tabsBar);
  panel.appendChild(body);
  panel.appendChild(foot);

  function status(msg, kind) {
    foot.textContent = msg;
    foot.className = "foot" + (kind ? " " + kind : "");
    foot.title = msg;
  }

  // position / size
  var W = Math.min(ui.w || 360, window.innerWidth - 16);
  panel.style.setProperty("--w", W + "px");
  if (ui.h) panel.style.setProperty("--h", ui.h + "px");
  function clampPos(x, y, el) {
    var w = el.offsetWidth || W, hh = el.offsetHeight || 40;
    return [Math.max(4, Math.min(x, window.innerWidth - Math.min(w, window.innerWidth) - 4)), Math.max(4, Math.min(y, window.innerHeight - Math.min(hh, 60)))];
  }
  function place() {
    var x = ui.x != null ? ui.x : window.innerWidth - W - 16, y = ui.y != null ? ui.y : 16;
    var p = clampPos(x, y, ui.minimized ? pill : panel);
    panel.style.left = pill.style.left = p[0] + "px";
    panel.style.top = pill.style.top = p[1] + "px";
  }
  function makeDraggable(handle, el, onClick) {
    var sx, sy, ox, oy, moved = false, dragging = false;
    handle.addEventListener("pointerdown", function (e) {
      if (e.button !== 0) return;
      // In the header, links and buttons keep working as normal clicks.
      if (handle !== pill && e.target.closest && e.target.closest("a,button,input,select")) return;
      dragging = true; moved = false;
      sx = e.clientX; sy = e.clientY; ox = el.offsetLeft; oy = el.offsetTop;
      handle.setPointerCapture(e.pointerId);
    });
    handle.addEventListener("pointermove", function (e) {
      if (!dragging) return;
      var dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
      var p = clampPos(ox + dx, oy + dy, el);
      el.style.left = p[0] + "px"; el.style.top = p[1] + "px";
    });
    handle.addEventListener("pointerup", function () {
      if (!dragging) return;
      dragging = false;
      if (moved) {
        ui.x = el.offsetLeft; ui.y = el.offsetTop; saveUi(); place();
      } else if (onClick) onClick();
    });
  }
  makeDraggable(head, panel);
  makeDraggable(pill, pill, function () { setMin(false); });
  function setMin(m) {
    ui.minimized = m; saveUi();
    wrap.className = m ? "min" : "";
    place();
    if (!m) setTimeout(function () { minBtn.focus(); }, 0);
  }
  minBtn.addEventListener("click", function () { setMin(true); });
  window.addEventListener("resize", place);
  window.addEventListener("keydown", function (e) {
    if (e.altKey && e.shiftKey && e.code === "KeyR") { e.preventDefault(); setMin(!ui.minimized); }
  });
  if (window.ResizeObserver) {
    var resizeTimer;
    new ResizeObserver(function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        if (ui.minimized || !panel.offsetWidth) return;
        if (Math.abs(panel.offsetWidth - W) > 2) { W = ui.w = panel.offsetWidth; panel.style.setProperty("--w", W + "px"); saveUi(); }
        if (panel.style.height) { ui.h = panel.offsetHeight; panel.style.setProperty("--h", ui.h + "px"); panel.style.height = ""; saveUi(); }
      }, 150);
    }).observe(panel);
  }

  // page navigation
  function pageHref(p) {
    var params = new URLSearchParams(window.location.search);
    params.delete("er");
    if (p === "error") params.set("er", ui.lastEr != null ? ui.lastEr : 4);
    var q = params.toString();
    return p + ".html" + (q ? "?" + q : "");
  }
  function renderNav() {
    nav.innerHTML = "";
    [["before", "Before"], ["queue", "Queue"], ["after", "After"], ["error", "Error"]].forEach(function (p) {
      var file = (window.location.pathname.split("/").pop() || "").replace(".html", "");
      nav.appendChild(h("a", { href: pageHref(p[0]), class: file === p[0] ? "on" : "", title: "Open " + p[0] + ".html" }, p[1]));
    });
  }

  // ------------------------------------------------------------------ tabs
  var TABS = {
    before: [["states", "States"], ["model", "Model"], ["theme", "Theme"]],
    queue: [["states", "States"], ["model", "Model"], ["theme", "Theme"]],
    after: [["states", "Message"], ["theme", "Theme"]],
    error: [["states", "Error"], ["theme", "Theme"]],
  };
  var current;
  function render() {
    var p = pageId();
    pageBadge.textContent = p + (p === "error" ? " " + document.body.getAttribute("data-errorid") : "");
    renderNav();
    var tabs = TABS[p] || TABS.queue;
    var active = ui.tabs[p] && tabs.some(function (t) { return t[0] === ui.tabs[p]; }) ? ui.tabs[p] : tabs[0][0];
    tabsBar.innerHTML = "";
    tabs.forEach(function (t) {
      var b = h("button", { type: "button", role: "tab", "aria-selected": String(t[0] === active) }, t[1]);
      b.addEventListener("click", function () { ui.tabs[p] = t[0]; saveUi(); render(); });
      tabsBar.appendChild(b);
    });
    var pane = h("div", { class: "pane", role: "tabpanel" });
    if (current && current.destroy) current.destroy();
    current = null;
    var builder = {
      states: { before: beforeStates, queue: queueStates, after: afterStates, error: errorStates }[p],
      model: { before: beforeModel, queue: queueModel }[p],
      theme: themeTab,
    }[active];
    current = builder ? builder(pane) || {} : {};
    body.innerHTML = "";
    body.appendChild(pane);
  }

  // ------------------------------------------------------------------ model helpers (before / queue)
  function info() {
    return vm.options.inqueueInfo; // shared with PreviewQueueStateVM, which mutates its layout flags
  }
  var lastMessage = { text: null, obj: null };
  function messageFor(enabled, text) {
    if (!enabled) return null;
    if (lastMessage.text !== text || !lastMessage.obj) lastMessage = { text: text, obj: R.buildMessage(true, text) };
    return lastMessage.obj;
  }
  function forceProgress(pct) {
    var $pb = $(".progressbar");
    $pb.find(".progress").stop(true, true).css("width", pct + "%");
    $pb.data("progress", pct);
    vm.ticket.progress(pct / 100);
  }
  // Builds the payload the Queue-it status endpoint would return and runs it through the real engine:
  // queueViewModel.refresh(data) -> doCallbacks(data) -> every queueViewModel.modelUpdated(fn) fires.
  function pushUpdate(opts) {
    opts = opts || {};
    var i = info();
    var target = opts.page || pageId();
    var t = R.buildTicket();
    i.isBeforeOrIdle = target === "before";
    i.pageId = target;
    i.pageClass = target === "before" ? "before prequeue" : "queue";
    i.QueueState = target === "before" ? 1 : 2;
    t.queuePaused = !!i.layout.queueIsPausedVisible;
    Object.assign(i.ticket, t);
    i.forecastStatus = target === "before" ? "InLine" : S.forecastStatus;
    i.message = messageFor(S.messageEnabled, S.messageText);
    var texts = R.buildTexts(target);
    ["header", "body", "queueHeader", "queueBody"].forEach(function (k) { i.texts[k] = texts[k]; });
    i.updateInterval = 30000;
    var beforePct = Math.round(($(".progressbar").data("progress") || 0));
    vm.refresh(i);
    if (target === "queue") {
      // The engine only lets "users ahead" go down and the progress bar go forward (like production).
      // When you deliberately move them backwards here, force the value so the preview follows the panel.
      var ahead = parseInt(S.usersInLineAheadOfYou, 10);
      if (!isNaN(ahead) && vm.ticket.usersInLineAheadOfYou() !== ahead && S.forecastStatus === "InLine") vm.ticket.usersInLineAheadOfYou(ahead);
      var pct = Math.round(Number(S.progress) * 100);
      if (pct < beforePct) forceProgress(pct);
    }
    return i;
  }

  // modelUpdated log
  var logLines = [];
  var logListeners = [];
  var modelCount = 0;
  if (vm && typeof vm.modelUpdated === "function") {
    vm.modelUpdated(function (data) {
      modelCount++;
      var t = (data && data.ticket) || {};
      var line = "[" + now() + "] #" + modelCount + " modelUpdated  page=" + (data && data.pageId) + "  forecast=" + (data && data.forecastStatus) +
        (data && data.isBeforeOrIdle ? "  secondsToStart=" + t.secondsToStart : "  #" + t.queueNumber + "  ahead=" + t.usersInLineAheadOfYou + "  wait=" + t.whichIsIn + "  progress=" + t.progress);
      logLines.unshift(line);
      logLines = logLines.slice(0, 40);
      window.__lastModelUpdate = data;
      logListeners.forEach(function (fn) { fn(); });
    });
  }
  function logBox() {
    var pre = h("div", { class: "log", "aria-label": "modelUpdated log" });
    function draw() { pre.textContent = logLines.length ? logLines.join("\n") : "No modelUpdated calls yet. Push an update."; }
    draw();
    logListeners.push(draw);
    return { el: pre, destroy: function () { logListeners.splice(logListeners.indexOf(draw), 1); } };
  }
  function callbackCounts() {
    var pr = (vm.statusChangeCallbackArray || []).length, mu = Math.max(0, (vm.callbackArray || []).length - 1);
    return h("div", { class: "kv" }, "pageReady callbacks", h("b", null, String(pr)), "modelUpdated callbacks (theme)", h("b", null, String(mu)));
  }

  // ------------------------------------------------------------------ QUEUE: States
  var inviteState = { on: false, mode: "none" };
  function queueStates(pane) {
    if (!PSVM) { pane.appendChild(h("p", { class: "note" }, "PreviewQueueStateVM is not available on this page.")); return; }
    var s1 = section("Other information", "Same states as the Queue-it preview “Other information” window. They run through the real engine (PreviewQueueStateVM).");
    s1.appendChild(obsCheck("The user's internet connection is lost", PSVM.connectionLost, "A warning message is displayed instead of the queue information when the user loses internet connection"));
    s1.appendChild(obsCheck("JavaScript is disabled in the user's browser", PSVM.javascriptDisabled, "A warning message is displayed on top of the page if JavaScript is not enabled in the user's browser"));
    s1.appendChild(obsCheck("The queue is paused", PSVM.queuePaused, "While the queue is paused, this information is displayed instead of estimated wait time and/or expected arrival time on the website"));
    var soon;
    s1.appendChild(obsCheck("The user is first in line", PSVM.firstInLine, "When the user is first in line, “Number of users in line ahead of you” changes to “It is your turn”", function (v) {
      soon.input.disabled = !v; soon.classList.toggle("disabled", !v); delay.input.disabled = !v; delay.classList.toggle("disabled", !v);
    }));
    soon = obsCheck("The user is being redirected to the website", PSVM.serviceSoon, "Just before being redirected, redirection information is displayed instead of estimated wait time and/or expected arrival time");
    soon.classList.add("sub");
    var delay = check("…taking longer than ~15 s (“You're almost there”)", vm.layout.servicedSoonDelayVisible(), function (v) { vm.layout.servicedSoonDelayVisible(v); }, "Message 3 from the white paper: shown when redirecting the current pool takes longer than ~15 seconds (#serviced-soon span:last-child)");
    delay.classList.add("sub");
    vm.layout.servicedSoonDelayVisible.subscribe(function (v) { delay.input.checked = !!v; });
    [soon, delay].forEach(function (c) { var off = !PSVM.firstInLine(); c.input.disabled = off; c.classList.toggle("disabled", off); });
    s1.appendChild(soon);
    s1.appendChild(delay);
    s1.appendChild(obsCheck("It's the user's turn and the queue browser tab is inactive", PSVM.redirectModal, "A pop-up informs the user when their turn started and asks them to confirm that they want to proceed to the website"));
    if (PSVM.dynamicMessageVisibleByLayout) s1.appendChild(obsCheck("No dynamic message has been posted", PSVM.hideDynamicMessage, "If there is no dynamic message saved on the event console, the dynamic message section is hidden for all users"));
    pane.appendChild(s1);

    if (PSVM.reminderFormVisibleByLayout) {
      var s2 = section("E-mail reminder", "After the user enters an e-mail and clicks “Notify me by e-mail”, a status message is displayed for 60 seconds.");
      var rg = radioGroup("reminder", [["", "Nothing entered"], ["success", "A valid e-mail address"], ["error", "An empty or invalid e-mail address"]], PSVM.reminderEmailStatus() || "", function (v) {
        if (!v) PSVM.hideReminderStatusMessage(); else { $("#divEmailStatusFrame").show(); PSVM.reminderEmailStatus(v); }
      });
      PSVM.reminderEmailStatus.subscribe(function (v) { rg.set(v || ""); });
      s2.appendChild(rg);
      pane.appendChild(s2);
    }

    var s3 = section("Progress bar");
    var cur = Math.round(($(".progressbar").data("progress") || vm.ticket.progress() * 100) || 0);
    var out = h("b", null, cur + "%");
    var range = h("input", { type: "range", min: "0", max: "100", value: String(cur), "aria-label": "Progress bar width" });
    range.addEventListener("input", function () { out.textContent = range.value + "%"; forceProgress(Number(range.value)); });
    s3.appendChild(row(h("span", null, "Width"), range, out));
    var upd = check("Show the “updating” animation", $("#MainPart_divProgressbar_Progress").hasClass("updated"), function (v) {
      $("#MainPart_divProgressbar_Progress").toggleClass("updated", v);
    }, "The .progress element gets the class “updated” for ~7 s whenever the bar moves.");
    s3.appendChild(upd);
    pane.appendChild(s3);

    var s4 = section("More states");
    s4.appendChild(obsCheck("Queue ID link dialog is open", vm.queueIdLinkModalVisible, "Shown when the user clicks “Queue ID:” in the footer (continue on another device)."));
    var cookieOff = check("The browser blocks cookies", vm.texts.cookiesInfoClass() === "cookiesNotAllowed", function (v) {
      var t = R.theme.texts;
      vm.texts.cookiesInfoText(v ? t.cookiesNotAllowedInfoText : t.cookiesAllowedInfoText);
      vm.texts.cookiesInfoTooltip(v ? t.cookiesNotAllowedInfoTooltip : t.cookiesAllowedInfoTooltip);
      vm.texts.cookiesInfoClass(v ? "cookiesNotAllowed" : "cookiesAllowed");
    }, "Switches #lbCookieInfo (shown in #main-top-message) to the cookies-not-allowed text and class.");
    s4.appendChild(cookieOff);
    pane.appendChild(s4);

    pane.appendChild(inviteOnlySection());
  }

  // Invite-only waiting room (ported from the old script-for-preview.js)
  function inviteOnlySection() {
    var s = section("Invite-only", "Simulates the invite-only e-mail verification widget (body.key-required).");
    var sub = radioGroup("invite", [["none", "Waiting for e-mail"], ["emailError", "E-mail error"], ["emailSuccess", "Code sent (e-mail accepted)"], ["codeError", "Code error"]], inviteState.mode, function (v) {
      inviteState.mode = v; applyInvite();
    });
    sub.style.marginLeft = "20px";
    sub.style.display = inviteState.on ? "" : "none";
    s.appendChild(check("Invite-only is active", inviteState.on, function (v) { inviteState.on = v; sub.style.display = v ? "" : "none"; applyInvite(); }));
    s.appendChild(sub);
    return s;
  }
  function applyInvite() {
    var on = inviteState.on;
    if (on && !document.getElementById("qr-invite-css")) {
      document.head.appendChild(h("link", { id: "qr-invite-css", rel: "stylesheet", href: "files/inviteOnlyCSS.css" }));
    }
    if (on && !document.getElementById("divChallenge")) {
      $('<div id="divChallenge"><div id="divChallenge_Content"><div id="challenge-widget-container"><div id="challenge-container">' +
        '<form onsubmit="event.preventDefault()"><div id="main_invite_div">' +
        '<label for="invitee_email" id="lblEmail">Please enter email</label>' +
        '<div class="input_box"><input aria-label="email" placeholder="Please enter email" type="text" id="invitee_email" required="" autocomplete="" />' +
        '<button class="btn" type="submit" id="btnSubmit_Email">Submit</button></div>' +
        '<div aria-live="assertive" class="message_box"><div id="error_box"></div><div id="loading_div" class="hidden" style="display:none">Verifying Please wait...........<br /></div></div>' +
        "</div></form></div></div></div></div>").insertAfter("#divConfirmRedirectModal");
    }
    $("#divChallenge").toggle(on);
    $("body").toggleClass("key-required", on);
    $("#MainPart_divProgressbar, #MainPart_divProgressbarBox, #MainPart_frmReminder2, #footer-direct-link").toggle(!on);
    if (!on) {
      $("#qr-invite-css").remove();
      return;
    }
    var m = inviteState.mode;
    $("#error_box").toggle(m === "emailError").text(m === "emailError" ? "Your email cannot be verified. Please enter the email registered for this event." : "");
    $("#code_message, #error_box_code").remove();
    if (m === "emailSuccess") $('<div id="code_message">A six-digit verification code has been sent to your email. Please submit the code above.</div>').insertAfter("#divChallenge .input_box");
    if (m === "codeError") $('<div id="error_box_code">The code you provided is incorrect. Try again.</div>').insertAfter("#divChallenge .input_box");
  }

  // ------------------------------------------------------------------ BEFORE: States
  function beforeStates(pane) {
    var s1 = section("Other information", "Pre-queue states from the Queue-it preview window.");
    if (PSVM) {
      s1.appendChild(obsCheck("The user's internet connection is lost", PSVM.connectionLost, "A warning message is displayed instead of the countdown when the user loses internet connection"));
      if (PSVM.dynamicMessageVisibleByLayout) s1.appendChild(obsCheck("No dynamic message has been posted", PSVM.hideDynamicMessage, "If there is no dynamic message saved on the event console, the dynamic message section is hidden for all users"));
    }
    pane.appendChild(s1);

    var s2 = section("Countdown", "Seconds until the waiting room starts. Applied with a status update, like the 30 s poll in production.");
    var secs = numberInput(S.secondsToStart, function (v) { S.secondsToStart = v; R.saveSim(); }, { min: "0", step: "1", "aria-label": "Seconds to start" });
    secs.style.width = "110px";
    s2.appendChild(row(secs, button("Apply", function () { pushUpdate(); status("Countdown set to " + S.secondsToStart + " s", "ok"); }), button("+1 min", function () { secs.value = S.secondsToStart = (Number(S.secondsToStart) || 0) + 60; R.saveSim(); pushUpdate(); }), button("+1 h", function () { secs.value = S.secondsToStart = (Number(S.secondsToStart) || 0) + 3600; R.saveSim(); pushUpdate(); })));
    pane.appendChild(s2);

    var s3 = section("Transition to the queue", "The pre-queue page turns into the queue page without a reload: body gets data-pageid=“queue”, texts switch to the queue texts and pageReady(“queue”) fires.");
    s3.appendChild(h("div", { class: "stack" },
      button("Start transition (countdown runs out in 5 s)", function () {
        var keep = S.secondsToStart;
        S.secondsToStart = 5;
        pushUpdate();
        S.secondsToStart = keep;
        status("Countdown ends in 5 s…", "warn");
      }, "primary", "Sets secondsToStart to 5. When the countdown expires the engine calls trySwitchBeforePageToQueue()."),
      button("Event started now (status update with isBeforeOrIdle = false)", function () {
        pushUpdate({ page: "queue" });
        status("Pushed queue model; page switched to queue", "ok");
      }, "", "What happens when a status poll returns the queue model before the countdown finishes.")
    ));
    s3.appendChild(check("After the switch, send the first queue update automatically", ui.autoFirstQueuePush !== false, function (v) { ui.autoFirstQueuePush = v; saveUi(); }, "In production the next status poll returns queue number, users ahead, etc. This pushes that model 1.5 s after the switch."));
    pane.appendChild(s3);
  }

  // ------------------------------------------------------------------ BEFORE: Model
  function beforeModel(pane) {
    var s = section("Pre-queue model", "Edit the status data and push it through queueViewModel.refresh(). Every queueViewModel.modelUpdated(fn) in your theme receives it.");
    var g = h("div", { class: "grid2" });
    g.appendChild(field("Seconds to start", numberInput(S.secondsToStart, function (v) { S.secondsToStart = v; R.saveSim(); }, { min: "0" })));
    g.appendChild(field("Users in line (total)", numberInput(S.usersInQueue, function (v) { S.usersInQueue = v; R.saveSim(); }, { min: "0" }), "ticket.usersInQueue (#MainPart_lbUsersInQueueCount). Visible when “Show total users in line” is on in Theme › Display."));
    s.appendChild(g);
    s.appendChild(messageFields());
    s.appendChild(row(button("Push update (modelUpdated)", function () { pushUpdate(); status("Pushed pre-queue model at " + now(), "ok"); }, "primary"), button("Re-run pageReady", rerunPageReady, "", "Calls every queueViewModel.pageReady(fn) again with the current page id.")));
    pane.appendChild(s);
    var s2 = section("Callbacks");
    s2.appendChild(callbackCounts());
    var lb = logBox();
    s2.appendChild(lb.el);
    pane.appendChild(s2);
    return { destroy: lb.destroy };
  }

  function messageFields() {
    var box = h("div");
    box.appendChild(check("Dynamic message posted", S.messageEnabled, function (v) { S.messageEnabled = v; R.saveSim(); }, "message.text in the model. Empty = the #MainPart_divTimeBox section is hidden."));
    box.appendChild(field("Message text (Creole markup)", textArea(S.messageText, function (v) { S.messageText = v; R.saveSim(); }, { rows: "2" }), "Supports Queue-it's Creole formatting, e.g. **bold**, //italic//, [[https://example.com|link]]."));
    return box;
  }
  function rerunPageReady() {
    vm.doStatusChangeCallbacks(pageId());
    status("pageReady(“" + pageId() + "”) callbacks re-run", "ok");
  }

  // ------------------------------------------------------------------ QUEUE: Model
  var auto = { timer: null, startAhead: 0, startProgress: 0 };
  function minutesText(m) {
    if (m <= 0) return "less than a minute";
    if (m === 1) return "1 minute";
    if (m < 60) return m + " minutes";
    var hrs = Math.floor(m / 60), rest = m % 60;
    return hrs + (hrs === 1 ? " hour" : " hours") + (rest ? " and " + rest + (rest === 1 ? " minute" : " minutes") : "");
  }
  function queueModel(pane) {
    var inputs = {};
    var s = section("Queue model", "Edit the status data and push it through queueViewModel.refresh(). Every queueViewModel.modelUpdated(fn) in your theme receives it.");
    var g = h("div", { class: "grid2" });
    g.appendChild(field("Queue number", inputs.queueNumber = textInput(S.queueNumber, function (v) { S.queueNumber = v; R.saveSim(); })));
    g.appendChild(field("Users ahead of you", inputs.ahead = numberInput(S.usersInLineAheadOfYou, function (v) { S.usersInLineAheadOfYou = v; R.saveSim(); }, { min: "0" })));
    g.appendChild(field("Estimated wait (text)", inputs.which = textInput(S.whichIsIn, function (v) { S.whichIsIn = v; R.saveSim(); }), "ticket.whichIsIn, e.g. “14 minutes”."));
    g.appendChild(field("Wait in minutes", inputs.wait = numberInput(S.waitMinutes, function (v) { S.waitMinutes = v; R.saveSim(); }, { min: "0" }), "Used to compute expectedServiceTime (now + minutes)."));
    var prog = h("input", { type: "range", min: "0", max: "100", value: String(Math.round(S.progress * 100)) });
    var progOut = h("b", null, Math.round(S.progress * 100) + "%");
    prog.addEventListener("input", function () { S.progress = Number(prog.value) / 100; progOut.textContent = prog.value + "%"; R.saveSim(); });
    inputs.prog = prog; inputs.progOut = progOut;
    s.appendChild(g);
    s.appendChild(field("Progress", row(prog, progOut)));
    s.appendChild(field("Forecast status", inputs.forecast = select([["InLine", "InLine"], ["FirstInLine", "FirstInLine (it is your turn)"], ["NotReadyYet", "NotReadyYet"]], S.forecastStatus, function (v) { S.forecastStatus = v; R.saveSim(); }),
      "FirstInLine switches to “It is your turn” and the redirect messages. After that the engine ignores InLine updates (as in production); use Reset to start over."));
    s.appendChild(messageFields());
    s.appendChild(row(
      button("Push update (modelUpdated)", function () { pushUpdate(); status("Pushed queue model at " + now(), "ok"); }, "primary"),
      button("Re-run pageReady", rerunPageReady, "", "Calls every queueViewModel.pageReady(fn) again with the current page id."),
      button("Reset", function () { R.resetSim(); window.location.reload(); }, "danger", "Restore default model values and reload the page.")
    ));
    pane.appendChild(s);

    var s2 = section("Auto-run the line", "Pushes an update every few seconds: users ahead go down, progress goes up, until it is the user's turn.");
    var every = numberInput(ui.autoEvery || 4, function (v) { ui.autoEvery = Math.max(1, Number(v) || 4); saveUi(); }, { min: "1", step: "1", "aria-label": "Seconds between updates" });
    every.style.width = "70px";
    var startBtn = button(auto.timer ? "Stop" : "Start", function () {
      if (auto.timer) { stopAuto(); return; }
      auto.startAhead = Math.max(1, Number(S.usersInLineAheadOfYou) || 1);
      auto.startProgress = Number(S.progress) || 0;
      S.forecastStatus = "InLine";
      inputs.forecast.value = "InLine";
      tick();
      auto.timer = setInterval(tick, (ui.autoEvery || 4) * 1000);
      startBtn.textContent = "Stop";
      status("Auto-run started", "ok");
    }, "primary");
    function stopAuto() {
      clearInterval(auto.timer); auto.timer = null; startBtn.textContent = "Start"; R.saveSim();
    }
    function tick() {
      var ahead = Math.max(0, Number(S.usersInLineAheadOfYou) || 0);
      var step = Math.max(1, Math.round(auto.startAhead * (0.06 + Math.random() * 0.08)));
      ahead = Math.max(0, ahead - step);
      S.usersInLineAheadOfYou = ahead;
      S.progress = Math.min(1, auto.startProgress + (1 - auto.startProgress) * (1 - ahead / auto.startAhead));
      S.waitMinutes = Math.ceil(ahead / Math.max(1, auto.startAhead / 20));
      S.whichIsIn = minutesText(S.waitMinutes);
      if (ahead === 0) S.forecastStatus = "FirstInLine";
      pushUpdate();
      inputs.ahead.value = ahead; inputs.which.value = S.whichIsIn; inputs.wait.value = S.waitMinutes;
      inputs.prog.value = Math.round(S.progress * 100); inputs.progOut.textContent = inputs.prog.value + "%";
      inputs.forecast.value = S.forecastStatus;
      if (ahead === 0) { stopAuto(); status("It is your turn (FirstInLine pushed)", "ok"); }
    }
    s2.appendChild(row(h("span", null, "Every"), every, h("span", null, "seconds"), startBtn));
    pane.appendChild(s2);

    var s3 = section("Callbacks");
    s3.appendChild(callbackCounts());
    var lb = logBox();
    s3.appendChild(lb.el);
    pane.appendChild(s3);
    return { destroy: lb.destroy };
  }

  // ------------------------------------------------------------------ AFTER
  function afterStates(pane) {
    var s = section("Dynamic message", "The post-queue page polls for a message every few seconds. This pushes the same payload through AfterView.refreshClientInfo(). (The after page has no modelUpdated callbacks in Queue-it.)");
    s.appendChild(check("Message posted", S.afterMessageEnabled, function (v) { S.afterMessageEnabled = v; R.saveSim(); pushAfter(); }));
    s.appendChild(field("Message text (Creole markup)", textArea(S.afterMessageText, function (v) { S.afterMessageText = v; R.saveSim(); }, { rows: "3" })));
    s.appendChild(row(button("Push message", function () { S.afterMessageEnabled = true; R.saveSim(); pushAfter(); render(); }, "primary"), button("Re-run pageReady", rerunPageReady)));
    pane.appendChild(s);
    var s2 = section("Callbacks");
    s2.appendChild(callbackCounts());
    pane.appendChild(s2);
  }
  function pushAfter() {
    if (!vm || !vm.refreshClientInfo) return;
    vm.refreshClientInfo({ updateInterval: 5000, message: S.afterMessageEnabled ? R.buildMessage(true, S.afterMessageText) : null });
    status(S.afterMessageEnabled ? "Message pushed at " + now() : "Message removed", "ok");
  }

  // ------------------------------------------------------------------ ERROR
  var ERROR_REASONS = {
    0: "Fallback for unknown error ids.",
    1: "A missing or invalid customer ID was passed into a waiting room URL.",
    2: "The waiting room is idle with “Hide event” idle logic, or a missing/invalid event ID was passed.",
    3: "Deprecated – not used.",
    4: "The queue number validity time was exceeded, or the Queue ID was cancelled (cancel action/API, CAPTCHA replay).",
    5: "Max redirects per user exceeded (link sharing/reuse, integration errors, target site issues).",
    6: "The queueittoken is invalid (expired, misconfigured or tampered).",
    7: "The visitor took too long to solve the challenge (e.g. CAPTCHA).",
    8: "The browser blocked scripts from Queue-it's domain, so challenges cannot be shown.",
    9: "“Require enqueue token” is on and no valid token was provided.",
    10: "“Require user identification key” is on and no key was provided.",
    11: "“Require unique key” is on and the key was not unique.",
    12: "The Queue ID was used more times than allowed.",
    13: "Too many refreshes while a challenge was shown.",
    14: "Wrong CAPTCHA answer three times.",
  };
  function errorStates(pane) {
    var er = R.errorId();
    ui.lastEr = er; saveUi();
    var st = R.ERROR_STATES[er];
    var s = section("Error state", "Each error is its own page load in Queue-it (/error?er=N), so picking one reloads error.html?er=N and your theme's pageReady runs against it.");
    s.appendChild(h("div", { class: "kv" }, "data-errorid", h("b", null, String(er)), "data-errortype", h("b", null, st.type)));
    s.appendChild(h("p", { class: "hint" }, ERROR_REASONS[er] || ""));
    var list = h("div", { class: "errlist", role: "listbox", "aria-label": "Error states" });
    Object.keys(R.ERROR_STATES).forEach(function (k) {
      var e = R.ERROR_STATES[k];
      var params = new URLSearchParams(window.location.search);
      params.set("er", k);
      list.appendChild(h("a", { href: "error.html?" + params.toString(), class: Number(k) === er ? "on" : "", role: "option", "aria-selected": String(Number(k) === er), title: ERROR_REASONS[k] },
        "er=" + k + " · " + e.type, h("br"), h("small", null, e.header)));
    });
    s.appendChild(list);
    setTimeout(function () {
      var on = list.querySelector("a.on");
      if (on) list.scrollTop = on.offsetTop - list.offsetTop - list.clientHeight / 2 + on.offsetHeight / 2;
    }, 0);
    var prev = Number(er) - 1, next = Number(er) + 1;
    s.appendChild(row(
      button("← Previous", function () { go(prev); }, "", null),
      button("Next →", function () { go(next); }, "", null)
    ));
    function go(n) {
      if (!R.ERROR_STATES.hasOwnProperty(n)) return;
      var params = new URLSearchParams(window.location.search);
      params.set("er", n);
      window.location.search = params.toString();
    }
    pane.appendChild(s);
    if (st.details && vm.detailExpander) {
      var s2 = section("Details");
      s2.appendChild(obsCheck("“More details” is expanded", vm.detailExpander.isDetailsExpanded));
      pane.appendChild(s2);
    }
    var s3 = section("Theme scripting");
    s3.appendChild(h("p", { class: "hint", html: "Target this state in your theme JS with <code>$(\"body\").attr(\"data-errorid\") == \"" + er + "\"</code> inside <code>queueViewModel.pageReady</code>." }));
    s3.appendChild(row(button("Re-run pageReady", rerunPageReady)));
    pane.appendChild(s3);
    var keyHandler = function (e) {
      if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      if (e.altKey && e.key === "ArrowRight") go(next);
      if (e.altKey && e.key === "ArrowLeft") go(prev);
    };
    window.addEventListener("keydown", keyHandler);
    return { destroy: function () { window.removeEventListener("keydown", keyHandler); } };
  }

  // ------------------------------------------------------------------ THEME
  var draft = null;
  var dirty = false;
  function getDraft() {
    if (!draft) draft = R.helpers.clone(R.theme);
    return draft;
  }
  var DISPLAY_FLAGS = [
    ["logoVisible", "Show logo", "all"],
    ["languageSelectorVisible", "Show language selector", "all"],
    ["dynamicMessageVisible", "Show dynamic message", "before queue"],
    ["reminderVisible", "Show “Notify me” reminder", "queue"],
    ["reminderEmailVisible", "Show e-mail input in reminder", "queue"],
    ["queueNumberVisible", "Show queue number", "queue"],
    ["usersInLineAheadOfYouVisible", "Show users in line ahead of you", "queue"],
    ["expectedServiceTimeVisible", "Show expected arrival time", "queue"],
    ["whichIsInVisible", "Show estimated wait time", "queue"],
    ["progressVisible", "Show progress bar", "queue"],
    ["usersInQueueVisible", "Show total users in line (pre-queue)", "before"],
    ["isRedirectPromptDialogEnabled", "Ask the user to confirm before redirect", "queue"],
    ["isQueueitFooterHidden", "Hide Queue-it footer logo (white label)", "all"],
  ];
  var THEME_SUBTABS = [["import", "Import"], ["general", "General"], ["styling", "Styling"], ["panels", "Panels"], ["display", "Display"], ["texts", "Texts"], ["tags", "Tags"]];

  function themeTab(pane) {
    var d = getDraft();
    var active = ui.themeTab || "import";
    var bar = h("div", { class: "subtabs", role: "tablist", "aria-label": "Theme settings" });
    THEME_SUBTABS.forEach(function (t) {
      var b = h("button", { type: "button", role: "tab", "aria-selected": String(t[0] === active) }, t[1]);
      b.addEventListener("click", function () { ui.themeTab = t[0]; saveUi(); render(); });
      bar.appendChild(b);
    });
    var holder = h("div");
    var src = R.theme.source || {};
    var srcText = src.type === "preview" ? "Imported preview" + (src.importedAt ? " · " + new Date(src.importedAt).toLocaleString() : "") : "Local theme (files/style.css, files/script.js)";
    holder.appendChild(h("p", { class: "hint", style: "margin:8px 0 0" }, "Active theme: ", h("b", null, srcText)));
    var content = h("div");
    ({ import: themeImport, general: themeGeneral, styling: themeStyling, panels: themePanels, display: themeDisplay, texts: themeTexts, tags: themeTags }[active] || themeImport)(content, d);
    var dirtyNote = h("span", { class: "dirty" }, dirty ? "Unsaved changes" : "");
    var actions = h("div", { class: "sticky" }, dirtyNote,
      button("Discard", function () { draft = null; dirty = false; render(); status("Changes discarded"); }, "", "Forget unsaved theme changes"),
      button("Save & reload", function () { saveDraftAndReload(); }, "primary", "Store the theme (shared by all 4 pages) and reload so it is applied like a real page load"));
    if (active === "import") actions.style.display = "none";
    markDirty = function () { dirty = true; dirtyNote.textContent = "Unsaved changes"; };
    pane.appendChild(bar);
    pane.appendChild(holder);
    pane.appendChild(content);
    pane.appendChild(actions);
  }
  var markDirty = function () { dirty = true; };
  function saveDraftAndReload(msg) {
    if (draft) R.saveTheme(draft);
    draft = null; dirty = false;
    try { window.sessionStorage.setItem(FLASH_KEY, msg || "Theme saved and applied"); } catch (e) {}
    window.location.reload();
  }
  function bindText(obj, key, attrs) {
    return textInput(obj[key], function (v) { obj[key] = v; markDirty(); }, attrs);
  }
  function bindArea(obj, key, attrs) {
    return textArea(obj[key], function (v) { obj[key] = v; markDirty(); }, attrs);
  }

  function themeImport(c) {
    var s = section("Import from a Custom Theme preview link", "Paste a preview link from GO (Custom theme › Preview › Copy link). The before, queue, after and error previews are read and the replica takes over their stylesheets, scripts, logo, panels, display settings and texts.");
    var input = h("input", { type: "url", placeholder: "https://{customer}.queue-it.net/queue/{customer}/layout/{guid}/preview?previewid=…", value: (R.theme.source && R.theme.source.url) || ui.lastPreviewUrl || "", "aria-label": "Preview link" });
    var result = h("div");
    var go = button("Import theme", function () {
      var link = input.value.trim();
      ui.lastPreviewUrl = link; saveUi();
      result.innerHTML = "";
      if (!/^https?:$/.test(window.location.protocol)) {
        result.appendChild(h("div", { class: "errbox" }, "The pages are opened from disk (file://), so the preview cannot be fetched. Start the local server instead:\n\n  node server.js\n\nthen open http://localhost:8080/ — or paste the preview page source below."));
        return;
      }
      go.disabled = true;
      status("Importing…", "warn");
      var progress = h("div", { class: "okbox" }, "Fetching previews…");
      result.appendChild(progress);
      R.importPreview(link, function (page, ok) {
        progress.textContent += "\n" + (ok ? "✓ " : "✗ ") + page;
      }).then(function (res) {
        var t = res.theme;
        var summary = "Imported " + res.report.filter(function (r) { return r.ok; }).length + "/4 pages\n" +
          t.styling.styleSheets.length + " stylesheet(s), " + t.styling.javascripts.length + " script(s)\n" +
          "Panels: " + (R.PANELS.filter(function (p) { return t.layout[R.PANEL_IDS[p].flag]; }).join(", ") || "none");
        draft = t;
        saveDraftAndReload(summary.replace(/\n/g, " · "));
      }).catch(function (err) {
        go.disabled = false;
        result.innerHTML = "";
        result.appendChild(h("div", { class: "errbox" }, "Import failed:\n" + err.message + "\n\nCheck that the link is a Custom Theme preview link and that it has not expired (preview links last 30 days)."));
        status("Import failed", "err");
      });
    }, "primary");
    s.appendChild(input);
    s.appendChild(row(go));
    s.appendChild(result);
    c.appendChild(s);

    var s2 = section("Or paste the page source", "If the server is not running: open the preview link, View Source, copy everything and paste it here. Only that page type is imported.");
    var area = h("textarea", { class: "tall", placeholder: "<!DOCTYPE html>…", "aria-label": "Preview page HTML source" });
    s2.appendChild(area);
    s2.appendChild(row(button("Import from source", function () {
      try {
        var parsed = R.parsePreviewHtml(area.value);
        if (!parsed.pageId) throw new Error("No data-pageid found – is this a Queue-it page?");
        draft = R.themeFromParsed([parsed], "pasted " + parsed.pageId + " page");
        saveDraftAndReload("Imported pasted " + parsed.pageId + " page");
      } catch (e) {
        status(e.message, "err");
      }
    })));
    c.appendChild(s2);

    var s3 = section("Theme JSON", "Copy the active theme to share it or keep versions; paste JSON and load it to restore.");
    var json = h("textarea", { class: "tall", "aria-label": "Theme JSON" });
    json.value = JSON.stringify(R.theme, null, 2);
    s3.appendChild(json);
    s3.appendChild(row(
      button("Copy", function () {
        json.select();
        (navigator.clipboard ? navigator.clipboard.writeText(json.value) : Promise.reject()).then(function () { status("Theme JSON copied", "ok"); }, function () { document.execCommand && document.execCommand("copy"); status("Theme JSON selected – press Cmd/Ctrl+C", "warn"); });
      }),
      button("Load JSON", function () {
        try {
          var t = JSON.parse(json.value);
          draft = R.helpers.merge(R.defaultTheme(), t);
          saveDraftAndReload("Theme loaded from JSON");
        } catch (e) { status("Invalid JSON: " + e.message, "err"); }
      }),
      button("Reset to local theme", function () {
        if (!window.confirm("Replace the active theme with the default local theme (files/style.css + files/script.js)?")) return;
        R.resetTheme(); draft = null;
        try { window.sessionStorage.setItem(FLASH_KEY, "Reset to local theme"); } catch (e) {}
        window.location.reload();
      }, "danger")
    ));
    c.appendChild(s3);
  }

  function themeGeneral(c, d) {
    var g = d.general;
    var s = section("General");
    s.appendChild(field("Logo URL", bindText(g, "logoSrc"), "texts.logoSrc → #imgCustomerLogo"));
    s.appendChild(field("Favicon URL", bindText(g, "faviconUrl")));
    s.appendChild(field("Document title", bindText(g, "documentTitle")));
    s.appendChild(field("Language (culture)", select(R.LANGUAGES.map(function (l) { return [l[0], l[0] + " – " + l[1]]; }), g.culture, function (v) { g.culture = v; markDirty(); }),
      "Sets body[data-culture] and the countdown locale. A ?cid= in the URL (from the language selector) overrides it."));
    var g2 = h("div", { class: "grid2" });
    g2.appendChild(field("Customer ID", bindText(g, "customerId")));
    g2.appendChild(field("Event ID", bindText(g, "eventId"), "Preview pages use “preview-layout”. Some theme scripts check this."));
    s.appendChild(g2);
    c.appendChild(s);
  }

  function lines(arr) { return (arr || []).join("\n"); }
  function unlines(v) { return v.split(/\r?\n/).map(function (x) { return x.trim(); }).filter(Boolean); }
  function themeStyling(c, d) {
    var st = d.styling;
    var s = section("Stylesheets");
    s.appendChild(check("Include the Queue-it default stylesheet", st.includeDefaultCss !== false, function (v) { st.includeDefaultCss = v; markDirty(); }, "Every real theme starts with Queue-it's default style (style_*.css on assets.queue-it.net)."));
    s.appendChild(field("Stylesheets (one URL per line, in order)", textArea(lines(st.styleSheets), function (v) { st.styleSheets = unlines(v); markDirty(); }), "Local paths (files/style.css) or full URLs (https://assets.queue-it.net/…)."));
    c.appendChild(s);
    var s2 = section("JavaScript");
    s2.appendChild(field("Scripts (one URL per line, in order)", textArea(lines(st.javascripts), function (v) { st.javascripts = unlines(v); markDirty(); }), "Loaded after queueViewModel is created, so pageReady/modelUpdated work exactly like in GO."));
    c.appendChild(s2);
    var s3 = section("Live CSS", "Applied instantly on top of the theme and saved for all pages. Handy for quick experiments before moving rules into a stylesheet.");
    var css = textArea(R.theme.styling.customCss || "", function (v) {
      var el = document.getElementById("qr-custom-css");
      if (el) el.textContent = v;
      R.theme.styling.customCss = v;
      st.customCss = v;
      clearTimeout(css._t);
      css._t = setTimeout(function () { R.saveTheme(); status("Live CSS saved", "ok"); }, 400);
    }, { class: "tall", placeholder: ".btn { background: #0d5f41; }", "aria-label": "Live CSS" });
    s3.appendChild(css);
    c.appendChild(s3);
  }

  function themePanels(c, d) {
    var s = section("Panels (iframes)", "Same six panels as the theme editor. Each is an iframe; tick to show it.");
    R.PANELS.forEach(function (p) {
      var ids = R.PANEL_IDS[p];
      var url = bindText(d.panels, p, { "aria-label": p + " panel URL", placeholder: "https://…" });
      var box = h("div", { class: "field" });
      box.appendChild(check(p.charAt(0).toUpperCase() + p.slice(1) + " panel  #" + ids.div, !!d.layout[ids.flag], function (v) { d.layout[ids.flag] = v; markDirty(); }));
      box.appendChild(url);
      s.appendChild(box);
    });
    c.appendChild(s);
  }

  function themeDisplay(c, d) {
    var p = pageId();
    var s = section("Display", "Element visibility, as set on the theme / waiting room. Showing the settings that affect the " + p + " page.");
    var shown = 0;
    DISPLAY_FLAGS.forEach(function (f) {
      if (f[2] !== "all" && f[2].split(" ").indexOf(p) < 0) return;
      shown++;
      s.appendChild(check(f[1], !!d.layout[f[0]], function (v) { d.layout[f[0]] = v; markDirty(); }, "layout." + f[0]));
    });
    c.appendChild(s);
    var others = DISPLAY_FLAGS.length - shown;
    if (others) c.appendChild(h("p", { class: "hint" }, others + " more setting(s) apply to other pages; open those pages to edit them."));
  }

  function themeTexts(c, d) {
    var t = d.texts, p = pageId();
    var blocks = {
      before: ["Pre-queue page", [["beforeHeader", "Header (H1 → #lbHeaderH2)"], ["beforeBody", "Body (H2 → #lbHeaderP)"], ["countdownFinishedText", "Countdown finished text"]]],
      queue: ["Queue page", [["queueHeader", "Header (H1 → #lbHeaderH2)"], ["queueBody", "Body (H2 → #lbHeaderP)"], ["messageHeader", "Dynamic message header"]]],
      after: ["Post-queue page", [["afterHeader", "Header (H1 → #lbHeaderH2)"], ["afterBody", "Body (H2 → #lbHeaderP)"]]],
    };
    if (p === "error") {
      c.appendChild(h("p", { class: "note" }, "Error texts are fixed per error id and language in Queue-it. Customize them in your theme JavaScript (pageReady + data-errorid), see the Error tab."));
    }
    var order = [p].concat(["before", "queue", "after"].filter(function (x) { return x !== p; }));
    order.forEach(function (key) {
      var b = blocks[key];
      if (!b) return;
      var s = section(b[0] + (key === p ? " (this page)" : ""));
      var target = key === p ? s : h("details", null, h("summary", null, "Edit " + b[0].toLowerCase()));
      b[1].forEach(function (f) {
        var isBody = /Body/.test(f[0]);
        target.appendChild(field(f[1], isBody ? bindArea(t, f[0], { rows: "3" }) : bindText(t, f[0]), isBody ? "HTML allowed" : null));
      });
      if (key === "before") target.appendChild(h("p", { class: "hint" }, "When the pre-queue page turns into the queue page it switches to the queue header/body."));
      if (target !== s) s.appendChild(target);
      c.appendChild(s);
    });
    var s2 = section("All pages");
    s2.appendChild(field("Footer disclaimer (#footer-disclaimer)", bindArea(t, "disclaimerText", { rows: "2" }), "HTML allowed"));
    var adv = h("details", null, h("summary", null, "Cookie info texts (#lbCookieInfo)"));
    [["cookiesAllowedInfoText", "Cookies allowed"], ["cookiesAllowedInfoTooltip", "Cookies allowed tooltip"], ["cookiesNotAllowedInfoText", "Cookies blocked"], ["cookiesNotAllowedInfoTooltip", "Cookies blocked tooltip"]].forEach(function (f) {
      adv.appendChild(field(f[1], bindText(t, f[0])));
    });
    s2.appendChild(adv);
    c.appendChild(s2);
  }

  function themeTags(c, d) {
    var s = section("Tags", "Key/value pairs from the waiting room. Read them in panels/scripts with window.queueUserInfoClient.getTag(\"key\"). One per line: key=value");
    var text = (d.tags || []).map(function (x) { return x.key + "=" + x.value; }).join("\n");
    s.appendChild(textArea(text, function (v) {
      d.tags = unlines(v).map(function (l) { var i = l.indexOf("="); return i < 0 ? { key: l, value: "" } : { key: l.slice(0, i).trim(), value: l.slice(i + 1).trim() }; });
      markDirty();
    }, { class: "tall", placeholder: "logo=https://example.com/logo.png\neventname=Summer Tour", "aria-label": "Tags" }));
    c.appendChild(s);
  }

  // ------------------------------------------------------------------ boot
  function boot() {
    document.body.appendChild(host);
    place();
    render();
    var flash = null;
    try { flash = window.sessionStorage.getItem(FLASH_KEY); window.sessionStorage.removeItem(FLASH_KEY); } catch (e) {}
    if (flash) status(flash, "ok");
    else status(R.theme.source && R.theme.source.type === "preview" ? "Imported theme active" : "Local theme active – Alt+Shift+R hides this panel");

    // before -> queue switch happens in place; rebuild the panel for the queue page.
    var lastPage = pageId();
    new MutationObserver(function () {
      var p = pageId();
      if (p === lastPage) return;
      var from = lastPage;
      lastPage = p;
      render();
      if (from === "before" && p === "queue") {
        status("Switched from pre-queue to queue at " + now(), "ok");
        if (ui.autoFirstQueuePush !== false) setTimeout(function () { if (vm.isBeforeOrIdle && !vm.isBeforeOrIdle()) pushUpdate({ page: "queue" }); }, 1500);
      }
    }).observe(document.body, { attributes: true, attributeFilter: ["data-pageid"] });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  window.ReplicaPanel = { pushUpdate: pushUpdate, render: render, status: status };
})(window, document);
