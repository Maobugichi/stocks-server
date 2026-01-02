import { Router } from 'express';
import portfolioController from '../controllers/portfolio.controller.js';
import { checkAuth } from '../checkAuth.js';
import {
  validateAddHoldingMiddleware,
  validateUpdateHoldingMiddleware,
  validateHoldingIdMiddleware,
} from '../middlewares/portfolio-validation.middleware.js';

const portfolioRouter = Router();


portfolioRouter.get(
  '/',
  checkAuth,
  portfolioController.getPortfolio.bind(portfolioController)
);


portfolioRouter.post(
  '/save-port/:userId',
  validateAddHoldingMiddleware,
  portfolioController.addHolding.bind(portfolioController)
);


portfolioRouter.patch(
  '/:userId/holdings/:holdingId',
  validateHoldingIdMiddleware,
  validateUpdateHoldingMiddleware,
  portfolioController.updateHolding.bind(portfolioController)
);


portfolioRouter.delete(
  '/:userId/holdings/:holdingId',
  validateHoldingIdMiddleware,
  portfolioController.deleteHolding.bind(portfolioController)
);


portfolioRouter.delete(
  '/:userId/cache',
  portfolioController.clearUserCache.bind(portfolioController)
);

portfolioRouter.delete(
  '/cache/all',
  portfolioController.clearAllCache.bind(portfolioController)
);


portfolioRouter.get(
  '/:userId/health',
  portfolioController.getHealth.bind(portfolioController)
);

export default portfolioRouter;