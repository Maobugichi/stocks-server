import yahooFinance from "yahoo-finance2";
import pool from "../db.js";
import { Router } from "express";
import NodeCache from "node-cache";
import pLimit from "p-limit"; 


const CONFIG = {
  CACHE_TTL: {
    TICKERS: 900,       
    LIVE_DATA: 300,     
    SCREENER: 300,       
    TRENDING: 600,       
    SEARCH: 300,         
    FULL_RESPONSE: 300,  
  },
  RATE_LIMIT: {
    MAX_CONCURRENT: 3,
    DELAY_MS: 100,
  },
  RETRY: {
    MAX_ATTEMPTS: 3,
    TIMEOUT_MS: 8000,
    BASE_BACKOFF_MS: 1000,
  },
  BATCH_SIZE: 15,
  STALE_THRESHOLD_MS: 120000, 
};


const cache = new NodeCache({ 
  stdTTL: CONFIG.CACHE_TTL.FULL_RESPONSE, 
  checkperiod: 60, 
  useClones: false, 
  maxKeys: 500,     
});

yahooFinance.setGlobalConfig({
  validation: { logErrors: false, logWarnings: false },
});

const trendingPageRouter = Router();


const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));


const limiter = pLimit(CONFIG.RATE_LIMIT.MAX_CONCURRENT);


async function fetchWithRetry(fetchFn, options = {}) {
  const {
    maxRetries = CONFIG.RETRY.MAX_ATTEMPTS,
    timeoutMs = CONFIG.RETRY.TIMEOUT_MS,
    context = 'unknown',
  } = options;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const result = await Promise.race([
        fetchFn(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Request timeout')), timeoutMs)
        )
      ]);
      
      
      if (attempt > 0) await delay(CONFIG.RATE_LIMIT.DELAY_MS);
      
      return result;
    } catch (err) {
      const is429 = err.message?.includes('429') || err.message?.includes('Too Many Requests');
      const isTimeout = err.message?.includes('timeout');
      const isLastAttempt = attempt === maxRetries - 1;
      
      if ((is429 || isTimeout) && !isLastAttempt) {
        const backoffDelay = Math.min(
          CONFIG.RETRY.BASE_BACKOFF_MS * Math.pow(2, attempt),
          10000 // Max 10 seconds
        );
        console.log(` [${context}] ${isTimeout ? 'Timeout' : 'Rate limited'}. Retry ${attempt + 1}/${maxRetries} in ${backoffDelay}ms`);
        await delay(backoffDelay);
      } else {
        console.error(`❌ [${context}] Failed after ${attempt + 1} attempts:`, err.message);
        throw err;
      }
    }
  }
}


function getCached(key) {
  const cached = cache.get(key);
  if (cached) {
    return { data: cached.data, cachedAt: cached.cachedAt, hit: true };
  }
  return { data: null, hit: false };
}


function setCached(key, data, ttl = CONFIG.CACHE_TTL.FULL_RESPONSE) {
  cache.set(key, { data, cachedAt: Date.now() }, ttl);
}



function isCacheStale(key, thresholdMs = CONFIG.STALE_THRESHOLD_MS) {
  const cached = cache.get(key);
  if (!cached?.cachedAt) return false;
  return Date.now() - cached.cachedAt > thresholdMs;
}



async function getTickersFromDB(limit = 20) {
  const cacheKey = `tickers_${limit}`;
  
  const { data, hit } = getCached(cacheKey);
  if (hit) return data;

  try {
    const res = await pool.query(
      "SELECT symbol FROM tickers ORDER BY random() LIMIT $1",
      [limit]
    );
    const tickers = res.rows.map(r => r.symbol);
    
    setCached(cacheKey, tickers, CONFIG.CACHE_TTL.TICKERS);
    return tickers;
  } catch (err) {
    console.error('❌ DB query failed:', err.message);
    throw new Error('Failed to fetch tickers from database');
  }
}


function formatQuote(quote) {
  if (!quote?.symbol) return null;

  return {
    symbol: quote.symbol,
    price: typeof quote.regularMarketPrice === 'number'
      ? quote.regularMarketPrice
      : null,
    changePercent: quote.regularMarketChangePercent ?? null,
    marketCap: quote.marketCap ?? null,
    volume: quote.regularMarketVolume ?? null,
    currency: quote.currency ?? 'USD',
    exchange: quote.fullExchangeName ?? 'N/A',
  };
}




async function fetchLiveData(symbols) {
  if (!symbols?.length) return [];
  
  const cacheKey = `live_data_${symbols.sort().join('_')}`;
  const { data, hit } = getCached(cacheKey);
  if (hit) return data;
  
  console.log(`Fetching ${symbols.length} quotes in batches of ${CONFIG.BATCH_SIZE}...`);
  
  // Split into batches
  const batches = [];
  for (let i = 0; i < symbols.length; i += CONFIG.BATCH_SIZE) {
    batches.push(symbols.slice(i, i + CONFIG.BATCH_SIZE));
  }
  
  // Process batches with concurrency control
  const results = await Promise.all(
    batches.map((batch, idx) => 
      limiter(() => fetchBatchWithFallback(batch, idx))
    )
  );
  
  const flatResults = results.flat().filter(Boolean);
  
 if (flatResults.length > 0) {
    setCached(cacheKey, flatResults, CONFIG.CACHE_TTL.LIVE_DATA);
  } else {
    console.warn(`⚠️ Skipping cache for ${cacheKey} (empty result)`);
  }

  console.log(`✅ Fetched ${flatResults.length}/${symbols.length} quotes successfully`);
  
  return flatResults;
}


async function fetchBatchWithFallback(batch, batchIndex) {
  try {
    const quotes = await fetchWithRetry(
      () => yahooFinance.quote(batch, {
        fields: ['symbol', 'regularMarketPrice', 'regularMarketChange', 
                 'regularMarketChangePercent', 'marketCap', 'regularMarketVolume',
                 'currency', 'fullExchangeName']
      }),
      { context: `Batch ${batchIndex + 1}` }
    );
    
    const quotesArray = Array.isArray(quotes) ? quotes : [quotes];
    const formatted = quotesArray.map(formatQuote).filter(Boolean);
    
    console.log(`✅ Batch ${batchIndex + 1}: ${formatted.length}/${batch.length} quotes`);
    return formatted;
    
  } catch (err) {
    console.error(`❌ Batch ${batchIndex + 1} failed, trying individual fallback...`);
    
    // Fallback: fetch individually with concurrency limit
    const individualResults = await Promise.allSettled(
      batch.map(symbol => 
        limiter(() => 
          fetchWithRetry(
            () => yahooFinance.quote(symbol),
            { context: `Symbol ${symbol}` }
          ).then(formatQuote).catch(() => null)
        )
      )
    );
    
    const successful = individualResults
      .filter(r => r.status === 'fulfilled' && r.value)
      .map(r => r.value);
    
    console.log(`✅ Fallback recovered ${successful.length}/${batch.length} quotes`);
    return successful;
  }
}

async function fetchScreenerData(screenerId) {
  const cacheKey = `screener_${screenerId}`;
  const { data, hit } = getCached(cacheKey);
  if (hit) return data;
  
  try {
    const result = await fetchWithRetry(
      () => yahooFinance.screener({ scrIds: screenerId, count: 10 }),
      { context: `Screener ${screenerId}` }
    );
    
    const formatted = result.quotes.map(q => ({
      symbol: q.symbol,
      name: q.shortName || q.longName || q.symbol,
      price: q.regularMarketPrice ?? 0,
      changePercent: q.regularMarketChangePercent ?? 0,
      volume: q.regularMarketVolume ?? 0,
      marketCap: q.marketCap ?? null,
    }));
    
    setCached(cacheKey, formatted, CONFIG.CACHE_TTL.SCREENER);
    return formatted;
    
  } catch (err) {
    console.error(`❌ Screener ${screenerId} failed:`, err.message);
    return []; // Return empty array instead of throwing
  }
}


async function fetchTrendingSymbols() {
  const cacheKey = 'trending_quotes';
  const { data, hit } = getCached(cacheKey);
  if (hit) return data;
  
  try {
    const trend = await fetchWithRetry(
      () => yahooFinance.trendingSymbols('US'),
      { context: 'Trending Symbols' }
    );
    
    const trendingSymbols = trend.quotes.slice(0, 10).map(q => q.symbol);
    console.log(`📈 Trending: ${trendingSymbols.length} symbols`);
    
    const trendingData = await fetchLiveData(trendingSymbols);
    
    if (trendingData.length > 0) {
      setCached(cacheKey, trendingData, CONFIG.CACHE_TTL.TRENDING);
    } else {
      console.warn('⚠️ Trending symbols empty, not caching');
    }

    return trendingData;
    
  } catch (err) {
    console.error(`❌ Trending symbols failed:`, err.message);
    return [];
  }
}

async function revalidateInBackground(cacheKey, fetchFn) {
  console.log(`🔄 Background revalidation: ${cacheKey}`);
  
  try {
    const freshData = await fetchFn();
    if (freshData?.liveData?.length > 0) {
      setCached(cacheKey, freshData, CONFIG.CACHE_TTL.FULL_RESPONSE);
      console.log(`✅ Revalidated: ${cacheKey}`);
    } else {
      console.warn(`⚠️ Revalidation skipped for ${cacheKey} (empty live data)`);
    }

  
  } catch (err) {
    console.error(`❌ Revalidation failed for ${cacheKey}:`, err.message);
  }
}


trendingPageRouter.get("/trending-stock", async (req, res) => {
  const cacheKey = 'trending_stock_full';
  
  try {
    // Check cache
    const { data: cachedResponse, hit } = getCached(cacheKey);
    
    if (hit) {
      // Trigger background revalidation if stale
      if (isCacheStale(cacheKey)) {
        console.log('Cache stale, triggering background revalidation');
        
        
        revalidateInBackground(cacheKey, async () => {
          const tickers = await getTickersFromDB(20);
          const [liveData, gainers, losers, active, isTrendingQuote] = await Promise.allSettled([
            fetchLiveData(tickers),
            fetchScreenerData('day_gainers'),
            fetchScreenerData('day_losers'),
            fetchScreenerData('most_actives'),
            fetchTrendingSymbols(),
          ]);
          
          return {
            liveData: liveData.status === 'fulfilled' ? liveData.value : [],
            gainers: gainers.status === 'fulfilled' ? gainers.value : [],
            losers: losers.status === 'fulfilled' ? losers.value : [],
            active: active.status === 'fulfilled' ? active.value : [],
            isTrendingQuote: isTrendingQuote.status === 'fulfilled' ? isTrendingQuote.value : [],
          };
        }).catch(err => console.error('Background revalidation error:', err));
      }
      
      return res.json(cachedResponse);
    }
    
   
    console.log('Cache miss, fetching fresh data...');
    
    const tickers = await getTickersFromDB(20);
    
   
    const [liveData, gainers, losers, active, isTrendingQuote] = await Promise.allSettled([
      fetchLiveData(tickers),
      fetchScreenerData('day_gainers'),
      fetchScreenerData('day_losers'),
      fetchScreenerData('most_actives'),
      fetchTrendingSymbols(),
    ]);
    
    const responseData = {
      liveData: liveData.status === 'fulfilled' ? liveData.value : [],
      gainers: gainers.status === 'fulfilled' ? gainers.value : [],
      losers: losers.status === 'fulfilled' ? losers.value : [],
      active: active.status === 'fulfilled' ? active.value : [],
      isTrendingQuote: isTrendingQuote.status === 'fulfilled' ? isTrendingQuote.value : [],
    };
    
    if (responseData.liveData.length > 0) {
      setCached(cacheKey, responseData, CONFIG.CACHE_TTL.FULL_RESPONSE);
      console.log('Fresh data fetched and cached');
    } else {
      console.warn('⚠️ Initial fetch empty, not caching full response');
    }

    console.log('Fresh data fetched and cached');
    
    res.json(responseData);
    
  } catch (err) {
    console.error('❌ /trending-stock error:', err);
    res.status(500).json({ 
      error: 'Failed to fetch trending stock data',
      message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
    });
  }
});


trendingPageRouter.get('/trending-search', async (req, res) => {
  try {
    const ticker = (req.query.ticker || req.query.symbol)?.toString().trim().toUpperCase();
    
    if (!ticker) {
      return res.status(400).json({ 
        error: 'Bad Request',
        message: 'Ticker symbol is required' 
      });
    }
    
    
    if (!/^[A-Z0-9.-]{1,10}$/.test(ticker)) {
      return res.status(400).json({ 
        error: 'Bad Request',
        message: 'Invalid ticker format' 
      });
    }
    
    const cacheKey = `search_${ticker}`;
    const { data, hit } = getCached(cacheKey);
    if (hit) return res.json(data);
    
    const quote = await fetchWithRetry(
      () => yahooFinance.quote(ticker),
      { context: `Search ${ticker}` }
    );
    
   const formatted = formatQuote(quote);
  if (formatted) {
    setCached(cacheKey, formatted, CONFIG.CACHE_TTL.SEARCH);
    return res.json(formatted);
  }

    res.json(quote);
    
  } catch (err) {
    console.error(`❌ Search error:`, err);
    
    if (err.message?.includes('timeout')) {
      return res.status(504).json({ 
        error: 'Gateway Timeout',
        message: 'Request took too long. Please try again.'
      });
    }
    
    if (err.message?.includes('Not Found') || err.message?.includes('404')) {
      return res.status(404).json({ 
        error: 'Not Found',
        message: 'Ticker symbol not found'
      });
    }
    
    res.status(500).json({ 
      error: 'Internal Server Error',
      message: process.env.NODE_ENV === 'development' ? err.message : 'Failed to fetch quote'
    });
  }
});


trendingPageRouter.get('/cache-stats', (req, res) => {
  const stats = cache.getStats();
  const keys = cache.keys();
  
  res.json({
    totalKeys: keys.length,
    keys: keys,
    stats: {
      hits: stats.hits,
      misses: stats.misses,
      hitRate: stats.hits + stats.misses > 0 
        ? `${((stats.hits / (stats.hits + stats.misses)) * 100).toFixed(2)}%`
        : '0%',
      ksize: stats.ksize,
      vsize: stats.vsize,
    },
    memory: {
      heapUsed: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`,
      heapTotal: `${(process.memoryUsage().heapTotal / 1024 / 1024).toFixed(2)} MB`,
      rss: `${(process.memoryUsage().rss / 1024 / 1024).toFixed(2)} MB`,
    }
  });
});

trendingPageRouter.delete('/cache/:key', (req, res) => {
  const { key } = req.params;
  
  if (key) {
    const deleted = cache.del(key);
    if (deleted) {
      console.log(`🗑️ Deleted cache: ${key}`);
      return res.json({ message: `Deleted: ${key}`, success: true });
    }
    return res.status(404).json({ message: 'Key not found', success: false });
  }
  

  const count = cache.keys().length;
  cache.flushAll();
  console.log(`🗑️ Cleared ${count} cache entries`);
  res.json({ message: `Cleared ${count} entries`, success: true });
});

export default trendingPageRouter;