import { REGION_EXCHANGES } from "./exchange.js";
import pool from "./db.js";
import axios from "axios";

const MAX_RETRIES = 3;
const RETRY_DELAY = 2000;


const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const withRetry = async (fn, retries = MAX_RETRIES) => {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === retries) throw error;
      
      const delayTime = RETRY_DELAY * Math.pow(2, i); // Exponential backoff
      console.warn(`API call failed, retrying in ${delayTime}ms... (${i + 1}/${retries + 1})`);
      await delay(delayTime);
    }
  }
};



const getRegionExchanges = (regionCode) => {
  const region = REGION_EXCHANGES[regionCode?.toUpperCase()];
  if (!region) {
    console.warn(`Region ${regionCode} not supported`);
    return null;
  }
  return region;
};


const getUserPreferences = async (userId) => {
  try {
    
    const query = `SELECT preferred_markets FROM user_preferences WHERE user_id = $1`;
    const result = await pool.query(query, [userId]);
    const rows = result.rows[0]
  
    if (rows.preferred_markets.length > 0 && rows.preferred_markets) {
      const regions = rows.preferred_markets;
    
      const validRegions = regions.filter(region => REGION_EXCHANGES[region?.toUpperCase()]);
      
      if (validRegions.length !== regions.length) {
        const invalidRegions = regions.filter(region => !REGION_EXCHANGES[region?.toUpperCase()]);
        console.warn(`Invalid regions found: ${invalidRegions.join(', ')}`);
      }
      
      return validRegions.length > 0 ? validRegions : ['US', 'GB', 'DE'];
    }
    
    return ['US', 'GB', 'DE']; 
  } catch (error) {
    console.error('Error fetching user preferences:', error);
    return ['US', 'GB', 'DE'];
  }
};

const fetchExchangeSymbols = async ( region , key) => {
  console.log("Finnkey" + region)
  const fetchFn = async () => {
    const response = await axios.get(
      `https://finnhub.io/api/v1/stock/symbol`,
      {
        params: {
          exchange:region,
          token: key
        },
        timeout: 10000 
      }
    );
    
    
    if (!response.data || !Array.isArray(response.data)) {
      //throw new Error(`Invalid response format for exchange ${region}`);
    }
    
    return response.data
      .filter(stock => 
        stock && 
        stock.symbol && 
        stock.type === 'Common Stock' && 
        !stock.symbol.includes('.') && 
        stock.symbol.length <= 6 &&
        stock.symbol.match(/^[A-Z0-9]+$/)
      )
      .slice(0, 150); 
  };

  try {
    const symbols = await withRetry(fetchFn);
    console.log(`✓ Fetched ${symbols.length} symbols from ${region}`);
    return symbols.map(symbol => ({
      ...symbol,
      region
    }));
  } catch (error) {
    console.error(`✗ Failed to fetch symbols for (${region}):`, error.message);
    return [];
  }
};

const BATCH_SIZE = 5; 


// Fetch stock quote data with retry logic
const fetchStockQuote = async (symbol,key) => {
  const fetchFn = async () => {
    const response = await axios.get(
      `https://finnhub.io/api/v1/quote`,
      {
        params: {
          symbol,
          token: key
        },
        timeout: 8000
      }
    );
    return response.data;
  };

  try {
    const quote = await withRetry(fetchFn);
    if (!quote || typeof quote.c !== 'number' || quote.c <= 0) {
      return null;
    }
    return quote;
  } catch (error) {
    console.error(`Error fetching quote for ${symbol}:`, error.message);
    return null;
  }
};

// Fetch stock profile with retry logic
const fetchStockProfile = async (symbol) => {
  const fetchFn = async () => {
    const response = await axios.get(
      `https://finnhub.io/api/v1/stock/profile2`,
      {
        params: {
          symbol,
          token: FINNHUB_API_KEY
        },
        timeout: 8000
      }
    );
    return response.data;
  };

  try {
    const profile = await withRetry(fetchFn);
    return profile || {};
  } catch (error) {
    console.error(`Error fetching profile for ${symbol}:`, error.message);
    return {};
  }
};


const processStocksBatch = async (symbols, regionInfo) => {
  const results = [];
  const totalBatches = Math.ceil(symbols.length / BATCH_SIZE);
  
  console.log(`Processing ${symbols.length} symbols in ${totalBatches} batches for ${regionInfo.name}`);
  
  for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
    const batch = symbols.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    
    console.log(`Processing batch ${batchNum}/${totalBatches} for ${regionInfo.name}...`);
    
    const batchPromises = batch.map(async (symbolData) => {
      try {
        const [quote, profile] = await Promise.all([
          fetchStockQuote(symbolData.symbol),
          fetchStockProfile(symbolData.symbol)
        ]);

        if (quote && quote.c > 0) {
          const marketCap = profile.marketCapitalization || 0;
          const volume = quote.v || 0;
          
          // Filter out penny stocks and low volume stocks
          if (quote.c >= 1 && (marketCap > 100 || volume > 10000)) {
            return {
              ticker: symbolData.symbol,
              name: symbolData.description || profile.name || symbolData.symbol,
              price: parseFloat(quote.c.toFixed(2)),
              change: parseFloat((quote.d || 0).toFixed(2)),
              changePercent: parseFloat((quote.dp || 0).toFixed(2)),
              volume: volume,
              marketCap: marketCap,
              exchange: symbolData.exchange,
              region: symbolData.region,
              currency: profile.currency || regionInfo.currency || 'USD',
              logo: profile.logo || null,
              industry: profile.finnhubIndustry || 'N/A',
              country: profile.country || regionInfo.name,
              weburl: profile.weburl || null,
              lastUpdated: new Date().toISOString()
            };
          }
        }
        return null;
      } catch (error) {
        console.error(`Error processing ${symbolData.symbol}:`, error.message);
        return null;
      }
    });

    const batchResults = await Promise.all(batchPromises);
    const validResults = batchResults.filter(result => result !== null);
    results.push(...validResults);
    
    console.log(`Batch ${batchNum} completed: ${validResults.length}/${batch.length} valid stocks`);
    
    // Rate limit delay between batches
    if (i + BATCH_SIZE < symbols.length) {
      await delay(1200); // 1.2 second delay between batches
    }
  }

  return results;
};


export { getRegionExchanges , getUserPreferences , fetchExchangeSymbols , delay , processStocksBatch }