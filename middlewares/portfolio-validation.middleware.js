import {
  validateAddHolding,
  validateUpdateHolding,
  validateHoldingId,
} from '../utils/portfolio-validation.js';

export function validateAddHoldingMiddleware(req, res, next) {
  const { ticker, shares, buyPrice } = req.body;
  const validation = validateAddHolding(ticker, shares, buyPrice);

  if (!validation.isValid) {
    return res.status(400).json({
      error: 'Validation failed',
      message: validation.errors.join(', '),
    });
  }

  next();
}

export function validateUpdateHoldingMiddleware(req, res, next) {
  const { ticker, shares, buyPrice } = req.body;
  const validation = validateUpdateHolding(ticker, shares, buyPrice);

  if (!validation.isValid) {
    return res.status(400).json({
      error: 'Validation failed',
      message: validation.errors.join(', '),
    });
  }

  next();
}

export function validateHoldingIdMiddleware(req, res, next) {
  const { holdingId } = req.params;
  const validation = validateHoldingId(holdingId);

  if (!validation.isValid) {
    return res.status(400).json({
      error: 'Invalid holding ID',
      message: validation.errors.join(', '),
    });
  }

  next();
}