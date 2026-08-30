// server/src/db.js

/**
 * SQLite database singleton using better-sqlite3.
 * Applies required pragmas and runs schema migrations on first import.
 */

const path = require('path');
const Database = require('better-sqlite3');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, '../../data/stockhouse.db');

// Ensure the data directory exists
const fs = require('fs');
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Create a single Database instance
const db = new Database(DB_PATH, { verbose: console.log });

// Apply SQLite pragmas for performance & safety
function applyPragmas(database) {
  database.pragma('journal_mode = WAL');
  database.pragma('foreign_keys = ON');
  database.pragma('busy_timeout = 5000');
  database.pragma('synchronous = NORMAL');
  // Negative cache_size means number of pages; -20000 ≈ 20k pages (~80MB)
  database.pragma('cache_size = -20000');
  database.pragma('temp_store = MEMORY');
}

applyPragmas(db);

// Run schema if tables do not exist
function runMigrations(database) {
  const schemaPath = path.resolve(__dirname, 'schema.sql');
  const schemaSQL = fs.readFileSync(schemaPath, 'utf-8');
  // Execute each statement individually (better-sqlite3 does not support multiple statements in exec)
  const statements = schemaSQL.split(/;\s*\n/).filter(s => s.trim().length > 0);
  const transaction = database.transaction((stmts) => {
    for (const stmt of stmts) {
      database.exec(stmt + ';');
    }
  });
  try {
    transaction(statements);
    console.log('✅ Database schema applied.');
  } catch (err) {
    console.error('⚠️ Schema migration error (might be already applied):', err.message);
  }
}

runMigrations(db);

module.exports = db;
