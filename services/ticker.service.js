import pool from "../db.js";
import cacheService from "./cache.service.js";
import { CONFIG } from "../configs/yahoo-finance.config.js";

class TickerService  {
    async getRandomTickers(limit = 20) {
        const cacheKey = `tickers_${limit}`;

        const { data , hit } = cacheService.get(cacheKey);
        if (hit) return data;

        try {
            const res = await pool.query(
                'SELECT symbol FROM tickers ORDER BY random() LIMIT $1',
                [limit]
            )

            const tickers = res.rows.map(r => r.symbol);
            cacheService.set(cacheKey , tickers , CONFIG.CACHE_TTL.TICKERS);

           
            return tickers
        } catch(err) {
            console.error('DB query failed', err.message);
            throw new Error('Failed to fetch tickers from database')
        }
    } 
}


export default new TickerService();