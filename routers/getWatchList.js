import { Router } from "express";
import pool from "../db.js";
import yahooFinance from "yahoo-finance2";

const watchListRouter = Router();

watchListRouter.get("/:userId", async (req,res) => {
    const { userId } = req.params;
    try {
    const result = await pool.query("SELECT symbol, company_name, fifty_two_week_high,fifty_two_week_low , pe_ration FROM watchlist WHERE user_id = $1",[userId]);
    const watchlist = result.rows;
    
    if (watchlist.length === 0) return res.json([]);

    const symbols = watchlist.map((h) => h.symbol);
   
    const liveData = await yahooFinance.quote(symbols);
    
    const sparkLineData = await Promise.all(
        symbols.map(async (symbol) => {  
                const period2 = Math.floor(Date.now() / 1000); 
                const period1 = period2 - 7 * 24 * 60 * 60;     
                const chart = await yahooFinance.chart(symbol, {
                    period1,
                    period2,
                    interval: "1h" 
                });
              
                const quotes = chart.quotes || [];
              
                return {
                symbol,
                timestamps: quotes.map(q => q.date),
                closes: quotes.map(q => q.close)
            }
        
        })
    );

    

    const merged = watchlist.map(item => {
        const live = liveData.find(data => data.symbol == item.symbol);
        const spark = sparkLineData.find(s => s.symbol == item.symbol);
        
        return {
        symbol: item.symbol,
        company_name: item.company_name,
        current_price: live?.regularMarketPrice || null,
        change_percent_daily: live?.regularMarketChangePercent || null,
        change_percent_weekly: live?.fiftyTwoWeekChangePercent || null, 
        market_cap: live?.marketCap || null,
        volume: live?.regularMarketVolume || null,
        average_volume: live?.averageDailyVolume3Month || null,
        fifty_two_week_high: item.fifty_two_week_high,
        fifty_two_week_low: item.fifty_two_week_low,
        pe_ratio: item.pe_ration,
        sparkline: {
          timestamps: spark?.timestamps || [],
          closes: spark?.closes || []
        }
       };
    });
   
    res.json(merged)
    } catch(err) {
        res.json(err)
        //console.log(err)
    }
})

export default watchListRouter

