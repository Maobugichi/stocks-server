import yahooFinance from "yahoo-finance2";
import pool from "../db.js";
import { Router } from "express";
import NodeCache from "node-cache";

const cache = new NodeCache({ 
  stdTTL: 600, 
  checkperiod: 60, 
  useClones: false
});

yahooFinance.setGlobalConfig({
  validation: { logErrors: false, logWarnings: false },
});

const trendingPageRouter = Router();

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Rate limiter to control concurrent requests
class RateLimiter {
  constructor(maxConcurrent = 3, delayMs = 100) {
    this.maxConcurrent = maxConcurrent;
    this.delayMs = delayMs;
    this.queue = [];
    this.running = 0;
  }

  async execute(fn) {
    while (this.running >= this.maxConcurrent) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    this.running++;
    try {
      const result = await fn();
      await delay(this.delayMs);
      return result;
    } finally {
      this.running--;
    }
  }
}

const rateLimiter = new RateLimiter(3, 100);

// Utility function for exponential backoff retry with timeout
async function fetchWithRetry(fetchFn, maxRetries = 3, timeoutMs = 10000) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Wrap fetch with timeout
      const result = await Promise.race([
        fetchFn(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Request timeout')), timeoutMs)
        )
      ]);
      return result;
    } catch (err) {
      const is429 = err.message?.includes('429') || err.message?.includes('Too Many Requests');
      const isTimeout = err.message?.includes('timeout');
      
      if ((is429 || isTimeout) && attempt < maxRetries - 1) {
        const backoffDelay = Math.pow(2, attempt) * 1000;
        console.log(`⏳ ${isTimeout ? 'Timeout' : 'Rate limited'}. Retrying in ${backoffDelay}ms... (attempt ${attempt + 1}/${maxRetries})`);
        await delay(backoffDelay);
      } else {
        throw err;
      }
    }
  }
}

async function getTickersFromDB(limit = 20) {
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
  const BATCH_SIZE = 15;
  
  console.log(`📊 Fetching live data for ${symbols.length} symbols in batches of ${BATCH_SIZE}...`);
  
  const batches = [];
  for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
    batches.push(symbols.slice(i, i + BATCH_SIZE));
  }
  
  const batchPromises = batches.map((batch, index) => 
    rateLimiter.execute(async () => {
      try {
        return await fetchWithRetry(async () => {
          const quotes = await yahooFinance.quote(batch, {
            fields: ['symbol', 'regularMarketPrice', 'regularMarketChange', 
                     'regularMarketChangePercent', 'marketCap', 'regularMarketVolume',
                     'currency', 'fullExchangeName']
          }, { validation: { logErrors: false } });
          
          const quotesArray = Array.isArray(quotes) ? quotes : [quotes];
          
          const batchResults = quotesArray
            .filter(quote => {
              // More robust validation
              if (!quote || typeof quote !== 'object') return false;
              if (!quote.symbol) return false;
              if (typeof quote.regularMarketPrice !== 'number' || quote.regularMarketPrice <= 0) return false;
              return true;
            })
            .map(quote => ({
              symbol: quote.symbol,
              price: quote.regularMarketPrice ?? null,
              changePercent: quote.regularMarketChange ?? null,
              regularMarketChangePercent: quote.regularMarketChangePercent ?? null,
              marketCap: quote.marketCap ?? null,
              volume: quote.regularMarketVolume ?? null,
              currency: quote.currency ?? 'USD',
              exchange: quote.fullExchangeName ?? null,
            }));
          
          console.log(`✅ Batch ${index + 1} successful (${batchResults.length}/${batch.length} valid quotes)`);
          return batchResults;
        }, 3, 8000); // 8 second timeout per batch
      } catch (err) {
        console.error(`❌ Failed for batch ${index + 1} [${batch.join(',')}]: ${err.message}`);
        
        // Try individual fallback for failed batch
        console.log(`🔄 Attempting individual fetch for batch ${index + 1}...`);
        const individualResults = [];
        
        for (const symbol of batch) {
          try {
            const quote = await yahooFinance.quote(symbol, {}, { validation: { logErrors: false } });
            if (quote && quote.symbol && quote.regularMarketPrice) {
              individualResults.push({
                symbol: quote.symbol,
                price: quote.regularMarketPrice ?? null,
                changePercent: quote.regularMarketChange ?? null,
                regularMarketChangePercent: quote.regularMarketChangePercent ?? null,
                marketCap: quote.marketCap ?? null,
                volume: quote.regularMarketVolume ?? null,
                currency: quote.currency ?? 'USD',
                exchange: quote.fullExchangeName ?? null,
              });
            }
          } catch (symbolErr) {
            console.error(`❌ Failed individual fetch for ${symbol}: ${symbolErr.message}`);
          }
        }
        
        console.log(`✅ Individual fallback recovered ${individualResults.length}/${batch.length} quotes`);
        return individualResults;
      }
    })
  );
  
  const batchResults = await Promise.all(batchPromises);
  batchResults.forEach(batch => results.push(...batch));
  
  cache.set(cacheKey, results, 300);
  console.log(`✓ Cached live data (${results.length}/${symbols.length} successful results)`);
  
  return results;
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
    }, 3, 8000); // 8 second timeout
    
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
    }, 3, 8000); // 8 second timeout
    
    const trendingSymbols = trend.quotes.map(q => q.symbol);
    console.log(`📈 Found ${trendingSymbols.length} trending symbols`);
    
    const trendingData = await fetchLiveData(trendingSymbols);
    
    cache.set(cacheKey, trendingData, 600);
    console.log(`✓ Cached trending quotes`);
    
    return trendingData;
  } catch (err) {
    console.error(`❌ Failed to fetch trending symbols: ${err.message}`);
    return [];
  }
}

// Background revalidation function
async function revalidateCache(cacheKey, fetchFunction) {
  console.log(`🔄 Background revalidation started for ${cacheKey}`);
  try {
    const freshData = await fetchFunction();
    cache.set(cacheKey, freshData, 300);
    console.log(`✅ Background revalidation complete for ${cacheKey}`);
  } catch (err) {
    console.error(`❌ Background revalidation failed for ${cacheKey}:`, err.message);
  }
}

trendingPageRouter.get("/trending-stock", async (req, res) => {
  try {
    const cacheKey = 'trending_stock_full';
    
    let cachedResponse = cache.get(cacheKey);
    
    // Stale-while-revalidate: Return cached data immediately if available
    if (cachedResponse) {
      console.log('✓ Cache hit for full trending stock response (stale-while-revalidate)');
      
      // Check if cache is older than 2 minutes - trigger background refresh
      const ttl = cache.getTtl(cacheKey);
      const now = Date.now();
      const age = now - (ttl - 300000); // 300000ms = 5min cache duration
      
      if (age > 120000) { // 2 minutes old
        console.log('🔄 Cache is stale, triggering background revalidation');
        
        // Fire and forget - don't await
        revalidateCache(cacheKey, async () => {
          const tickers = await getTickersFromDB(20);
          
          const [liveData, gainers, losers, active, isTrendingQuote] = await Promise.all([
            fetchLiveData(tickers),
            fetchScreenerData('day_gainers', 300),
            fetchScreenerData('day_losers', 300),
            fetchScreenerData('most_actives', 300),
            fetchTrendingSymbols()
          ]);
          
          return {
            liveData,
            gainers,
            losers,
            active,
            isTrendingQuote
          };
        }).catch(err => console.error('Background revalidation error:', err));
      }
      
      return res.json(cachedResponse);
    }
    
    console.log('🚀 Starting trending stock data fetch (cache miss)...');
    
    const tickers = await getTickersFromDB(20);
    console.log(`📋 Retrieved ${tickers.length} tickers from DB`);
   
    // Fetch everything in parallel with individual timeouts
    const [liveData, gainers, losers, active, isTrendingQuote] = await Promise.all([
      fetchLiveData(tickers).catch(err => {
        console.error('❌ Live data fetch failed:', err.message);
        return [];
      }),
      fetchScreenerData('day_gainers', 300).catch(err => {
        console.error('❌ Gainers fetch failed:', err.message);
        return [];
      }),
      fetchScreenerData('day_losers', 300).catch(err => {
        console.error('❌ Losers fetch failed:', err.message);
        return [];
      }),
      fetchScreenerData('most_actives', 300).catch(err => {
        console.error('❌ Most actives fetch failed:', err.message);
        return [];
      }),
      fetchTrendingSymbols().catch(err => {
        console.error('❌ Trending symbols fetch failed:', err.message);
        return [];
      })
    ]);
    
    const responseData = {
      liveData,
      gainers,
      losers,
      active,
      isTrendingQuote
    };
    
    // Cache full response for 5 minutes
    cache.set(cacheKey, responseData, 300);
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
    }, 3, 8000); // 8 second timeout
    
    cache.set(cacheKey, quote, 300);
    console.log(`✓ Cached search result: ${ticker}`);
    
    res.json(quote);
  } catch (err) {
    console.error(`❌ Error searching for ticker:`, err);
    
    // Better error handling for timeouts
    if (err.message?.includes('timeout')) {
      return res.status(504).json({ 
        error: 'Request timeout',
        message: 'The search request took too long to complete. Please try again.'
      });
    }
    
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