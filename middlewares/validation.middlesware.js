export function validateTickerParam(req, res , next) {
    const ticker = (req.query.ticker || req.query.symbol)?.toString().trim().toUpperCase();

    if (!ticker) {
        return res.status(400).json({
            error:'Bad Request',
            message:'Ticker symbol is required'
        })
    }

    if (!/^[A-Z0-9.-]{1,10}$/.test(ticker)) {
        return res.status(400).json({ 
        error: 'Bad Request',
        message: 'Invalid ticker format' 
        });
    }

    req.ticker = ticker;
    next();
}