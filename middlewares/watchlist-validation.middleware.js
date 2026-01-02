export function validateTicker(req, res, next) {
  const { ticker } = req.body;

  if (!ticker) {
    return res.status(400).json({
      error: 'Validation failed',
      message: 'Ticker symbol is required',
    });
  }

  if (typeof ticker !== 'string' || ticker.trim().length === 0) {
    return res.status(400).json({
      error: 'Validation failed',
      message: 'Ticker must be a non-empty string',
    });
  }

 
  if (!/^[A-Z0-9.-]{1,10}$/i.test(ticker)) {
    return res.status(400).json({
      error: 'Validation failed',
      message: 'Invalid ticker format',
    });
  }

 
  req.body.ticker = ticker.trim().toUpperCase();
  next();
}

export function validateTickerParam(req, res, next) {
  const { ticker } = req.params;

  if (!ticker) {
    return res.status(400).json({
      error: 'Validation failed',
      message: 'Ticker parameter is required',
    });
  }

  if (!/^[A-Z0-9.-]{1,10}$/i.test(ticker)) {
    return res.status(400).json({
      error: 'Validation failed',
      message: 'Invalid ticker format',
    });
  }

  req.params.ticker = ticker.trim().toUpperCase();
  next();
}