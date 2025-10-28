import { Router } from "express";
import pool from "../db.js";
import yahooFinance from "yahoo-finance2";

const portfolioRouter = Router();

const cache = new Map();
const CACHE_TTL = 2 * 60 * 1000; 

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

// Clear cache for specific user
function clearUserCache(userId) {
  const cacheKey = getCacheKey(userId, "portfolio");
  cache.delete(cacheKey);
  console.log(`🗑️ Cleared cache for user ${userId}`);
}

// Clear all cache
function clearAllCache() {
  const size = cache.size;
  cache.clear();
  console.log(`🗑️ Cleared all cache (${size} entries)`);
}

// Batch fetch with error handling for individual symbols
async function fetchQuotesSafely(symbols) {
  const results = [];
  const batchSize = 10;
  
  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, i + batchSize);
    try {
      const quotes = await yahooFinance.quote(batch);
      const quotesArray = Array.isArray(quotes) ? quotes : [quotes];
      results.push(...quotesArray);
    } catch (err) {
      console.error(`Error fetching batch ${i}-${i + batchSize}:`, err.message);
      batch.forEach(symbol => {
        results.push({ symbol, error: true });
      });
    }
  }
  
  return results;
}

async function fetchHistorySafely(symbols, period1, period2) {
  const results = [];
  
  for (const symbol of symbols) {
    try {
      const history = await yahooFinance.chart(symbol, {
        period1,
        period2,
        interval: "1d",
      });
      results.push({ symbol, data: history });
    } catch (err) {
      console.error(`Error fetching history for ${symbol}:`, err.message);
      results.push({ symbol, data: null, error: true });
    }
  }
  
  return results;
}

// GET portfolio data
portfolioRouter.get("/:userId", async (req, res) => {
  const { userId } = req.params;
  const { skipCache } = req.query;
  
  try {
    // Check cache first (unless skipCache is true)
    if (!skipCache) {
      const cacheKey = getCacheKey(userId, "portfolio");
      const cachedData = getFromCache(cacheKey);
      if (cachedData) {
        console.log(`✓ Cache hit for user ${userId}`);
        return res.json({ ...cachedData, cached: true });
      }
    }

    console.log(`📊 Fetching fresh portfolio data for user ${userId}`);

    // Fetch holdings from database
    const result = await pool.query(
      "SELECT id, symbol, shares, buy_price FROM portfolio WHERE user_id = $1 ORDER BY symbol",
      [userId]
    );

    const holdings = result.rows;

    if (holdings.length === 0) {
      return res.json({ message: "No holdings available" });
    }

    if (holdings.length > 100) {
      return res.status(400).json({ 
        error: "Portfolio too large",
        message: "Maximum 100 holdings supported" 
      });
    }

    const symbols = holdings.map((h) => h.symbol);

    const quotesArray = await fetchQuotesSafely(symbols);
    const quoteMap = new Map(
      quotesArray
        .filter(q => !q.error)
        .map(q => [q.symbol, q])
    );

    const validSymbols = symbols.filter(s => quoteMap.has(s));
    
    const now = new Date();
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(now.getMonth() - 1);

    const historyResults = await fetchHistorySafely(validSymbols, oneMonthAgo, now);
    const historyMap = new Map(
      historyResults
        .filter(h => !h.error && h.data?.quotes?.length > 0)
        .map(h => [h.symbol, h.data])
    );

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
      return {
        id: h.id, // Include ID for delete/update operations
        symbol: h.symbol,
        shares: h.shares,
        buyPrice: h.buy_price,
        currentPrice: quote?.regularMarketPrice || 0,
        prevClose: quote?.regularMarketPreviousClose || 0,
        marketCap: quote?.marketCap || null,
        peRatio: quote?.trailingPE || null,
        dividendYield: quote?.dividendYield || null,
        valid: !!quote,
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
      },
    };

    // Cache the response
    const cacheKey = getCacheKey(userId, "portfolio");
    setCache(cacheKey, response);
    console.log(`✓ Cached portfolio data for user ${userId}`);

    res.json(response);
  } catch (err) {
    console.error("Portfolio calculation error:", err);
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
    // Validate input
    if (!ticker || !shares || !buyPrice) {
      return res.status(400).json({ 
        error: "Missing required fields",
        message: "ticker, shares, and buyPrice are required" 
      });
    }

    // Validate numeric values
    if (isNaN(shares) || isNaN(buyPrice) || Number(shares) <= 0 || Number(buyPrice) <= 0) {
      return res.status(400).json({ 
        error: "Invalid values",
        message: "shares and buyPrice must be positive numbers" 
      });
    }

    // Insert new holding
    const result = await pool.query(
      "INSERT INTO portfolio (user_id, symbol, shares, buy_price) VALUES ($1, $2, $3, $4) RETURNING id, symbol, shares, buy_price",
      [userId, ticker.toUpperCase(), shares, buyPrice]
    );

    // Clear cache immediately after update
    clearUserCache(userId);

    console.log(`✅ Added holding ${ticker} for user ${userId}`);

    res.json({ 
      success: true, 
      message: "Holding added successfully",
      holding: result.rows[0]
    });
  } catch (err) {
    console.error("Error saving portfolio:", err);
    
    // Handle duplicate entry
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
    // Validate holdingId is a number
    if (isNaN(holdingId)) {
      return res.status(400).json({ 
        error: "Invalid holding ID",
        message: "Holding ID must be a number" 
      });
    }

    // Delete the holding (ensure it belongs to this user)
    const result = await pool.query(
      "DELETE FROM portfolio WHERE id = $1 AND user_id = $2 RETURNING symbol",
      [holdingId, userId]
    );

    // Check if holding was found and deleted
    if (result.rowCount === 0) {
      return res.status(404).json({ 
        error: "Holding not found",
        message: "The specified holding does not exist or does not belong to this user" 
      });
    }

    // Clear cache immediately after deletion
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
    // Validate holdingId
    if (isNaN(holdingId)) {
      return res.status(400).json({ 
        error: "Invalid holding ID",
        message: "Holding ID must be a number" 
      });
    }

    // Build dynamic update query
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

    // Add WHERE clause parameters
    values.push(holdingId, userId);

    // Execute update
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

    // Clear cache immediately after update
    clearUserCache(userId);

    console.log(`✏️ Updated holding ${result.rows[0].symbol} (ID: ${holdingId}) for user ${userId}`);

    res.json({ 
      success: true, 
      message: "Holding updated successfully",
      holding: result.rows[0]
    });
  } catch (err) {
    console.error("Error updating holding:", err);
    
    // Handle duplicate entry
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

// DELETE - Clear all cache (admin endpoint - add auth!)
portfolioRouter.delete("/cache/all", (req, res) => {
  clearAllCache();
  res.json({ 
    success: true, 
    message: "All cache cleared" 
  });
});

// GET - Health check endpoint
portfolioRouter.get("/:userId/health", async (req, res) => {
  res.json({ 
    status: "ok",
    cacheSize: cache.size,
    cacheTTL: `${CACHE_TTL / 1000} seconds`,
    timestamp: new Date().toISOString()
  });
});

export default portfolioRouter;