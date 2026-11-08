/**
 * Loads COHERE_API_KEY (and anything else) for local scripts: .env / .env.local first, then 1Password CLI.
 * Zero external dependencies. Variables already set in the environment win.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

export function loadEnv(root) {
  // 1. Simple zero-dependency .env loader
  for (const envFile of ['.env', '.env.local']) {
    const fullPath = path.join(root, envFile);
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
