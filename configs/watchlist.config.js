// watchlist.config.js - Updated for Finnhub

export const WATCHLIST_CONFIG = {
  SPARKLINE: {
    DAYS: 7, // Number of days for sparkline data
    INTERVAL: '1d', // Daily interval ('1d', '1h', etc.)
  },
  RATE_LIMIT: {
    CALLS_PER_MINUTE: 60, // Finnhub free tier: 60 calls/minute
    DELAY_MS: 1100, // Delay between requests (1.1 seconds to be safe)
  },
  CACHE: {
    QUOTE_TTL: 60, // Cache quotes for 1 minute
    PROFILE_TTL: 3600, // Cache company profiles for 1 hour
    SPARKLINE_TTL: 300, // Cache sparkline data for 5 minutes
  }
};

// Finnhub API Response Formats Reference
// =====================================
// 
// /quote endpoint returns:
// {
//   "c": 222.48,     // Current price
//   "d": 1.01,       // Change
//   "dp": 0.4562,    // Percent change
//   "h": 223.78,     // High price of the day
//   "l": 220.27,     // Low price of the day  
//   "o": 221.03,     // Open price of the day
//   "pc": 221.47,    // Previous close price
//   "t": 1705075200  // Timestamp
// }
//
// /stock/candle endpoint returns:
// {
//   "c": [217.68, 218.24, ...],  // Close prices
//   "h": [222.49, 221.50, ...],  // High prices
//   "l": [217.19, 217.1192, ...], // Low prices
//   "o": [221.03, 218.89, ...],  // Open prices
//   "s": "ok",                    // Status (ok or no_data)
//   "t": [1704830400, ...],       // Timestamps
//   "v": [29772040, ...]          // Volume data
// }
//
// /stock/profile2 endpoint returns:
// {
//   "country": "US",
//   "currency": "USD",
//   "exchange": "NASDAQ",
//   "ipo": "1980-12-12",
//   "marketCapitalization": 3436959.61, // In millions
//   "name": "Apple Inc",
//   "phone": "14089961010",
//   "shareOutstanding": 15441.88,
//   "ticker": "AAPL",
//   "weburl": "https://www.apple.com/",
//   "logo": "https://...",
//   "finnhubIndustry": "Technology"
// }
//
// /stock/metric endpoint returns:
// {
//   "metric": {
//     "52WeekHigh": 199.62,
//     "52WeekLow": 124.17,
//     "10DayAverageTradingVolume": 58.58,
//     "beta": 1.24,
//     "marketCapitalization": 3436959.61,
//     "peBasicExclExtraTTM": 33.22,
//     ... many more metrics
//   },
//   "series": {
//     "annual": {...},
//     "quarterly": {...}
//   }
// }

export default WATCHLIST_CONFIG;