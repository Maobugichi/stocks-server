import yahooFinance from "yahoo-finance2";
import pool from "../db.js";
import { Router } from "express";
import NodeCache from "node-cache";


const cache = new NodeCache({ 
  stdTTL: 300, // 5 minutes default TTL
  checkperiod: 60, 
  useClones: false // Better performance, but be careful with object mutations
});

yahooFinance.setGlobalConfig({
  validation: { logErrors: false, logWarnings: false },
});

const trendingPageRouter = Router();

async function getTickersFromDB(limit = 50) {
  const cacheKey = `tickers_${limit}`;
  
 
  let cachedTickers = cache.get(cacheKey);
  if (cachedTickers) {
    console.log(`Cache hit for ${cacheKey}`);
    return cachedTickers;
  }
  

  const res = await pool.query(
    "SELECT symbol FROM tickers ORDER BY random() LIMIT $1",
    [limit]
  );
  const tickers = res.rows.map(r => r.symbol);
  
  
  cache.set(cacheKey, tickers, 600);
  console.log(`Cached ${cacheKey}`);
  
  return tickers;
}

async function fetchLiveData(symbols) {
  const cacheKey = `live_data_${symbols.sort().join('_')}`;
  

  let cachedData = cache.get(cacheKey);
  if (cachedData) {
    console.log(`Cache hit for live data`);
    return cachedData;
  }
  
  const results = [];
  for (const symbol of symbols) {
    try {
      const quote = await yahooFinance.quote(symbol);
      if (!quote || !quote.regularMarketPrice) {
        throw new Error("No valid market data");
      }
     
      results.push({
        symbol,
        price: quote.regularMarketPrice ?? null,
        changePercent: quote.regularMarketChange ?? null,
        regularMarketChangePercent: quote.regularMarketChangePercent ?? null,
        marketCap: quote.marketCap ?? null,
        volume: quote.regularMarketVolume ?? null, 
        currency: quote.currency ?? null,
        exchange: quote.fullExchangeName ?? null,
      });
      
      //console.log(`✅ ${symbol} → ${quote.regularMarketPrice} ${quote.currency}`);
     
    } catch (err) {
      console.error(`❌ Failed for ${symbol}: ${err.message}`);
     
    }
  }
  
 
  cache.set(cacheKey, results, 120);
  console.log(`Cached live data`);
  
  return results;
}

async function fetchNews(symbols) {
  const cacheKey = `news_${symbols.sort().join('_')}`;
  
  // Try to get from cache first
  let cachedNews = cache.get(cacheKey);
  if (cachedNews) {
    console.log(`Cache hit for news`);
    return cachedNews;
  }
  
  const result = [];

  for (const symbol of symbols) {
    try {
      // 🔹 Await the API call
      const news_data = await yahooFinance.search(symbol, { newsCount: 10 });

      // Filter out invalid quotes (like MONEY_MARKET)
      const validQuotes = (news_data.quotes || []).filter(
        q => q.quoteType !== "MONEY_MARKET"
      );

      // Map only if news exists
      const news = (news_data.news || []).map(n => ({
        title: n.title,
        publisher: n.publisher,
        link: n.link,
        published: n.providerPublishTime * 1000,
      }));

      result.push({ symbol, validQuotes, news });
    } catch (err) {
      console.error(`❌ Failed for ${symbol}: ${err.message}`);
    }
  }

  // Cache for 15 minutes (900 seconds) since news doesn't change very frequently
  cache.set(cacheKey, result, 900);
  console.log(`Cached news data`);
  
  return result;
}

trendingPageRouter.get("/trending-stock", async (req, res) => {
  try {
    const cacheKey = 'trending_stock_full';
    
    // Try to get complete response from cache first
    let cachedResponse = cache.get(cacheKey);
    if (cachedResponse) {
      console.log('Cache hit for full trending stock response');
      return res.json(cachedResponse);
    }
    
    const tickers = await getTickersFromDB(50); // e.g. ['AAPL','MSFT']
    const liveData = await fetchLiveData(tickers);
    const news = await fetchNews(tickers);
    console.log(tickers);
    
    // Cache screener data separately since it's expensive
    let gainers = cache.get('day_gainers');
    if (!gainers) {
      const day_gainers = await yahooFinance.screener({ scrIds: "day_gainers", count: 10 });
      gainers = day_gainers.quotes.map(q => ({
        symbol: q.symbol,
        name: q.shortName,
        price: q.regularMarketPrice,
        changePercent: q.regularMarketChangePercent,
        volume: q.regularMarketVolume,
        marketCap: q.marketCap,
      }));
      cache.set('day_gainers', gainers, 180); // 3 minutes
    }
    
    let active = cache.get('most_actives');
    if (!active) {
      const most_actives = await yahooFinance.screener({ scrIds: "most_actives", count: 10 });
      active = most_actives.quotes.map(q => ({
        symbol: q.symbol,
        name: q.shortName,
        price: q.regularMarketPrice,
        changePercent: q.regularMarketChangePercent,
        volume: q.regularMarketVolume,
        marketCap: q.marketCap,
      }));
      cache.set('most_actives', active, 180); // 3 minutes
    }

    //await yahooFinance.screener({scrIds:"ipo", count: 10 });
    //await yahooFinance.screener({scrIds:"etf_gainers", count: 10 });
    //await yahooFinance.screener({scrIds:"sector", count: 11 });

    let losers = cache.get('day_losers');
    if (!losers) {
      const day_losers = await yahooFinance.screener({ scrIds: "day_losers", count: 10 });
      losers = day_losers.quotes.map(q => ({
        symbol: q.symbol,
        name: q.shortName,
        price: q.regularMarketPrice,
        changePercent: q.regularMarketChangePercent,
        volume: q.regularMarketVolume,
        marketCap: q.marketCap,
      }));
      cache.set('day_losers', losers, 180); // 3 minutes
    }

    let isTrendingQuote = cache.get('trending_quotes');
    if (!isTrendingQuote) {
      const trend = await yahooFinance.trendingSymbols('US');
      const trendin = trend.quotes.map(q => ({
        symbol: q.symbol,
      }));
      //const news_data = await yahooFinance.quoteSummary("AAPL", { modules: ["news"] });
      const trends = trendin.map(item => item.symbol);
      isTrendingQuote = await fetchLiveData(trends);
      cache.set('trending_quotes', isTrendingQuote, 300); // 5 minutes
    }
    
    const responseData = {
      liveData,
      gainers,
      losers,
      active,
      isTrendingQuote,
      news
    };
    
    // Cache the complete response for 1 minute
    cache.set(cacheKey, responseData, 60);
    
    res.json(responseData);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch trending stocks" });
  }
});

trendingPageRouter.get('/trending-search', async (req, res) => {
  try {
    const ticker = req.query;
    const cacheKey = `search_${JSON.stringify(ticker)}`;
    
    // Try to get from cache first
    let cachedQuote = cache.get(cacheKey);
    if (cachedQuote) {
      console.log(`Cache hit for search: ${cacheKey}`);
      return res.json(cachedQuote);
    }
    
    const quote = await yahooFinance.quote(ticker);
    
    // Cache for 2 minutes
    cache.set(cacheKey, quote, 120);
    console.log(`Cached search result: ${cacheKey}`);
    
    res.json(quote);
  } catch (err) {
    res.status(500).json(err);
  }
});

// Optional: Add cache statistics endpoint for monitoring
trendingPageRouter.get('/cache-stats', (req, res) => {
  const stats = cache.getStats();
  res.json({
    keys: cache.keys().length,
    hits: stats.hits,
    misses: stats.misses,
    hitRate: stats.hits / (stats.hits + stats.misses) || 0,
    memoryUsage: process.memoryUsage()
  });
});

// Optional: Add cache clear endpoint for development
trendingPageRouter.delete('/cache', (req, res) => {
  const deletedCount = cache.keys().length;
  cache.flushAll();
  res.json({ message: `Cleared ${deletedCount} cache entries` });
});

export default trendingPageRouter;