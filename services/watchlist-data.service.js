import pool from "../db.js";

class WatchlistDataService {
    async getWatchlist(userId) {
        const result = await pool.query(
            'SELECT symbol, company_name, fifty_two_week_high, fifty_two_week_low, pe_ration FROM watchlist WHERE user_id = $1',
            [userId]
        );

        return result.rows
    }

    async addToWatchlist(){
       const { symbol, company_name, fifty_two_week_high, fifty_two_week_low, pe_ratio } = stockData;

        const result = await pool.query(
        'INSERT INTO watchlist (user_id, symbol, company_name, fifty_two_week_high, fifty_two_week_low, pe_ration) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
        [userId, symbol, company_name, fifty_two_week_high, fifty_two_week_low, pe_ratio]
        );

        return result.rows[0];
    }

    async removeFromWatchlist(userId, ticker) {
        const result = await pool.query(
        'DELETE FROM watchlist WHERE symbol = $1 AND user_id = $2 RETURNING symbol',
        [ticker, userId]
        );

        return result.rowCount > 0 ? result.rows[0] : null;
    }

    async checkExists(userId, ticker) {
        const result = await pool.query(
        'SELECT 1 FROM watchlist WHERE user_id = $1 AND symbol = $2',
        [userId, ticker]
        );
        return result.rowCount > 0;
    }
}


export default new WatchlistDataService();