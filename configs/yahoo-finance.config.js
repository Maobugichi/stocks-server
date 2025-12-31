export const CONFIG = {
  CACHE_TTL: {
    TICKERS: 600,       
    LIVE_DATA: 300,    
    SCREENER: 300,      
    TRENDING: 600,      
    SEARCH: 300,        
    FULL_RESPONSE: 300,
  },
  RATE_LIMIT: {
    MAX_CONCURRENT: 3,
    DELAY_MS: 100,
  },
  RETRY: {
    MAX_ATTEMPTS: 2,
    TIMEOUT_MS: 5000,
    BASE_BACKOFF_MS: 500,
  },
  BATCH_SIZE: 10,
  STALE_THRESHOLD_MS: 120000,      
  ENDPOINT_TIMEOUT_MS: 25000,      
  BATCH_PROCESSING_TIMEOUT: 15000, 
  SEARCH_TIMEOUT: 8000,           
};

export const YAHOO_FINANCE_CONFIG = {
  validation: {
    logErrors: false,
    logWarnings: false,
  }
};

export const CACHE_CONFIG = {
  stdTTL: CONFIG.CACHE_TTL.FULL_RESPONSE,
  checkperiod: 60,
  useClones: false,
  maxKeys: 500,
};