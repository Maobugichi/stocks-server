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

// Add new holding

portfolioRouter.post(

  '/save-port/:userId',

  validateAddHoldingMiddleware,

  portfolioController.addHolding.bind(portfolioController)

);

// Update holding

portfolioRouter.patch(

  '/:userId/holdings/:holdingId',

  validateHoldingIdMiddleware,

  validateUpdateHoldingMiddleware,

  portfolioController.updateHolding.bind(portfolioController)

);

// Delete holding

portfolioRouter.delete(

  '/:userId/holdings/:holdingId',

  validateHoldingIdMiddleware,

  portfolioController.deleteHolding.bind(portfolioController)

);

// Cache management

portfolioRouter.delete(

  '/:userId/cache',

  portfolioController.clearUserCache.bind(portfolioController)

);

portfolioRouter.delete(

  '/cache/all',

  portfolioController.clearAllCache.bind(portfolioController)

);

// Health check

portfolioRouter.get(

  '/:userId/health',

  portfolioController.getHealth.bind(portfolioController)

);

export default portfolioRouter;