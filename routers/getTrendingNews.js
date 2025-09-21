import { Router } from "express";
import yahooFinance from "yahoo-finance2";

const trendingRouter = Router();

trendingRouter.get("/", async (req,res) => {
    try{
        const trending = await yahooFinance.trendingSymbols('US');

        const newsPromises = trending.quotes.slice(0,5).map(async (stock) => {
            try {
                   const search = await  yahooFinance.search(stock.symbol);
                    return {
                        symbol:stock.symbol,
                        companyName:stock.shortName,
                        news:search.news || []
                    }
            } catch(err) {
                console.error(`Error fetching news for ${stock.symbol}:`, err);
                return { symbol:stock.symbol, news:[]}
            }
           
        });
       

        const results = await Promise.all(newsPromises);
        
        const data =  results.flatMap(result => 
            result.news.map(newsItem => ({
                ...newsItem,
                thumbnail:newsItem.thumbnail?.resolutions?.[0]?.url,
                relatedSymbol:result.symbol,
                companyName:result.companyName
            }))
        )

        
        res.json(data)
    } catch(err) {
        res.status(500).json(err)
    }
});


export default trendingRouter