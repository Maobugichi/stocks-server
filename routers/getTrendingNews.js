import yahooFinance from "yahoo-finance2";
yahooFinance.suppressNotices(["yahooSurvey"]);

const trendingRouter = Router();

trendingRouter.get("/", async (req, res) => {
  try {
    const trending = await yahooFinance.trendingSymbols("US");
    const results = [];
    for (const stock of trending.quotes.slice(0, 5)) {
      await new Promise(r => setTimeout(r, 500)); 
      const search = await yahooFinance.search(stock.symbol);
      results.push({
        symbol: stock.symbol,
        companyName: stock.shortName,
        news: search.news || []
      });
    }

    const data = results.flatMap(result =>
      result.news.map(newsItem => ({
        ...newsItem,
        thumbnail: newsItem.thumbnail?.resolutions?.[0]?.url,
        relatedSymbol: result.symbol,
        companyName: result.companyName
      }))
    );

    res.json(data);
  } catch (err) {
    console.error("Error fetching trending data:", err);
    res.status(500).json(err);
  }
});


export default trendingRouter