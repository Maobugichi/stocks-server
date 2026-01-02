import { Router } from "express";
import pool from "../db.js";
import yahooFinance from "yahoo-finance2";
import { checkAuth } from "../checkAuth.js";

const portfolioRouter = Router();

const cache = new Map();
const CACHE_TTL = 2 * 60 * 1000; 

// Configure Yahoo Finance
yahooFinance.setGlobalConfig({
  validation: { logErrors: false, logWarnings: false },
});

function getCacheKey(userId, type) {
  return `${userId}:${type}`;
}

function getFromCache(key) {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  cache.delete(key);
  return null;
}

function setCache(key, data) {
  cache.set(key, { data, timestamp: Date.now() });
}

function clearUserCache(userId) {
  const cacheKey = getCacheKey(userId, "portfolio");
  cache.delete(cacheKey);
  console.log(`🗑️ Cleared cache for user ${userId}`);
}

function clearAllCache() {
  const size = cache.size;
  cache.clear();
  console.log(`🗑️ Cleared all cache (${size} entries)`);
}

// Helper: Fetch with timeout and retry
async function fetchWithRetry(fn, options = {}) {
  const { timeout = 8000, retries = 2, context = 'unknown' } = options;
  
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const result = await Promise.race([
        fn(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), timeout)
        )
      ]);
      return result;
    } catch (err) {
      console.error(`❌ [${context}] Attempt ${attempt + 1}/${retries} failed:`, err.message);
      
      if (attempt < retries - 1) {
        const delay = 1000 * (attempt + 1);
        console.log(`⏳ Retrying in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
      } else {
        throw err;
      }
    }
  }
}


async function fetchQuotesSafely(symbols) {
  if (!symbols.length) return [];
  
  console.log(`📊 Fetching quotes for ${symbols.length} symbols...`);
  const results = [];
  const batchSize = 5; // Reduced from 10 to avoid rate limits
  
  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, i + batchSize);
    
    try {
      // Add delay between batches
      if (i > 0) {
        await new Promise(r => setTimeout(r, 500));
      }
      
      const quotes = await fetchWithRetry(
        () => yahooFinance.quote(batch, {
          fields: ['symbol', 'regularMarketPrice', 'regularMarketPreviousClose', 
                   'marketCap', 'trailingPE', 'dividendYield', 
                   'fiftyTwoWeekLow', 'fiftyTwoWeekHigh']
        }),
        { context: `Batch ${i}-${i + batchSize}`, timeout: 8000, retries: 2 }
      );
      
      const quotesArray = Array.isArray(quotes) ? quotes : [quotes];
      console.log(`✅ Fetched ${quotesArray.length}/${batch.length} quotes`);
      results.push(...quotesArray);
      
    } catch (err) {
      console.error(`❌ Batch ${i}-${i + batchSize} completely failed:`, err.message);
      
      // Try individual fallback
      for (const symbol of batch) {
        try {
          await new Promise(r => setTimeout(r, 200));
          const quote = await fetchWithRetry(
            () => yahooFinance.quote(symbol),
            { context: symbol, timeout: 5000, retries: 1 }
          );
          results.push(quote);
          console.log(`✅ Fallback success: ${symbol}`);
        } catch (symbolErr) {
          console.error(`❌ Failed to fetch ${symbol}:`, symbolErr.message);
          results.push({ symbol, error: true, errorMessage: symbolErr.message });
        }
      }
    }
  }
  
  const successCount = results.filter(r => !r.error).length;
  console.log(`📊 Final: ${successCount}/${symbols.length} quotes fetched successfully`);
  
  return results;
}

// Improved history fetching
async function fetchHistorySafely(symbols, period1, period2) {
  if (!symbols.length) return [];
  
  console.log(`📈 Fetching history for ${symbols.length} symbols...`);
  const results = [];
  
  for (const symbol of symbols) {
    try {
      await new Promise(r => setTimeout(r, 300)); // Rate limiting
      
      const history = await fetchWithRetry(
        () => yahooFinance.chart(symbol, {
          period1,
          period2,
          interval: "1d",
        }),
        { context: `History ${symbol}`, timeout: 8000, retries: 1 }
      );
      
      results.push({ symbol, data: history });
      console.log(`✅ History fetched: ${symbol}`);
      
    } catch (err) {
      console.error(`❌ History failed for ${symbol}:`, err.message);
      results.push({ symbol, data: null, error: true });
    }
  }
  
  return results;
}

portfolioRouter.get("/", checkAuth, async (req, res) => {
  const userId = req.user.id;
  const { skipCache } = req.query;
  const startTime = Date.now();
 
  try {
    // Check cache
    if (!skipCache) {
      const cacheKey = getCacheKey(userId, "portfolio");
      const cachedData = getFromCache(cacheKey);
      if (cachedData) {
        console.log(`✅ Cache hit for user ${userId} (${Date.now() - startTime}ms)`);
        return res.json({ ...cachedData, cached: true });
      }
    }

    console.log(`📊 Fetching fresh portfolio data for user ${userId}`);

    // Get holdings from database
    const result = await pool.query(
      "SELECT id, symbol, shares, buy_price FROM portfolio WHERE user_id = $1 ORDER BY symbol",
      [userId]
    );

    const holdings = result.rows;

    if (holdings.length === 0) {
      return res.json({ 
        message: "No holdings available",
        breakdown: []
      });
    }

    if (holdings.length > 100) {
      return res.status(400).json({ 
        error: "Portfolio too large",
        message: "Maximum 100 holdings supported" 
      });
    }

    const symbols = holdings.map((h) => h.symbol);

    // Fetch quotes with improved error handling
    const quotesArray = await fetchQuotesSafely(symbols);
    
    // Log errors for debugging
    const erroredQuotes = quotesArray.filter(q => q.error);
    if (erroredQuotes.length > 0) {
      console.warn(`⚠️ ${erroredQuotes.length} quotes failed:`, erroredQuotes.map(q => q.symbol));
    }
    
    const quoteMap = new Map(
      quotesArray
        .filter(q => !q.error && q.regularMarketPrice)
        .map(q => [q.symbol, q])
    );

    console.log(`📊 Valid quotes: ${quoteMap.size}/${symbols.length}`);

    // If no valid quotes, return error
    if (quoteMap.size === 0) {
      return res.status(503).json({
        error: "Unable to fetch market data",
        message: "Yahoo Finance API is temporarily unavailable. Please try again in a moment.",
        breakdown: holdings.map(h => ({
          id: h.id,
          symbol: h.symbol,
          shares: h.shares,
          buyPrice: h.buy_price,
          currentPrice: 0,
          valid: false,
          errorMessage: "API unavailable"
        }))
      });
    }

    const validSymbols = symbols.filter(s => quoteMap.has(s));
    
    // Fetch history only for valid symbols
    const now = new Date();
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(now.getMonth() - 1);

    const historyResults = await fetchHistorySafely(validSymbols, oneMonthAgo, now);
    const historyMap = new Map(
      historyResults
        .filter(h => !h.error && h.data?.quotes?.length > 0)
        .map(h => [h.symbol, h.data])
    );

    // Calculate portfolio metrics
    let portfolioValue = 0;
    let investedAmount = 0;
    let yesterdayPortfolioValue = 0;
    let totalMarketCap = 0;
    let totalDividendYield = 0;
    let totalPE = 0;
    let countPE = 0;
    let countDividend = 0;
    let invalidHoldings = 0;

    holdings.forEach((holding) => {
      const quote = quoteMap.get(holding.symbol);
      if (!quote) {
        invalidHoldings++;
        return;
      }

      const shares = Number(holding.shares);
      const buyPrice = Number(holding.buy_price);
      const currentPrice = quote.regularMarketPrice || 0;
      const prevClose = quote.regularMarketPreviousClose || currentPrice;

      portfolioValue += currentPrice * shares;
      investedAmount += buyPrice * shares;
      yesterdayPortfolioValue += prevClose * shares;

      if (quote.marketCap) totalMarketCap += quote.marketCap;
      
      if (quote.dividendYield) {
        totalDividendYield += quote.dividendYield;
        countDividend++;
      }

      if (quote.trailingPE && quote.trailingPE > 0) {
        totalPE += quote.trailingPE;
        countPE++;
      }
    });

    const profitLoss = portfolioValue - investedAmount;
    const percentGainLoss =
      investedAmount > 0 ? (profitLoss / investedAmount) * 100 : 0;
    
    const dailyChange = portfolioValue - yesterdayPortfolioValue;
    const dailyChangePercent =
      yesterdayPortfolioValue > 0
        ? (dailyChange / yesterdayPortfolioValue) * 100
        : 0;

    const avgPE = countPE > 0 ? totalPE / countPE : null;
    const averageDividendYield =
      countDividend > 0 ? totalDividendYield / countDividend : null;

    // Portfolio history calculation
    const historiesAvailable = Array.from(historyMap.values());
    
    let dates = [];
    let profitLossHistory = [];
    let portfolioValueHistory = [];

    if (historiesAvailable.length > 0) {
      const numPoints = Math.min(
        ...historiesAvailable.map((h) => h.quotes?.length || 0)
      );

      for (let i = 0; i < numPoints; i++) {
        let totalValueAtPoint = 0;

        holdings.forEach((holding) => {
          const shares = Number(holding.shares);
          const history = historyMap.get(holding.symbol);
          
          if (history?.quotes[i]?.close) {
            const price = history.quotes[i].close;
            totalValueAtPoint += shares * price;
          } else {
            const quote = quoteMap.get(holding.symbol);
            const currentPrice = quote?.regularMarketPrice || 0;
            totalValueAtPoint += shares * currentPrice;
          }
        });

        const dateValue = historiesAvailable[0].quotes[i]?.date;
        if (dateValue) {
          dates.push(dateValue.toISOString().split("T")[0]);
        }
        
        portfolioValueHistory.push(totalValueAtPoint);
        profitLossHistory.push(totalValueAtPoint - investedAmount);
      }
    }

    const dailyHistory = [];
    const dailyDates = [];

    for (let i = 1; i < portfolioValueHistory.length; i++) {
      const prevValue = portfolioValueHistory[i - 1];
      const currValue = portfolioValueHistory[i];
      
      const pctChange =
        prevValue > 0 ? ((currValue - prevValue) / prevValue) * 100 : 0;
      
      dailyHistory.push(pctChange);
      dailyDates.push(dates[i]);
    }

    const low52 = holdings.reduce((sum, h) => {
      const quote = quoteMap.get(h.symbol);
      if (!quote) return sum;
      const shares = Number(h.shares);
      const low = quote.fiftyTwoWeekLow || 0;
      return sum + shares * low;
    }, 0);

    const high52 = holdings.reduce((sum, h) => {
      const quote = quoteMap.get(h.symbol);
      if (!quote) return sum;
      const shares = Number(h.shares);
      const high = quote.fiftyTwoWeekHigh || 0;
      return sum + shares * high;
    }, 0);

    const stockPerformance = holdings
      .map((h) => {
        const quote = quoteMap.get(h.symbol);
        if (!quote) return null;
        
        const shares = Number(h.shares);
        const buyPrice = Number(h.buy_price);
        const currentPrice = quote.regularMarketPrice || 0;
        
        const invested = buyPrice * shares;
        const currentValue = currentPrice * shares;
        const gainLoss = currentValue - invested;
        const pct = invested > 0 ? (gainLoss / invested) * 100 : 0;
        
        return { symbol: h.symbol, gainLoss, pct };
      })
      .filter(Boolean);

    const topStock = stockPerformance.length > 0
      ? stockPerformance.reduce((a, b) => (b.pct > a.pct ? b : a))
      : null;
    
    const worstStock = stockPerformance.length > 0
      ? stockPerformance.reduce((a, b) => (b.pct < a.pct ? b : a))
      : null;

    const breakdown = holdings.map((h) => {
      const quote = quoteMap.get(h.symbol);
      const erroredQuote = quotesArray.find(q => q.symbol === h.symbol && q.error);
      
      return {
        id: h.id,
        symbol: h.symbol,
        shares: h.shares,
        buyPrice: h.buy_price,
        currentPrice: quote?.regularMarketPrice || 0,
        prevClose: quote?.regularMarketPreviousClose || 0,
        marketCap: quote?.marketCap || null,
        peRatio: quote?.trailingPE || null,
        dividendYield: quote?.dividendYield || null,
        valid: !!quote,
        errorMessage: erroredQuote?.errorMessage || null,
      };
    });

    const response = {
      portfolioValue,
      investedAmount,
      profitLoss,
      percentGainLoss,
      dailyChange,
      dailyChangePercent,
      avgPE,
      averageDividendYield,
      totalMarketCap,
      dates,
      profitLossHistory,
      portfolioValueHistory,
      dailyHistory,
      dailyDates,
      low52,
      high52,
      topStock,
      worstStock,
      breakdown,
      meta: {
        totalHoldings: holdings.length,
        validHoldings: holdings.length - invalidHoldings,
        invalidHoldings,
        historicalDataPoints: dates.length,
        calculatedAt: new Date().toISOString(),
        processingTime: `${Date.now() - startTime}ms`,
      },
    };

    // Cache the response
    const cacheKey = getCacheKey(userId, "portfolio");
    setCache(cacheKey, response);
    console.log(`✅ Portfolio calculated in ${Date.now() - startTime}ms`);

    res.json(response);
  } catch (err) {
    console.error("❌ Portfolio calculation error:", err);
    res.status(500).json({ 
      error: "Failed to calculate portfolio metrics",
      message: err.message 
    });
  }
});

// POST - Add new holding
portfolioRouter.post("/save-port/:userId", async (req, res) => {
  const { userId } = req.params;
  const { ticker, shares, buyPrice } = req.body;

  try {
    if (!ticker || !shares || !buyPrice) {
      return res.status(400).json({ 
        error: "Missing required fields",
        message: "ticker, shares, and buyPrice are required" 
      });
    }

    if (isNaN(shares) || isNaN(buyPrice) || Number(shares) <= 0 || Number(buyPrice) <= 0) {
      return res.status(400).json({ 
        error: "Invalid values",
        message: "shares and buyPrice must be positive numbers" 
      });
    }

    const result = await pool.query(
      "INSERT INTO portfolio (user_id, symbol, shares, buy_price) VALUES ($1, $2, $3, $4) RETURNING id, symbol, shares, buy_price",
      [userId, ticker.toUpperCase(), shares, buyPrice]
    );

    clearUserCache(userId);
    console.log(`✅ Added holding ${ticker} for user ${userId}`);

    res.json({ 
      success: true, 
      message: "Holding added successfully",
      holding: result.rows[0]
    });
  } catch (err) {
    console.error("Error saving portfolio:", err);
    
    if (err.code === '23505') {
      return res.status(409).json({ 
        error: "Duplicate holding",
        message: `${ticker} already exists in your portfolio` 
      });
    }
    
    res.status(500).json({ 
      error: "Failed to save portfolio",
      message: err.message 
    });
  }
});

// DELETE - Remove holding by ID
portfolioRouter.delete("/:userId/holdings/:holdingId", async (req, res) => {
  const { userId, holdingId } = req.params;

  try {
    if (isNaN(holdingId)) {
      return res.status(400).json({ 
        error: "Invalid holding ID",
        message: "Holding ID must be a number" 
      });
    }

    const result = await pool.query(
      "DELETE FROM portfolio WHERE id = $1 AND user_id = $2 RETURNING symbol",
      [holdingId, userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ 
        error: "Holding not found",
        message: "The specified holding does not exist or does not belong to this user" 
      });
    }

    clearUserCache(userId);

    const deletedSymbol = result.rows[0].symbol;
    console.log(`🗑️ Deleted holding ${deletedSymbol} (ID: ${holdingId}) for user ${userId}`);

    res.json({ 
      success: true, 
      message: "Holding deleted successfully",
      deletedSymbol 
    });
  } catch (err) {
    console.error("Error deleting holding:", err);
    res.status(500).json({ 
      error: "Failed to delete holding",
      message: err.message 
    });
  }
});

// PATCH - Update existing holding
portfolioRouter.patch("/:userId/holdings/:holdingId", async (req, res) => {
  const { userId, holdingId } = req.params;
  const { ticker, shares, buyPrice } = req.body;

  try {
    if (isNaN(holdingId)) {
      return res.status(400).json({ 
        error: "Invalid holding ID",
        message: "Holding ID must be a number" 
      });
    }

    const updates = [];
    const values = [];
    let paramCount = 1;

    if (ticker !== undefined) {
      updates.push(`symbol = $${paramCount++}`);
      values.push(ticker.toUpperCase());
    }
    if (shares !== undefined) {
      if (isNaN(shares) || Number(shares) <= 0) {
        return res.status(400).json({ 
          error: "Invalid shares value",
          message: "shares must be a positive number" 
        });
      }
      updates.push(`shares = $${paramCount++}`);
      values.push(shares);
    }
    if (buyPrice !== undefined) {
      if (isNaN(buyPrice) || Number(buyPrice) <= 0) {
        return res.status(400).json({ 
          error: "Invalid buyPrice value",
          message: "buyPrice must be a positive number" 
        });
      }
      updates.push(`buy_price = $${paramCount++}`);
      values.push(buyPrice);
    }

    if (updates.length === 0) {
      return res.status(400).json({ 
        error: "No updates provided",
        message: "At least one field (ticker, shares, buyPrice) must be provided" 
      });
    }

    values.push(holdingId, userId);

    const result = await pool.query(
      `UPDATE portfolio SET ${updates.join(', ')} WHERE id = $${paramCount++} AND user_id = $${paramCount} RETURNING id, symbol, shares, buy_price`,
      values
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ 
        error: "Holding not found",
        message: "The specified holding does not exist or does not belong to this user" 
      });
    }

    clearUserCache(userId);
    console.log(`✏️ Updated holding ${result.rows[0].symbol} (ID: ${holdingId}) for user ${userId}`);

    res.json({ 
      success: true, 
      message: "Holding updated successfully",
      holding: result.rows[0]
    });
  } catch (err) {
    console.error("Error updating holding:", err);
    
    if (err.code === '23505') {
      return res.status(409).json({ 
        error: "Duplicate holding",
        message: "A holding with this symbol already exists in your portfolio" 
      });
    }
    
    res.status(500).json({ 
      error: "Failed to update holding",
      message: err.message 
    });
  }
});

// DELETE - Clear user cache
portfolioRouter.delete("/:userId/cache", (req, res) => {
  const { userId } = req.params;
  clearUserCache(userId);
  res.json({ 
    success: true, 
    message: `Cache cleared for user ${userId}` 
  });
});

// DELETE - Clear all cache
portfolioRouter.delete("/cache/all", (req, res) => {
  clearAllCache();
  res.json({ 
    success: true, 
    message: "All cache cleared" 
  });
});


portfolioRouter.get("/:userId/health", async (req, res) => {
  res.json({ 
    status: "ok",
    cacheSize: cache.size,
    cacheTTL: `${CACHE_TTL / 1000} seconds`,
    timestamp: new Date().toISOString()
  });
});

export default portfolioRouter;