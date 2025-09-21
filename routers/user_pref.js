
import { Router } from "express";
import pool from "../db.js";
import { checkAuth } from "../checkAuth.js";

const prefRouter = Router();
prefRouter.use(checkAuth);

prefRouter.patch("/preferences/markets", async (req, res) => {
  const { preferredMarkets } = req.body;
  const userId = req.user.id;

  try {
    await pool.query(
      "UPDATE user_preferences SET preferred_markets=$1 WHERE user_id=$2",
      [preferredMarkets, userId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update markets" });
  }
});

export default prefRouter;


/*import { Router } from "express";
import yahooFinance from "yahoo-finance2";
import axios from "axios";
import NodeCache from "node-cache";
import cron from "node-cron";
import pool from "../db.js";
import 'dotenv/config';

// Suppress Yahoo Finance notices
yahooFinance.suppressNotices(['yahooSurvey', 'ripHistorical']);

// Disable Yahoo Finance validation
yahooFinance.setGlobalConfig({
  validation: { logErrors: false, logOptionsErrors: false, throwErrors: false }
});

const trendingRouter = Router();

// Initialize NodeCache
const cache = new NodeCache({
  stdTTL: 900, // 15 minutes in seconds
  checkperiod: 120 // Check for expired keys every 2 minutes
});

console.log('NodeCache initialized successfully');

const CACHE_TTL = 900; // 15 minutes in seconds

// Finnhub client with axios
const finnhubClient = axios.create({
  baseURL: "https://finnhub.io/api/v1",
  params: { token: process.env.FINN_KEY }
});

// Map markets to Finnhub exchange codes
const marketToExchange = {
  'US': 'US',
  'GB': 'L', 
  'JP': 'T', 
  'NG': 'LG' 
};


const fallbackTrendingStocks = {
  US: [
    { symbol: "AAPL", shortName: "Apple Inc." },
    { symbol: "MSFT", shortName: "Microsoft Corporation" },
    { symbol: "GOOGL", shortName: "Alphabet Inc." },
    { symbol: "AMZN", shortName: "Amazon.com, Inc." },
    { symbol: "TSLA", shortName: "Tesla, Inc." },
    { symbol: "NVDA", shortName: "NVIDIA Corporation" },
    { symbol: "JPM", shortName: "JPMorgan Chase" },
    { symbol: "V", shortName: "Visa Inc." },
    { symbol: "WMT", shortName: "Walmart Inc." },
    { symbol: "PG", shortName: "Procter & Gamble" }
  ],
  GB: [
    { symbol: "BP.L", shortName: "BP p.l.c." },
    { symbol: "HSBA.L", shortName: "HSBC Holdings" },
    { symbol: "GSK.L", shortName: "GlaxoSmithKline" },
    { symbol: "AZN.L", shortName: "AstraZeneca" },
    { symbol: "BARC.L", shortName: "Barclays PLC" },
    { symbol: "ULVR.L", shortName: "Unilever PLC" },
    { symbol: "VOD.L", shortName: "Vodafone Group" },
    { symbol: "RIO.L", shortName: "Rio Tinto" },
    { symbol: "SHEL.L", shortName: "Shell PLC" },
    { symbol: "BA.L", shortName: "BAE Systems" }
  ],
  JP: [
    { symbol: "7203.T", shortName: "Toyota Motor" },
    { symbol: "9984.T", shortName: "SoftBank Group" },
    { symbol: "6758.T", shortName: "Sony Group" },
    { symbol: "8306.T", shortName: "Mitsubishi UFJ" },
    { symbol: "4063.T", shortName: "Shin-Etsu Chemical" },
    { symbol: "6501.T", shortName: "Hitachi, Ltd." },
    { symbol: "8035.T", shortName: "Tokyo Electron" },
    { symbol: "6902.T", shortName: "DENSO Corporation" },
    { symbol: "9432.T", shortName: "NTT Corporation" },
    { symbol: "2914.T", shortName: "Japan Tobacco" }
  ],
  NG: [
    { symbol: "DANGCEM.LG", shortName: "Dangote Cement" },
    { symbol: "MTNN.LG", shortName: "MTN Nigeria" },
    { symbol: "ZENITHBANK.LG", shortName: "Zenith Bank" },
    { symbol: "GTCO.LG", shortName: "Guaranty Trust" },
    { symbol: "UBA.LG", shortName: "United Bank for Africa" },
    { symbol: "FBNH.LG", shortName: "FBN Holdings" },
    { symbol: "ACCESSBANK.LG", shortName: "Access Bank" },
    { symbol: "NESTLE.LG", shortName: "Nestle Nigeria" },
    { symbol: "BUACEMENT.LG", shortName: "BUA Cement" },
    { symbol: "FLOURMILL.LG", shortName: "Flour Mills Nigeria" }
  ]
};


const fallbackExpandedStocks = [
  // US (100 stocks)
  { symbol: "AAPL", shortName: "Apple Inc.", price: 150, market: "US", description: "Consumer electronics", sector: "Technology" },
  { symbol: "MSFT", shortName: "Microsoft Corporation", price: 300, market: "US", description: "Software and cloud services", sector: "Technology" },
  { symbol: "GOOGL", shortName: "Alphabet Inc.", price: 2700, market: "US", description: "Search and advertising", sector: "Technology" },
  { symbol: "AMZN", shortName: "Amazon.com, Inc.", price: 3400, market: "US", description: "E-commerce and cloud", sector: "Consumer" },
  { symbol: "TSLA", shortName: "Tesla, Inc.", price: 750, market: "US", description: "Electric vehicles", sector: "Automotive" },
  // Add ~95 more US stocks (example, abbreviated for brevity)
  { symbol: "NVDA", shortName: "NVIDIA Corporation", price: 220, market: "US", description: "Graphics and AI", sector: "Technology" },
  { symbol: "JPM", shortName: "JPMorgan Chase", price: 160, market: "US", description: "Banking and finance", sector: "Financial" },
  // ... (extend to ~100 with real or placeholder data)

  // GB (100 stocks)
  { symbol: "BP.L", shortName: "BP p.l.c.", price: 400, market: "GB", description: "Oil and gas", sector: "Energy" },
  { symbol: "HSBA.L", shortName: "HSBC Holdings", price: 450, market: "GB", description: "Global banking", sector: "Financial" },
  { symbol: "GSK.L", shortName: "GlaxoSmithKline", price: 1400, market: "GB", description: "Pharmaceuticals", sector: "Healthcare" },
  { symbol: "AZN.L", shortName: "AstraZeneca", price: 8500, market: "GB", description: "Biopharmaceuticals", sector: "Healthcare" },
  { symbol: "BARC.L", shortName: "Barclays PLC", price: 180, market: "GB", description: "Banking services", sector: "Financial" },
  // Add ~95 more GB stocks
  { symbol: "ULVR.L", shortName: "Unilever PLC", price: 4000, market: "GB", description: "Consumer goods", sector: "Consumer" },
  // ... (extend to ~100)

  // JP (100 stocks)
  { symbol: "7203.T", shortName: "Toyota Motor", price: 2000, market: "JP", description: "Automobile manufacturer", sector: "Automotive" },
  { symbol: "9984.T", shortName: "SoftBank Group", price: 6000, market: "JP", description: "Tech and telecom", sector: "Technology" },
  { symbol: "6758.T", shortName: "Sony Group", price: 12000, market: "JP", description: "Electronics and entertainment", sector: "Technology" },
  { symbol: "8306.T", shortName: "Mitsubishi UFJ", price: 600, market: "JP", description: "Financial services", sector: "Financial" },
  { symbol: "4063.T", shortName: "Shin-Etsu Chemical", price: 4500, market: "JP", description: "Chemical manufacturing", sector: "Industrials" },
  // Add ~95 more JP stocks
  { symbol: "6501.T", shortName: "Hitachi, Ltd.", price: 7000, market: "JP", description: "Conglomerate", sector: "Industrials" },
  // ... (extend to ~100)

  // NG (10 stocks, limited by data availability)
  { symbol: "DANGCEM.LG", shortName: "Dangote Cement", price: 300, market: "NG", description: "Cement production", sector: "Industrials" },
  { symbol: "MTNN.LG", shortName: "MTN Nigeria", price: 200, market: "NG", description: "Telecommunications", sector: "Telecom" },
  { symbol: "ZENITHBANK.LG", shortName: "Zenith Bank", price: 25, market: "NG", description: "Banking services", sector: "Financial" },
  { symbol: "GTCO.LG", shortName: "Guaranty Trust", price: 30, market: "NG", description: "Financial services", sector: "Financial" },
  { symbol: "UBA.LG", shortName: "United Bank for Africa", price: 10, market: "NG", description: "Banking", sector: "Financial" },
  { symbol: "FBNH.LG", shortName: "FBN Holdings", price: 15, market: "NG", description: "Financial holdings", sector: "Financial" },
  { symbol: "ACCESSBANK.LG", shortName: "Access Bank", price: 12, market: "NG", description: "Banking", sector: "Financial" },
  { symbol: "NESTLE.LG", shortName: "Nestle Nigeria", price: 1200, market: "NG", description: "Consumer goods", sector: "Consumer" },
  { symbol: "BUACEMENT.LG", shortName: "BUA Cement", price: 70, market: "NG", description: "Cement production", sector: "Industrials" },
  { symbol: "FLOURMILL.LG", shortName: "Flour Mills Nigeria", price: 35, market: "NG", description: "Food processing", sector: "Consumer" }
];


async function fetchNews(market) {
  try {
    const res = await finnhubClient.get("/news", {
      params: { category: "general" }
    });
    return res.data || [];
  } catch (error) {
    console.error(`Error fetching news for ${market}:`, error.message);
    return [];
  }
}

// Fetch Finnhub IPO calendar
async function fetchIPOCalendar() {
  try {
    const res = await finnhubClient.get("/calendar/ipo");
    return res.data.ipoCalendar || [];
  } catch (error) {
    console.error("Error fetching IPO calendar:", error.message);
    return [];
  }
}

// Fetch Forex Rates
async function fetchForexRates() {
  try {
    const pairs = [
      { symbol: "EURUSD=X", name: "EUR/USD" },
      { symbol: "GBPUSD=X", name: "GBP/USD" },
      { symbol: "USDJPY=X", name: "USD/JPY" },
      { symbol: "USDCAD=X", name: "USD/CAD" },
      { symbol: "AUDUSD=X", name: "AUD/USD" }
    ];
    
    const results = {};
    
    for (const pair of pairs) {
      try {
        const quote = await yahooFinance.quote(pair.symbol);
        if (quote?.regularMarketPrice) {
          results[pair.name] = {
            price: quote.regularMarketPrice,
            change: quote.regularMarketChange || 0,
            changePercent: quote.regularMarketChangePercent || 0
          };
        }
        await new Promise(r => setTimeout(r, 100));
      } catch (err) {
        console.error(`Error fetching ${pair.symbol}:`, err.message);
        try {
          const finnhubSymbol = `OANDA:${pair.name.replace('/', '_')}`;
          const res = await finnhubClient.get("/quote", { params: { symbol: finnhubSymbol } });
          if (res.data?.c) {
            results[pair.name] = {
              price: res.data.c,
              change: res.data.d || 0,
              changePercent: res.data.dp || 0
            };
          }
        } catch (finnhubErr) {
          console.error(`Finnhub fallback failed for ${pair.name}:`, finnhubErr.message);
        }
      }
    }
    
    return results;
  } catch (error) {
    console.error("Error fetching forex rates:", error.message);
    return {};
  }
}

// Fetch Crypto Snapshot
async function fetchCryptoSnapshot() {
  try {
    const cryptoPairs = [
      { symbol: "BTC-USD", name: "Bitcoin" },
      { symbol: "ETH-USD", name: "Ethereum" },
      { symbol: "BNB-USD", name: "Binance Coin" },
      { symbol: "ADA-USD", name: "Cardano" }
    ];
    
    const results = [];
    
    for (const crypto of cryptoPairs) {
      try {
        const [quote, chart] = await Promise.all([
          yahooFinance.quote(crypto.symbol).catch(() => null),
          yahooFinance.chart(crypto.symbol, {
            period1: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
            period2: new Date(),
            interval: "1d"
          }).catch(() => ({ quotes: [] }))
        ]);
        
        if (quote?.regularMarketPrice) {
          const sparklineData = chart.quotes.map(h => ({ price: h.close, date: new Date(h.date) }));
          const sparklineChange = calculateSparklineChange(sparklineData);
          
          results.push({
            symbol: crypto.symbol,
            name: crypto.name,
            price: quote.regularMarketPrice,
            change: quote.regularMarketChange || 0,
            changePercent: quote.regularMarketChangePercent || 0,
            volume: quote.regularMarketVolume || 0,
            marketCap: quote.marketCap || 0,
            sparkline: sparklineData,
            sparklineChangePercent: sparklineChange
          });
        }
        await new Promise(r => setTimeout(r, 150));
      } catch (err) {
        console.error(`Error fetching ${crypto.symbol}:`, err.message);
      }
    }
    
    if (results.length === 0) {
      try {
        const now = Math.floor(Date.now() / 1000);
        const sevenDaysAgo = now - 7 * 24 * 60 * 60;
        const res = await finnhubClient.get("/crypto/candle", {
          params: {
            symbol: "BINANCE:BTCUSDT",
            resolution: "D",
            from: sevenDaysAgo,
            to: now
          }
        });
        
        if (res.data && res.data.s === "ok" && res.data.c?.length > 0) {
          const prices = res.data.c;
          const timestamps = res.data.t;
          
          results.push({
            symbol: "BTC-USD",
            name: "Bitcoin",
            price: prices[prices.length - 1],
            change: prices[prices.length - 1] - prices[0],
            changePercent: ((prices[prices.length - 1] - prices[0]) / prices[0]) * 100,
            volume: 0,
            marketCap: 0,
            sparkline: prices.map((price, index) => ({
              price,
              date: new Date(timestamps[index] * 1000)
            })),
            sparklineChangePercent: ((prices[prices.length - 1] - prices[0]) / prices[0])
          });
        }
      } catch (finnhubErr) {
        console.error("Finnhub crypto fallback failed:", finnhubErr.message);
      }
    }
    
    return results;
  } catch (error) {
    console.error("Error fetching crypto snapshot:", error.message);
    return [];
  }
}

// Fetch Sparkline
async function fetchSparkline(symbol) {
  try {
    const chart = await yahooFinance.chart(symbol, {
      period1: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      period2: new Date(),
      interval: "1d"
    });
    return chart.quotes?.map(h => ({ price: h.close })) || [];
  } catch (err) {
    console.error(`Error fetching chart data for ${symbol}:`, err.message);
    return [];
  }
}

// Calculate Sparkline Change
function calculateSparklineChange(sparkline) {
  if (!sparkline || sparkline.length < 2) return 0;
  const firstPrice = sparkline[0].price;
  const lastPrice = sparkline[sparkline.length - 1].price;
  if (firstPrice === 0) return 0;
  return (lastPrice - firstPrice) / firstPrice;
}

// Fetch Market Indices
async function fetchBasicMarketData() {
  const indices = ["^GSPC", "^DJI", "^IXIC", "^VIX"];
  const marketData = [];
  for (const symbol of indices) {
    try {
      const quote = await yahooFinance.quote(symbol);
      if (quote?.regularMarketPrice) {
        marketData.push({
          symbol,
          name: quote.shortName || symbol,
          value: quote.regularMarketPrice,
          change: quote.regularMarketChange || 0,
          changePercent: quote.regularMarketChangePercent || 0,
          volume: quote.regularMarketVolume || 0
        });
      }
      await new Promise(r => setTimeout(r, 100));
    } catch (err) {
      console.error(`Error fetching ${symbol}:`, err.message);
    }
  }
  return marketData;
}

// Fetch Basic Stock Data
async function fetchBasicStockData(symbol, shortName) {
  try {
    const [quote, sparkline, summary] = await Promise.all([
      yahooFinance.quote(symbol).catch(() => null),
      fetchSparkline(symbol),
      yahooFinance.quoteSummary(symbol, {
        modules: ["recommendationTrend", "price", "summaryDetail"]
      }).catch(() => ({}))
    ]);

    const sparklineChangePercent = calculateSparklineChange(sparkline);

    return {
      symbol,
      shortName: shortName || quote?.shortName || symbol,
      price: quote?.regularMarketPrice || 0,
      currency: quote?.currency || "USD",
      changePercent: quote?.regularMarketChangePercent || 0,
      sparklineChangePercent,
      volume: quote?.regularMarketVolume || 0,
      avgVolume: quote?.averageDailyVolume10Day || 0,
      marketCap: quote?.marketCap || 0,
      week52High: quote?.fiftyTwoWeekHigh || 0,
      week52Low: quote?.fiftyTwoWeekLow || 0,
      pe: quote?.trailingPE || null,
      eps: quote?.epsTrailingTwelveMonths || null,
      beta: quote?.beta || null,
      sparkline,
      recommendation: summary.recommendationTrend?.recommendationKey || null,
      targetPrice: summary.price?.targetMeanPrice || null,
      analystCount: summary.recommendationTrend?.numberOfAnalystOpinions || 0,
      dividendYield: summary.summaryDetail?.dividendYield || 0,
      dividendRate: summary.summaryDetail?.dividendRate || 0
    };
  } catch (err) {
    console.error(`Error fetching data for ${symbol}:`, err.message);
    return {
      symbol,
      shortName: shortName || symbol,
      price: 0,
      changePercent: 0,
      sparklineChangePercent: 0,
      sparkline: [],
      recommendation: null,
      targetPrice: null,
      analystCount: 0,
      dividendYield: 0,
      dividendRate: 0
    };
  }
}

// Fetch Sector Movers
async function fetchSectorMovers() {
  const sectorProxies = {
    "Technology": ["AAPL", "MSFT", "GOOGL", "NVDA"],
    "Energy": ["XOM", "CVX", "COP"],
    "Financial": ["JPM", "BAC", "WFC"],
    "Healthcare": ["JNJ", "PFE", "UNH"],
    "Consumer": ["AMZN", "TSLA", "HD"]
  };
  
  const sectorData = {};
  
  for (const [sector, symbols] of Object.entries(sectorProxies)) {
    try {
      const sectorStocks = [];
      
      for (const symbol of symbols.slice(0, 2)) {
        try {
          const quote = await yahooFinance.quote(symbol);
          if (quote?.regularMarketPrice) {
            sectorStocks.push({
              symbol,
              name: quote.shortName || symbol,
              price: quote.regularMarketPrice,
              changePercent: quote.regularMarketChangePercent || 0,
              marketCap: quote.marketCap || 0
            });
          }
          await new Promise(r => setTimeout(r, 100));
        } catch (err) {
          console.error(`Error fetching sector stock ${symbol}:`, err.message);
        }
      }
      
      if (sectorStocks.length > 0) {
        const avgChange = sectorStocks.reduce((sum, stock) => sum + stock.changePercent, 0) / sectorStocks.length;
        const totalMarketCap = sectorStocks.reduce((sum, stock) => sum + stock.marketCap, 0);
        
        sectorData[sector] = {
          avgChangePercent: avgChange,
          totalMarketCap: totalMarketCap,
          stocks: sectorStocks,
          topPerformer: sectorStocks.reduce((prev, curr) => 
            prev.changePercent > curr.changePercent ? prev : curr
          )
        };
      }
    } catch (err) {
      console.error(`Error fetching sector ${sector}:`, err.message);
    }
  }
  
  return sectorData;
}

// Fetch Finnhub Earnings Calendar
async function fetchEarningsCalendar() {
  try {
    const today = new Date();
    const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    
    const res = await finnhubClient.get("/calendar/earnings", {
      params: {
        from: today.toISOString().split("T")[0],
        to: nextWeek.toISOString().split("T")[0]
      }
    });
    return res.data.earningsCalendar?.slice(0, 10) || [];
  } catch (error) {
    console.error("Error fetching earnings calendar:", error.message);
    return [];
  }
}

// Fetch Economic Indicators with fallback
async function fetchEconomicIndicators() {
  try {
    const indicators = [];
    
    // Try Finnhub first
    try {
      const today = new Date();
      const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
      
      const res = await finnhubClient.get("/calendar/economic", {
        params: {
          from: today.toISOString().split('T')[0],
          to: nextWeek.toISOString().split('T')[0]
        }
      });
      
      if (res.data?.economicCalendar?.length > 0) {
        indicators.push(...res.data.economicCalendar.slice(0, 5).map(item => ({
          event: item.event,
          time: item.time,
          country: item.country,
          actual: item.actual,
          estimate: item.estimate,
          previous: item.previous,
          impact: item.impact,
          unit: item.unit
        })));
      }
    } catch (err) {
      console.error("Finnhub economic calendar not available:", err.message);
    }
    
    // Fallback to static/mock data if empty
    if (indicators.length < 5) {
      const fallbackIndicators = [
        {
          event: "US Non-Farm Payrolls",
          time: new Date().toISOString(),
          country: "US",
          actual: null,
          estimate: "200K",
          previous: "187K",
          impact: "High",
          unit: "Jobs"
        },
        {
          event: "UK CPI Inflation",
          time: new Date().toISOString(),
          country: "UK",
          actual: null,
          estimate: "2.2%",
          previous: "2.0%",
          impact: "High",
          unit: "%"
        },
        {
          event: "Japan GDP Growth",
          time: new Date().toISOString(),
          country: "JP",
          actual: null,
          estimate: "0.5%",
          previous: "0.7%",
          impact: "Medium",
          unit: "%"
        },
        {
          event: "Nigeria Inflation Rate",
          time: new Date().toISOString(),
          country: "NG",
          actual: null,
          estimate: "32.0%",
          previous: "33.4%",
          impact: "High",
          unit: "%"
        }
      ];
      indicators.push(...fallbackIndicators.slice(0, 5 - indicators.length));
    }
    
    // Add bond data from Yahoo
    try {
      const bondSymbols = [
        { symbol: "^TNX", name: "10-Year Treasury" },
        { symbol: "^FVX", name: "5-Year Treasury" },
        { symbol: "^TYX", name: "30-Year Treasury" }
      ];
      
      for (const bond of bondSymbols) {
        try {
          const quote = await yahooFinance.quote(bond.symbol);
          if (quote?.regularMarketPrice) {
            indicators.push({
              event: bond.name,
              time: new Date().toISOString(),
              country: "US",
              actual: quote.regularMarketPrice,
              estimate: null,
              previous: quote.regularMarketPreviousClose,
              impact: "High",
              unit: "%",
              change: quote.regularMarketChange,
              changePercent: quote.regularMarketChangePercent
            });
          }
          await new Promise(r => setTimeout(r, 100));
        } catch (err) {
          console.error(`Error fetching ${bond.symbol}:`, err.message);
        }
      }
    } catch (err) {
      console.error("Error fetching bond data:", err.message);
    }
    
    return indicators.slice(0, 8);
  } catch (error) {
    console.error("Error fetching economic indicators:", error.message);
    return [];
  }
}

// Fetch Yahoo Trending with Retries
async function fetchYahooTrending(market, retries = 3) {
  while (retries > 0) {
    try {
      const trends = await yahooFinance.trendingSymbols(market);
      if (trends?.quotes?.length > 0) return trends.quotes;
      console.log(`Yahoo trending empty for ${market}, retrying...`);
    } catch (error) {
      console.error(`Yahoo trending fetch error for ${market}:`, error.message);
    }
    retries--;
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  return [];
}

// Finnhub Fallback for Trending Stocks
async function fetchFinnhubTrending() {
  const symbols = ["AAPL", "TSLA", "MSFT", "NVDA"];
  try {
    const sentiments = [];
    for (const symbol of symbols) {
      try {
        const res = await finnhubClient.get("/stock/social-sentiment", { params: { symbol } });
        if (res.data?.reddit?.length) {
          sentiments.push({
            symbol,
            shortName: symbol,
            mentions: res.data.reddit.reduce((sum, item) => sum + item.mention, 0),
            score: res.data.reddit.reduce((sum, item) => sum + item.score, 0) / res.data.reddit.length || 0
          });
        }
        await new Promise(r => setTimeout(r, 500));
      } catch (err) {
        console.error(`Finnhub social sentiment error for ${symbol}:`, err.message);
      }
    }
    return sentiments.sort((a, b) => b.mentions - a.mentions).slice(0, 15).map(item => ({
      symbol: item.symbol,
      shortName: item.shortName
    }));
  } catch (error) {
    console.error("Finnhub trending fallback error:", error.message);
    return [];
  }
}

// Fetch Expanded Stocks (100+ stocks for new users, per market)
async function fetchExpandedStocks(markets, limitPerMarket = 100) {
  const allStocks = [];

  for (const market of markets) {
    const exchange = marketToExchange[market] || 'US';
    let symbols = [];
    try {
      // Step 1: Get list of stock symbols from Finnhub
      const res = await finnhubClient.get("/stock/symbol", { params: { exchange } });
      console.log("hellloooo")
      console.log(res)
      symbols = res.data.map(item => item.symbol).slice(0, limitPerMarket);
      console.log(`Fetched ${symbols.length} symbols for ${market}`);
    } catch (error) {
      console.error(`Error fetching symbols for ${market}:`, error.message);
      symbols = fallbackExpandedStocks.filter(s => s.market === market).map(s => s.symbol).slice(0, limitPerMarket);
      console.log(`Using ${symbols.length} fallback symbols for ${market}`);
    }

    // Validate symbols with Finnhub to ensure Yahoo compatibility (except NG)
    if (market !== 'NG') {
      const validSymbols = [];
      for (const symbol of symbols.slice(0, limitPerMarket)) {
        try {
          const quote = await finnhubClient.get("/quote", { params: { symbol } });
          if (quote.data.c > 0) validSymbols.push(symbol);
          await new Promise(r => setTimeout(r, 500));
        } catch (err) {
          console.error(`Finnhub validation failed for ${symbol}:`, err.message);
        }
      }
      symbols = validSymbols.length > 0 ? validSymbols : symbols;
      console.log(`Validated ${symbols.length} symbols for ${market}`);
    } else {
      // NG: Use Finnhub for quotes, not Yahoo
      const validSymbols = [];
      for (const symbol of symbols) {
        try {
          const quote = await finnhubClient.get("/quote", { params: { symbol } });
          if (quote.data.c > 0) validSymbols.push(symbol);
          await new Promise(r => setTimeout(r, 500));
        } catch (err) {
          console.error(`Finnhub validation failed for ${symbol}:`, err.message);
        }
      }
      symbols = validSymbols.length > 0 ? validSymbols : fallbackTrendingStocks.NG.map(s => s.symbol);
      console.log(`Validated ${symbols.length} NG symbols with Finnhub`);
    }

    // Step 2: Batch fetch details with Yahoo (except NG)
    const batchSize = 20;
    const marketStocks = [];
    if (market !== 'NG') {
      for (let i = 0; i < symbols.length; i += batchSize) {
        const batch = symbols.slice(i, i + batchSize);
        try {
          const quotes = await yahooFinance.quote(batch);
          marketStocks.push(...quotes.filter(q => q.regularMarketPrice));
          console.log(`Fetched ${quotes.length} quotes for ${market} batch ${i / batchSize + 1}`);
          await new Promise(r => setTimeout(r, 1000));
        } catch (err) {
          console.error(`Error fetching batch for ${market} stocks:`, err.message);
        }
      }
    } else {
      // NG: Use Finnhub quotes
      for (const symbol of symbols) {
        try {
          const quote = await finnhubClient.get("/quote", { params: { symbol } });
          if (quote.data.c > 0) {
            marketStocks.push({
              symbol,
              shortName: fallbackTrendingStocks.NG.find(s => s.symbol === symbol)?.shortName || symbol,
              regularMarketPrice: quote.data.c,
              regularMarketChangePercent: quote.data.dp || 0,
              regularMarketVolume: 0,
              marketCap: 0
            });
          }
          await new Promise(r => setTimeout(r, 500));
        } catch (err) {
          console.error(`Finnhub quote failed for ${symbol}:`, err.message);
        }
      }
    }

    // Step 3: Enrich only 10 stocks with Finnhub profile
    for (const stock of marketStocks.slice(0, 10)) {
      try {
        const profile = await finnhubClient.get("/stock/profile2", { params: { symbol: stock.symbol } });
        stock.description = profile.data.description || profile.data.weburl || 'No description';
        stock.sector = profile.data.finnhubIndustry || 'Unknown';
        stock.market = market;
        await new Promise(r => setTimeout(r, 500));
      } catch (err) {
        console.error(`Error enriching ${stock.symbol}:`, err.message);
        stock.description = 'No description';
        stock.sector = 'Unknown';
        stock.market = market;
      }
    }
    // Set defaults for remaining stocks
    for (const stock of marketStocks.slice(10)) {
      stock.description = 'No description';
      stock.sector = 'Unknown';
      stock.market = market;
    }

    allStocks.push(...marketStocks);
    console.log(`Fetched ${marketStocks.length} expanded stocks for ${market}`);
    if (marketStocks.length < 50) {
      const fallback = fallbackExpandedStocks.filter(s => s.market === market).slice(0, limitPerMarket - marketStocks.length);
      allStocks.push(...fallback);
      console.log(`Added ${fallback.length} fallback stocks for ${market}`);
    }
  }
  return allStocks.length > 0 ? allStocks : fallbackExpandedStocks;
}

// Fetch unique markets from user_preferences
async function getUniqueMarkets() {
  try {
    const result = await pool.query("SELECT DISTINCT unnest(preferred_markets) as market FROM user_preferences");
    const markets = result.rows.map(row => row.market);
    return markets.length > 0 ? markets : ["US"];
  } catch (err) {
    console.error("Error fetching unique markets from user_preferences:", err.message);
    return ["US"];
  }
}

// Cron Job to Refresh Trending Cache and Expanded Stocks
cron.schedule('*/5 * * * *', async () => {
  console.log('Running cron to refresh trending cache and expanded stocks');
  const markets = await getUniqueMarkets();
  console.log('Cron markets from user_preferences:', markets);

  // Cache trending stocks
  for (const market of markets) {
    try {
      let trends = [];
      if (market === 'US') {
        trends = await fetchYahooTrending(market);
      } else {
        trends = fallbackTrendingStocks[market] || [];
        console.log(`Using fallback trending stocks for ${market}`);
      }

      if (!trends.length) {
        console.log(`No trending for ${market}, using Finnhub fallback`);
        trends = await fetchFinnhubTrending();
      }

      const symbolsDetailed = [];
      for (const q of trends.slice(0, 15)) {
        try {
          const stockData = await fetchBasicStockData(q.symbol, q.shortName);
          if (stockData.price > 0) {
            symbolsDetailed.push(stockData);
          }
          await new Promise(r => setTimeout(r, 50));
        } catch (err) {
          console.error(`Cron: Error fetching stock ${q.symbol}:`, err.message);
        }
      }

      if (symbolsDetailed.length > 0) {
        try {
          cache.set(`trending:${market}`, [{ market, symbols: symbolsDetailed }], CACHE_TTL);
          console.log(`Cache updated for trending ${market}`);
        } catch (cacheErr) {
          console.error(`Cache set error for ${market}:`, cacheErr.message);
        }
      } else {
        console.log(`Cron: No valid trending data for ${market}`);
      }
    } catch (err) {
      console.error(`Cron: Error processing trending ${market}:`, err.message);
    }
  }

  // Cache expanded stocks
  const expanded = await fetchExpandedStocks(markets, 100);
  if (expanded.length > 0) {
    try {
      cache.set(`expanded:global`, expanded, CACHE_TTL);
      console.log(`Expanded stocks cached globally: ${expanded.length} stocks`);
    } catch (cacheErr) {
      console.error(`Cache set error for expanded stocks:`, cacheErr.message);
    }
  }
});

// Main Trending Dashboard Endpoint
trendingRouter.get("/trending-stock", async (req, res) => {
  try {
    const userId = req.user.id;
    const prefResult = await pool.query(
      "SELECT currency, preferred_markets FROM user_preferences WHERE user_id=$1",
      [userId]
    );

    if (!prefResult.rows.length) {
      return res.status(400).json({ error: "Preferences not set" });
    }

    const { currency, preferred_markets } = prefResult.rows[0];
    const markets = preferred_markets?.length ? preferred_markets : ["US"];
    console.log(`User ${userId} preferred markets:`, markets);

    const dashboardData = {
      currency,
      marketIndices: [],
      trendingStocks: [],
      expandedStocks: [],
      topGainers: [],
      topLosers: [],
      mostActive: [],
      news: {},
      sectorMovers: {},
      ipos: [],
      forexRates: {},
      crypto: [],
      earningsCalendar: [],
      economicIndicators: []
    };

    // Fetch independent data concurrently
    const independentDataPromises = [
      fetchBasicMarketData().catch(err => {
        console.error("Market indices error:", err.message);
        return [];
      }),
      fetchIPOCalendar().catch(err => {
        console.error("IPO calendar error:", err.message);
        return [];
      }),
      fetchForexRates().catch(err => {
        console.error("Forex rates error:", err.message);
        return {};
      }),
      fetchCryptoSnapshot().catch(err => {
        console.error("Crypto snapshot error:", err.message);
        return [];
      }),
      fetchEarningsCalendar().catch(err => {
        console.error("Earnings calendar error:", err.message);
        return [];
      }),
      fetchEconomicIndicators().catch(err => {
        console.error("Economic indicators error:", err.message);
        return [];
      })
    ];

    const [
      marketIndices,
      ipos,
      forexRates,
      crypto,
      earningsCalendar,
      economicIndicators
    ] = await Promise.allSettled(independentDataPromises);

    dashboardData.marketIndices = marketIndices.status === 'fulfilled' ? marketIndices.value : [];
    dashboardData.ipos = ipos.status === 'fulfilled' ? ipos.value : [];
    dashboardData.forexRates = forexRates.status === 'fulfilled' ? forexRates.value : {};
    dashboardData.crypto = crypto.status === 'fulfilled' ? crypto.value : [];
    dashboardData.earningsCalendar = earningsCalendar.status === 'fulfilled' ? earningsCalendar.value : [];
    dashboardData.economicIndicators = economicIndicators.status === 'fulfilled' ? economicIndicators.value : [];

    let allValidSymbols = [];

    // Process each market for trending stocks
    for (const market of markets) {
      try {
        console.log(`Processing market: ${market}`);
        
        // Check cache for trending
        let cachedData = cache.get(`trending:${market}`);
        if (cachedData) {
          dashboardData.trendingStocks.push(...cachedData);
          console.log(`Served trending data for ${market} from cache`);
          allValidSymbols.push(...cachedData[0].symbols.filter(s => s.changePercent != null && s.price > 0));
        } else {
          let trends = [];
          if (market === 'US') {
            trends = await fetchYahooTrending(market);
          } else {
            trends = fallbackTrendingStocks[market] || [];
            console.log(`Using fallback trending stocks for ${market}`);
          }

          if (!trends.length) {
            console.log(`No trending for ${market}, using Finnhub fallback`);
            trends = await fetchFinnhubTrending();
          }

          const symbolsDetailed = [];
          for (const q of trends.slice(0, 15)) {
            try {
              const stockData = await fetchBasicStockData(q.symbol, q.shortName);
              if (stockData.price > 0) {
                symbolsDetailed.push(stockData);
              }
              await new Promise(r => setTimeout(r, 50));
            } catch (stockErr) {
              console.error(`Error fetching stock ${q.symbol}:`, stockErr.message);
            }
          }

          if (symbolsDetailed.length > 0) {
            const marketData = { market, symbols: symbolsDetailed };
            dashboardData.trendingStocks.push(marketData);
            try {
              cache.set(`trending:${market}`, [marketData], CACHE_TTL);
              console.log(`Cache set for trending ${market}`);
            } catch (cacheErr) {
              console.error(`Cache set error for ${market}:`, cacheErr.message);
            }
            allValidSymbols.push(...symbolsDetailed.filter(s => s.changePercent != null && s.price > 0));
          }
        }

        // Fetch market-specific data
        try {
          const [newsData, sectorData] = await Promise.allSettled([
            fetchNews(market),
            fetchSectorMovers()
          ]);
          
          dashboardData.news[market] = newsData.status === 'fulfilled' ? newsData.value : [];
          dashboardData.sectorMovers[market] = sectorData.status === 'fulfilled' ? sectorData.value : {};
        } catch (marketDataErr) {
          console.error(`Error fetching market data for ${market}:`, marketDataErr.message);
          dashboardData.news[market] = [];
          dashboardData.sectorMovers[market] = {};
        }
      } catch (marketErr) {
        console.error(`Error processing market ${market}:`, marketErr.message);
      }
    }

    // Fetch expanded stocks for user's preferred markets
    let expandedCached = cache.get(`expanded:global`);
    if (expandedCached) {
      dashboardData.expandedStocks = markets.map(market => ({
        market,
        stocks: expandedCached.filter(stock => stock.market === market)
      }));
      console.log(`Served ${dashboardData.expandedStocks.reduce((sum, m) => sum + m.stocks.length, 0)} expanded stocks from cache`);
    } else {
      const expanded = await fetchExpandedStocks(markets, 100);
      if (expanded.length > 0) {
        dashboardData.expandedStocks = markets.map(market => ({
          market,
          stocks: expanded.filter(stock => stock.market === market)
        }));
        try {
          cache.set(`expanded:global`, expanded, CACHE_TTL);
          console.log(`Expanded stocks fetched and cached: ${expanded.length} stocks`);
        } catch (cacheErr) {
          console.error(`Cache set error for expanded stocks:`, cacheErr.message);
        }
      } else {
        dashboardData.expandedStocks = markets.map(market => ({
          market,
          stocks: fallbackExpandedStocks.filter(stock => stock.market === market)
        }));
        console.log(`Used ${dashboardData.expandedStocks.reduce((sum, m) => sum + m.stocks.length, 0)} fallback expanded stocks`);
      }
    }

    // Calculate top gainers/losers from ALL markets
    if (allValidSymbols.length > 0) {
      dashboardData.topGainers = allValidSymbols
        .filter(s => s.changePercent > 0)
        .sort((a, b) => b.changePercent - a.changePercent)
        .slice(0, 10);
        
      dashboardData.topLosers = allValidSymbols
        .filter(s => s.changePercent < 0)
        .sort((a, b) => a.changePercent - b.changePercent)
        .slice(0, 10);
    } else {
      console.log('No valid symbols for gainers/losers, using fallback');
      try {
        const trends = await yahooFinance.trendingSymbols('US');
        if (trends?.quotes) {
          dashboardData.topGainers = trends.quotes
            .filter(item => item.regularMarketChangePercent > 0)
            .sort((a, b) => b.regularMarketChangePercent - a.regularMarketChangePercent)
            .slice(0, 10)
            .map(item => ({
              symbol: item.symbol,
              shortName: item.shortName,
              price: item.regularMarketPrice,
              changePercent: item.regularMarketChangePercent
            }));
          dashboardData.topLosers = trends.quotes
            .filter(item => item.regularMarketChangePercent < 0)
            .sort((a, b) => a.regularMarketChangePercent - b.regularMarketChangePercent)
            .slice(0, 10)
            .map(item => ({
              symbol: item.symbol,
              shortName: item.shortName,
              price: item.regularMarketPrice,
              changePercent: item.regularMarketChangePercent
            }));
        }
      } catch (fallbackErr) {
        console.error('Fallback for gainers/losers failed:', fallbackErr.message);
      }
    }

    // Most active from first market with data
    if (dashboardData.trendingStocks.length > 0) {
      const firstMarket = dashboardData.trendingStocks[0];
      dashboardData.mostActive.push({
        market: firstMarket.market,
        symbols: firstMarket.symbols
          .filter(s => s.volume > 0)
          .sort((a, b) => b.volume - a.volume)
          .slice(0, 10)
      });
    }

    // Log summary for debugging
    console.log("Dashboard data summary:", {
      marketIndices: dashboardData.marketIndices.length,
      trendingStocks: dashboardData.trendingStocks.length,
      expandedStocks: dashboardData.expandedStocks.reduce((sum, m) => sum + m.stocks.length, 0),
      topGainers: dashboardData.topGainers.length,
      topLosers: dashboardData.topLosers.length,
      mostActive: dashboardData.mostActive.length,
      forexRates: Object.keys(dashboardData.forexRates).length,
      crypto: dashboardData.crypto.length,
      ipos: dashboardData.ipos.length,
      earningsCalendar: dashboardData.earningsCalendar.length,
      economicIndicators: dashboardData.economicIndicators.length,
      newsMarkets: Object.keys(dashboardData.news).length,
      sectorMoversMarkets: Object.keys(dashboardData.sectorMovers).length
    });

    res.json(dashboardData);
  } catch (err) {
    console.error("Main trending endpoint error:", err.message);
    res.status(500).json({ 
      error: "Failed to fetch trending dashboard", 
      details: err.message,
      timestamp: new Date().toISOString()
    });
  }
});

export default trendingRouter; /*
