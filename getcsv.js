import puppeteer from "puppeteer";
import pool from "./db.js";

// Working data sources - focus on actual stock constituents, not index metadata
const SOURCES = [
  // Verified working direct URLs for actual stock tickers
  {
    url: "https://raw.githubusercontent.com/datasets/s-and-p-500-companies/main/data/constituents.csv",
    exchange: "NYSE/NASDAQ",
    country: "USA",
    direct: true
  },
  
  // Direct raw URLs for comprehensive ticker lists
  {
    url: "https://raw.githubusercontent.com/rreichel3/US-Stock-Symbols/main/nyse/nyse_full_tickers.csv",
    exchange: "NYSE",
    country: "USA",
    direct: true
  },
  {
    url: "https://raw.githubusercontent.com/rreichel3/US-Stock-Symbols/main/nasdaq/nasdaq_full_tickers.csv",
    exchange: "NASDAQ",
    country: "USA", 
    direct: true
  },
  {
    url: "https://raw.githubusercontent.com/rreichel3/US-Stock-Symbols/main/amex/amex_full_tickers.csv",
    exchange: "AMEX",
    country: "USA",
    direct: true
  },

  // Try alternative repos with actual ticker data
  {
    url: "https://raw.githubusercontent.com/datasets/nasdaq-listings/master/data/nasdaq-listed.csv",
    exchange: "NASDAQ",
    country: "USA",
    direct: true
  },
  
  // UK/European sources
  {
    url: "https://raw.githubusercontent.com/datasets/ftse-100/master/data/constituents.csv", 
    exchange: "LSE",
    country: "UK",
    direct: true
  },
  
  // GitHub repos that should have constituent data, not index metadata
  {
    url: "https://github.com/datasets/dax",
    exchange: "XETRA",
    country: "Germany",
    csvPath: "data/constituents.csv"
  },
  {
    url: "https://github.com/datasets/ftse-100",
    exchange: "LSE", 
    country: "UK",
    csvPath: "data/constituents.csv"
  },
  {
    url: "https://github.com/datasets/nikkei-225", 
    exchange: "TSE",
    country: "Japan",
    csvPath: "data/constituents.csv"
  },
  {
    url: "https://github.com/datasets/hang-seng",
    exchange: "HKEX",
    country: "Hong Kong", 
    csvPath: "data/constituents.csv"
  },

  // African Stock Exchanges - HTML table scraping
  {
    url: "https://www.african-markets.com/en/stock-markets/ngse/listed-companies",
    exchange: "NGX",
    country: "Nigeria",
    scrapeType: "htmlTable",
    selectors: {
      table: "table.table",
      rows: "tbody tr",
      company: "td:nth-child(1) a",
      symbol: "td:nth-child(1) a", // Extract symbol from link or text
      sector: "td:nth-child(2)",
      price: "td:nth-child(3)"
    }
  },
  {
    url: "https://www.african-markets.com/en/stock-markets/jse/listed-companies",
    exchange: "JSE", 
    country: "South Africa",
    scrapeType: "htmlTable",
    selectors: {
      table: "table.table",
      rows: "tbody tr", 
      company: "td:nth-child(1) a",
      symbol: "td:nth-child(1) a",
      sector: "td:nth-child(2)",
      price: "td:nth-child(3)"
    }
  },
  {
    url: "https://www.african-markets.com/en/stock-markets/gse/listed-companies",
    exchange: "GSE",
    country: "Ghana", 
    scrapeType: "htmlTable",
    selectors: {
      table: "table.table",
      rows: "tbody tr",
      company: "td:nth-child(1) a", 
      symbol: "td:nth-child(1) a",
      sector: "td:nth-child(2)",
      price: "td:nth-child(3)"
    }
  },
  {
    url: "https://www.african-markets.com/en/stock-markets/brvm/listed-companies",
    exchange: "BRVM",
    country: "Morocco",
    scrapeType: "htmlTable", 
    selectors: {
      table: "table.table",
      rows: "tbody tr",
      company: "td:nth-child(1) a",
      symbol: "td:nth-child(1) a",
      sector: "td:nth-child(2)", 
      price: "td:nth-child(3)"
    }
  }
];

function parseCSV(csvString) {
  try {
    const lines = csvString.split('\n').map(line => line.trim()).filter(Boolean);
    if (lines.length < 2) return [];
    
    const [header, ...rows] = lines;
    const columns = header.split(',').map(col => col.replace(/"/g, '').trim());
    
    return rows.map(row => {
      // Handle CSV with quoted values and commas inside quotes
      const values = [];
      let current = '';
      let inQuotes = false;
      
      for (let i = 0; i < row.length; i++) {
        const char = row[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          values.push(current.trim().replace(/"/g, ''));
          current = '';
        } else {
          current += char;
        }
      }
      values.push(current.trim().replace(/"/g, ''));
      
      const obj = {};
      columns.forEach((col, i) => {
        obj[col] = values[i] || '';
      });
      return obj;
    }).filter(obj => Object.values(obj).some(val => val)); // Filter empty rows
  } catch (error) {
    console.error('CSV parsing error:', error.message);
    return [];
  }
}

async function saveTickers(tickers, exchange, country) {
  const client = await pool.connect();
  try {
    let inserted = 0;
    for (const t of tickers) {
      // Try multiple possible column names for symbol and name
      const symbol = t.Symbol || t.symbol || t.Ticker || t.ticker || t.Code || t.code || t.SYMBOL;
      const name = t.Name || t.name || t.Security || t.security || t.Company || t.company || 
                  t.COMPANY || t.SECURITY || t['Company Name'] || t['Security Name'] || '';
      
      if (!symbol || symbol.length < 1) continue;

      try {
        await pool.query(
          `INSERT INTO tickers (symbol, name, exchange, country)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (symbol) DO UPDATE SET
           name = EXCLUDED.name,
           exchange = EXCLUDED.exchange,
           country = EXCLUDED.country`,
          [symbol.trim(), name.trim(), exchange, country]
        );
        inserted++;
      } catch (dbError) {
        console.error(`Database error for ${symbol}:`, dbError.message);
      }
    }
    console.log(`✅ Inserted ${inserted}/${tickers.length} tickers for ${exchange} (${country})`);
  } catch (error) {
    console.error(`Database connection error for ${exchange}:`, error.message);
  } finally {
    client.release();
  }
}

async function fetchDirectCSV(page, url) {
  try {
    console.log(`  📡 Fetching direct URL: ${url}`);
    await page.goto(url, { 
      waitUntil: "networkidle2", 
      timeout: 15000 
    });
    
    const content = await page.evaluate(() => document.body.innerText);
    
    if (!content || content.length < 100) {
      throw new Error('Content too short or empty');
    }
    
    // Check if it's actually CSV content
    if (!content.includes(',') || !content.includes('\n')) {
      throw new Error('Content does not appear to be CSV format');
    }
    
    return content;
  } catch (error) {
    console.error(`  ❌ Direct fetch failed: ${error.message}`);
    throw error;
  }
}

async function fetchFromGitHubRepo(page, url, csvPath) {
  try {
    console.log(`  📂 Navigating GitHub repo: ${url}`);
    await page.goto(url, { waitUntil: "networkidle2", timeout: 15000 });
    
    // Try to find the CSV file
    const possibleSelectors = [
      `a[href$="${csvPath}"]`,
      `a[title$=".csv"]`,
      'a.js-navigation-open[title*=".csv"]',
      'a[href*=".csv"]'
    ];
    
    let csvUrl = null;
    for (const selector of possibleSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 3000 });
        csvUrl = await page.$eval(selector, el => el.href);
        if (csvUrl) break;
      } catch (e) {
        continue;
      }
    }
    
    if (!csvUrl) {
      throw new Error('Could not find CSV file in repository');
    }
    
    console.log(`  📄 Found CSV file, navigating to: ${csvUrl}`);
    await page.goto(csvUrl, { waitUntil: "networkidle2", timeout: 15000 });
    
    // Try to get raw content
    try {
      await page.waitForSelector('a[data-testid="raw-button"]', { timeout: 5000 });
      const rawUrl = await page.$eval('a[data-testid="raw-button"]', el => el.href);
      console.log(`  📥 Getting raw content from: ${rawUrl}`);
      
      await page.goto(rawUrl, { waitUntil: "networkidle2", timeout: 15000 });
      return await page.evaluate(() => document.body.innerText);
    } catch (rawError) {
      console.log(`  ⚠️  Raw button not found, trying alternative...`);
      
      // Try to get content directly from the page
      const content = await page.evaluate(() => {
        const codeBlock = document.querySelector('table.highlight tbody tr td.blob-code');
        if (codeBlock) {
          return codeBlock.innerText;
        }
        return document.body.innerText;
      });
      
      if (content && content.includes(',')) {
        return content;
      }
      
      throw new Error('Could not extract CSV content');
    }
  } catch (error) {
    console.error(`  ❌ GitHub repo fetch failed: ${error.message}`);
    throw error;
  }
}

// Fetch data from HTML tables (for African exchanges)
const fetchFromHtmlTable = async (page, url, selectors) => {
  try {
    console.log(`  🌍 Scraping HTML table from: ${url}`);
    await page.goto(url, { waitUntil: "networkidle2", timeout: 20000 });
    
    // Wait for table to load
    await page.waitForSelector(selectors.table, { timeout: 10000 });
    
    // Extract data from table
    const tableData = await page.evaluate((sel) => {
      const rows = document.querySelectorAll(sel.rows);
      const results = [];
      
      for (const row of rows) {
        try {
          const companyElement = row.querySelector(sel.company);
          const sectorElement = row.querySelector(sel.sector);
          const priceElement = row.querySelector(sel.price);
          
          if (companyElement) {
            // Extract symbol from company text or link
            let symbol = '';
            let name = companyElement.textContent.trim();
            
            // Try to extract symbol from parentheses like "Company Name (SYMBOL)"
            const symbolMatch = name.match(/\(([A-Z0-9]+)\)$/);
            if (symbolMatch) {
              symbol = symbolMatch[1];
              name = name.replace(/\s*\([A-Z0-9]+\)$/, '').trim();
            } else {
              // If no parentheses, use the link href or text as symbol
              const href = companyElement.getAttribute('href');
              if (href) {
                const hrefSymbol = href.split('/').pop();
                symbol = hrefSymbol.toUpperCase();
              } else {
                // Last resort: use first few words as symbol
                symbol = name.split(' ')[0].toUpperCase().slice(0, 6);
              }
            }
            
            results.push({
              Symbol: symbol,
              Name: name,
              Sector: sectorElement ? sectorElement.textContent.trim() : '',
              Price: priceElement ? priceElement.textContent.trim() : ''
            });
          }
        } catch (rowError) {
          console.log('Error processing row:', rowError.message);
        }
      }
      
      return results;
    }, selectors);
    
    console.log(`  ✅ Extracted ${tableData.length} companies from HTML table`);
    return tableData;
    
  } catch (error) {
    console.error(`  ❌ HTML table scraping failed: ${error.message}`);
    throw error;
  }
};

async function main() {
  console.log("🚀 Starting global ticker data collection...\n");
  
  const browser = await puppeteer.launch({ 
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu'
    ]
  });
  
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
  
  let successCount = 0;
  let totalSources = SOURCES.length;
  
  for (const source of SOURCES) {
    try {
      console.log(`📥 Processing ${source.exchange} (${source.country})...`);
      
      // Skip backup sources if primary worked
      if (source.backup && successCount > 0) {
        console.log(`  ⏭️  Skipping backup source, primary already succeeded`);
        continue;
      }
      
      if (source.direct) {
        // Direct CSV URL
        const csv = await fetchDirectCSV(page, source.url);
        const tickers = parseCSV(csv);
        
        if (tickers.length === 0) {
          console.log(`  ⚠️  No valid tickers parsed from CSV`);
          continue;
        }
        
        await saveTickers(tickers, source.exchange, source.country);
        successCount++;
      } else if (source.scrapeType === 'htmlTable') {
        // HTML table scraping for African exchanges
        const tickers = await fetchFromHtmlTable(page, source.url, source.selectors);
        
        if (tickers.length === 0) {
          console.log(`  ⚠️  No valid tickers scraped from HTML table`);
          continue;
        }
        
        await saveTickers(tickers, source.exchange, source.country);
        successCount++;
      } else {
        // GitHub repository navigation
        const csv = await fetchFromGitHubRepo(page, source.url, source.csvPath);
        const tickers = parseCSV(csv);
        
        if (tickers.length === 0) {
          console.log(`  ⚠️  No valid tickers parsed from CSV`);
          continue;
        }
        
        await saveTickers(tickers, source.exchange, source.country);
        successCount++;
      }
      
      // Small delay between sources
      await new Promise(resolve => setTimeout(resolve, 1500));
      
    } catch (err) {
      console.error(`❌ Failed for ${source.exchange} (${source.country}): ${err.message}`);
      
      // Try to continue with other sources
      continue;
    }
  }
  
  await browser.close();
  
  console.log(`\n🎉 Global ticker collection complete!`);
  console.log(`✅ Successfully processed: ${successCount}/${totalSources} sources`);
  
  // Get final count from database
  try {
    const result = await pool.query('SELECT COUNT(*) as total FROM tickers');
    console.log(`📊 Total tickers in database: ${result.rows[0].total}`);
    
    const exchangeCounts = await pool.query(`
      SELECT exchange, country, COUNT(*) as count 
      FROM tickers 
      GROUP BY exchange, country 
      ORDER BY count DESC
    `);
    
    console.log('\n📈 Breakdown by exchange:');
    exchangeCounts.rows.forEach(row => {
      console.log(`  ${row.exchange} (${row.country}): ${row.count} tickers`);
    });
    
  } catch (dbError) {
    console.error('Error getting database stats:', dbError.message);
  }
  
  process.exit(0);
}

main().catch((err) => {
  console.error("💥 Critical error:", err);
  process.exit(1);
});