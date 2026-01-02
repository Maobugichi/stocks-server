import watchlistDataService from '../services/watchlist-data.service.js';
import watchlistQuoteService from '../services/watchlist-quote.service.js';
import notificationService from '../services/notification.service.js';

class WatchlistController {
  async getWatchlist(req, res) {
    const userId = req.user.id;

    try {
   
      const watchlist = await watchlistDataService.getWatchlist(userId);

      if (watchlist.length === 0) {
        return res.json([]);
      }

      const symbols = watchlist.map((item) => item.symbol);

   
      const [liveData, sparklineData] = await Promise.all([
        watchlistQuoteService.fetchLiveQuotes(symbols),
        watchlistQuoteService.fetchSparklineData(symbols),
      ]);

   
      const merged = watchlistQuoteService.mergeWatchlistWithLiveData(
        watchlist,
        liveData,
        sparklineData
      );

      res.json(merged);
    } catch (err) {
      console.error('Error fetching watchlist:', err);
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

     
      const quoteData = await watchlistQuoteService.fetchSingleQuote(ticker);

    
      await watchlistDataService.addToWatchlist(userId, quoteData);

     
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