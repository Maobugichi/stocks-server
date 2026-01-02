import yahooFinance from 'yahoo-finance2';
import { WATCHLIST_CONFIG } from '../config/watchlist.config.js';

yahooFinance.setGlobalConfig({
  validation: { logErrors: false, logWarnings: false },
  validateResult: false,
});

class WatchlistQuoteService {
  async fetchLiveQuotes(symbols) {
    if (!symbols || symbols.length === 0) {
      return [];
    }

    try {
      const quotes = await yahooFinance.quote(symbols, {
        validateResult: false,
      });

      return Array.isArray(quotes) ? quotes : [quotes];
    } catch (err) {
      console.error('Failed to fetch live quotes:', err.message);
      throw new Error('Unable to fetch market data');
    }
  }

  async fetchSingleQuote(ticker) {
    try {
      const quote = await yahooFinance.quote(ticker, {
        validateResult: false,
      });

      return this.formatQuoteForStorage(quote);
    } catch (err) {
      console.error(`Failed to fetch quote for ${ticker}:`, err.message);
      throw new Error(`Ticker "${ticker}" not found or unavailable`);
    }
  }

  async fetchSparklineData(symbols) {
    if (!symbols || symbols.length === 0) {
      return [];
    }

    const period2 = Math.floor(Date.now() / 1000);
    const period1 = period2 - WATCHLIST_CONFIG.SPARKLINE.DAYS * 24 * 60 * 60;

    const sparklinePromises = symbols.map(async (symbol) => {
      try {
        const chart = await yahooFinance.chart(symbol, {
          period1,
          period2,
          interval: WATCHLIST_CONFIG.SPARKLINE.INTERVAL,
        });

        const quotes = chart.quotes || [];

        return {
          symbol,
          timestamps: quotes.map((q) => q.date),
          closes: quotes.map((q) => q.close),
        };
      } catch (err) {
        console.error(`Sparkline failed for ${symbol}:`, err.message);
        return {
          symbol,
          timestamps: [],
          closes: [],
        };
      }
    });

    return await Promise.all(sparklinePromises);
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
        pe_ratio: item.pe_ration,
        sparkline: {
          timestamps: spark?.timestamps || [],
          closes: spark?.closes || [],
        },
      };
    });
  }
}

export default new WatchlistQuoteService();