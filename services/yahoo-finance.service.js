import yahooFinance from "yahoo-finance2";
import cacheService from "./cache.service.js";
import { delay, fetchWithRetry, withTimeout } from "../utils/retry.util.js";
import { limiter } from "../utils/rate-limiter.util.js";
import { CONFIG , YAHOO_FINANCE_CONFIG } from "../configs/yahoo-finance.config.js";

yahooFinance.setGlobalConfig(YAHOO_FINANCE_CONFIG);

class YahooFinanceService {
    formatQuote(quote) {
        if (!quote?.symbol) return null;

        return {
            symbol:quote.symbol,
            price:typeof quote.regularMarketPrice === 'number' 
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

    async fetchQuote(symbol) {
       const { useCache = true, format = true, fields = [] } = options;
       const cacheKey = `quote_${symbol}`;
       if (useCache) {
          const { data, hit } = cacheService.get(cacheKey);
          if (hit) return data;
        }

        const quote = await withTimeout(
            fetchWithRetry(
                () => yahooFinance.quote(symbol,{ 
                    validateResult: false ,
                    ...(fields.length > 0 && { fields })
                }),
                { context:`Quote ${symbol}`}
            ),
            CONFIG.SEARCH_TIMEOUT,
            'Search timeout'
        );

        const result = format ? this.formatQuote(quote) : quote;
        if (useCache && result) {
            cacheService.set(cacheKey, result , CONFIG.CACHE_TTL.SEARCH);
        }

        return result
    }

    async fetchQuotesBatch(symbols , options = {}) {
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
                'dividendYield',
                'fiftyTwoWeekLow',
                'fiftyTwoWeekHigh'
            ] 
            
        } = options;

        console.log(`fetching ${symbols.length} quotes in batches`);
        const results = [];

        for (let i = 0; i < symbols.length; i += batchSize) {
            const batch = symbols.slice(i, i + batchSize);

            try {
                if (i > 0) {
                    await delay(batchDelay);
                }

                const quotes = await fetchWithRetry(
                    () => 
                        yahooFinance.quote(batch, {
                            fields,
                            validateResult:false
                        }),
                    {
                        context: `Batch ${i}-${i + batchSize}`
                    }
                );

                const quotesArray = Array.isArray(quotes) ? quotes : [quotes];

                console.log(`Fetched ${quotesArray.length}/${batch.length} quotes`);
                results.push(...quotesArray);
            } catch(err) {
                console.error(`Batch ${i}-${i + batchSize} completely failed:`, err.message);
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

         const successCount = results.filter((r) => !r.error).length;
         console.log(`Final: ${successCount}/${symbols.length} quotes fetched`);

         return results;
    }

    async fetchLiveData(symbols) {
        if (!symbols?.length) return [];

        const cacheKey = `live_data_${symbols.sort().join('_')}`;
        const { data , hit } = cacheService.get(cacheKey)
        if (hit) return data
        
        console.log(`Fetching ${symbols.length} quotes in batches of ${CONFIG.BATCH_SIZE}`);

        const batches = [];
        for (let i = 0; i < symbols.length; i += CONFIG.BATCH_SIZE) {
            batches.push(symbols.slice(i,i + CONFIG.BATCH_SIZE))
        }

        const results = await withTimeout(
            Promise.all(
                batches.map((batch,idx) => limiter(() => this.#fetchBatch(batch,idx)))
            ),
            CONFIG.BATCH_PROCESSING_TIMEOUT,
            'Batch processing timed out'
        ).catch(err => {
            console.error('fetchLiveData failed:' , err.message)
            return []
        });

        const flatResults = results.flat().filter(Boolean);

        if (flatResults.length > 0) {
            cacheService.set(cacheKey, flatResults , CONFIG.CACHE_TTL.LIVE_DATA);
        }

         console.log(`Fetched ${flatResults.length}/${symbols.length} quotes successfully`);

         return flatResults;
    }

    async #fetchBatch(batch, batchIndex) {
        try {
            const quotes = await fetchWithRetry(
                () => yahooFinance.quote(batch , {
                    fields: ['symbol', 'regularMarketPrice', 'regularMarketChange', 
                   'regularMarketChangePercent', 'marketCap', 'regularMarketVolume',
                   'currency', 'fullExchangeName'],
                    validateResult: false 
                }), 
                { context: `Batch ${batchIndex + 1}`}
            );

            const quotesArray = Array.isArray(quotes) ? quotes : [quotes];
            const formatted = quotesArray
            .filter(q => q && q.symbol && q.regularMarketPrice !== undefined)
            .map(q => this.formatQuote(q))
            .filter(Boolean);

            console.log(`Batch ${batchIndex + 1}: ${formatted.length}/${batch.length} quotes`);
            return formatted;
        } catch(err) {
           console.error(`Batch ${batchIndex + 1} failed completely:`, err.message);
            return await this._fetchIndividually(batch, batchIndex); 
        }
    }

    async #fetchIndividually(batch, batchIndex) {
        console.log(`Fetching batch ${batchIndex + 1} individually...`);
        
        const results = await Promise.allSettled(
            batch.map(symbol => 
            yahooFinance.quote(symbol, { validateResult: false })
                .then(quote => this.formatQuote(quote))
                .catch(err => {
                console.log(`⚠️ Skipping invalid ticker: ${symbol}`);
                return null;
                })
            )
        );
  
        const formatted = results
            .filter(r => r.status === 'fulfilled' && r.value)
            .map(r => r.value);
        
        console.log(`✅ Batch ${batchIndex + 1} (individual): ${formatted.length}/${batch.length} quotes`);
        return formatted;
    }

    async fetchScreenerData(screenerId,count = 25) {
        const cacheKey = `screener_${screenerId}_${count}`
        const { data, hit } = cacheService.get(cacheKey);
        if (hit) return data;

        try {
            const result = await fetchWithRetry(
                () => yahooFinance.screener({scrIds: screenerId , count },
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
            cacheService.set(cacheKey, formatted, CONFIG.CACHE_TTL.SCREENER);
            return formatted;
        } catch(err) {
            console.log(`Screener ${screenerId} failed:`, err.message)
            return [];
        }
    }

    async fetchTrendingSymbols() {
        const cacheKey = 'trending_quotes';
        const { data, hit } = cacheService.get(cacheKey);
        if (hit) return data;
        
        try {
        const trend = await fetchWithRetry(
            () => yahooFinance.trendingSymbols('US',{ validateResult: false }),
            { context: 'Trending Symbols' }
        );
        
        const trendingSymbols = trend.quotes.slice(0, 10).map(q => q.symbol);
        console.log(`Trending: ${trendingSymbols.length} symbols`);
        
        const trendingData = await this.fetchLiveData(trendingSymbols);
        
        if (trendingData.length > 0) {
            cacheService.set(cacheKey, trendingData, CONFIG.CACHE_TTL.TRENDING);
        }

        return trendingData;
        
        } catch (err) {
        console.error(`Trending symbols failed:`, err.message);
        return [];
        }
    }

    async fetchHistory(symbols, period1, period2, options = {}) {
        if (!symbols.length) return [];

        const { delay = 300, interval = '1d' } = options;

        console.log(`fetching history for ${symbols.length} symbols...`);
        const results = [];
        for (const symbol of symbols) {
            try {
                await delay(delay)
           
                const history = await fetchWithRetry(
                    () => yahooFinance.chart(symbol , {
                        period1,
                        period2,
                        interval
                    }),
                    {
                        context: `History ${symbol}`,
                        timeout: 8000,
                        retries: 1
                });

                results.push({ symbol, data: history});
                console.log(`history: ${symbol}`)
            } catch(err) {
                console.error(` History failed for ${symbol}:`, err.message);
                results.push({ symbol, data: null, error: true });
            }
        }

        return results

    }
}

export default new YahooFinanceService();