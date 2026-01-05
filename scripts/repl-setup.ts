/**
 * Interactive REPL setup script for Freeplay development.
 * 
 * By default, connects to production (app.freeplay.ai).
 * Use --local flag to connect to localhost with SSL bypass.
 * 
 * Usage:
 *   npm run repl          # Production (default)
 *   npm run repl -- --local   # Local development
 */

import { inspect } from 'util';
import repl from 'repl';
import { config } from 'dotenv';
import Freeplay from '../src/index.js';

// Load environment variables from .env file
config();

// Check if running in local mode
const isLocal = process.argv.includes('--local');

if (isLocal) {
  console.log("🔧 Local mode: Disabling SSL verification for localhost...");
  // Disable SSL verification for local development (self-signed certificates)
  // This is safe for local dev but should never be used in production
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

// Get environment variables
const freeplayApiKey = process.env.FREEPLAY_API_KEY;
const projectId = process.env.FREEPLAY_PROJECT_ID;
const sessionId = process.env.FREEPLAY_SESSION_ID;
const datasetId = process.env.FREEPLAY_DATASET_ID;

// Set API base URL
const apiBase = isLocal
  ? (process.env.FREEPLAY_API_URL || 'http://localhost:8000')
  : (process.env.FREEPLAY_API_URL || 'https://app.freeplay.ai');

// Initialize client
let client: Freeplay | null = null;

if (!freeplayApiKey) {
  console.log("⚠️  Warning: FREEPLAY_API_KEY not set in .env");
} else {
  client = new Freeplay({
    freeplayApiKey,
    baseUrl: `${apiBase}/api`,
  });
  console.log("✅ Freeplay client initialized as 'client'");
}

// Print welcome banner
console.log("\n" + "=".repeat(60));
console.log("🎮 Freeplay Interactive REPL (Node.js)");
console.log("=".repeat(60));
console.log("\nMode:", isLocal ? "🔧 Local Development" : "🌐 Production");
console.log("\nAvailable variables:");
console.log("  • client       : Freeplay client instance");
console.log(`  • projectId    : ${projectId || '(not set)'}`);
console.log(`  • sessionId    : ${sessionId || '(not set)'}`);
console.log(`  • datasetId    : ${datasetId || '(not set)'}`);
console.log(`  • apiBase      : ${apiBase}`);

if (isLocal) {
  console.log("\n⚠️  SSL verification disabled for local development");
} else {
  console.log("\n🔒 SSL verification enabled (production mode)");
  console.log("    Use -- --local flag to connect to localhost");
}

console.log("\nAvailable imports:");
console.log("  • Freeplay     : Main SDK class");
console.log("\nExample commands:");
console.log("  await client.metadata.updateSession({");
console.log("    projectId,");
console.log("    sessionId,");
console.log("    metadata: { test_key: 'Hello from Node!' }");
console.log("  });");
console.log("\n" + "=".repeat(60) + "\n");

// Start REPL
const replServer = repl.start({
  prompt: 'freeplay> ',
  useColors: true,
  writer: (output) => inspect(output, { colors: true, depth: 3 }),
});

// Add context variables
replServer.context.client = client;
replServer.context.projectId = projectId;
replServer.context.sessionId = sessionId;
replServer.context.datasetId = datasetId;
replServer.context.apiBase = apiBase;
replServer.context.Freeplay = Freeplay;

