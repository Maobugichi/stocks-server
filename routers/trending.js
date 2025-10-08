import yahooFinance from "yahoo-finance2";
import pool from "../db.js";
import { Router } from "express";
import NodeCache from "node-cache";

const cache = new NodeCache({ 
  stdTTL: 600, // 10 minutes default TTL (increased from 5)
  checkperiod: 60, 
  useClones: false
});

yahooFinance.setGlobalConfig({
  validation: { logErrors: false, logWarnings: false },
});

const trendingPageRouter = Router();

// Utility function to add delay between requests
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Utility function for exponential backoff retry
async function fetchWithRetry(fetchFn, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fetchFn();
    } catch (err) {
      const is429 = err.message?.includes('429') || err.message?.includes('Too Many Requests');
      
      if (is429 && attempt < maxRetries - 1) {
        const backoffDelay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
        console.log(`⏳ Rate limited. Retrying in ${backoffDelay}ms... (attempt ${attempt + 1}/${maxRetries})`);
        await delay(backoffDelay);
      } else {
        throw err;
      }
    }
  }
}

async function getTickersFromDB(limit = 25) {
  const cacheKey = `tickers_${limit}`;
  
  let cachedTickers = cache.get(cacheKey);
  if (cachedTickers) {
    console.log(`✓ Cache hit for ${cacheKey}`);
    return cachedTickers;
  }

  const res = await pool.query(
    "SELECT symbol FROM tickers ORDER BY random() LIMIT $1",
    [limit]
  );
  const tickers = res.rows.map(r => r.symbol);
  
  // Cache for 15 minutes
  cache.set(cacheKey, tickers, 900);
  console.log(`✓ Cached ${cacheKey}`);
  
  return tickers;
}

async function fetchLiveData(symbols) {
  const cacheKey = `live_data_${symbols.sort().join('_')}`;
  
  let cachedData = cache.get(cacheKey);
  if (cachedData) {
    console.log(`✓ Cache hit for live data`);
    return cachedData;
  }
  
  const results = [];
  const BATCH_SIZE = 10; // Fetch 10 symbols at a time
  const DELAY_BETWEEN_BATCHES = 1200; // 1.2 seconds between batches
  
  console.log(`📊 Fetching live data for ${symbols.length} symbols in batches of ${BATCH_SIZE}...`);
  
  for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
    const batch = symbols.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(symbols.length / BATCH_SIZE);
    
    console.log(`📦 Processing batch ${batchNum}/${totalBatches}: ${batch.join(', ')}`);
    
    try {
      await fetchWithRetry(async () => {
        const quotes = await yahooFinance.quote(batch);
        const quotesArray = Array.isArray(quotes) ? quotes : [quotes];
        
        for (const quote of quotesArray) {
          if (quote && quote.symbol && quote.regularMarketPrice) {
            results.push({
              symbol: quote.symbol,
              price: quote.regularMarketPrice ?? null,
              changePercent: quote.regularMarketChange ?? null,
              regularMarketChangePercent: quote.regularMarketChangePercent ?? null,
              marketCap: quote.marketCap ?? null,
              volume: quote.regularMarketVolume ?? null,
              currency: quote.currency ?? null,
              exchange: quote.fullExchangeName ?? null,
            });
          }
        }
        
        console.log(`✅ Batch ${batchNum} successful (${quotesArray.length} quotes)`);
      });
    } catch (err) {
      console.error(`❌ Failed for batch ${batchNum} [${batch.join(',')}]: ${err.message}`);
    }
    
    // Add delay between batches (except for the last batch)
    if (i + BATCH_SIZE < symbols.length) {
      await delay(DELAY_BETWEEN_BATCHES);
    }
  }
  
  // Cache for 5 minutes
  cache.set(cacheKey, results, 300);
  console.log(`✓ Cached live data (${results.length} results)`);
  
  return results;
}

async function fetchNews(symbols) {
  const cacheKey = `news_${symbols.sort().join('_')}`;
  
  let cachedNews = cache.get(cacheKey);
  if (cachedNews) {
    console.log(`✓ Cache hit for news`);
    return cachedNews;
  }
  
  const result = [];
  const DELAY_BETWEEN_REQUESTS = 300; // 300ms delay between news requests
  
  console.log(`📰 Fetching news for ${symbols.length} symbols...`);

  for (let i = 0; i < symbols.length; i++) {
    const symbol = symbols[i];
    
    try {
      await fetchWithRetry(async () => {
        const news_data = await yahooFinance.search(symbol, { newsCount: 10 });

        const validQuotes = (news_data.quotes || []).filter(
          q => q.quoteType !== "MONEY_MARKET"
        );

        const news = (news_data.news || []).map(n => ({
          title: n.title,
          publisher: n.publisher,
          link: n.link,
          published: n.providerPublishTime * 1000,
        }));

        result.push({ symbol, validQuotes, news });
      });
      
      console.log(`✅ News fetched for ${symbol}`);
    } catch (err) {
      console.error(`❌ Failed to fetch news for ${symbol}: ${err.message}`);
    }
    
    // Add delay between requests (except for the last one)
    if (i < symbols.length - 1) {
      await delay(DELAY_BETWEEN_REQUESTS);
    }
  }

  // Cache for 15 minutes since news doesn't change frequently
  cache.set(cacheKey, result, 900);
  console.log(`✓ Cached news data (${result.length} results)`);
  
  return result;
}

async function fetchScreenerData(screnerId, cacheDuration = 300) {
  const cacheKey = `screener_${screnerId}`;
  
  let cached = cache.get(cacheKey);
  if (cached) {
    console.log(`✓ Cache hit for ${screnerId}`);
    return cached;
  }
  
  try {
    const data = await fetchWithRetry(async () => {
      return await yahooFinance.screener({ scrIds: screnerId, count: 10 });
    });
    
    const formatted = data.quotes.map(q => ({
      symbol: q.symbol,
      name: q.shortName,
      price: q.regularMarketPrice,
      changePercent: q.regularMarketChangePercent,
      volume: q.regularMarketVolume,
      marketCap: q.marketCap,
    }));
    
    cache.set(cacheKey, formatted, cacheDuration);
    console.log(`✓ Cached ${screnerId}`);
    
    return formatted;
  } catch (err) {
    console.error(`❌ Failed to fetch ${screnerId}: ${err.message}`);
    return [];
  }
}

async function fetchTrendingSymbols() {
  const cacheKey = 'trending_quotes';
  
  let cached = cache.get(cacheKey);
  if (cached) {
    console.log(`✓ Cache hit for trending quotes`);
    return cached;
  }
  
  try {
    const trend = await fetchWithRetry(async () => {
      return await yahooFinance.trendingSymbols('US');
    });
    
    const trendingSymbols = trend.quotes.map(q => q.symbol);
    console.log(`📈 Found ${trendingSymbols.length} trending symbols`);
    
    // Fetch live data for trending symbols
    const trendingData = await fetchLiveData(trendingSymbols);
    
    // Cache for 10 minutes
    cache.set(cacheKey, trendingData, 600);
    console.log(`✓ Cached trending quotes`);
    
    return trendingData;
  } catch (err) {
    console.error(`❌ Failed to fetch trending symbols: ${err.message}`);
    return [];
  }
}

trendingPageRouter.get("/trending-stock", async (req, res) => {
  try {
    const cacheKey = 'trending_stock_full';
    
    let cachedResponse = cache.get(cacheKey);
    if (cachedResponse) {
      console.log('✓ Cache hit for full trending stock response');
      return res.json(cachedResponse);
    }
    
    console.log('🚀 Starting trending stock data fetch...');
    
    // Fetch tickers from DB (reduced from 50 to 25)
    const tickers = await getTickersFromDB(25);
    console.log(`📋 Retrieved ${tickers.length} tickers from DB`);
    
    // Fetch all data with delays built in
    const [liveData, gainers, losers, active, isTrendingQuote] = await Promise.all([
      fetchLiveData(tickers),
      fetchScreenerData('day_gainers', 300),
      fetchScreenerData('day_losers', 300),
      fetchScreenerData('most_actives', 300),
      fetchTrendingSymbols()
    ]);
    
    // Add delay before fetching news to spread out requests
    await delay(500);
    const news = await fetchNews(tickers);
    
    const responseData = {
      liveData,
      gainers,
      losers,
      active,
      isTrendingQuote,
      news
    };
    
    // Cache full response for 3 minutes
    cache.set(cacheKey, responseData, 180);
    console.log('✅ Trending stock data fetch complete!');
    
    res.json(responseData);
  } catch (err) {
    console.error('❌ Error in /trending-stock:', err);
    res.status(500).json({ 
      error: 'Failed to fetch trending stock data',
      message: err.message 
    });
  }
});

trendingPageRouter.get('/trending-search', async (req, res) => {
  try {
    const ticker = req.query.ticker || req.query.symbol;
    
    if (!ticker) {
      return res.status(400).json({ error: 'Ticker symbol is required' });
    }
    
    const cacheKey = `search_${ticker}`;
    
    let cachedQuote = cache.get(cacheKey);
    if (cachedQuote) {
      console.log(`✓ Cache hit for search: ${ticker}`);
      return res.json(cachedQuote);
    }
    
    const quote = await fetchWithRetry(async () => {
      return await yahooFinance.quote(ticker);
    });
    
    // Cache for 5 minutes
    cache.set(cacheKey, quote, 300);
    console.log(`✓ Cached search result: ${ticker}`);
    
    res.json(quote);
  } catch (err) {
    console.error(`❌ Error searching for ticker:`, err);
    res.status(500).json({ 
      error: 'Failed to fetch quote',
      message: err.message 
    });
  }
});

trendingPageRouter.get('/cache-stats', (req, res) => {
  const stats = cache.getStats();
  const keys = cache.keys();
  
  res.json({
    totalKeys: keys.length,
    keys: keys,
    hits: stats.hits,
    misses: stats.misses,
    hitRate: ((stats.hits / (stats.hits + stats.misses)) * 100).toFixed(2) + '%' || '0%',
    memoryUsage: {
      heapUsed: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`,
      heapTotal: `${(process.memoryUsage().heapTotal / 1024 / 1024).toFixed(2)} MB`,
    }
  });
});

trendingPageRouter.delete('/cache', (req, res) => {
  const deletedCount = cache.keys().length;
  cache.flushAll();
  console.log(`🗑️ Cleared ${deletedCount} cache entries`);
  res.json({ 
    message: `Cleared ${deletedCount} cache entries`,
    success: true 
  });
});

// Optional: Clear specific cache entry
trendingPageRouter.delete('/cache/:key', (req, res) => {
  const { key } = req.params;
  const deleted = cache.del(key);
  
  if (deleted) {
    console.log(`🗑️ Cleared cache entry: ${key}`);
    res.json({ message: `Cleared cache entry: ${key}`, success: true });
  } else {
    res.status(404).json({ message: 'Cache key not found', success: false });
  }
});

export default trendingPageRouter;