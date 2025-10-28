import { Router } from "express";
import pool from "../db.js";
import yahooFinance from "yahoo-finance2";

const portfolioRouter = Router();

// Simple in-memory cache (consider Redis for production)
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

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

// Batch fetch with error handling for individual symbols
async function fetchQuotesSafely(symbols) {
  const results = [];
  const batchSize = 10; // Yahoo Finance may have limits
  
  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, i + batchSize);
    try {
      const quotes = await yahooFinance.quote(batch);
      const quotesArray = Array.isArray(quotes) ? quotes : [quotes];
      results.push(...quotesArray);
    } catch (err) {
      console.error(`Error fetching batch ${i}-${i + batchSize}:`, err.message);
      // Add placeholder for failed quotes
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

portfolioRouter.get("/:userId", async (req, res) => {
  const { userId } = req.params;
  
  try {
    // Check cache first
    const cacheKey = getCacheKey(userId, "portfolio");
    const cachedData = getFromCache(cacheKey);
    if (cachedData) {
      return res.json({ ...cachedData, cached: true });
    }

    // Fetch holdings from database
    const result = await pool.query(
      "SELECT symbol, shares, buy_price FROM portfolio WHERE user_id = $1 ORDER BY symbol",
      [userId]
    );

    const holdings = result.rows;

    if (holdings.length === 0) {
      return res.json({ message: "No holdings available" });
    }

    // Limit portfolio size for performance
    if (holdings.length > 100) {
      return res.status(400).json({ 
        error: "Portfolio too large",
        message: "Maximum 100 holdings supported" 
      });
    }

    const symbols = holdings.map((h) => h.symbol);

    // Fetch quotes in batches
    const quotesArray = await fetchQuotesSafely(symbols);
    const quoteMap = new Map(
      quotesArray
        .filter(q => !q.error)
        .map(q => [q.symbol, q])
    );

    // Only fetch history for valid quotes
    const validSymbols = symbols.filter(s => quoteMap.has(s));
    
    const now = new Date();
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(now.getMonth() - 1);

    // Fetch historical data with error handling
    const historyResults = await fetchHistorySafely(validSymbols, oneMonthAgo, now);
    const historyMap = new Map(
      historyResults
        .filter(h => !h.error && h.data?.quotes?.length > 0)
        .map(h => [h.symbol, h.data])
    );

    // Calculate current portfolio metrics
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

    // Calculate performance metrics
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

    // Calculate historical data - only for holdings with valid history
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
            // Use current price as fallback for missing historical data
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

    // Calculate daily percentage changes
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

    // Calculate 52-week range
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

    // Calculate individual stock performance
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

    // Build detailed breakdown
    const breakdown = holdings.map((h) => {
      const quote = quoteMap.get(h.symbol);
      return {
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
    setCache(cacheKey, response);

    res.json(response);
  } catch (err) {
    console.error("Portfolio calculation error:", err);
    res.status(500).json({ 
      error: "Failed to calculate portfolio metrics",
      message: err.message 
    });
  }
});

// Health check endpoint
portfolioRouter.get("/:userId/health", async (req, res) => {
  res.json({ 
    status: "ok",
    cacheSize: cache.size,
    timestamp: new Date().toISOString()
  });
});

export default portfolioRouter;