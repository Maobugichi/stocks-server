import yahooFinance from "yahoo-finance2";
import axios from 'axios';
import cacheService from "./cache.service.js";
import { delay, fetchWithRetry, withTimeout } from "../utils/retry.util.js";
import { CONFIG, YAHOO_FINANCE_CONFIG } from "../configs/yahoo-finance.config.js";

yahooFinance.setGlobalConfig(YAHOO_FINANCE_CONFIG);

const FINNHUB_API_KEY = process.env.FINN_KEY;
const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1';

class HybridFinanceService {
    constructor() {
        this.yahooFailCount = 0;
        this.maxYahooFails = 3;
        this.useFinnhubOnly = false;
    }

    formatQuote(quote, source = 'yahoo') {
        if (!quote) return null;

        if (source === 'finnhub') {
            return {
                symbol: quote.symbol,
                price: quote.c || null,
                changePercent: quote.dp || null,
                marketCap: null, // Finnhub free tier doesn't have this
                volume: null, // Would need separate call
                currency: 'USD',
                exchange: 'N/A',
                source: 'finnhub'
            };
        }

       
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
            source: 'yahoo'
        };
    }

  
    async #fetchFromFinnhub(symbol) {
        if (!FINNHUB_API_KEY) {
            throw new Error('Finnhub API key not configured');
        }

        console.log(`Finnhub: ${symbol}`);
        const response = await axios.get(`${FINNHUB_BASE_URL}/quote`, {
            params: { symbol, token: FINNHUB_API_KEY },
            timeout: 5000
        });

        return {
            symbol,
            ...response.data
        };
    }

  
    async #fetchFromYahoo(symbol) {
        console.log(`Yahoo: ${symbol}`);
        return await yahooFinance.quote(symbol, { 
            validateResult: false,
            fields: [
                'symbol', 
                'regularMarketPrice', 
                'regularMarketChangePercent', 
                'marketCap', 
                'regularMarketVolume',
                'currency', 
                'fullExchangeName'
            ]
        });
    }

    
    async fetchQuote(symbol, options = {}) {
        const { useCache = true, format = true, forceFinnhub = false } = options;
        const cacheKey = `quote_${symbol}`;
        
      
        if (useCache) {
            const { data, hit } = cacheService.getGlobal(cacheKey);
            if (hit) {
                console.log(`💾 Cache: ${symbol}`);
                return data;
            }
        }

        let result = null;
        let source = 'yahoo';

      
        if (forceFinnhub || this.useFinnhubOnly) {
            try {
                const quote = await this.#fetchFromFinnhub(symbol);
                result = format ? this.formatQuote(quote, 'finnhub') : quote;
                source = 'finnhub';
            } catch (err) {
                console.error(`Finnhub failed for ${symbol}:`, err.message);
                throw err;
            }
        } else {
           
            try {
                const quote = await this.#fetchFromYahoo(symbol);
                result = format ? this.formatQuote(quote, 'yahoo') : quote;
                this.yahooFailCount = 0; // Reset fail counter on success
                source = 'yahoo';
            } catch (err) {
                console.error(`⚠️ Yahoo failed for ${symbol}, trying Finnhub...`);
                this.yahooFailCount++;

               
                if (this.yahooFailCount >= this.maxYahooFails) {
                    console.log('🔄 Switching to Finnhub-only mode due to repeated Yahoo failures');
                    this.useFinnhubOnly = true;
                }

              
                try {
                    const quote = await this.#fetchFromFinnhub(symbol);
                    result = format ? this.formatQuote(quote, 'finnhub') : quote;
                    source = 'finnhub';
                } catch (finnhubErr) {
                    console.error(`❌ Both sources failed for ${symbol}`);
                    throw new Error(`Failed to fetch ${symbol} from any source`);
                }
            }
        }

        // Cache the result
        if (useCache && result) {
            cacheService.setGlobal(cacheKey, result, CONFIG.CACHE_TTL.QUOTE || 120);
        }

        return result;
    }

    /**
     * Batch fetch with intelligent routing
     * - Use Yahoo for bulk requests (when available)
     * - Use Finnhub for individual requests or as fallback
     */
    async fetchQuotesBatch(symbols, options = {}) {
        if (!symbols.length) return [];

        const {
            batchSize = 5,
            batchDelay = 1000,
            preferFinnhub = false
        } = options;

        console.log(`Fetching ${symbols.length} quotes in batches`);
        const results = [];
        const uncachedSymbols = [];

        // Check cache first
        for (const symbol of symbols) {
            const { data, hit } = cacheService.getGlobal(`quote_${symbol}`);
            if (hit) {
                results.push(data);
            } else {
                uncachedSymbols.push(symbol);
            }
        }

        if (uncachedSymbols.length === 0) {
            console.log(`All ${symbols.length} quotes from cache`);
            return results;
        }

        console.log(`Fetching ${uncachedSymbols.length} uncached quotes`);

        // Route strategy
        if (preferFinnhub || this.useFinnhubOnly) {
            // Use Finnhub with rate limiting (60/min = 1 per second)
            console.log('Using Finnhub for batch...');
            for (const symbol of uncachedSymbols) {
                try {
                    await delay(1100); // Stay under 60/min limit
                    const quote = await this.fetchQuote(symbol, { forceFinnhub: true });
                    results.push(quote);
                } catch (err) {
                    console.error(`Failed ${symbol}:`, err.message);
                    results.push({ symbol, error: true, errorMessage: err.message });
                }
            }
        } else {
            // Try Yahoo batch first
            for (let i = 0; i < uncachedSymbols.length; i += batchSize) {
                const batch = uncachedSymbols.slice(i, i + batchSize);

                try {
                    if (i > 0) await delay(batchDelay);

                    const quotes = await fetchWithRetry(
                        () => yahooFinance.quote(batch, {
                            validateResult: false,
                            fields: [
                                'symbol', 
                                'regularMarketPrice', 
                                'regularMarketChangePercent', 
                                'marketCap', 
                                'regularMarketVolume',
                                'currency', 
                                'fullExchangeName'
                            ]
                        }),
                        { context: `Batch ${i}-${i + batchSize}`, retries: 1, timeout: 10000 }
                    );

                    const quotesArray = Array.isArray(quotes) ? quotes : [quotes];
                    
                    quotesArray.forEach(quote => {
                        if (quote?.symbol) {
                            const formatted = this.formatQuote(quote, 'yahoo');
                            cacheService.setGlobal(`quote_${quote.symbol}`, formatted, CONFIG.CACHE_TTL.QUOTE);
                            results.push(formatted);
                        }
                    });

                    console.log(`✅ Yahoo batch: ${quotesArray.length}/${batch.length}`);
                    this.yahooFailCount = 0; // Reset on success
                } catch (err) {
                    console.error(`❌ Yahoo batch failed, switching to Finnhub fallback...`);
                    this.yahooFailCount++;

                    if (this.yahooFailCount >= this.maxYahooFails) {
                        this.useFinnhubOnly = true;
                    }

                    // Fallback to Finnhub for failed batch
                    for (const symbol of batch) {
                        try {
                            await delay(1100);
                            const quote = await this.fetchQuote(symbol, { forceFinnhub: true });
                            results.push(quote);
                        } catch (symbolErr) {
                            console.error(`Failed ${symbol}:`, symbolErr.message);
                            results.push({ symbol, error: true, errorMessage: symbolErr.message });
                        }
                    }
                }
            }
        }

        const successCount = results.filter(r => !r.error).length;
        console.log(`Final: ${successCount}/${symbols.length} quotes fetched`);

        return results;
    }

  
    async fetchHistory(symbols, period1, period2, options = {}) {
        const { delayMs = 1000, interval = '1d' } = options;
        console.log(`📈Fetching history for ${symbols.length} symbols (Yahoo only)...`);
        
        const results = [];
        
        for (const symbol of symbols) {
            const cacheKey = `history_${symbol}_${period1}_${period2}_${interval}`;
            
            const { data, hit } = cacheService.getGlobal(cacheKey);
            if (hit) {
                results.push(data);
                continue;
            }

            try {
                await delay(delayMs);
                const history = await fetchWithRetry(
                    () => yahooFinance.chart(symbol, { period1, period2, interval }),
                    { context: `History ${symbol}`, timeout: 8000, retries: 2 }
                );

                const result = { symbol, data: history };
                results.push(result);
                cacheService.setGlobal(cacheKey, result, 3600);
                console.log(`✅ History: ${symbol}`);
            } catch (err) {
                console.error(`❌ History failed for ${symbol}:`, err.message);
                results.push({ symbol, data: null, error: true });
            }
        }

        return results;
    }

    async fetchTrendingSymbols() {
        const cacheKey = 'trending_quotes';
        const { data, hit } = cacheService.getGlobal(cacheKey);
        
        if (hit) {
            console.log(`💾 Trending from cache`);
            return data;
        }
        
        console.log(`🌐 Fetching trending symbols (Yahoo only)`);
        try {
            const trend = await fetchWithRetry(
                () => yahooFinance.trendingSymbols('US', { validateResult: false }),
                { context: 'Trending', retries: 2 }
            );
            
            const trendingSymbols = trend.quotes.slice(0, 10).map(q => q.symbol);
            const trendingData = await this.fetchQuotesBatch(trendingSymbols);
            
            if (trendingData.length > 0) {
                cacheService.setGlobal(cacheKey, trendingData, CONFIG.CACHE_TTL.TRENDING || 180);
            }

            return trendingData;
        } catch (err) {
            console.error(`❌ Trending failed:`, err.message);
            return [];
        }
    }

   
    resetYahooStatus() {
        console.log('🔄 Resetting Yahoo status, will retry Yahoo on next request');
        this.yahooFailCount = 0;
        this.useFinnhubOnly = false;
    }

   
    getStatus() {
        return {
            useFinnhubOnly: this.useFinnhubOnly,
            yahooFailCount: this.yahooFailCount,
            primarySource: this.useFinnhubOnly ? 'finnhub' : 'yahoo'
        };
    }
}

export default new HybridFinanceService();