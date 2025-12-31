// scripts/validate-tickers.js

import yahooFinance from "yahoo-finance2";
import pool from "../db.js";

async function validateTickers() {
  const result = await pool.query("SELECT symbol FROM tickers");
  const symbols = result.rows.map(r => r.symbol);
  
  console.log(`Validating ${symbols.length} tickers...`);
  
  const invalidTickers = [];
  
  for (const symbol of symbols) {
    try {
      await yahooFinance.quote(symbol, { 
        validateResult: false,
        fields: ['symbol', 'regularMarketPrice']
      });
      process.stdout.write('.');
    } catch (err) {
      invalidTickers.push(symbol);
      console.log(`\n❌ Invalid: ${symbol}`);
    }
    
    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  console.log(`\n\nFound ${invalidTickers.length} invalid tickers:`);
  console.log(invalidTickers);
  

  if (invalidTickers.length > 0) {
     await pool.query(
      "DELETE FROM tickers WHERE symbol = ANY($1)",
      [invalidTickers]
    );
    console.log(`Deleted ${invalidTickers.length} invalid tickers`);
  }
}

validateTickers();