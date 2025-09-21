import { Router } from "express";
import pool from "../db.js";
import yahooFinance from "yahoo-finance2";

const portfolioRouter = Router();

portfolioRouter.get("/:userId", async (req,res) => {
    const { userId } = req.params;
    console.log("hello")
    try {
        const result = await pool.query("SELECT symbol, shares, buy_price FROM portfolio WHERE user_id = $1",[userId]);

        const holdings = result.rows;

        if (holdings.length === 0) {
            return res.json({message: 'No holdings available'})
        }

        const symbols = holdings.map((h) => h.symbol);

        const now = new Date();
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(now.getMonth() - 1);
        const quotes = await yahooFinance.quote(symbols);
        const quotesArray = Array.isArray(quotes) ? quotes : [quotes];
        const historyPromises = symbols.map((s) =>
          yahooFinance.chart(s, { 
            period1: oneMonthAgo,
            period2: now,
            interval: "1d" })
        );
        const historyResults = await Promise.all(historyPromises);

        let portfolioValue = 0;
        let investedAmount = 0;
        let dailyChange = 0;
        let totalMarketCap = 0;
        let totalDividendYield = 0;
        let totalPE = 0;
        let countPE = 0;

        holdings.forEach((holding) => {
            const quote = quotesArray.find((q) => q.symbol == holding.symbol);
            if (!quote) return;
            const currentPrice = quote.regularMarketPrice || 0;
            const prevClose = quote.regularMarketPreviousClose || 0;

            const shares = Number(holding.shares);
            const buyPrice = Number(holding.buy_price);
            if (quote.marketCap) totalMarketCap += quote.marketCap;
            if (quote.dividendYield) totalDividendYield += quote.dividendYield;

            if (quote.trailingPE) {
                totalPE += quote.trailingPE
                countPE++
            }

           
            portfolioValue += currentPrice * shares;
            investedAmount += buyPrice * shares;
            dailyChange += (currentPrice - prevClose) * shares;
        })
        const avgPE = countPE > 0 ? totalPE / countPE : null;
        const averageDividendYield = holdings.length > 0 ? totalDividendYield / holdings.length : null
        const profitLoss = portfolioValue - investedAmount;
        const percentGainLoss = investedAmount > 0 ? (profitLoss / investedAmount) * 100 : 0;
        const dailyChangePercent = portfolioValue > 0 ? (dailyChange / portfolioValue) * 100 : 0;

        const numPoints = Math.min(...historyResults.map((h) => h.quotes.length))
 
        const dates = historyResults[0].quotes
         .slice(0, numPoints)
         .map((q) => q.date.toISOString().split("T")[0]); 
        const profitLossHistory = [];
         for (let i = 0; i < numPoints; i++) {
            let totalValueAtPoint = 0;

            holdings.forEach((holding,index) => {
                const shares = Number(holding.shares);
                const price = historyResults[index].quotes[i]?.close || 0;
                totalValueAtPoint += shares * price
            })
            profitLossHistory.push(totalValueAtPoint - investedAmount)
         }
         const dailyHistory = [];
         const dailyDates = []

        for (let i = 1; i < numPoints; i++) {
            let prevValue = 0;
            let currValue = 0;

            holdings.forEach((holding,idx) => {
                const shares = Number(holding.shares);
                const prev = historyResults[idx].quotes[i - 1]?.close || 0;
                const curr = historyResults[idx].quotes[i]?.close || 0;

                prevValue += shares * prev;
                currValue += shares * curr
            })
            const pctChange = prevValue > 0 ? ((currValue - prevValue) / prevValue) * 100 : 0;
            dailyHistory.push(pctChange)
            dailyDates.push(dates[i])
        }
        const low52 = holdings.reduce((sum, h, i) => 
            sum + (Number(h.shares) * (quotesArray[i].fiftyTwoWeekLow || 0)), 0);

        const high52 = holdings.reduce((sum, h, i) => 
            sum + (Number(h.shares) * (quotesArray[i].fiftyTwoWeekHigh || 0)), 0);

        const stockPerformance = holdings.map((h) => {
            const q = quotesArray.find((qq) => qq.symbol === h.symbol);
            const currentPrice = q?.regularMarketPrice || 0;
            const gainLoss = (currentPrice - Number(h.buy_price)) * Number(h.shares);
            const pct = h.buy_price > 0 ? (gainLoss / (h.buy_price * h.shares)) * 100 : 0;
            return { symbol:h.symbol , gainLoss , pct}
        });
        const topStock = stockPerformance.reduce((a,b) => b.pct > a.pct ? b : a);
        const worstStock = stockPerformance.reduce((a,b) => (b.pct < a.pct ? b : a));
        
        res.json({
            portfolioValue,
            investedAmount,
            profitLoss,
            percentGainLoss,
            dailyChange,
            dailyChangePercent,
            avgPE,
            averageDividendYield,
            totalMarketCap,
            dates,
            profitLossHistory,
            dailyHistory,
            dailyDates,
            low52,
            high52,
            topStock,
            worstStock,
            breakdown: holdings.map((h) => {
                const q = quotesArray.find((qq) => qq.symbol == h.symbol);
                return {
                    symbol:h.symbol,
                    shares:h.shares,
                    buyPrice:h.buy_price,
                    currentPrice:q?.regularMarketPrice || 0,
                    prevClose:q?.regularMarketPreviousClose || 0,
                    marketCap: q?.marketCap || null,
                    peRatio: q?.trailingPE || null,
                    dividendYield: q?.dividendYield || null,
                }
            })
        })
    } catch(err) {
        console.log(err)
        res.status(500).json(err)
    }
});

export default portfolioRouter
