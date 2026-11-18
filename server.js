#!/usr/bin/env node
/*
 * Queue-it replica waiting room - local dev server (no dependencies).
 *
 *   node server.js            -> http://localhost:8080
 *   PORT=3000 node server.js  -> http://localhost:3000
 *
 * Serves this folder and exposes /__proxy?url=<https://*.queue-it.net/...>
 * so the replica panel can read a Custom Theme preview page (those pages
 * do not send CORS headers, so the browser cannot fetch them directly).
 * Only *.queue-it.net hosts are allowed through the proxy.
 */
const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 8080;
const ALLOWED_HOST = /(^|\.)queue-it\.net$/i;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".mp4": "video/mp4",
  ".pdf": "application/pdf",
};

function send(res, status, body, type) {
  res.writeHead(status, { "Content-Type": type || "text/plain; charset=utf-8", "Cache-Control": "no-store" });
  res.end(body);
}

function proxy(req, res, target, redirectsLeft) {
  let url;
  try {
    url = new URL(target);
  } catch (e) {
    return send(res, 400, "Invalid url");
  }
  if (url.protocol !== "https:" || !ALLOWED_HOST.test(url.hostname)) {
    return send(res, 403, "Only https://*.queue-it.net URLs can be proxied");
  }
  const upstream = https.get(
    url,
    { headers: { "User-Agent": "Mozilla/5.0 (QueueItReplica local preview importer)", Accept: "text/html,*/*" } },
    (up) => {
      if (up.statusCode >= 300 && up.statusCode < 400 && up.headers.location && redirectsLeft > 0) {
        up.resume();
        return proxy(req, res, new URL(up.headers.location, url).toString(), redirectsLeft - 1);
      }
      res.writeHead(up.statusCode || 502, {
        "Content-Type": up.headers["content-type"] || "text/html; charset=utf-8",
        "X-Proxied-Url": url.toString(),
        "Cache-Control": "no-store",
      });
      up.pipe(res);
    }
  );
  upstream.on("error", (err) => send(res, 502, "Proxy error: " + err.message));
  upstream.setTimeout(15000, () => upstream.destroy(new Error("timeout")));
}

const server = http.createServer((req, res) => {
  const reqUrl = new URL(req.url, "http://localhost");

  if (reqUrl.pathname === "/__proxy") {
    return proxy(req, res, reqUrl.searchParams.get("url") || "", 5);
  }
  if (reqUrl.pathname === "/__ping") {
    return send(res, 200, "ok");
  }

  let rel = decodeURIComponent(reqUrl.pathname);
  if (rel === "/") rel = "/index.html";
  const file = path.normalize(path.join(ROOT, rel));
  if (!file.startsWith(ROOT)) return send(res, 403, "Forbidden");

  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) return send(res, 404, "Not found: " + rel);
    res.writeHead(200, {
      "Content-Type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    fs.createReadStream(file).pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`Queue-it replica running at http://localhost:${PORT}/`);
  console.log(`  before: http://localhost:${PORT}/before.html`);
  console.log(`  queue:  http://localhost:${PORT}/queue.html`);
  console.log(`  after:  http://localhost:${PORT}/after.html`);
  console.log(`  error:  http://localhost:${PORT}/error.html?er=5`);
});
