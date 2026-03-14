// bridge.js - Serveur bridge VSCode autonome (port 3333)
// Lance avec : node bridge.js

const http = require("http");
const { exec, execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const PORT = 3333;

function respond(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  res.end(JSON.stringify(data));
}

const server = http.createServer((req, res) => {
  if (req.method === "OPTIONS") {
    respond(res, 200, {});
    return;
  }

  const url = new URL(req.url, "http://localhost");
  const route = url.pathname;

  let body = "";
  req.on("data", chunk => body += chunk);
  req.on("end", () => {
    try {
      handleRequest(req.method, route, body, res);
    } catch (err) {
      respond(res, 500, { error: err.message });
    }
  });
});

function handleRequest(method, route, body, res) {
  // GET /status
  if (method === "GET" && route === "/status") {
    respond(res, 200, {
      status: "ok",
      bridge: "node-standalone",
      port: PORT
    });
    return;
  }

  // POST /open - ouvrir un fichier dans VSCode
  if (method === "POST" && route === "/open") {
    const data = JSON.parse(body);
    const filePath = data.path;
    const line = data.line || null;
    const target = line ? `${filePath}:${line}` : filePath;
    exec(`code -g "${target}"`, (err) => {
      if (err) respond(res, 500, { error: err.message });
      else respond(res, 200, { success: true, path: filePath });
    });
    return;
  }

  // POST /write - créer/écrire un fichier et l'ouvrir
  if (method === "POST" && route === "/write") {
    const data = JSON.parse(body);
    const filePath = data.path;
    const content = data.content;
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, content, "utf8");
    if (data.open !== false) {
      exec(`code "${filePath}"`, () => {});
    }
    respond(res, 200, { success: true, path: filePath });
    return;
  }

  // GET /read?path=... - lire un fichier
  if (method === "GET" && route === "/read") {
    const url2 = new URL(`http://localhost${route}?${require("url").parse(body).query || ""}`);
    const filePath = new URLSearchParams(body).get("path") 
      || new URL(`http://localhost/read?${body}`).searchParams.get("path")
      || "";
    // Alternative: passer le path dans le body JSON
    try {
      const parsed = JSON.parse(body);
      const fp = parsed.path;
      if (!fs.existsSync(fp)) {
        respond(res, 404, { error: "Fichier introuvable: " + fp });
        return;
      }
      const content = fs.readFileSync(fp, "utf8");
      respond(res, 200, { path: fp, content, size: content.length });
    } catch {
      respond(res, 400, { error: "Passe le path dans le body JSON: {\"path\": \"C:\\\\...\"}" });
    }
    return;
  }

  // POST /read - lire un fichier (méthode POST plus simple)
  if (method === "POST" && route === "/read") {
    const data = JSON.parse(body);
    if (!fs.existsSync(data.path)) {
      respond(res, 404, { error: "Fichier introuvable: " + data.path });
      return;
    }
    const content = fs.readFileSync(data.path, "utf8");
    respond(res, 200, { path: data.path, content, lines: content.split("\n").length });
    return;
  }

  // POST /replace - remplacer du texte dans un fichier
  if (method === "POST" && route === "/replace") {
    const data = JSON.parse(body);
    if (!fs.existsSync(data.path)) {
      respond(res, 404, { error: "Fichier introuvable" });
      return;
    }
    let content = fs.readFileSync(data.path, "utf8");
    if (!content.includes(data.old_text)) {
      respond(res, 400, { error: "Texte introuvable dans le fichier" });
      return;
    }
    const newContent = content.replace(data.old_text, data.new_text);
    fs.writeFileSync(data.path, newContent, "utf8");
    exec(`code "${data.path}"`, () => {});
    respond(res, 200, { success: true });
    return;
  }

  // POST /terminal - ouvrir un terminal VSCode et lancer une commande
  if (method === "POST" && route === "/terminal") {
    const data = JSON.parse(body);
    // Ouvre VSCode avec une tâche dans un nouveau terminal
    const cmd = `code --new-window`;
    exec(`start cmd /k "${data.command}"`, (err) => {
      if (err) respond(res, 500, { error: err.message });
      else respond(res, 200, { success: true, command: data.command });
    });
    return;
  }

  // POST /diff - afficher un diff entre deux fichiers
  if (method === "POST" && route === "/diff") {
    const data = JSON.parse(body);
    exec(`code -d "${data.file1}" "${data.file2}"`, (err) => {
      if (err) respond(res, 500, { error: err.message });
      else respond(res, 200, { success: true });
    });
    return;
  }

  respond(res, 404, { error: "Route inconnue: " + route });
}

server.listen(PORT, "127.0.0.1", () => {
  console.log(`✅ VSCode Bridge démarré sur http://127.0.0.1:${PORT}`);
  console.log(`   Routes disponibles :`);
  console.log(`   GET  /status`);
  console.log(`   POST /open    { "path": "C:\\\\...", "line": 42 }`);
  console.log(`   POST /read    { "path": "C:\\\\..." }`);
  console.log(`   POST /write   { "path": "C:\\\\...", "content": "...", "open": true }`);
  console.log(`   POST /replace { "path": "C:\\\\...", "old_text": "...", "new_text": "..." }`);
  console.log(`   POST /diff    { "file1": "C:\\\\...", "file2": "C:\\\\..." }`);
});
