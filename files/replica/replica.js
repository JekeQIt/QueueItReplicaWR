/*
 * Queue-it replica waiting room - shared runtime.
 *
 * Loaded synchronously in <head> of before.html, queue.html, after.html and error.html,
 * BEFORE the Queue-it engine (queueit_*.js from assets.queue-it.net). It:
 *   - keeps the theme (GO "Custom theme" settings) in localStorage so all 4 pages share it
 *   - writes the theme stylesheets / scripts into the page in the same order Queue-it does
 *   - builds the options/inqueueInfo objects the real Queue-it view models are created with
 *   - imports a theme from a Custom Theme preview link (via server.js proxy)
 *
 * The floating control panel lives in files/replica/panel.js.
 */
(function (window, document) {
  "use strict";

  var THEME_KEY = "qit-replica:theme:v1";
  var SIM_KEY = "qit-replica:sim:v1";

  // Queue-it's own engine assets are loaded from the Queue-it CDN (same files a live waiting room uses).
  var CDN = "https://assets.queue-it.net/static/QueueFront/";
  var DEFAULT_LOGO = CDN + "img/queue-it_logo_d732b5399b4291a5f959fd72a743ada5.png";
  var DEFAULT_CSS = CDN + "css/combined/style_4b7103cc264fb3bc2ea72ec0dfec6931.css";
  var EVENT_NAME = "My Layout Test Event";

  // Languages offered by the language selector when it is enabled (Value / Text like Queue-it renders them).
  var LANGUAGES = [
    ["ar-QA", "العربية (قطر)"], ["ca-ES", "Català (Català)"], ["zh-CN", "中文(中华人民共和国)"],
    ["zh-TW", "中文(台灣)"], ["cs-CZ", "Čeština (Česká Republika)"], ["da-DK", "Dansk (Danmark)"],
    ["nl-NL", "Nederlands (Nederland)"], ["en-GB", "English (United Kingdom)"], ["en-US", "English (United States)"],
    ["fi-FI", "suomi (Suomi)"], ["fr-CA", "Français (Canada)"], ["fr-FR", "Français (France)"],
    ["de-DE", "Deutsch (Deutschland)"], ["el-GR", "ελληνικά (Ελλάδα)"], ["he-IL", "עברית (ישראל)"],
    ["it-IT", "italiano (Italia)"], ["ja-JP", "日本語 (日本)"], ["ko-KR", "한국어 (대한민국)"],
    ["nb-NO", "Norsk, bokmål (Norge)"], ["pl-PL", "polski (Polska)"], ["pt-BR", "Português (Brasil)"],
    ["pt-PT", "Português (Portugal)"], ["ru-RU", "русский (Россия)"], ["es-ES", "Español (España)"],
    ["es-MX", "Español (México)"], ["sv-SE", "Svenska (Sverige)"], ["th-TH", "ไทย (ประเทศไทย)"],
    ["tr-TR", "Türkçe (Türkiye)"], ["uk-UA", "Українська (українська)"], ["vi-VN", "Tiếng Việt (Việt Nam)"],
  ];

  // Error states, as served by https://{customer}.queue-it.net/error?er={id} (default en-US texts).
  var ERROR_STATES = {
    0: { type: "General", header: "An error has occurred.", body: "An unexpected error has occurred. Please inform the Queue-it team by e-mail at: mailto:support@queue-it.com", button: "Get a new place in line" },
    1: { type: "UnknownCustomerId", header: "Unknown line", body: "The link you used seems to be broken. We cannot recognize the line it is referring to.", button: "Get a new place in line" },
    2: { type: "UnknownEventId", header: "Unknown line", body: "The link you used seems to be broken. We cannot recognize the line it is referring to.", button: "Get a new place in line" },
    3: { type: "EventNotFound", header: "An error has occurred.", body: "An unexpected error has occurred. Please inform the Queue-it team by e-mail at: mailto:support@queue-it.com", button: "Get a new place in line" },
    4: { type: "AfterWindow", header: "Your queue number is no longer valid", body: "Queue numbers are only valid for 10 minutes. Unfortunately, your queue number has now expired.", button: "Get a new place in line", details: true },
    5: { type: "MaxNoOfRedirectsPerQId", header: "Old number in line", body: "You have used this number in line before. To get back in line, click the button below.", button: "Get a new place in line" },
    6: { type: "KnownUserV3", header: "An error has occurred.", body: "An unexpected error has occurred. Please inform the Queue-it team by e-mail at: mailto:support@queue-it.com", button: "Get a new place in line" },
    7: { type: "ChallengeSolveTimeout", header: "Solving challenge took too long", body: "The challenge has to be solved in 2 minutes. Click the button below to return to your place in the queue and solve the challenge.", button: "Return and retry", keepsQueueId: true },
    8: { type: "ChallengeBlocked", header: "An error has occurred.", body: "An unexpected error has occurred. Please inform the Queue-it team by e-mail at: mailto:support@queue-it.com", button: "Get a new place in line" },
    9: { type: "InvalidQueueitEnqueueToken", header: "Restricted Access", body: "You have attempted to enter a waiting room, but the access link is invalid. Please ensure you are using the correct valid link.", button: "Get a new place in line" },
    10: { type: "MissingCustomDataKey", header: "Restricted Access", body: "You have attempted to enter a waiting room, but the access link is invalid. Please ensure you are using the correct valid link.", button: "Get a new place in line" },
    11: { type: "CustomDataUniqueKeyViolation", header: "Restricted Access", body: "You have attempted to enter a waiting room, but the access link is invalid. Please ensure you are using the correct valid link.", button: "Get a new place in line" },
    12: { type: "QueueIdUsageLimitError", header: "An error has occurred.", body: "An unexpected error has occurred. Please inform the Queue-it team by e-mail at: mailto:support@queue-it.com", button: "Get a new place in line" },
    13: { type: "ChallengeRetryLimitReached", header: "Too many refreshes", body: "You’ve exceeded the maximum of 5 allowed refresh attempts. Try again, to get a place in line.", button: "Get a new place in line" },
    14: { type: "ChallengeAttemptsUsed", header: "No more attempts left", body: "You’ve entered the wrong CAPTCHA three times. Start over and get a place in line", button: "Get a new place in line" },
  };

  var PANELS = ["top", "left", "right", "middle", "bottom", "side"];
  var PANEL_IDS = {
    top: { div: "toppanel", iframe: "toppanel_iframe", flag: "topPanelVisible", src: "toppanelIFrameSrc" },
    left: { div: "leftpanel", iframe: "leftpanel_iframe", flag: "leftPanelVisible", src: "leftpanelIFrameSrc" },
    right: { div: "rightpanel", iframe: "rightpanel_iframe", flag: "rightPanelVisible", src: "rightpanelIFrameSrc" },
    middle: { div: "middlepanel", iframe: "middlepanel_iframe", flag: "middlePanelVisible", src: "middlepanelIFrameSrc" },
    bottom: { div: "bottompanel", iframe: "bottompanel_iframe", flag: "bottomPanelVisible", src: "bottompanelIFrameSrc" },
    side: { div: "sidebar", iframe: "sidebar_iframe", flag: "sidePanelVisible", src: "sidepanelIFrameSrc" },
  };

  function defaultTheme() {
    return {
      name: "Local theme",
      source: { type: "local" },
      general: {
        customerId: "queuejeff",
        eventId: "preview-layout",
        eventName: EVENT_NAME,
        culture: "en-US",
        documentTitle: "Queue-it",
        logoSrc: DEFAULT_LOGO,
        faviconUrl: "files/default_images/queue-it.ico",
      },
      styling: {
        includeDefaultCss: true,
        styleSheets: ["files/style.css"],
        javascripts: ["files/script.js", "files/test.js"],
        customCss: "",
      },
      panels: {
        top: "files/top.html",
        left: "files/left.html",
        right: "files/right.html",
        middle: "files/middle.html",
        bottom: "files/bottom.html",
        side: "files/side.html",
      },
      layout: {
        logoVisible: true,
        languageSelectorVisible: false,
        dynamicMessageVisible: true,
        reminderVisible: true,
        reminderEmailVisible: true,
        queueNumberVisible: true,
        usersInLineAheadOfYouVisible: true,
        expectedServiceTimeVisible: true,
        whichIsInVisible: true,
        usersInQueueVisible: false,
        progressVisible: true,
        isRedirectPromptDialogEnabled: false,
        isQueueitFooterHidden: false,
        topPanelVisible: false,
        leftPanelVisible: false,
        rightPanelVisible: false,
        middlePanelVisible: false,
        bottomPanelVisible: false,
        sidePanelVisible: false,
      },
      texts: {
        beforeHeader: EVENT_NAME,
        beforeBody:
          EVENT_NAME + " has not yet begun. When " + EVENT_NAME + " begins, you will be assigned a random place in line (alongside everyone else who also arrives before " + EVENT_NAME + " begins).",
        queueHeader: "You are now in line",
        queueBody: "You are in line for " + EVENT_NAME + ". When it is your turn, you will have 10 minutes to enter the website.",
        afterHeader: "The event has ended",
        afterBody: "The " + EVENT_NAME + " event has ended, and the line is now closed.",
        disclaimerText: "",
        countdownFinishedText: "You will now be redirected to the line.",
        cookiesAllowedInfoText: "You can close this page without losing your place in line.",
        cookiesAllowedInfoTooltip: "You will not lose your place in line if you close this page, but you must return when your turn comes up.",
        cookiesNotAllowedInfoText: "You will lose your place in line if you close this page!",
        cookiesNotAllowedInfoTooltip: "Your browser does not allow us to save cookies. To keep your place in line, copy the web address of this page and save it for later.",
        messageHeader: "Message last updated:",
      },
      tags: [],
    };
  }

  function defaultSim() {
    return {
      queueNumber: "8445",
      usersInLineAheadOfYou: 1758,
      whichIsIn: "14 minutes",
      waitMinutes: 14,
      progress: 0.75,
      forecastStatus: "InLine",
      usersInQueue: 2500,
      secondsToStart: 480,
      messageEnabled: true,
      messageText: "This is a test message.",
      afterMessageEnabled: false,
      afterMessageText: "Thank you for your patience. Follow us for news about the next sale.",
    };
  }

  // ---------- helpers ----------
  function clone(o) {
    return JSON.parse(JSON.stringify(o));
  }
  function merge(base, over) {
    if (!over || typeof over !== "object") return base;
    Object.keys(over).forEach(function (k) {
      var v = over[k];
      if (v && typeof v === "object" && !Array.isArray(v) && base[k] && typeof base[k] === "object" && !Array.isArray(base[k])) {
        merge(base[k], v);
      } else {
        base[k] = v;
      }
    });
    return base;
  }
  function readJson(key) {
    try {
      var raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }
  function writeJson(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  }
  function escAttr(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  }
  function absUrl(u) {
    if (!u) return "";
    u = String(u).trim();
    return u.indexOf("//") === 0 ? "https:" + u : u;
  }
  function qs(name) {
    var m = new RegExp("[?&]" + name + "=([^&#]*)", "i").exec(window.location.search);
    return m ? decodeURIComponent(m[1].replace(/\+/g, " ")) : null;
  }
  function timeString(date, withSeconds) {
    var opts = { hour: "numeric", minute: "2-digit" };
    if (withSeconds) opts.second = "2-digit";
    try {
      return date.toLocaleTimeString(Replica.culture, opts);
    } catch (e) {
      return date.toLocaleTimeString("en-US", opts);
    }
  }
  function dateTimeString(date) {
    try {
      return date.toLocaleString(Replica.culture);
    } catch (e) {
      return date.toLocaleString("en-US");
    }
  }
  function guid() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  // ---------- state ----------
  var theme = merge(defaultTheme(), readJson(THEME_KEY) || {});
  // Themes saved before the engine moved to the CDN may still point at the old local logo.
  if (theme.general.logoSrc === "files/vendor/img/queue-it_logo.png") theme.general.logoSrc = DEFAULT_LOGO;
  var sim = merge(defaultSim(), readJson(SIM_KEY) || {});

  var Replica = {
    version: "1.0.0",
    THEME_KEY: THEME_KEY,
    SIM_KEY: SIM_KEY,
    ERROR_STATES: ERROR_STATES,
    PANELS: PANELS,
    PANEL_IDS: PANEL_IDS,
    LANGUAGES: LANGUAGES,
    DEFAULT_LOGO: DEFAULT_LOGO,
    theme: theme,
    sim: sim,
    culture: qs("cid") || theme.general.culture || "en-US",
    queueId: qs("q") || "618183e3-c842-487c-80d8-7b9ac588c476",
    pageId: null,
    helpers: { clone: clone, merge: merge, absUrl: absUrl, qs: qs, timeString: timeString, guid: guid },
    defaultTheme: defaultTheme,
    defaultSim: defaultSim,
  };

  Replica.saveTheme = function (t) {
    if (t) Replica.theme = theme = t;
    return writeJson(THEME_KEY, theme);
  };
  Replica.resetTheme = function () {
    Replica.theme = theme = defaultTheme();
    try {
      window.localStorage.removeItem(THEME_KEY);
    } catch (e) {}
  };
  Replica.saveSim = function () {
    return writeJson(SIM_KEY, sim);
  };
  Replica.resetSim = function () {
    Replica.sim = sim = defaultSim();
    try {
      window.localStorage.removeItem(SIM_KEY);
    } catch (e) {}
  };

  // ---------- <head> writers (called inline with document.write so ordering matches Queue-it) ----------
  Replica.writeHead = function (pageId) {
    Replica.pageId = pageId;
    var g = theme.general, s = theme.styling, out = [];
    out.push('<link rel="shortcut icon" href="' + escAttr(absUrl(g.faviconUrl) || "files/default_images/queue-it.ico") + '" />');
    if (s.includeDefaultCss !== false) out.push('<link rel="stylesheet" href="' + DEFAULT_CSS + '" type="text/css" data-replica="default" />');
    (s.styleSheets || []).forEach(function (href) {
      if (href && String(href).trim()) out.push('<link rel="stylesheet" href="' + escAttr(absUrl(href)) + '" type="text/css" data-replica="theme" />');
    });
    out.push('<style id="qr-custom-css" data-replica="custom">' + (s.customCss || "").replace(/<\/style/gi, "<\\/style") + "</style>");
    document.write(out.join("\n"));
    document.title = g.documentTitle || "Queue-it";
    document.documentElement.setAttribute("lang", (Replica.culture || "en-US").split("-")[0]);
  };

  // Theme JavaScript files. Written after the view model exists, like Queue-it does,
  // so queueViewModel.pageReady / modelUpdated registrations work.
  Replica.writeThemeScripts = function () {
    var out = [];
    (theme.styling.javascripts || []).forEach(function (src) {
      if (src && String(src).trim()) out.push('<script type="text/javascript" src="' + escAttr(absUrl(src)) + '"><\/script>');
    });
    if (out.length) document.write(out.join("\n"));
  };

  // ---------- model builders ----------
  function languagesFor(culture) {
    if (!theme.layout.languageSelectorVisible) return [];
    var list = LANGUAGES.map(function (l) {
      return { Disabled: false, Group: null, Selected: l[0] === culture, Text: l[1], Value: l[0] };
    });
    if (!list.some(function (l) { return l.Selected; })) list.push({ Disabled: false, Group: null, Selected: true, Text: culture, Value: culture });
    return list;
  }
  Replica.languagesFor = languagesFor;

  function whatIsThisUrl() {
    return "https://queue-it.com/what-is-this.html?customerId=" + encodeURIComponent(theme.general.customerId) + "&eventId=" + encodeURIComponent(theme.general.eventId) + "&queueId=00000000-0000-0000-0000-000000000000&language=" + encodeURIComponent(Replica.culture) + "&preview=true";
  }
  Replica.whatIsThisUrl = whatIsThisUrl;

  Replica.buildTexts = function (pageId) {
    var t = theme.texts, isBefore = pageId === "before";
    var texts = {
      countdownFinishedText: t.countdownFinishedText,
      queueBody: t.queueBody,
      queueHeader: t.queueHeader,
      header: isBefore ? t.beforeHeader : t.queueHeader,
      body: isBefore ? t.beforeBody : t.queueBody,
      disclaimerText: t.disclaimerText || null,
      // Theme stylesheets are written by Replica.writeHead; keep this constant so the engine never swaps <link>s.
      styleSheets: "replica",
      javascripts: theme.styling.javascripts.slice(),
      logoSrc: absUrl(theme.general.logoSrc) || DEFAULT_LOGO,
      faviconUrl: absUrl(theme.general.faviconUrl),
      whatIsThisUrl: whatIsThisUrl(),
      queueItLogoPointsToUrl: whatIsThisUrl(),
      welcomeSoundUrls: null,
      cookiesAllowedInfoText: t.cookiesAllowedInfoText,
      cookiesNotAllowedInfoText: t.cookiesNotAllowedInfoText,
      cookiesAllowedInfoTooltip: t.cookiesAllowedInfoTooltip,
      cookiesNotAllowedInfoTooltip: t.cookiesNotAllowedInfoTooltip,
      AppleTouchIconUrl: "",
      DocumentTitle: theme.general.documentTitle,
      tags: (theme.tags || []).map(function (x) { return { key: x.key, value: x.value }; }),
      messageUpdatedTimeAgo: "Message last updated {0} ago",
      languages: languagesFor(Replica.culture),
    };
    PANELS.forEach(function (p) {
      texts[PANEL_IDS[p].src] = absUrl(theme.panels[p]);
    });
    return texts;
  };

  Replica.buildLayout = function () {
    var l = clone(theme.layout);
    l.queueIsPausedVisible = false;
    l.servicedSoonVisible = false;
    l.firstInLineVisible = false;
    l.queueNumberLoadingVisible = false;
    return l;
  };

  Replica.buildMessage = function (enabled, text) {
    if (!enabled) return null;
    return {
      header: theme.texts.messageHeader || "Message last updated:",
      text: text,
      timestamp: null,
      id: "replica-" + Date.now(),
      timestampFormatted: timeString(new Date()),
      timeSpanSeconds: null,
      timeZonePostfix: "",
      timestampUTC: null,
    };
  };

  Replica.buildTicket = function () {
    var now = new Date();
    var start = new Date(now.getTime() + (Number(sim.secondsToStart) || 0) * 1000);
    var expected = new Date(now.getTime() + (Number(sim.waitMinutes) || 0) * 60000);
    return {
      queuePaused: false,
      lastUpdatedUTC: now.toISOString(),
      queueNumber: String(sim.queueNumber),
      whichIsIn: sim.whichIsIn,
      expectedServiceTime: timeString(expected),
      usersInLineAheadOfYou: String(sim.usersInLineAheadOfYou),
      lastUpdated: timeString(now, true),
      progress: Number(sim.progress),
      timeZonePostfix: "",
      expectedServiceTimeUTC: expected.toISOString(),
      customUrlParams: null,
      sdkVersion: null,
      windowStartTimeUTC: null,
      windowStartTime: "",
      secondsToStart: Number(sim.secondsToStart) || 0,
      usersInQueue: Number(sim.usersInQueue) || 0,
      eventStartTimeFormatted: timeString(start),
      eventStartTimeUTC: start.toISOString(),
    };
  };

  Replica.buildInqueueInfo = function (pageId) {
    var isBefore = pageId === "before";
    return {
      isBeforeOrIdle: isBefore,
      pageId: pageId,
      pageClass: isBefore ? "before prequeue" : "queue",
      QueueState: isBefore ? 1 : 2,
      ticket: Replica.buildTicket(),
      message: Replica.buildMessage(sim.messageEnabled, sim.messageText),
      texts: Replica.buildTexts(pageId),
      layout: Replica.buildLayout(),
      forecastStatus: isBefore ? "InLine" : sim.forecastStatus === "FirstInLine" ? "InLine" : sim.forecastStatus,
      layoutName: "LayoutName",
      layoutVersion: 1,
      updateInterval: 30000,
    };
  };

  Replica.inQueueOptions = function (pageId) {
    var info = Replica.buildInqueueInfo(pageId);
    return {
      customerId: theme.general.customerId,
      eventId: theme.general.eventId,
      requireKey: false,
      isQueueitEnqueueTokenRequired: false,
      queueId: Replica.queueId,
      targetUrl: "",
      customUrlParams: "",
      culture: Replica.culture,
      languages: languagesFor(Replica.culture),
      layout: "LayoutName",
      layoutVersion: 1,
      messageFeed: window.messageFeed,
      sdkVersion: "",
      isBeforeOrIdle: info.isBeforeOrIdle,
      isIdle: false,
      inqueueInfo: info,
      challengeVerifyEndpoint: "",
      showChallenges: false,
      challengesIssuedByReason: null,
      challenges: null,
      isPreview: true,
    };
  };

  Replica.errorOptions = function () {
    return {
      customerId: theme.general.customerId,
      eventId: theme.general.eventId,
      targetUrl: "",
      culture: Replica.culture,
      languageSelectorVisible: theme.layout.languageSelectorVisible ? "True" : "False",
      languages: languagesFor(Replica.culture),
      tags: (theme.tags || []).map(function (x) { return { key: x.key, value: x.value }; }),
      queuePathPrefix: "",
    };
  };

  Replica.afterOptions = function () {
    return {
      customerId: theme.general.customerId,
      eventId: theme.general.eventId,
      queueId: Replica.queueId,
      language: Replica.culture,
      languageSelectorVisible: theme.layout.languageSelectorVisible ? "True" : "False",
      languages: languagesFor(Replica.culture),
      layoutName: "",
      tags: (theme.tags || []).map(function (x) { return { key: x.key, value: x.value }; }),
      queuePathPrefix: "",
    };
  };

  Replica.errorId = function () {
    var er = parseInt(qs("er"), 10);
    return ERROR_STATES.hasOwnProperty(er) ? er : 4;
  };

  // ---------- body / static rendering ----------
  // Runs right after <body> opens: attributes theme scripts read in pageReady.
  Replica.applyBodyAttrs = function (pageId) {
    var b = document.body;
    b.setAttribute("data-culture", Replica.culture);
    if (pageId === "error") {
      var er = Replica.errorId();
      b.setAttribute("data-errorid", String(er));
      b.setAttribute("data-errortype", ERROR_STATES[er].type);
    }
  };

  function setPanelStatic(p) {
    var ids = PANEL_IDS[p];
    var div = document.getElementById(ids.div), frame = document.getElementById(ids.iframe);
    if (!div) return;
    var visible = !!theme.layout[ids.flag];
    div.style.display = visible ? "" : "none";
    if (frame) frame.setAttribute("src", visible ? absUrl(theme.panels[p]) : "");
  }

  // after/error pages are server-rendered in Queue-it (no knockout model for texts/panels),
  // so the replica fills them in before $(document).ready / pageReady runs.
  Replica.renderStaticPage = function (pageId) {
    var t = theme.texts, l = theme.layout;
    var h = document.getElementById("lbHeaderH2"), p = document.getElementById("lbHeaderP");
    var logo = document.getElementById("imgCustomerLogo"), logoBox = document.getElementById("logocontainer");
    if (pageId === "after") {
      if (h) h.innerHTML = t.afterHeader || "";
      if (p) p.innerHTML = t.afterBody || "";
    }
    if (pageId === "error") {
      var er = Replica.errorId(), st = ERROR_STATES[er];
      if (h) h.textContent = st.header;
      if (p) p.textContent = st.body;
      var btn = document.querySelector("#MainPart_divWarningBox .btn");
      if (btn) {
        btn.setAttribute("href", "queue.html" + (st.keepsQueueId ? "?q=" + encodeURIComponent(Replica.queueId) : ""));
        var l1 = btn.querySelector(".l");
        if (l1) l1.textContent = st.button;
      }
      var details = document.getElementById("detailExpander");
      if (details) {
        if (st.details) {
          var entered = new Date(Date.now() - 3 * 3600000), turn = new Date(Date.now() - 2 * 3600000), valid = new Date(turn.getTime() + 10 * 60000);
          var d = document.getElementById("expandableDetails");
          if (d) d.textContent = "You entered the queue at " + dateTimeString(entered) + ". It was your turn at " + dateTimeString(turn) + ", and your queue number was valid until " + dateTimeString(valid) + ". Click the button below to get a new place at the end of the queue.";
        } else {
          var br = details.previousElementSibling;
          if (br && br.tagName === "BR") br.parentNode.removeChild(br);
          details.parentNode.removeChild(details);
        }
      }
    }
    if (logo) logo.setAttribute("src", absUrl(theme.general.logoSrc) || DEFAULT_LOGO);
    if (logoBox) logoBox.style.display = l.logoVisible ? "" : "none";
    var disc = document.getElementById("footer-disclaimer");
    if (disc) disc.innerHTML = t.disclaimerText || "";
    PANELS.forEach(setPanelStatic);
    Replica.applyCommonStatic();
  };

  Replica.applyCommonStatic = function () {
    var link = document.getElementById("footer-queueit-link");
    if (link) link.style.display = theme.layout.isQueueitFooterHidden ? "none" : "";
    var what = document.getElementById("hlThisIsQueueIt");
    if (what) what.setAttribute("href", whatIsThisUrl());
    var by = document.getElementById("aThisIsQueueIt");
    if (by) by.setAttribute("href", whatIsThisUrl());
    var qid = document.getElementById("hlLinkToQueueTicket2");
    if (qid) qid.textContent = Replica.queueId;
  };

  // ---------- Custom Theme preview import ----------
  var PREVIEW_RE = /^\/(before|queue|after|error|exit)\/([^/]+)\/layout\/([^/]+)\/preview\/?$/i;
  var DEFAULT_ASSET_RE = /assets\.queue-it\.net\/static\/QueueFront\//i;

  Replica.parsePreviewUrl = function (input) {
    var u;
    try {
      u = new URL(String(input).trim());
    } catch (e) {
      throw new Error("That is not a valid URL.");
    }
    if (!/(^|\.)queue-it\.net$/i.test(u.hostname)) throw new Error("Preview links must be on *.queue-it.net.");
    var m = PREVIEW_RE.exec(u.pathname);
    if (!m) throw new Error("Expected a link like https://{customer}.queue-it.net/queue/{customer}/layout/{guid}/preview?previewid=...");
    return {
      origin: u.origin,
      page: m[1].toLowerCase(),
      customerId: m[2],
      layoutGuid: m[3],
      previewId: u.searchParams.get("previewid") || "",
      urlFor: function (page) {
        return u.origin + "/" + page + "/" + m[2] + "/layout/" + m[3] + "/preview" + (u.search || "");
      },
    };
  };

  function fetchText(url) {
    var viaProxy = /^https?:$/.test(window.location.protocol);
    var target = viaProxy ? "/__proxy?url=" + encodeURIComponent(url) : url;
    return fetch(target, { cache: "no-store" }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status + " for " + url);
      return r.text();
    });
  }
  Replica.fetchText = fetchText;

  function extractJsonAfter(source, marker) {
    var i = source.indexOf(marker);
    if (i < 0) return null;
    i = source.indexOf("{", i);
    if (i < 0) return null;
    var depth = 0, inStr = false, esc = false;
    for (var j = i; j < source.length; j++) {
      var c = source[j];
      if (inStr) {
        if (esc) esc = false;
        else if (c === "\\") esc = true;
        else if (c === '"') inStr = false;
      } else if (c === '"') inStr = true;
      else if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) {
          try {
            return JSON.parse(source.slice(i, j + 1));
          } catch (e) {
            return null;
          }
        }
      }
    }
    return null;
  }

  function hrefsFromHtml(html, selector, attr) {
    var doc = new DOMParser().parseFromString("<div>" + (html || "") + "</div>", "text/html");
    return Array.prototype.map.call(doc.querySelectorAll(selector), function (el) { return el.getAttribute(attr); });
  }

  // Parse one preview page (any page type) into a partial theme.
  Replica.parsePreviewHtml = function (html) {
    var doc = new DOMParser().parseFromString(html, "text/html");
    var body = doc.body;
    var pageId = body ? body.getAttribute("data-pageid") : null;
    var out = { pageId: pageId, styleSheets: null, javascripts: null, texts: {}, layout: {}, panels: {}, general: {} };

    // Stylesheets / scripts as the page references them (minus Queue-it's own combined files).
    var info = extractJsonAfter(html, "inqueueInfo:");
    var sheets = info && info.texts && info.texts.styleSheets ? hrefsFromHtml(info.texts.styleSheets, "link[rel=stylesheet]", "href") : Array.prototype.map.call(doc.querySelectorAll("head link[rel=stylesheet]"), function (l) { return l.getAttribute("href"); });
    // Conditional IE comments are not parsed as elements, so ie_*.css drops out automatically.
    out.styleSheets = sheets.filter(function (h) { return h && !DEFAULT_ASSET_RE.test(h); }).map(absUrl);
    var scripts = info && info.texts && Array.isArray(info.texts.javascripts) ? info.texts.javascripts : Array.prototype.map.call(doc.querySelectorAll("head script[src]"), function (s) { return s.getAttribute("src"); });
    out.javascripts = scripts.filter(function (s) { return s && !DEFAULT_ASSET_RE.test(s) && !/\/challenge\//i.test(s); }).map(absUrl);

    var custMatch = /customerId:\s*'([^']*)'/.exec(html);
    if (custMatch) out.general.customerId = custMatch[1];

    if (info) {
      var tx = info.texts || {};
      if (tx.logoSrc) out.general.logoSrc = absUrl(tx.logoSrc);
      if (tx.faviconUrl) out.general.faviconUrl = absUrl(tx.faviconUrl);
      if (tx.DocumentTitle) out.general.documentTitle = tx.DocumentTitle;
      PANELS.forEach(function (p) {
        var v = tx[PANEL_IDS[p].src];
        if (v != null) out.panels[p] = absUrl(v);
      });
      ["disclaimerText", "countdownFinishedText", "cookiesAllowedInfoText", "cookiesNotAllowedInfoText", "cookiesAllowedInfoTooltip", "cookiesNotAllowedInfoTooltip"].forEach(function (k) {
        if (tx[k] != null) out.texts[k] = tx[k];
      });
      if (pageId === "before") {
        out.texts.beforeHeader = tx.header || "";
        out.texts.beforeBody = tx.body || "";
        if (tx.queueHeader != null) out.texts.queueHeader = tx.queueHeader;
        if (tx.queueBody != null) out.texts.queueBody = tx.queueBody;
      } else {
        out.texts.queueHeader = tx.header || "";
        out.texts.queueBody = tx.body || "";
      }
      if (Array.isArray(tx.tags) && tx.tags.length) out.tags = tx.tags.map(function (t) { return { key: t.key || t.Key, value: t.value || t.Value }; });
      var L = info.layout || {};
      Object.keys(defaultTheme().layout).forEach(function (k) {
        if (typeof L[k] === "boolean") out.layout[k] = L[k];
      });
      if (info.message && info.message.header) out.texts.messageHeader = info.message.header;
    } else if (body) {
      // after / error: server-rendered markup
      var h = doc.getElementById("lbHeaderH2"), p = doc.getElementById("lbHeaderP");
      if (pageId === "after") {
        out.texts.afterHeader = h ? h.innerHTML.trim() : "";
        out.texts.afterBody = p ? p.innerHTML.trim() : "";
      }
      var logo = doc.getElementById("imgCustomerLogo");
      if (logo && logo.getAttribute("src")) out.general.logoSrc = absUrl(logo.getAttribute("src"));
      var disc = doc.getElementById("footer-disclaimer");
      if (disc && disc.innerHTML.trim()) out.texts.disclaimerText = disc.innerHTML.trim();
      PANELS.forEach(function (p2) {
        var ids = PANEL_IDS[p2], div = doc.getElementById(ids.div), fr = doc.getElementById(ids.iframe);
        if (!div) return;
        var hidden = /display:\s*none/i.test(div.getAttribute("style") || "");
        out.layout[ids.flag] = !hidden;
        if (fr && fr.getAttribute("src")) out.panels[p2] = absUrl(fr.getAttribute("src"));
      });
      out.layout.isQueueitFooterHidden = !doc.getElementById("footer-queueit-link");
    }
    var fav = doc.querySelector("link[rel='shortcut icon']");
    if (fav && fav.getAttribute("href") && !out.general.faviconUrl) out.general.faviconUrl = absUrl(fav.getAttribute("href"));
    return out;
  };

  // Merge parsed preview pages into a fresh theme. Queue page wins for shared settings.
  Replica.themeFromParsed = function (parsedList, sourceUrl) {
    var t = defaultTheme();
    t.name = "Imported preview";
    t.source = { type: "preview", url: sourceUrl || "", importedAt: new Date().toISOString() };
    t.styling.styleSheets = [];
    t.styling.javascripts = [];
    t.panels = { top: "", left: "", right: "", middle: "", bottom: "", side: "" };
    PANELS.forEach(function (p) { t.layout[PANEL_IDS[p].flag] = false; });
    var order = { after: 0, error: 1, before: 2, queue: 3 };
    parsedList
      .filter(Boolean)
      .sort(function (a, b) { return (order[a.pageId] || 0) - (order[b.pageId] || 0); })
      .forEach(function (p) {
        if (p.styleSheets && p.styleSheets.length) t.styling.styleSheets = p.styleSheets;
        if (p.javascripts && p.javascripts.length) t.styling.javascripts = p.javascripts;
        merge(t.general, p.general);
        merge(t.texts, p.texts);
        merge(t.layout, p.layout);
        Object.keys(p.panels).forEach(function (k) { if (p.panels[k]) t.panels[k] = p.panels[k]; });
        if (p.tags) t.tags = p.tags;
      });
    t.general.eventId = "preview-layout";
    return t;
  };

  // Fetch all 4 page types of a preview link and build a theme from them.
  Replica.importPreview = function (link, onProgress) {
    var info = Replica.parsePreviewUrl(link);
    var pages = ["queue", "before", "after", "error"];
    var report = [];
    return Promise.all(
      pages.map(function (page) {
        var url = info.urlFor(page);
        return fetchText(url)
          .then(function (html) {
            var parsed = Replica.parsePreviewHtml(html);
            report.push({ page: page, ok: true, pageId: parsed.pageId });
            if (onProgress) onProgress(page, true);
            return parsed;
          })
          .catch(function (err) {
            report.push({ page: page, ok: false, error: err.message });
            if (onProgress) onProgress(page, false, err);
            return null;
          });
      })
    ).then(function (parsed) {
      if (!parsed.some(Boolean)) {
        var e = new Error(report.map(function (r) { return r.page + ": " + r.error; }).join("\n"));
        e.report = report;
        throw e;
      }
      var t = Replica.themeFromParsed(parsed, link);
      return { theme: t, report: report };
    });
  };

  window.Replica = Replica;
})(window, document);
