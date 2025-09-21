import { Router } from "express";
import yahooFinance from "yahoo-finance2";
import NodeCache from "node-cache"

const newsCache = new NodeCache({ stdTTL:1800 });

const newsRouter = Router();

const getRelativeTime = (timestamp) => {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;
  
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
};

newsRouter.get("/:symbol", async (req , res) => {
    try {
        const { symbol } = req.params;
        
        const cacheKey = `news_${symbol.toLowerCase()}`;

        const cachedNews = newsCache.get(cacheKey)
        
        if (cachedNews) {
            return res.json(cachedNews);
        }
        
        const searchResults = await yahooFinance.search(symbol, {
            newsCount:20,
            quotesCount:0,
            enableFuzzyQuery:false
        });

       
      
        const formattedNews = searchResults.news?.map(article => ({
            uuid:article.uuid,
            title:article.title,
            publisher:article.publisher,
            link:article.link,
            publishTime:article.providerPublishTime,
            summary:article.summary || '',
            thumbnail:article.thumbnail?.resolutions?.[0]?.url,
            tickers:article.relatedTickers,
            relativeTime:getRelativeTime(article.providerPublishTime)
        })) || [];

        
         newsCache.set(cacheKey,formattedNews)
         res.json(formattedNews)
    } catch(err) {
        console.log(err)
        res.status(500).json({error:err})
    }
})

export default newsRouter