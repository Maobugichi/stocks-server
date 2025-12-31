import fs from 'fs';
import csv from 'csv-parser';
import pool from './db.js';

const CSV_FILE = './tickers.csv';

// --- Array to hold tickers ---
const tickers = [];

// --- Utility to clean strings ---
const cleanString = (str) => str?.toString().trim().replace(/^"|"$/g, '') || null;

// --- Read CSV ---
fs.createReadStream(CSV_FILE)
  .pipe(csv({ headers: false })) // no header row
  .on('data', (row) => {
    const symbol = cleanString(row[0]);
    const name = cleanString(row[1]);
    const country = cleanString(row[6]);
    const exchange = cleanString(row[10]) || "UNKNOWN"; // column 10 for exchange or fallback

    if (symbol && name && country) {
      tickers.push({ symbol, name, country, exchange });
    }
  })
  .on('end', async () => {
    console.log(`Parsed ${tickers.length} valid tickers`);

    if (tickers.length === 0) return;

    const client = await pool.connect();
    try {
      // Build bulk insert query
      const values = [];
      const placeholders = tickers.map((t, i) => {
        const idx = i * 4;
        values.push(t.symbol, t.name, t.country, t.exchange);
        return `($${idx + 1}, $${idx + 2}, $${idx + 3}, $${idx + 4})`;
      }).join(',');

      const query = `
        INSERT INTO tickers(symbol, name, country, exchange)
        VALUES ${placeholders}
        ON CONFLICT (symbol) DO NOTHING
      `;

      await client.query(query, values);
      console.log('All tickers inserted successfully!');
    } catch (err) {
      console.error('Error inserting tickers:', err);
    } finally {
      client.release();
      pool.end();
    }
  });
