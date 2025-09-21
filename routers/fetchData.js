import { Router } from "express";
import yahooFinance from "yahoo-finance2";

const stockrouter = Router();

function extractVolume(chart) {
  
  if (chart.quotes?.length) {
    return chart.quotes
      .filter((q) => q.volume && q.volume > 0)
      .map((q) => ({
        date: q.date.toISOString().slice(0, 10),
        volume: q.volume,
      }));
  }


  if (chart.timestamp && chart.indicators?.quote?.[0]?.volume) {
    const timestamps = chart.timestamp;
    const volArr = chart.indicators.quote[0].volume;

    const daily = timestamps.map((ts, i) => {
      const volume = volArr[i];
      const day = new Date(ts * 1000).toISOString().slice(0, 10);
      return { date: day, volume: typeof volume === "number" ? volume : null };
    });

    const map = new Map();
    for (const point of daily) {
      if (point.volume && point.volume > 0) {
        map.set(point.date, { date: point.date, volume: point.volume });
      }
    }

    return Array.from(map.values()).sort((a, b) =>
      a.date < b.date ? -1 : 1
    );
  }

  return [];
}

function extractOHLC(chart) {
  if (chart.quotes?.length) {
    return chart.quotes.map((q) => ({
      date: q.date.toISOString().slice(0, 10),
      open: q.open,
      high: q.high,
      low: q.low,
      close: q.close,
      volume: q.volume,
    }));
  }

  if (chart.timestamp && chart.indicators?.quote?.[0]) {
    const { open, high, low, close, volume } = chart.indicators.quote[0];
    const data = chart.timestamp.map((ts, i) => ({
      date: new Date(ts * 1000).toISOString().slice(0, 10),
      open: open[i],
      high: high[i],
      low: low[i],
      close: close[i],
      volume: volume[i],
    }));

    return data
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .filter((c, i, arr) => i === 0 || c.date !== arr[i - 1].date);
  }

  return [];
}

stockrouter.get("/:symbol", async (req, res) => {
  
  try {
    const symbol = req.params.symbol.toUpperCase();

    const { period1 , period2 , interval } = req.query;
   
    //const { period1 , period2 , interval } = req?.body 
    const quote = await yahooFinance.quoteSummary(symbol, {
      modules: [
        "financialData",
        "summaryProfile",
        "price",
        "defaultKeyStatistics",
        "earnings",
        "recommendationTrend",
        "calendarEvents",
        "summaryDetail"
      ],
    });

   
    const time2 = Math.floor(Date.now() / 1000) 
    const time1 =  time2 - 90 * 24 * 60 * 60
  
   
    const chart = await yahooFinance.chart(symbol, {
        period1: period1 ? parseInt(period1) : time1  ,
        period2: period2 ? parseInt(period2) : time2,
        interval: interval || "1d"
    });

    let volumeHistory = extractVolume(chart);
   
    const ohlcHistory = extractOHLC(chart);

    volumeHistory = volumeHistory.slice(-30); 

    const latestVolume =
      volumeHistory.length > 0
        ? volumeHistory[volumeHistory.length - 1].volume
        : null;

    const avgVolume =
      volumeHistory.length > 0
        ? Math.round(
            volumeHistory.reduce((s, x) => s + x.volume, 0) / volumeHistory.length
          )
        : null;
     const data = {
     
      symbol: quote.price?.symbol,
      company_name: quote.price?.longName,
      currency: quote.price?.currency,
      current_price: quote.price?.regularMarketPrice,
      change_percent_daily: quote.price?.regularMarketChangePercent,
      market_cap: quote.price?.marketCap,
      ohlc_history: ohlcHistory,

      open: quote.price?.regularMarketOpen,
      prev_close: quote.price?.regularMarketPreviousClose,
      day_high: quote.price?.regularMarketDayHigh,
      day_low: quote.price?.regularMarketDayLow,

      fifty_two_week_high: quote.defaultKeyStatistics?.fiftyTwoWeekHigh ??
       quote.summaryDetail?.fiftyTwoWeekHigh,
      fifty_two_week_low:  quote.defaultKeyStatistics?.fiftyTwoWeekLow ??
       quote.summaryDetail?.fiftyTwoWeekLow,

     
      volume: latestVolume,
      avg_volume: avgVolume,
      avg_volume_3m: quote.price?.averageDailyVolume3Month,
      avg_volume_10d: quote.price?.averageDailyVolume10Day,
      volume_history: volumeHistory,

      pe_ratio:
        quote.defaultKeyStatistics?.forwardPE ??
        quote.defaultKeyStatistics?.trailingPE,
      peg_ratio: quote.defaultKeyStatistics?.pegRatio,
      price_to_book: quote.defaultKeyStatistics?.priceToBook,
      price_to_sales: quote.defaultKeyStatistics?.priceToSalesTrailing12Months,

      
      revenue: quote.financialData?.totalRevenue,
      net_income: quote.financialData?.netIncomeToCommon,
      eps: quote.defaultKeyStatistics?.trailingEps,
      profit_margins: quote.financialData?.profitMargins,
      gross_margins: quote.financialData?.grossMargins,
      operating_margins: quote.financialData?.operatingMargins,
      free_cashflow: quote.financialData?.freeCashflow,
      operating_cashflow: quote.financialData?.operatingCashflow,
      book_value: quote.defaultKeyStatistics?.bookValue,
      beta: quote.defaultKeyStatistics?.beta,
      enterprise_value: quote.defaultKeyStatistics?.enterpriseValue,
      shares_outstanding: quote.defaultKeyStatistics?.sharesOutstanding,
      debt_to_equity: quote.financialData?.debtToEquity,
      return_on_equity: quote.financialData?.returnOnEquity,
      return_on_assets: quote.financialData?.returnOnAssets,

    
      dividend_rate: quote.summaryDetail?.dividendRate ??
      quote.defaultKeyStatistics?.dividendRate,
      dividend_yield: quote.summaryDetail?.dividendYield ??
       quote.defaultKeyStatistics?.dividendYield,
      payout_ratio: quote.defaultKeyStatistics?.payoutRatio,
      next_dividend_date: quote.calendarEvents?.dividends?.exDate,

     
      analyst_target_mean: quote.financialData?.targetMeanPrice,
      analyst_target_high: quote.financialData?.targetHighPrice,
      analyst_target_low: quote.financialData?.targetLowPrice,
      recommendation_mean: quote.financialData?.recommendationMean,
      recommendations: quote.recommendationTrend?.trend,

     
      earnings_yearly: quote.earnings?.financialsChart?.yearly,
      earnings_quarterly: quote.earnings?.financialsChart?.quarterly,
      earnings_estimates: quote.earnings?.earningsChart?.quarterly,
      next_earnings_date: quote.calendarEvents?.earnings?.earningsDate,

     
      sector: quote.summaryProfile?.sector,
      industry: quote.summaryProfile?.industry,
      employees: quote.summaryProfile?.fullTimeEmployees,
      headquarters: `${quote.summaryProfile?.city}, ${quote.summaryProfile?.country}`,
      website: quote.summaryProfile?.website,
      business_summary: quote.summaryProfile?.longBusinessSummary,
     };


     
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch stock data" });
  }
});

export default stockrouter;
