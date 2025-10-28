import { Router } from "express";
import pool from "../db.js";
import yahooFinance from "yahoo-finance2";
import { sendNotifications } from "../getNotifs.js";

const addWatchlistRouter = Router();

addWatchlistRouter.post("/add/:userId",async (req,res) => {
    const { userId } = req.params;
    const { ticker } = req.body;

    try {
    const quote = await yahooFinance.quote(ticker);
    const formatted = {
     symbol: quote.symbol,
     company_name: quote.shortName,
     current_price: quote.regularMarketPrice,
     change_percent_daily: quote.regularMarketChangePercent,
     market_cap: quote.marketCap,
     volume: quote.regularMarketVolume,
     average_volume: quote.averageDailyVolume3Month,
     fifty_two_week_high: quote.fiftyTwoWeekHigh,
     fifty_two_week_low: quote.fiftyTwoWeekLow,
     pe_ratio: quote.trailingPE
    };

    const { symbol , company_name ,fifty_two_week_high, fifty_two_week_low , pe_ratio } = formatted

    await pool.query("INSERT INTO watchlist(user_id, symbol,company_name,fifty_two_week_high,fifty_two_week_low,pe_ration) VALUES($1,$2,$3,$4,$5,$6)",
        [userId , symbol , company_name, fifty_two_week_high , fifty_two_week_low,pe_ratio]
    );

    sendNotifications("watchlist-updated" , {
        message:`watchlist updated: ${ticker} added`
    },userId);

    res.json(formatted)
   } catch(err) {
    console.log(err)
    res.json(err)
   }
})

addWatchlistRouter.delete(`/remove/:userId/:ticker`, async (req,res) => {
    try {
        const { userId , ticker } = req.params;
        await pool.query("DELETE FROM watchlist WHERE symbol = $1 AND user_id = $2" , [ticker , userId]);
        res.status(200).json({message:'success'})
    } catch(err) {
        res.status(500).json(err)
    }
})

export default addWatchlistRouter