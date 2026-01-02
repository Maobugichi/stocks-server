export const PORTFOLIO_CONFIG = {
  CACHE_TTL: 2 * 60 * 1000,
  MAX_HOLDINGS: 100,
  
  FETCH: {
    BATCH_SIZE: 5,
    BATCH_DELAY_MS: 500,
    INDIVIDUAL_DELAY_MS: 200,
    TIMEOUT_MS:8000,
    MAX_RETRIES: 2,
  },

  HISTORY: {
    PERIOD_MONTHS: 1,
    INTERVAL: '1d'
  },

  YAHOO_FIELDS: [
    'symbol',
    'regularMarketPrice',
    'regularMarketPreviousClose',
    'marketCap',
    'trailingPE',
    'dividendYield',
    'fiftyTwoWeekLow',
    'fiftyTwoWeekHigh',
  ]
};

