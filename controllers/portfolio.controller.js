import portfolioCacheService from "../services/portfolio-cache.service.js";
import portfolioDataService from "../services/portfolio-data.service";
import yahooFinanceService from "../services/yahoo-finance.service.js"; 
import portfolioCalculationService from "../services/portfolio-calculation.service";
import { PORTFOLIO_CONFIG } from "../configs/portfolio.config";

class PortfolioController {
    async getPortfolio(req,res) {
        const userId = req.user.id;
        const { skipCache } = req.query;
        const startTime = Date.now();

        try {
            if (!skipCache) {
                const cachedData = portfolioCacheService.get(userId);
                if (cachedData) {
                    console.log(`cache hit for user ${userId} (${Date.now() - startTime}ms)`)
                    return res.json({ ...cachedData, cached: true });
                }
            }

            console.log(`fetching fresh portfolio data for user ${userId}`);

            const holdings = await portfolioDataService.getHoldings(userId);

            if (holdings.length === 0) {
                return res.json({
                    message: 'No holdings available',
                    breakdown: []
                });
            }

             if (holdings.length > PORTFOLIO_CONFIG.MAX_HOLDINGS) {
                return res.status(400).json({
                error: 'Portfolio too large',
                message: `Maximum ${PORTFOLIO_CONFIG.MAX_HOLDINGS} holdings supported`,
                });
            }

            const symbols = holdings.map((h) => h.symbol);

            const quotesArray = await yahooFinanceService.fetchQuotesBatch(symbols, {
                batchSize: 5,
                batchDelay: 500,
                individualDelay: 200,
            });


            const erroredQuotes = quotesArray.filter((q) => q.error);
            if (erroredQuotes.length > 0) {
                console.warn(
                `${erroredQuotes.length} quotes failed:`,
                erroredQuotes.map((q) => q.symbol)
                );
            }

            const quoteMap = new Map(
                quotesArray
                .filter((q) => !q.error && q.regularMarketPrice)
                .map((q) => [q.symbol, q])
            );
            console.log(`Valid quotes: ${quoteMap.size}/${symbols.length}`);

      
            if (quoteMap.size === 0) {
                return res.status(503).json({
                error: 'Unable to fetch market data',
                message:
                    'Yahoo Finance API is temporarily unavailable. Please try again in a moment.',
                breakdown: holdings.map((h) => ({
                    id: h.id,
                    symbol: h.symbol,
                    shares: h.shares,
                    buyPrice: h.buy_price,
                    currentPrice: 0,
                    valid: false,
                    errorMessage: 'API unavailable',
                })),
                });
            }

            const validSymbols = symbols.filter((s) => quoteMap.has(s));

            
            const now = new Date();
            const oneMonthAgo = new Date();
            oneMonthAgo.setMonth(now.getMonth() - PORTFOLIO_CONFIG.HISTORY.PERIOD_MONTHS);

            const historyResults = await yahooQuoteService.fetchHistory(
                validSymbols,
                oneMonthAgo,
                now
            );

            const historyMap = new Map(
                historyResults
                .filter((h) => !h.error && h.data?.quotes?.length > 0)
                .map((h) => [h.symbol, h.data])
            );

            
            const metrics = portfolioCalculationService.calculatePortfolioMetrics(
                holdings,
                quoteMap
            );

            const history = portfolioCalculationService.calculatePortfolioHistory(
                holdings,
                quoteMap,
                historyMap
            );

            const { low52, high52 } =
                portfolioCalculationService.calculate52WeekRange(holdings, quoteMap);

            const { topStock, worstStock } =
                portfolioCalculationService.calculateStockPerformance(
                holdings,
                quoteMap
                );

            const breakdown = portfolioCalculationService.createBreakdown(
                holdings,
                quoteMap,
                quotesArray
            );

            const response = {
                ...metrics,
                ...history,
                low52,
                high52,
                topStock,
                worstStock,
                breakdown,
                meta: {
                    totalHoldings: holdings.length,
                    validHoldings: holdings.length - metrics.invalidHoldings,
                    invalidHoldings: metrics.invalidHoldings,
                    historicalDataPoints: history.dates.length,
                    calculatedAt: new Date().toISOString(),
                    processingTime: `${Date.now() - startTime}ms`,
                },
            };

           
            portfolioCacheService.set(userId, response);
            console.log(`Portfolio calculated in ${Date.now() - startTime}ms`);

            res.json(response);
        } catch (err) {
            console.error('Portfolio calculation error:', err);
            res.status(500).json({
                error: 'Failed to calculate portfolio metrics',
                message: err.message,
            });
        }
    }

    async addHolding(req, res) {
    const { userId } = req.params;
    const { ticker, shares, buyPrice } = req.body;

    try {
      const holding = await portfolioDataService.addHolding(
        userId,
        ticker,
        shares,
        buyPrice
      );

      portfolioCacheService.clearUser(userId);
      console.log(` Added holding ${ticker} for user ${userId}`);

      res.json({
        success: true,
        message: 'Holding added successfully',
        holding,
      });
    } catch (err) {
      console.error('Error saving portfolio:', err);

      if (err.code === '23505') {
        return res.status(409).json({
          error: 'Duplicate holding',
          message: `${ticker} already exists in your portfolio`,
        });
      }

      res.status(500).json({
        error: 'Failed to save portfolio',
        message: err.message,
      });
    }
  }

  async deleteHolding(req, res) {
    const { userId, holdingId } = req.params;

    try {
      const deleted = await portfolioDataService.deleteHolding(
        userId,
        holdingId
      );

      if (!deleted) {
        return res.status(404).json({
          error: 'Holding not found',
          message:
            'The specified holding does not exist or does not belong to this user',
        });
      }

      portfolioCacheService.clearUser(userId);
      console.log(
        `Deleted holding ${deleted.symbol} (ID: ${holdingId}) for user ${userId}`
      );

      res.json({
        success: true,
        message: 'Holding deleted successfully',
        deletedSymbol: deleted.symbol,
      });
    } catch (err) {
      console.error('Error deleting holding:', err);
      res.status(500).json({
        error: 'Failed to delete holding',
        message: err.message,
      });
    }
  }

  async updateHolding(req, res) {
    const { userId, holdingId } = req.params;
    const { ticker, shares, buyPrice } = req.body;

    try {
      const updated = await portfolioDataService.updateHolding(
        userId,
        holdingId,
        { ticker, shares, buyPrice }
      );

      if (!updated) {
        return res.status(404).json({
          error: 'Holding not found',
          message:
            'The specified holding does not exist or does not belong to this user',
        });
      }

      portfolioCacheService.clearUser(userId);
      console.log(
        `Updated holding ${updated.symbol} (ID: ${holdingId}) for user ${userId}`
      );

      res.json({
        success: true,
        message: 'Holding updated successfully',
        holding: updated,
      });
    } catch (err) {
      console.error('Error updating holding:', err);

      if (err.code === '23505') {
        return res.status(409).json({
          error: 'Duplicate holding',
          message:
            'A holding with this symbol already exists in your portfolio',
        });
      }

      res.status(500).json({
        error: 'Failed to update holding',
        message: err.message,
      });
    }
  }

  clearUserCache(req, res) {
    const { userId } = req.params;
    portfolioCacheService.clearUser(userId);
    res.json({
      success: true,
      message: `Cache cleared for user ${userId}`,
    });
  }

  clearAllCache(req, res) {
    const count = portfolioCacheService.clearAll();
    res.json({
      success: true,
      message: `Cleared ${count} cache entries`,
    });
  }

  getHealth(req, res) {
    res.json({
      status: 'ok',
      cacheSize: portfolioCacheService.getSize(),
      cacheTTL: `${PORTFOLIO_CONFIG.CACHE_TTL / 1000} seconds`,
      timestamp: new Date().toISOString(),
    });
  }
}


export default new PortfolioController();