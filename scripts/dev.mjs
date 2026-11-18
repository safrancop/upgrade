// Local dev server with live reload. Usage: npm run dev  ->  http://localhost:4780
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT) || 4780;
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml", ".json": "application/json", ".webmanifest": "application/manifest+json" };
const clients = new Set();
const reload = `<script>new EventSource("/__reload").onmessage=()=>location.reload();</script>`;

let timer;
for (const dir of ["", "css", "js"]) {
  fs.watch(path.join(root, dir), () => {
    clearTimeout(timer);
    timer = setTimeout(() => clients.forEach((res) => res.write("data: reload\n\n")), 80);
  });
}

http
  .createServer((req, res) => {
    const url = req.url.split("?")[0];
    if (url === "/__reload") {
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
      clients.add(res);
      req.on("close", () => clients.delete(res));
      return;
    }
    const file = path.normalize(path.join(root, url === "/" ? "index.html" : url));
    if (!file.startsWith(root) || file.includes("node_modules")) { res.writeHead(403); return res.end(); }
    fs.readFile(file, (err, body) => {
      if (err) { res.writeHead(404); return res.end("Not found"); }
      const ext = path.extname(file);
      res.writeHead(200, { "Content-Type": TYPES[ext] || "application/octet-stream", "Cache-Control": "no-store" });
      res.end(ext === ".html" ? body.toString().replace("</body>", reload + "</body>") : body);
    });
  })
  .listen(PORT, () => console.log(`Upgrade running at http://localhost:${PORT}`));
