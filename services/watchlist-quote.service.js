import axios from 'axios';
import { WATCHLIST_CONFIG } from "../configs/watchlist.config.js";

const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1';
const FINNHUB_API_KEY = process.env.FINN_KEY;

class WatchlistQuoteService {
  constructor() {
    this.client = axios.create({
      baseURL: FINNHUB_BASE_URL,
      params: {
        token: FINNHUB_API_KEY
      }
    });
  }

  async fetchLiveQuotes(symbols) {
    if (!symbols || symbols.length === 0) {
      return [];
    }

    try {
      // Finnhub doesn't support batch quotes, so we need to fetch individually
      // Add delays to respect rate limits (60 calls/min = ~1 call per second)
      const quotes = [];
      
      for (const symbol of symbols) {
        try {
          const response = await this.client.get('/quote', {
            params: { symbol }
          });
          
          quotes.push({
            symbol,
            ...response.data
          });
          
          // Add 1 second delay between requests to stay under rate limit
          if (symbols.indexOf(symbol) < symbols.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1100));
          }
        } catch (err) {
          console.error(`Failed to fetch quote for ${symbol}:`, err.message);
          quotes.push({
            symbol,
            error: true
          });
        }
      }

      return quotes;
    } catch (err) {
      console.error('Failed to fetch live quotes:', err.message);
      throw new Error('Unable to fetch market data');
    }
  }

  async fetchSingleQuote(ticker) {
    try {
      const response = await this.client.get('/quote', {
        params: { symbol: ticker }
      });

      // Also fetch company profile for company name
      const profileResponse = await this.client.get('/stock/profile2', {
        params: { symbol: ticker }
      });

      return this.formatQuoteForStorage({
        ...response.data,
        profile: profileResponse.data
      }, ticker);
    } catch (err) {
      console.error(`Failed to fetch quote for ${ticker}:`, err.message);
      throw new Error(`Ticker "${ticker}" not found or unavailable`);
    }
  }

  async fetchSparklineData(symbols) {
    if (!symbols || symbols.length === 0) {
      return [];
    }

    const to = Math.floor(Date.now() / 1000);
    const from = to - (WATCHLIST_CONFIG.SPARKLINE.DAYS * 24 * 60 * 60);
    
    // Map interval format: '1d' -> 'D'
    const resolution = WATCHLIST_CONFIG.SPARKLINE.INTERVAL === '1d' ? 'D' : 
                       WATCHLIST_CONFIG.SPARKLINE.INTERVAL === '1h' ? '60' : 'D';

    const sparklinePromises = symbols.map(async (symbol) => {
      try {
        // Add delay to respect rate limits
        await new Promise(resolve => 
          setTimeout(resolve, symbols.indexOf(symbol) * 1100)
        );

        const response = await this.client.get('/stock/candle', {
          params: {
            symbol,
            resolution,
            from,
            to
          }
        });

        const data = response.data;

        // Finnhub returns 's': 'no_data' when no data is available
        if (data.s === 'no_data' || !data.t || !data.c) {
          return {
            symbol,
            timestamps: [],
            closes: [],
          };
        }

        return {
          symbol,
          timestamps: data.t.map(ts => new Date(ts * 1000)),
          closes: data.c,
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

  formatQuoteForStorage(quote, symbol) {
    // Finnhub quote response format:
    // c: Current price
    // d: Change
    // dp: Percent change
    // h: High price of the day
    // l: Low price of the day
    // o: Open price of the day
    // pc: Previous close price
    
    return {
      symbol: symbol,
      company_name: quote.profile?.name || symbol,
      current_price: quote.c || null,
      change_percent_daily: quote.dp || null,
      market_cap: quote.profile?.marketCapitalization ? 
                   quote.profile.marketCapitalization * 1000000 : null, // Finnhub returns in millions
      volume: null, // Not available in quote endpoint, use candle endpoint instead
      average_volume: null, // Not available in free tier
      fifty_two_week_high: quote.h || null,
      fifty_two_week_low: quote.l || null,
      pe_ratio: null, // Available in company_basic_financials endpoint
    };
  }

  async fetchCompanyProfile(symbol) {
    try {
      const response = await this.client.get('/stock/profile2', {
        params: { symbol }
      });
      return response.data;
    } catch (err) {
      console.error(`Failed to fetch profile for ${symbol}:`, err.message);
      return null;
    }
  }

  async fetchBasicFinancials(symbol) {
    try {
      const response = await this.client.get('/stock/metric', {
        params: { 
          symbol,
          metric: 'all'
        }
      });
      return response.data;
    } catch (err) {
      console.error(`Failed to fetch financials for ${symbol}:`, err.message);
      return null;
    }
  }

  mergeWatchlistWithLiveData(watchlist, liveData, sparklineData) {
    return watchlist.map((item) => {
      const live = liveData.find((data) => data.symbol === item.symbol);
      const spark = sparklineData.find((s) => s.symbol === item.symbol);

      // Finnhub quote format:
      // c: current price
      // dp: percent change
      // h: high
      // l: low
      
      return {
        symbol: item.symbol,
        company_name: item.company_name,
        current_price: live?.c || null,
        change_percent_daily: live?.dp || null,
        change_percent_weekly: null, // Would need to calculate from historical data
        market_cap: item.market_cap,
        volume: null, // Not in quote endpoint
        average_volume: item.average_volume,
        fifty_two_week_high: live?.h || item.fifty_two_week_high,
        fifty_two_week_low: live?.l || item.fifty_two_week_low,
        pe_ratio: item.pe_ratio,
        sparkline: {
          timestamps: spark?.timestamps || [],
          closes: spark?.closes || [],
        },
      };
    });
  }

  // Helper method to batch requests with rate limiting
  async batchFetchWithRateLimit(symbols, fetchFn, delayMs = 1100) {
    const results = [];
    
    for (let i = 0; i < symbols.length; i++) {
      const symbol = symbols[i];
      
      try {
        const result = await fetchFn(symbol);
        results.push(result);
        
        // Add delay between requests (except for the last one)
        if (i < symbols.length - 1) {
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      } catch (err) {
        console.error(`Failed to fetch ${symbol}:`, err.message);
        results.push({ symbol, error: true });
      }
    }
    
    return results;
  }

  // Enhanced version with profile data
  async fetchEnhancedQuotes(symbols) {
    if (!symbols || symbols.length === 0) {
      return [];
    }

    return await this.batchFetchWithRateLimit(symbols, async (symbol) => {
      const [quoteResponse, profileResponse] = await Promise.all([
        this.client.get('/quote', { params: { symbol } }),
        this.client.get('/stock/profile2', { params: { symbol } })
      ]);

      return {
        symbol,
        quote: quoteResponse.data,
        profile: profileResponse.data
      };
    });
  }
}

export default new WatchlistQuoteService();