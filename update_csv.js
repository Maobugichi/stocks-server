import axios from 'axios';
import puppeteer from 'puppeteer';
import cron from 'node-cron';
import fs from 'fs';

// Static sector/industry mapping (expand as needed)
const sectorMap = {
  'DANGCEM.LG': { sector: 'Industrials', industry: 'Cement Production' },
  'MTNN.LG': { sector: 'Telecommunications', industry: 'Mobile Services' },
  'ACCESSCORP.LG': { sector: 'Financials', industry: 'Banking' },
  'ZENITHBANK.LG': { sector: 'Financials', industry: 'Banking' },
  'GTCO.LG': { sector: 'Financials', industry: 'Banking' }
  // Add more from https://www.investing.com/equities/nigeria
};

async function scrape() {
  let stocks = [];

  
  let browser;
  try {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    
   
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36', {
      userAgentData: {
        brands: [
          { brand: 'Chromium', version: '129' },
          { brand: 'Google Chrome', version: '129' }
        ],
        fullVersionList: [
          { brand: 'Chromium', version: '129.0.6668.100' },
          { brand: 'Google Chrome', version: '129.0.6668.100' }
        ],
        platform: 'Windows',
        platformVersion: '10.0.0',
        architecture: 'x86',
        model: '',
        mobile: false
      }
    });

    await page.goto('https://ngxgroup.com/exchange/data/equities-price-list/', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    
    await page.waitForSelector('table tbody tr', { timeout: 10000 }).catch(() => {
      console.warn('No table found after waiting, proceeding anyway');
    });

    stocks = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('table tbody tr'));
      console.log(rows)
      console.log('Puppeteer found rows:', rows.length); 
      return rows.map(row => {
        const cols = row.querySelectorAll('td');
        if (cols.length >= 3) {
          return {
            symbol: cols[0].textContent.trim() + '.LG',
            name: cols[1].textContent.trim() || 'Unknown',
            sector: 'Unknown',
            industry: 'Unknown',
            price: parseFloat(cols[2].textContent.trim().replace('N', '')) || 0
          };
        }
        return null;
      }).filter(s => s);
    });

    console.log('NGX scraped stocks:', stocks.length);
    if (stocks.length > 0) {
      // Apply sector mapping
      stocks.forEach(s => {
        const map = sectorMap[s.symbol];
        if (map) {
          s.sector = map.sector;
          s.industry = map.industry;
        }
      });
      fs.writeFileSync(
        './data/ng_stocks.csv',
        'symbol,name,sector,industry,price\n' +
          stocks.map(s => `${s.symbol},"${s.name}",${s.sector},${s.industry},${s.price}`).join('\n')
      );
      console.log(`Updated NGX CSV with ${stocks.length} stocks`);
      await browser.close();
      return;
    } else {
      console.warn('NGX scrape returned 0 stocks, falling back to AFX');
    }
  } catch (err) {
    console.error('NGX scrape failed:', err.message);
  } finally {
    if (browser) await browser.close();
  }

  // Fallback to AFX API (fresh data)
  try {
    const response = await axios.get('https://afx.kwayisi.org/ngx/api/stocks', {
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    stocks = response.data.map(s => ({
      symbol: s.symbol + '.LG',
      name: s.name || 'Unknown',
      sector: sectorMap[s.symbol + '.LG']?.sector || 'Unknown',
      industry: sectorMap[s.symbol + '.LG']?.industry || 'Unknown',
      price: s.price || 0
    }));

    console.log('AFX scraped stocks:', stocks.length);
    if (stocks.length > 0) {
      fs.writeFileSync(
        './data/ng_stocks.csv',
        'symbol,name,sector,industry,price\n' +
          stocks.map(s => `${s.symbol},"${s.name}",${s.sector},${s.industry},${s.price}`).join('\n')
      );
      console.log(`Updated AFX NG CSV with ${stocks.length} stocks`);
    } else {
      console.error('AFX API returned 0 stocks, no data written');
    }
  } catch (afxErr) {
    console.error('AFX fallback failed:', afxErr.message);
    console.error('No fresh data available, CSV not updated');
  }
}

// Schedule post-NGX market close (3:00 PM WAT)
cron.schedule('0 15 * * *', scrape);
scrape(); // Run on startup

export { scrape };