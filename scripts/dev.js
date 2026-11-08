#!/usr/bin/env node
/**
 * Local development server for Hugo Lafleur's portfolio & agent console.
 * Serves static files from ./mock and routes POST /api/chat to functions/api/chat.js.
 * Zero external dependencies.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { onRequestPost } from '../functions/api/chat.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const STATIC_DIR = path.join(ROOT, 'mock');
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 4173;

// 1. Simple zero-dependency .env loader
function loadEnv() {
  for (const envFile of ['.env', '.env.local']) {
    const fullPath = path.join(ROOT, envFile);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx !== -1) {
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    }
  }

  // 2. Optional: Try 1Password CLI if COHERE_API_KEY is not already set
  if (!process.env.COHERE_API_KEY) {
    try {
      const opCmd = fs.existsSync('/usr/local/bin/op') ? '/usr/local/bin/op' : 'op';
      const opKey = execSync(`${opCmd} item get Cohere --reveal --field apikey-default 2>/dev/null`, {
        encoding: 'utf8',
        timeout: 3000,
      }).trim();
      if (opKey) {
        process.env.COHERE_API_KEY = opKey;
        console.log('🔑 Loaded COHERE_API_KEY directly from 1Password CLI.');
      }
    } catch {
      // 1Password CLI is not signed in or item is not found; quietly proceed
    }
  }
}

loadEnv();

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // Route API: POST /api/chat
  if (pathname === '/api/chat') {
    if (req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Method not allowed' }));
      return;
    }

    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', async () => {
      try {
        const rawBody = Buffer.concat(chunks).toString('utf8');
        const webReq = new Request(`http://${req.headers.host || `localhost:${PORT}`}/api/chat`, {
          method: 'POST',
          headers: req.headers,
          body: rawBody,
        });

        const webRes = await onRequestPost({
          request: webReq,
          env: { COHERE_API_KEY: process.env.COHERE_API_KEY },
          fetchImpl: fetch,
        });

        const resHeaders = {};
        webRes.headers.forEach((v, k) => { resHeaders[k] = v; });

        res.writeHead(webRes.status, resHeaders);
        if (webRes.body) {
          const { Readable } = await import('node:stream');
          Readable.fromWeb(webRes.body).pipe(res);
        } else {
          res.end();
        }
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal dev server error', message: err.message, fallback: true }));
      }
    });
    return;
  }

  // Static files from mock/
  let filePath = path.join(STATIC_DIR, pathname === '/' ? 'index.html' : pathname);

  // Security: prevent directory traversal
  if (!filePath.startsWith(STATIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`\n⚡ Portfolio dev server listening on http://localhost:${PORT}`);
  if (process.env.COHERE_API_KEY) {
    console.log(`🤖 Cohere LLM: ACTIVE (Default enabled)`);
    console.log(`👉 Site URL: http://localhost:${PORT} (or force offline mode: ?llm=0)\n`);
  } else {
    console.log(`ℹ️  Cohere LLM: UNCONFIGURED (Running in offline fallback mode)`);
    console.log(`   To activate: sign in to 1Password ('op signin') or add COHERE_API_KEY to a .env file.\n`);
  }
});
