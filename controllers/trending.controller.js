import cacheService from "../services/cache.service.js";
import yahooFinanceService from "../services/yahoo-finance.service.js";
import tickerService from "../services/ticker.service.js";
import { withTimeout } from "../utils/retry.util.js";
import { CONFIG } from "../configs/yahoo-finance.config.js";

class TrendingController {
    async revalidateInBackground(cacheKey, fetchFn) {
        console.log(`Background revalidation: ${cacheKey}`);

        fetchFn()
          .then(freshData => {
            if (freshData?.liveData?.length > 0) {
                cacheService.setGlobal(cacheKey, freshData, CONFIG.CACHE_TTL.FULL_RESPONSE);
                console.log(`Revalidated ${cacheKey}`);
            } else {
                console.warn(`Revalidation skipped for ${cacheKey} (empty live data)`);
            }
          })
          .catch(err => {
            console.error(`Revalidation failed for ${cacheKey}:`, err.message);
          });
    }

    async fetchTrendingStockData() {
        // ✅ IMPROVED: Reduced from 25 to 15 tickers to minimize API calls
        const tickers = await tickerService.getRandomTickers(15);

        // ✅ These calls are already cached by the service layer
        // So parallel execution is safe as long as cache is working
        const [liveData, gainers, losers, active, isTrendingQuote] = await Promise.allSettled([
            yahooFinanceService.fetchLiveData(tickers),
            yahooFinanceService.fetchScreenerData('day_gainers'),
            yahooFinanceService.fetchScreenerData('day_losers'),
            yahooFinanceService.fetchScreenerData('most_actives', 25), // Reduced from 30 to 25
            yahooFinanceService.fetchTrendingSymbols(),
        ]);

        return {
            liveData: liveData.status === 'fulfilled' ? liveData.value : [],
            gainers: gainers.status === 'fulfilled' ? gainers.value : [],
            losers: losers.status === 'fulfilled' ? losers.value : [],
            active: active.status === 'fulfilled' ? active.value : [],
            isTrendingQuote: isTrendingQuote.status === 'fulfilled' ? isTrendingQuote.value : [],
        };
    }

    async getTrendingStock(req, res) {
        const cacheKey = 'trending_stock_full';
        const startTime = Date.now();
        
        try {
            const { data: cachedResponse, hit } = cacheService.getGlobal(cacheKey);
            
            if (hit) {
                console.log(`Cache HIT (${Date.now() - startTime}ms)`);
                
                // ✅ IMPROVED: Only revalidate if stale, not on every hit
                if (cacheService.isStale(cacheKey)) {
                    console.log('Cache stale, triggering background revalidation');
                    this.revalidateInBackground(cacheKey, () => this.fetchTrendingStockData());
                }
                
                return res.json(cachedResponse);
            }
            
            console.log('Cache MISS, fetching fresh data...');
            
            const responseData = await withTimeout(
                this.fetchTrendingStockData(),
                CONFIG.ENDPOINT_TIMEOUT_MS,
                'Endpoint timeout - data fetch took too long'
            );
            
            if (responseData.liveData.length > 0 || 
                responseData.gainers.length > 0 || 
                responseData.active.length > 0) {
                cacheService.setGlobal(cacheKey, responseData, CONFIG.CACHE_TTL.FULL_RESPONSE);
                console.log(`Fresh data cached (${Date.now() - startTime}ms)`);
            } else {
                console.warn(`No data to cache (${Date.now() - startTime}ms)`);
            }
            
            res.json(responseData);
            
        } catch (err) {
            console.error(`/trending-stock error (${Date.now() - startTime}ms):`, err.message);
            
            // ✅ IMPROVED: Handle rate limit errors specifically
            if (err.message?.includes('rate limit') || err.message?.includes('429')) {
                const { data: staleCache } = cacheService.getGlobal(cacheKey);
                if (staleCache) {
                    console.log('Rate limit hit, returning stale cache');
                    return res.json({ ...staleCache, cached: true, stale: true });
                }
                
                return res.status(429).json({
                    error: 'Rate limit exceeded',
                    message: 'Too many requests. Please try again in a moment.',
                    retryAfter: 60
                });
            }
            
            const { data: staleCache } = cacheService.getGlobal(cacheKey);
            if (staleCache) {
                console.log('Returning stale cache as fallback');
                return res.json(staleCache);
            }
            
            res.status(503).json({ 
                error: 'Service temporarily unavailable',
                message: 'Unable to fetch stock data. Please try again in a moment.',
                data: {
                    liveData: [],
                    gainers: [],
                    losers: [],
                    active: [],
                    isTrendingQuote: [],
                }
            });
        }
    }

    async searchTicker(req, res) {
        try {
            const ticker = req.ticker;
            
            // ✅ This is already cached by the service layer
            const quote = await yahooFinanceService.fetchQuote(ticker);
            res.json(quote);
            
        } catch (err) {
            console.error(`Search error:`, err);
            
            if (err.message?.includes('timeout')) {
                return res.status(504).json({ 
                    error: 'Gateway Timeout',
                    message: 'Request took too long. Please try again.'
                });
            }
            
            if (err.message?.includes('rate limit') || err.message?.includes('429')) {
                return res.status(429).json({ 
                    error: 'Rate Limit Exceeded',
                    message: 'Too many requests. Please try again in a moment.',
                    retryAfter: 60
                });
            }
            
            if (err.message?.includes('Not Found') || err.message?.includes('404')) {
                return res.status(404).json({ 
                    error: 'Not Found',
                    message: 'Ticker symbol not found'
                });
            }
            
            res.status(500).json({ 
                error: 'Internal Server Error',
                message: process.env.NODE_ENV === 'development' ? err.message : 'Failed to fetch quote'
            });
        }
    }

    getCacheStats(req, res) {
        const stats = cacheService.getStats();
        const keys = cacheService.keys();
        
        res.json({
            totalKeys: keys.length,
            keys: keys,
            stats: {
                hits: stats.hits,
                misses: stats.misses,
                hitRate: stats.hits + stats.misses > 0 
                    ? `${((stats.hits / (stats.hits + stats.misses)) * 100).toFixed(2)}%`
                    : '0%',
                ksize: stats.ksize,
                vsize: stats.vsize,
            },
            memory: {
                heapUsed: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`,
                heapTotal: `${(process.memoryUsage().heapTotal / 1024 / 1024).toFixed(2)} MB`,
                rss: `${(process.memoryUsage().rss / 1024 / 1024).toFixed(2)} MB`,
            }
        });
    }

    deleteCacheKey(req, res) {
        const { key } = req.params;
        
        if (key) {
            const deleted = cacheService.delete(key);
            if (deleted) {
                console.log(`Deleted cache: ${key}`);
                return res.json({ message: `Deleted: ${key}`, success: true });
            }
            return res.status(404).json({ message: 'Key not found', success: false });
        }
        
        const count = cacheService.keys().length;
        cacheService.flush();
        console.log(`Cleared ${count} cache entries`);
        res.json({ message: `Cleared ${count} entries`, success: true });
    }
}

export default new TrendingController();