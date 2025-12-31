import { Router } from "express";
import trendingController from "../controllers/trending.controller.js";
import { validateTickerParam } from "../middlewares/validation.middlesware.js"

const trendingPageRouter = Router();


trendingPageRouter.get(
  "/trending-stock", 
  trendingController.getTrendingStock.bind(trendingController)
);

trendingPageRouter.get(
  "/trending-search", 
  validateTickerParam,
  trendingController.searchTicker.bind(trendingController)
);


trendingPageRouter.get(
  "/cache-stats", 
  trendingController.getCacheStats.bind(trendingController)
);

trendingPageRouter.delete(
  "/cache/:key", 
  trendingController.deleteCacheKey.bind(trendingController)
);

export default trendingPageRouter;