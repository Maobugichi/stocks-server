import { Router } from "express";
import yahooFinance from "yahoo-finance2";
import NodeCache from "node-cache";

yahooFinance.suppressNotices(["yahooSurvey"]);

const trendingRouter = Router();


const newsCache = new NodeCache({ 
  stdTTL: 600, 
  checkperiod: 60 
});


async function fetchWithTimeout(fn, timeoutMs = 5000, retries = 2) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const result = await Promise.race([
        fn(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Request timeout')), timeoutMs)
        )
      ]);
      return result;
    } catch (err) {
      if (attempt === retries - 1) throw err;
      console.log(`Retry ${attempt + 1}/${retries}...`);
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
}

trendingRouter.get("/", async (req, res) => {
  try {

    const cached = newsCache.get('trending_news');
    if (cached) {
      console.log('Returning cached news');
      return res.json(cached);
    }

    console.log('Fetching fresh trending news...');

  
    const trending = await fetchWithTimeout(
      () => yahooFinance.trendingSymbols("US"),
      8000
    );

    if (!trending?.quotes?.length) {
      console.warn('⚠️ No trending symbols found');
      return res.json([]);
    }

    const results = [];
    const symbols = trending.quotes.slice(0, 5);

   
    for (const stock of symbols) {
      try {
        await new Promise(r => setTimeout(r, 300)); 
        
        const search = await fetchWithTimeout(
          () => yahooFinance.search(stock.symbol),
          5000,
          1 
        );

        if (search?.news?.length) {
          results.push({
            symbol: stock.symbol,
            companyName: stock.shortName || stock.longName || stock.symbol,
            news: search.news.slice(0, 3) 
          });
        }
      } catch (err) {
        console.error(`❌ Failed to fetch news for ${stock.symbol}:`, err.message);
        
      }
    }

   
    const data = results.flatMap(result =>
      result.news.map(newsItem => ({
        title: newsItem.title || 'No title',
        publisher: newsItem.publisher || 'Unknown',
        link: newsItem.link || '#',
        providerPublishTime: newsItem.providerPublishTime,
        type: newsItem.type || 'STORY',
        thumbnail: newsItem.thumbnail?.resolutions?.[0]?.url || null,
        relatedSymbol: result.symbol,
        companyName: result.companyName
      }))
    );

    // Cache the results
    if (data.length > 0) {
      newsCache.set('trending_news', data);
      console.log(`✅ Cached ${data.length} news articles`);
    }

    res.json(data);

  } catch (err) {
    console.error("❌ Error fetching trending data:", err.message);
    
    // Try to return stale cache as fallback
    const staleCache = newsCache.get('trending_news');
    if (staleCache) {
      console.log('⚠️ Returning stale cache due to error');
      return res.json(staleCache);
    }

    // Last resort: return empty array instead of 500 error
    res.status(200).json({
      articles: [],
      error: true,
      message: 'Unable to fetch news at this time'
    });
  }
});

// Optional: Clear cache endpoint
trendingRouter.delete("/cache", (req, res) => {
  newsCache.del('trending_news');
  res.json({ message: 'News cache cleared' });
});

export default trendingRouter;