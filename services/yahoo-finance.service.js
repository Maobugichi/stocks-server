import yahooFinance from "yahoo-finance2";
import cacheService from "./cache.service.js";
import { fetchWithRetry, withTimeout } from "../utils/retry.util.js";
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

    async fetchQuote(symbol) {
        const cacheKey = `search_${symbol}`;
        const { data , hit } = cacheService.get(cacheKey);
        if (hit) return data;

        const quote = await withTimeout(
            fetchWithRetry(
                () => yahooFinance.quote(symbol),
                { context:` Search ${symbol}`}
            ),
            CONFIG.SEARCH_TIMEOUT,
            'Search timeout'
        );

        const formatted = this.formatQuote(quote);
        if (formatted) {
            cacheService.set(cacheKey, formatted , CONFIG.CACHE_TTL.SEARCH);
            return formatted
        }

        return quote
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
                   'currency', 'fullExchangeName']
                }), 
                { context: `Batch ${batchIndex + 1}`}
            );

            const quotesArray = Array.isArray(quotes) ? quotes : [quotes];
            const formatted = quotesArray.map(q => this.formatQuote(q)).filter(Boolean);

            console.log(`Batch ${batchIndex + 1}: ${formatted.length}/${batch.length} quotes`);
            return formatted;
        } catch(err) {
           console.error(`Batch ${batchIndex + 1} failed completely:`, err.message);
           return []; 
        }
    }

    async fetchScreenerData(screenerId) {
        const cacheKey = `screener_${screenerId}`
        const { data, hit } = cacheService.get(cacheKey);
        if (hit) return data;

        try {
            const result = await fetchWithRetry(
                () => yahooFinance.screener({scrIds: screenerId , count: 10 }),
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
            () => yahooFinance.trendingSymbols('US'),
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
}