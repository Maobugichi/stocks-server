import yahooFinance from "yahoo-finance2";
import cacheService from "./cache.service.js";
import { delay, fetchWithRetry, withTimeout } from "../utils/retry.util.js";
import { limiter } from "../utils/rate-limiter.util.js";
import { CONFIG, YAHOO_FINANCE_CONFIG } from "../configs/yahoo-finance.config.js";

yahooFinance.setGlobalConfig(YAHOO_FINANCE_CONFIG);

class YahooFinanceService {
    formatQuote(quote) {
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
        }
    }

    formatQuoteDetailed(quote) {
        if (!quote?.symbol) return null;

        return {
            symbol: quote.symbol,
            regularMarketPrice: quote.regularMarketPrice || 0,
            regularMarketPreviousClose: quote.regularMarketPreviousClose || 0,
            marketCap: quote.marketCap || null,
            trailingPE: quote.trailingPE || null,
            dividendYield: quote.dividendYield || null,
            fiftyTwoWeekLow: quote.fiftyTwoWeekLow || null,
            fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh || null,
        };
    }

    
    async fetchQuote(symbol, options = {}) {
        const { useCache = true, format = true, fields = [] } = options;
        const cacheKey = `quote_${symbol}`;
        
        if (useCache) {
            const { data, hit } = cacheService.getGlobal(cacheKey);
            if (hit) {
                console.log(`Cache hit: ${symbol}`);
                return data;
            }
        }

        console.log(`Fetching quote: ${symbol}`);
        const quote = await withTimeout(
            fetchWithRetry(
                () => yahooFinance.quote(symbol, { 
                    validateResult: false,
                    ...(fields.length > 0 && { fields })
                }),
                { context: `Quote ${symbol}` }
            ),
            CONFIG.SEARCH_TIMEOUT,
            'Search timeout'
        );

        const result = format ? this.formatQuote(quote) : quote;
        if (useCache && result) {
            cacheService.setGlobal(cacheKey, result, CONFIG.CACHE_TTL.QUOTE || 60);
        }

        return result;
    }

   
    async fetchQuotesBatch(symbols, options = {}) {
        if (!symbols.length) return [];

        const {
            batchSize = 5,
            batchDelay = 500,
            individualDelay = 200,
            fields = [
                'symbol',
                'regularMarketPrice',
                'regularMarketPreviousClose',
                'marketCap',
                'trailingPE',
                'fiftyTwoWeekLow',
                'fiftyTwoWeekHigh'
            ] 
        } = options;

        console.log(`Fetching ${symbols.length} quotes in batches`);
        const results = [];
        const uncachedSymbols = [];

        
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

       
        for (let i = 0; i < uncachedSymbols.length; i += batchSize) {
            const batch = uncachedSymbols.slice(i, i + batchSize);

            try {
                if (i > 0) {
                    await delay(batchDelay);
                }

                const quotes = await fetchWithRetry(
                    () => yahooFinance.quote(batch, {
                        fields,
                        validateResult: false
                    }),
                    { context: `Batch ${i}-${i + batchSize}` }
                );

                const quotesArray = Array.isArray(quotes) ? quotes : [quotes];
                
                
                quotesArray.forEach(quote => {
                    if (quote?.symbol) {
                        cacheService.setGlobal(`quote_${quote.symbol}`, quote, CONFIG.CACHE_TTL.QUOTE || 60);
                    }
                });

                results.push(...quotesArray);
                console.log(`Fetched ${quotesArray.length}/${batch.length} quotes`);
            } catch (err) {
                console.error(`Batch ${i}-${i + batchSize} failed:`, err.message);
                
              
                for (const symbol of batch) {
                    try {
                        await delay(individualDelay);
                        const quote = await fetchWithRetry(
                            () => yahooFinance.quote(symbol),
                            { context: symbol, timeout: 5000, retries: 1 }
                        );
                        
                        cacheService.setGlobal(`quote_${symbol}`, quote, CONFIG.CACHE_TTL.QUOTE || 60);
                        results.push(quote);
                        console.log(`Fallback success: ${symbol}`);
                    } catch (symbolErr) {
                        console.error(`Failed to fetch ${symbol}:`, symbolErr.message);
                        results.push({ symbol, error: true, errorMessage: symbolErr.message });
                    }
                }
            }
        }

        const successCount = results.filter((r) => !r.error).length;
        console.log(`Final: ${successCount}/${symbols.length} quotes (${results.length - uncachedSymbols.length} cached)`);

        return results;
    }

   
    async fetchLiveData(symbols) {
        if (!symbols?.length) return [];

       
        const sortedSymbols = [...symbols].sort();
        const cacheKey = `live_data_${sortedSymbols.join('_')}`;
        
        const { data, hit, age } = cacheService.getGlobal(cacheKey);
        if (hit) {
            console.log(`Live data from cache (${Math.floor(age / 1000)}s old)`);
            return data;
        }
        
        console.log(`Fetching live data for ${symbols.length} quotes`);

        const batches = [];
        for (let i = 0; i < symbols.length; i += CONFIG.BATCH_SIZE) {
            batches.push(symbols.slice(i, i + CONFIG.BATCH_SIZE));
        }

        const results = await withTimeout(
            Promise.all(
                batches.map((batch, idx) => limiter(() => this.#fetchBatch(batch, idx)))
            ),
            CONFIG.BATCH_PROCESSING_TIMEOUT,
            'Batch processing timed out'
        ).catch(err => {
            console.error('fetchLiveData failed:', err.message);
            return [];
        });

        const flatResults = results.flat().filter(Boolean);

        if (flatResults.length > 0) {
            cacheService.setGlobal(cacheKey, flatResults, CONFIG.CACHE_TTL.LIVE_DATA || 60);
            console.log(`Cached ${flatResults.length} live quotes`);
        } else {
            console.log('No data to cache');
        }

        console.log(`Fetched ${flatResults.length}/${symbols.length} quotes successfully`);

        return flatResults;
    }

    async #fetchBatch(batch, batchIndex) {
        try {
            const quotes = await fetchWithRetry(
                () => yahooFinance.quote(batch, {
                    fields: [
                        'symbol', 
                        'regularMarketPrice', 
                        'regularMarketChange', 
                        'regularMarketChangePercent', 
                        'marketCap', 
                        'regularMarketVolume',
                        'currency', 
                        'fullExchangeName'
                    ],
                    validateResult: false 
                }), 
                { context: `Batch ${batchIndex + 1}` }
            );

            const quotesArray = Array.isArray(quotes) ? quotes : [quotes];
            const formatted = quotesArray
                .filter(q => q && q.symbol && q.regularMarketPrice !== undefined)
                .map(q => this.formatQuote(q))
                .filter(Boolean);

            console.log(`✅ Batch ${batchIndex + 1}: ${formatted.length}/${batch.length} quotes`);
            return formatted;
        } catch (err) {
            console.error(`❌ Batch ${batchIndex + 1} failed:`, err.message);
            return await this.#fetchIndividually(batch, batchIndex); 
        }
    }

    async #fetchIndividually(batch, batchIndex) {
        console.log(`🔄 Fetching batch ${batchIndex + 1} individually...`);
        
        const results = await Promise.allSettled(
            batch.map(async (symbol) => {
                try {
                    await delay(200);
                    const quote = await yahooFinance.quote(symbol, { validateResult: false });
                    return this.formatQuote(quote);
                } catch (err) {
                    console.log(`⚠️ Skipping invalid ticker: ${symbol}`);
                    return null;
                }
            })
        );
  
        const formatted = results
            .filter(r => r.status === 'fulfilled' && r.value)
            .map(r => r.value);
        
        console.log(`✅ Batch ${batchIndex + 1} (individual): ${formatted.length}/${batch.length} quotes`);
        return formatted;
    }

 
    async fetchScreenerData(screenerId, count = 25) {
        const cacheKey = `screener_${screenerId}_${count}`;
        const { data, hit, age } = cacheService.getGlobal(cacheKey);
        
        if (hit) {
            console.log(`💾 Screener ${screenerId} from cache (${Math.floor(age / 1000)}s old)`);
            return data;
        }

        console.log(`🌐 Fetching screener: ${screenerId}`);
        try {
            const result = await fetchWithRetry(
                () => yahooFinance.screener(
                    { scrIds: screenerId, count },
                    { validateResult: false }
                ),
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
            
            cacheService.setGlobal(cacheKey, formatted, CONFIG.CACHE_TTL.SCREENER || 300);
            console.log(`✅ Cached screener ${screenerId}`);
            return formatted;
        } catch (err) {
            console.error(`❌ Screener ${screenerId} failed:`, err.message);
            return [];
        }
    }

    /**
     * Fetch trending symbols (GLOBAL CACHE - same for all users)
     */
    async fetchTrendingSymbols() {
        const cacheKey = 'trending_quotes';
        const { data, hit, age } = cacheService.getGlobal(cacheKey);
        
        if (hit) {
            console.log(`💾 Trending from cache (${Math.floor(age / 1000)}s old)`);
            return data;
        }
        
        console.log(`🌐 Fetching trending symbols`);
        try {
            const trend = await fetchWithRetry(
                () => yahooFinance.trendingSymbols('US', { validateResult: false }),
                { context: 'Trending Symbols' }
            );
            
            const trendingSymbols = trend.quotes.slice(0, 10).map(q => q.symbol);
            console.log(`📊 Trending: ${trendingSymbols.length} symbols`);
            
            const trendingData = await this.fetchLiveData(trendingSymbols);
            
            if (trendingData.length > 0) {
                cacheService.setGlobal(cacheKey, trendingData, CONFIG.CACHE_TTL.TRENDING || 180);
                console.log(`✅ Cached trending data`);
            }

            return trendingData;
        } catch (err) {
            console.error(`❌ Trending symbols failed:`, err.message);
            return [];
        }
    }

    /**
     * Fetch history (can be USER-SPECIFIC if needed)
     */
    async fetchHistory(symbols, period1, period2, options = {}) {
        if (!symbols.length) return [];

        const { delayMs = 300, interval = '1d', userId = null } = options;

        console.log(`📈 Fetching history for ${symbols.length} symbols...`);
        const results = [];
        
        for (const symbol of symbols) {
            const cacheKey = `history_${symbol}_${period1}_${period2}_${interval}`;
            
            // Check cache (global since history is same for everyone)
            const { data, hit } = cacheService.getGlobal(cacheKey);
            if (hit) {
                results.push(data);
                console.log(`💾 History ${symbol} from cache`);
                continue;
            }

            try {
                await delay(delayMs);
           
                const history = await fetchWithRetry(
                    () => yahooFinance.chart(symbol, {
                        period1,
                        period2,
                        interval
                    }),
                    {
                        context: `History ${symbol}`,
                        timeout: 8000,
                        retries: 1
                    }
                );

                const result = { symbol, data: history };
                results.push(result);
                
                // Cache for 1 hour (historical data doesn't change)
                cacheService.setGlobal(cacheKey, result, 3600);
                console.log(`✅ History: ${symbol}`);
            } catch (err) {
                console.error(`❌ History failed for ${symbol}:`, err.message);
                results.push({ symbol, data: null, error: true });
            }
        }

        return results;
    }
}

export default new YahooFinanceService();