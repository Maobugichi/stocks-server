import { delay } from "../utils/retry.util.js";

class PortfolioCalculationService {
    calculatePortfolioMetrics(holdings, quoteMap) {
        let portfolioValue = 0;
        let investedAmount = 0;
        let yesterdayPortfolioValue = 0;
        let totalMarketCap = 0;
        let totalDividendYield = 0;
        let totalPE = 0;
        let countPE = 0;
        let countDividend = 0;
        let invalidHoldings = 0;

        holdings.forEach((holding) => {
            const quote = quoteMap.get(holding.symbol);
            if (!quote) {
                invalidHoldings++;
                return;
            }

            const shares = Number(holding.shares);
            const buyPrice = Number(holding.buy_price);
            const currentPrice = quote.regularMarketPrice || 0;
            const prevClose = quote.regularMarketPrice || currentPrice;

            portfolioValue += currentPrice * shares;
            investedAmount += buyPrice * shares;
            yesterdayPortfolioValue += prevClose * shares;

            if (quote.marketCap) totalMarketCap += quote.marketCap;

            if (quote.dividendYield) {
                totalDividendYield += quote.dividendYield;
                countDividend++;
            }

            if (quote.trailingPE && quote.trailingPE > 0) {
                totalPE += quote.trailingPE;
                countPE++;
            }
        });

        const profitLoss = portfolioValue - investedAmount;
        const percentGainLoss =
          investedAmount > 0 ? (profitLoss / investedAmount) * 100 : 0;
        const dailyChange = portfolioValue - yesterdayPortfolioValue;
        const dailyChangePercent = 
          yesterdayPortfolioValue > 0
           ? (dailyChange / yesterdayPortfolioValue) * 100
           : 0;
        const avgPE = countPE > 0 ? totalPE / countPE : null; 
        const averageDividendYield =
          countDividend > 0 ? totalDividendYield / countDividend : null;
         
        return {
            portfolioValue,
            investedAmount,
            profitLoss,
            percentGainLoss,
            dailyChange,
            dailyChangePercent,
            avgPE,
            averageDividendYield,
            totalMarketCap,
            invalidHoldings,
       };
    }

    calculatePortfolioHistory(holdings, quoteMap, historyMap) {
        const historiesAvailable = Array.from(historyMap.values());

        if (historiesAvailable.length === 0) { 
            return {
                dates:[],
                profitLossHistory: [],
                portfolioValueHistory: [],
                dailyHistory: [],
                dailyDates: [],
            }
        }

        const numPoints = Math.min(
            ...historiesAvailable.map((h) => h.quotes?.length || 0)
        );

        const dates = [];
        const profitLossHistory = [];
        const portfolioValueHistory = [];

        const investedAmount = holdings.reduce((sum,holding) => {
            const shares = Number(holding.shares);
            const buyPrice = Number(holding.buy_price);

            return sum + (shares * buyPrice);
        } , 0);
        
            for (let i = 0; i < numPoints; i++) {
                let totalValueAtPoint = 0;

                holdings.forEach((holding) => {
                    const shares = Number(holding.shares);
                    const history = historyMap.get(holding.symbol);

                    if (history?.quotes[i]?.close) {
                        const price = history.quotes[i].close;
                        totalValueAtPoint += shares * price
                    } else {
                        const quote = quoteMap.get(holding.symbol);
                        const currentPrice = quote?.regularMarketPrice || 0;
                        totalValueAtPoint += shares * currentPrice
                    }
                });

                const dateValue = historiesAvailable[0].quotes[i]?.date;
                if (dateValue) {
                    dates.push(dateValue.toISOString().split('T')[0]);
                }

                portfolioValueHistory.push(totalValueAtPoint)
                profitLossHistory.push(totalValueAtPoint - investedAmount)
            }

            const dailyHistory = [];
            const dailyDates = [];

            for (let i = 1; i < portfolioValueHistory.length; i++) {
                const prevValue = portfolioValueHistory[i - 1];
                const currValue = portfolioValueHistory[i];

                const pctChange =
                  prevValue > 0 ? ((currValue - prevValue) / prevValue) * 100 : 0;
                
                  dailyHistory.push(pctChange);
                  dailyDates.push(dates[i])
            }

            return {
                dates,
                profitLossHistory,
                portfolioValueHistory,
                dailyHistory,
                dailyDates,
            };
    }

    calculate52WeekRange(holdings, quoteMap) {
        const low52 = holdings.reduce((sum, h) => {
            const quote = quoteMap.get(h.symbol);
            if (!quote) return sum;
            const shares = Number(h.shares);
            const low = quote.fiftyTwoWeekLow || 0;
            return sum + shares * low;
        },0);


        const high52 = holdings.reduce((sum, h) => {
            const quote = quoteMap.get(h.symbol);
            if (!quote) return sum;
            const shares = Number(h.shares);
            const high = quote.fiftyTwoWeekHigh || 0;
            return sum + shares * high;
        },0);

        return { low52, high52 }
    }

    calculateStockPerformance(holdings, quoteMap) {
        const stockPerformance = holdings
         .map((h) => {
            const quote = quoteMap.get(h.symbol);
            if (!quote) return null;
            const shares = Number(h.shares);
            const buyPrice = Number(h.buy_price);
            const currentPrice = quote.regularMarketPrice || 0;

            const invested = buyPrice * shares;
            const currentValue = currentPrice * shares;
            const gainLoss = currentValue - invested;
            const pct = invested > 0 ? (gainLoss / invested) * 100 : 0;

            return { symbol: h.symbol, gainLoss, pct };
         })
          .filter(Boolean);

          const topStock =
            stockPerformance.length > 0
                ? stockPerformance.reduce((a, b) => (b.pct > a.pct ? b : a))
                : null;

          const worstStock =
                stockPerformance.length > 0
                    ? stockPerformance.reduce((a, b) => (b.pct < a.pct ? b : a))
                    : null;

          return { topStock, worstStock };
    }


    createBreakdown(holdings, quoteMap, quotesArray) {
    return holdings.map((h) => {
      const quote = quoteMap.get(h.symbol);
      const erroredQuote = quotesArray.find(
        (q) => q.symbol === h.symbol && q.error
      );

      return {
        id: h.id,
        symbol: h.symbol,
        shares: h.shares,
        buyPrice: h.buy_price,
        currentPrice: quote?.regularMarketPrice || 0,
        prevClose: quote?.regularMarketPreviousClose || 0,
        marketCap: quote?.marketCap || null,
        peRatio: quote?.trailingPE || null,
        dividendYield: quote?.dividendYield || null,
        valid: !!quote,
        errorMessage: erroredQuote?.errorMessage || null,
      };
    });
  }
}

export default new PortfolioCalculationService();