import { Router } from 'express';
import watchlistController from '../controllers/watchlist.controller.js';
import { checkAuth } from '../checkAuth.js';
import {
  validateTicker,
  validateTickerParam,
} from '../middlewares/watchlist-validation.middleware.js';

const watchlistRouter = Router();


watchlistRouter.get(
  '/',
  checkAuth,
  watchlistController.getWatchlist.bind(watchlistController)
);


watchlistRouter.post(
  '/add/:userId',
  validateTicker,
  watchlistController.addToWatchlist.bind(watchlistController)
);


watchlistRouter.delete(
  '/remove/:userId/:ticker',
  validateTickerParam,
  watchlistController.removeFromWatchlist.bind(watchlistController)
);

export default watchlistRouter;