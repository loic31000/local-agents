// extension.js - Local Agents Bridge
// Expose une API HTTP locale sur le port 3333

"use strict";

var vscode = require("vscode");
var http = require("http");

var server = null;

function activate(context) {
    server = http.createServer(function(req, res) {
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type");

        if (req.method === "OPTIONS") {
            res.writeHead(200);
            res.end();
            return;
        }

        var body = "";
        req.on("data", function(chunk) { body += chunk; });
        req.on("end", function() { handleRequest(req, res, body); });
    });

    server.listen(3333, "127.0.0.1", function() {
        vscode.window.showInformationMessage("Local Agents Bridge actif sur port 3333");
    });

    context.subscriptions.push({
        dispose: function() { if (server) server.close(); }
    });
}

function handleRequest(req, res, body) {
    var urlObj = new URL(req.url, "http://localhost");
    var path = urlObj.pathname;

    try {
        // GET /status
        if (req.method === "GET" && path === "/status") {
            var editor = vscode.window.activeTextEditor;
            res.writeHead(200);
            res.end(JSON.stringify({
                active_file: editor ? editor.document.fileName : null,
                language:    editor ? editor.document.languageId : null,
                line:        editor ? editor.selection.active.line + 1 : null,
                workspace:   vscode.workspace.workspaceFolders
                    ? vscode.workspace.workspaceFolders[0].uri.fsPath : null
            }));
            return;
        }

        // GET /active - fichier actif + selection
        if (req.method === "GET" && path === "/active") {
            var ed = vscode.window.activeTextEditor;
            if (!ed) {
                res.writeHead(404);
                res.end(JSON.stringify({ error: "Aucun fichier ouvert" }));
                return;
            }
            res.writeHead(200);
            res.end(JSON.stringify({
                path:      ed.document.fileName,
                content:   ed.document.getText(),
                selection: ed.document.getText(ed.selection) || null,
                language:  ed.document.languageId,
                line:      ed.selection.active.line + 1
            }));
            return;
        }

        // GET /diagnostics - erreurs du fichier actif
        if (req.method === "GET" && path === "/diagnostics") {
            var ed2 = vscode.window.activeTextEditor;
            if (!ed2) {
                res.writeHead(404);
                res.end(JSON.stringify({ error: "Aucun fichier ouvert" }));
                return;
            }
            var diags = vscode.languages.getDiagnostics(ed2.document.uri);
            var result = diags.map(function(d) {
                return {
                    severity: ["Error","Warning","Info","Hint"][d.severity],
                    message:  d.message,
                    line:     d.range.start.line + 1,
                    column:   d.range.start.character + 1,
                    source:   d.source
                };
            });
            res.writeHead(200);
            res.end(JSON.stringify({ diagnostics: result, count: result.length }));
            return;
        }

        // POST /open - ouvrir un fichier
        if (req.method === "POST" && path === "/open") {
            var data = JSON.parse(body);
            var uri = vscode.Uri.file(data.path);
            vscode.workspace.openTextDocument(uri).then(function(doc) {
                return vscode.window.showTextDocument(doc);
            }).then(function(ed3) {
                if (data.line) {
                    var pos = new vscode.Position(Math.max(0, data.line - 1), data.column ? data.column - 1 : 0);
                    ed3.selection = new vscode.Selection(pos, pos);
                    ed3.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
                }
                res.writeHead(200);
                res.end(JSON.stringify({ success: true, path: data.path }));
            });
            return;
        }

        // POST /write - ecrire un fichier
        if (req.method === "POST" && path === "/write") {
            var data2 = JSON.parse(body);
            var uri2 = vscode.Uri.file(data2.path);
            var encoder = new TextEncoder();
            vscode.workspace.fs.writeFile(uri2, encoder.encode(data2.content)).then(function() {
                if (data2.open) {
                    return vscode.workspace.openTextDocument(uri2).then(function(doc) {
                        return vscode.window.showTextDocument(doc);
                    });
                }
            }).then(function() {
                res.writeHead(200);
                res.end(JSON.stringify({ success: true, path: data2.path }));
            });
            return;
        }

        // POST /replace - remplacer du texte
        if (req.method === "POST" && path === "/replace") {
            var data3 = JSON.parse(body);
            var ed4 = vscode.window.activeTextEditor;
            if (!ed4) {
                res.writeHead(404);
                res.end(JSON.stringify({ error: "Aucun editeur actif" }));
                return;
            }
            var text = ed4.document.getText();
            var newText = text.replace(data3.old_text, data3.new_text);
            ed4.edit(function(editBuilder) {
                var start = new vscode.Position(0, 0);
                var end = ed4.document.positionAt(text.length);
                editBuilder.replace(new vscode.Range(start, end), newText);
            }).then(function() {
                res.writeHead(200);
                res.end(JSON.stringify({ success: true }));
            });
            return;
        }

        // POST /terminal - commande dans le terminal integre
        if (req.method === "POST" && path === "/terminal") {
            var data4 = JSON.parse(body);
            var term = vscode.window.activeTerminal || vscode.window.createTerminal("Local Agent");
            term.show();
            term.sendText(data4.command);
            res.writeHead(200);
            res.end(JSON.stringify({ success: true, command: data4.command }));
            return;
        }

        // POST /notify - notification
        if (req.method === "POST" && path === "/notify") {
            var data5 = JSON.parse(body);
            var msg = "Agent: " + data5.message;
            if (data5.type === "error") vscode.window.showErrorMessage(msg);
            else if (data5.type === "warning") vscode.window.showWarningMessage(msg);
            else vscode.window.showInformationMessage(msg);
            res.writeHead(200);
            res.end(JSON.stringify({ success: true }));
            return;
        }

        res.writeHead(404);
        res.end(JSON.stringify({ error: "Route inconnue: " + path }));

    } catch (err) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: err.message }));
    }
}

function deactivate() {
    if (server) server.close();
}

module.exports = { activate: activate, deactivate: deactivate };