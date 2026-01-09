import yahooFinance from 'yahoo-finance2';
import cacheService from './cache.service.js';
import { WATCHLIST_CONFIG } from "../configs/watchlist.config.js";
import { fetchWithRetry, delay } from '../utils/retry.util.js';
import { limiter } from '../utils/rate-limiter.util.js';
import { CONFIG } from '../configs/yahoo-finance.config.js';

yahooFinance.setGlobalConfig({
  validation: { logErrors: false, logWarnings: false },
  validateResult: false,
});

class WatchlistQuoteService {
  /**
   * ✅ IMPROVED: Added global caching for live quotes
   */
  async fetchLiveQuotes(symbols) {
    if (!symbols || symbols.length === 0) {
      return [];
    }

    const results = [];
    const uncachedSymbols = [];

    // Check cache first
    for (const symbol of symbols) {
      const cacheKey = `watchlist_quote_${symbol}`;
      const { data, hit } = cacheService.getGlobal(cacheKey);
      
      if (hit) {
        results.push(data);
      } else {
        uncachedSymbols.push(symbol);
      }
    }

    if (uncachedSymbols.length === 0) {
      console.log(`All ${symbols.length} watchlist quotes from cache`);
      return results;
    }

    console.log(`Fetching ${uncachedSymbols.length}/${symbols.length} uncached watchlist quotes`);

    try {
      // ✅ IMPROVED: Fetch in smaller batches with delays
      const BATCH_SIZE = 5;
      const BATCH_DELAY = 1000; // 1 second between batches

      for (let i = 0; i < uncachedSymbols.length; i += BATCH_SIZE) {
        const batch = uncachedSymbols.slice(i, i + BATCH_SIZE);

        if (i > 0) {
          await delay(BATCH_DELAY);
        }

        try {
          const quotes = await fetchWithRetry(
            () => yahooFinance.quote(batch, { validateResult: false }),
            { context: `watchlist-batch-${i / BATCH_SIZE + 1}` }
          );

          const quotesArray = Array.isArray(quotes) ? quotes : [quotes];
          
          // Cache each quote individually
          quotesArray.forEach(quote => {
            if (quote?.symbol) {
              const cacheKey = `watchlist_quote_${quote.symbol}`;
              cacheService.setGlobal(cacheKey, quote, 120); // 2 minutes cache
            }
          });

          results.push(...quotesArray);
        } catch (err) {
          console.error(`Batch ${i / BATCH_SIZE + 1} failed:`, err.message);
          
          // Fallback to individual fetching for failed batch
          for (const symbol of batch) {
            try {
              await delay(500);
              const quote = await fetchWithRetry(
                () => yahooFinance.quote(symbol, { validateResult: false }),
                { context: symbol, timeout: 5000, retries: 1 }
              );
              
              const cacheKey = `watchlist_quote_${symbol}`;
              cacheService.setGlobal(cacheKey, quote, 120);
              results.push(quote);
            } catch (symbolErr) {
              console.error(`Failed to fetch ${symbol}:`, symbolErr.message);
              results.push({ symbol, error: true, errorMessage: symbolErr.message });
            }
          }
        }
      }

      return results;
    } catch (err) {
      console.error('Failed to fetch live quotes:', err.message);
      throw new Error('Unable to fetch market data');
    }
  }

  /**
   * ✅ IMPROVED: Added caching for single quote
   */
  async fetchSingleQuote(ticker) {
    const cacheKey = `watchlist_quote_${ticker}`;
    const { data, hit } = cacheService.getGlobal(cacheKey);
    
    if (hit) {
      console.log(`Cache hit for ${ticker}`);
      return this.formatQuoteForStorage(data);
    }

    try {
      const quote = await fetchWithRetry(
        () => yahooFinance.quote(ticker, { validateResult: false }),
        { context: `quote-${ticker}` }
      );

      // Cache for 2 minutes
      cacheService.setGlobal(cacheKey, quote, 120);

      return this.formatQuoteForStorage(quote);
    } catch (err) {
      console.error(`Failed to fetch quote for ${ticker}:`, err.message);
      throw new Error(`Ticker "${ticker}" not found or unavailable`);
    }
  }

  /**
   * ✅ IMPROVED: Added caching and better rate limiting for sparklines
   */
  async fetchSparklineData(symbols) {
    if (!symbols || symbols.length === 0) {
      return [];
    }

    // ✅ CRITICAL: Limit sparkline fetching to prevent rate limits
    const MAX_SPARKLINES = 15;
    const symbolsToFetch = symbols.slice(0, MAX_SPARKLINES);
    
    if (symbols.length > MAX_SPARKLINES) {
      console.warn(
        `Limiting sparkline fetch to ${MAX_SPARKLINES}/${symbols.length} symbols to avoid rate limits`
      );
    }

    const period2 = Math.floor(Date.now() / 1000);
    const period1 = period2 - WATCHLIST_CONFIG.SPARKLINE.DAYS * 24 * 60 * 60;

    const results = [];
    const uncachedSymbols = [];

    // Check cache first
    for (const symbol of symbolsToFetch) {
      const cacheKey = `sparkline_${symbol}_${WATCHLIST_CONFIG.SPARKLINE.DAYS}d`;
      const { data, hit } = cacheService.getGlobal(cacheKey);
      
      if (hit) {
        results.push(data);
      } else {
        uncachedSymbols.push(symbol);
      }
    }

    if (uncachedSymbols.length === 0) {
      console.log(`All ${symbolsToFetch.length} sparklines from cache`);
      
      // Return empty sparklines for symbols beyond the limit
      const emptySparklines = symbols.slice(MAX_SPARKLINES).map(symbol => ({
        symbol,
        timestamps: [],
        closes: [],
        limited: true
      }));
      
      return [...results, ...emptySparklines];
    }

    console.log(`Fetching ${uncachedSymbols.length}/${symbolsToFetch.length} uncached sparklines`);

    // ✅ IMPROVED: Increased delay between sparkline requests
    const SPARKLINE_DELAY = 800; // Increased from 250ms to 800ms

    for (let i = 0; i < uncachedSymbols.length; i++) {
      const symbol = uncachedSymbols[i];

      if (i > 0) {
        await delay(SPARKLINE_DELAY);
      }

      try {
        const chart = await fetchWithRetry(
          () => yahooFinance.chart(symbol, {
            period1,
            period2,
            interval: WATCHLIST_CONFIG.SPARKLINE.INTERVAL,
          }),
          { 
            context: `sparkline-${symbol}`,
            timeout: 8000,
            retries: 1
          }
        );

        const quotes = chart.quotes || [];
        const sparklineData = {
          symbol,
          timestamps: quotes.map((q) => q.date),
          closes: quotes.map((q) => q.close),
        };

        // Cache sparklines for 10 minutes (they don't change often)
        const cacheKey = `sparkline_${symbol}_${WATCHLIST_CONFIG.SPARKLINE.DAYS}d`;
        cacheService.setGlobal(cacheKey, sparklineData, 600);

        results.push(sparklineData);
      } catch (err) {
        console.error(`Sparkline failed for ${symbol}:`, err.message);
        results.push({
          symbol,
          timestamps: [],
          closes: [],
          error: true
        });
      }
    }

    // Add empty sparklines for symbols beyond the limit
    const emptySparklines = symbols.slice(MAX_SPARKLINES).map(symbol => ({
      symbol,
      timestamps: [],
      closes: [],
      limited: true
    }));

    return [...results, ...emptySparklines];
  }

  formatQuoteForStorage(quote) {
    return {
      symbol: quote.symbol,
      company_name: quote.shortName || quote.longName || quote.symbol,
      current_price: quote.regularMarketPrice || null,
      change_percent_daily: quote.regularMarketChangePercent || null,
      market_cap: quote.marketCap || null,
      volume: quote.regularMarketVolume || null,
      average_volume: quote.averageDailyVolume3Month || null,
      fifty_two_week_high: quote.fiftyTwoWeekHigh || null,
      fifty_two_week_low: quote.fiftyTwoWeekLow || null,
      pe_ratio: quote.trailingPE || null,
    };
  }

  mergeWatchlistWithLiveData(watchlist, liveData, sparklineData) {
    return watchlist.map((item) => {
      const live = liveData.find((data) => data.symbol === item.symbol);
      const spark = sparklineData.find((s) => s.symbol === item.symbol);

      return {
        symbol: item.symbol,
        company_name: item.company_name,
        current_price: live?.regularMarketPrice || null,
        change_percent_daily: live?.regularMarketChangePercent || null,
        change_percent_weekly: live?.fiftyTwoWeekChangePercent || null,
        market_cap: live?.marketCap || null,
        volume: live?.regularMarketVolume || null,
        average_volume: live?.averageDailyVolume3Month || null,
        fifty_two_week_high: item.fifty_two_week_high,
        fifty_two_week_low: item.fifty_two_week_low,
        pe_ratio: item.pe_ratio,
        sparkline: {
          timestamps: spark?.timestamps || [],
          closes: spark?.closes || [],
          limited: spark?.limited || false
        },
      };
    });
  }
}

export default new WatchlistQuoteService();