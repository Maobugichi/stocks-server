import watchlistDataService from '../services/watchlist-data.service.js';
import watchlistQuoteService from '../services/watchlist-quote.service.js';
import notificationService from '../services/notification.service.js';

class WatchlistController {
 
  async getWatchlist(req, res) {
    const userId = req.user.id;
    const { skipCache } = req.query;
    const startTime = Date.now();

    try {
    
      const cacheKey = `watchlist_full_${userId}`;
      
      if (!skipCache) {
        const { data, hit } = cacheService.get(cacheKey);
        if (hit) {
          console.log(`Watchlist cache hit for user ${userId} (${Date.now() - startTime}ms)`);
          return res.json({ ...data, cached: true });
        }
      }

      const watchlist = await watchlistDataService.getWatchlist(userId);

      if (watchlist.length === 0) {
        return res.json([]);
      }

      // ✅ IMPROVED: Limit total watchlist size
      const MAX_WATCHLIST_SIZE = 50;
      if (watchlist.length > MAX_WATCHLIST_SIZE) {
        return res.status(400).json({
          error: 'Watchlist too large',
          message: `Maximum ${MAX_WATCHLIST_SIZE} symbols supported`,
        });
      }

      const symbols = watchlist.map((item) => item.symbol);

      console.log(`Fetching live data for ${symbols.length} watchlist symbols`);

      // ✅ IMPROVED: Fetch quotes and sparklines (sparklines have internal limit)
      const [liveData, sparklineData] = await Promise.all([
        watchlistQuoteService.fetchLiveQuotes(symbols),
        watchlistQuoteService.fetchSparklineData(symbols),
      ]);

      const merged = watchlistQuoteService.mergeWatchlistWithLiveData(
        watchlist,
        liveData,
        sparklineData
      );

      // ✅ Cache the full watchlist response for 2 minutes
      cacheService.set(cacheKey, merged, 120);
      
      console.log(`Watchlist fetched in ${Date.now() - startTime}ms`);

      res.json(merged);
    } catch (err) {
      console.error('Error fetching watchlist:', err);
      
      // ✅ Handle rate limit errors
      if (err.message?.includes('rate limit') || err.message?.includes('429')) {
        return res.status(429).json({
          error: 'Rate limit exceeded',
          message: 'Too many requests. Please try again in a moment.',
          retryAfter: 60
        });
      }
      
      res.status(500).json({
        error: 'Failed to fetch watchlist',
        message: err.message,
      });
    }
  }

  async addToWatchlist(req, res) {
    const { userId } = req.params;
    const { ticker } = req.body;

    try {
      const exists = await watchlistDataService.checkExists(userId, ticker);
      if (exists) {
        return res.status(409).json({
          error: 'Already exists',
          message: `${ticker} is already in your watchlist`,
        });
      }

      // ✅ This uses cached quote if available
      const quoteData = await watchlistQuoteService.fetchSingleQuote(ticker);

      await watchlistDataService.addToWatchlist(userId, quoteData);

      // ✅ Clear user's watchlist cache
      const cacheKey = `watchlist_full_${userId}`;
      cacheService.delete(cacheKey);

      notificationService.sendWatchlistUpdate(userId, ticker, 'added');

      console.log(`Added ${ticker} to watchlist for user ${userId}`);

      res.json({
        success: true,
        message: `${ticker} added to watchlist`,
        data: quoteData,
      });
    } catch (err) {
      console.error(`Error adding ${ticker} to watchlist:`, err);

      if (err.message.includes('not found')) {
        return res.status(404).json({
          error: 'Ticker not found',
          message: err.message,
        });
      }

      if (err.message?.includes('rate limit') || err.message?.includes('429')) {
        return res.status(429).json({
          error: 'Rate limit exceeded',
          message: 'Too many requests. Please try again in a moment.',
          retryAfter: 60
        });
      }

      if (err.code === '23505') {
        return res.status(409).json({
          error: 'Already exists',
          message: `${ticker} is already in your watchlist`,
        });
      }

      res.status(500).json({
        error: 'Failed to add to watchlist',
        message: err.message,
      });
    }
  }

  async removeFromWatchlist(req, res) {
    const { userId, ticker } = req.params;

    try {
      const deleted = await watchlistDataService.removeFromWatchlist(userId, ticker);

      if (!deleted) {
        return res.status(404).json({
          error: 'Not found',
          message: `${ticker} not found in your watchlist`,
        });
      }

      // ✅ Clear user's watchlist cache
      const cacheKey = `watchlist_full_${userId}`;
      cacheService.delete(cacheKey);

      notificationService.sendWatchlistUpdate(userId, ticker, 'removed');

      console.log(`Removed ${ticker} from watchlist for user ${userId}`);

      res.json({
        success: true,
        message: `${ticker} removed from watchlist`,
      });
    } catch (err) {
      console.error(`Error removing ${ticker} from watchlist:`, err);
      res.status(500).json({
        error: 'Failed to remove from watchlist',
        message: err.message,
      });
    }
  }
}

export default new WatchlistController();