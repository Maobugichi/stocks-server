import { Router } from "express";
import yahooFinance from 'yahoo-finance2';

const tickerRouter = Router();

tickerRouter.get('/:tic', async (req, res) => {
    try {
      const ticker = req.params.tic;
      const results = await yahooFinance.search(`${ticker}`);

      const cleanResults = results.quotes
      .filter(q => q.isYahooFinance && q.symbol && q.shortname)
      .map(q => ({
        symbol:q.symbol,
        name:q.shortname,
        exchange:q.exchDisp,
        type:q.quoteType
      }));
      res.json(cleanResults);
    } catch(err) {
        res.status(500).json(err.message);
    }
});

export default tickerRouter