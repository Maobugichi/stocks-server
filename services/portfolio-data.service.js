import pool from "../db.js";

class PortfolioDataService {
    async getHoldings(userId) {
        const result = await pool.query(
            'SELECT id, symbol, shares, buy_price FROM portfolio WHERE user_id = $1 ORDER BY symbol',
            [userId]
        );
        return result.rows;
    }

    async addHolding(userId, ticker, shares, buyPrice) {
        const result = await pool.query(
            'INSERT INTO portfolio (user_id, symbol, shares, buy_price) VALUES ($1, $2, $3 ,$4) RETURNING id, symbol, shares, buy_price',
            [userId, ticker.toUpperCase(), shares , buyPrice]
        )
        return result.rows[0]
    }

    async deleteHolding(userId, holdingId) {
    const result = await pool.query(
      'DELETE FROM portfolio WHERE id = $1 AND user_id = $2 RETURNING symbol',
      [holdingId, userId]
    );
    return result.rowCount > 0 ? result.rows[0] : null;
  }

  async updateHolding(userId, holdingId, updates) {
    const updateFields = [];
    const values = [];
    let paramCount = 1;

    if (updates.ticker !== undefined) {
      updateFields.push(`symbol = $${paramCount++}`);
      values.push(updates.ticker.toUpperCase());
    }
    if (updates.shares !== undefined) {
      updateFields.push(`shares = $${paramCount++}`);
      values.push(updates.shares);
    }
    if (updates.buyPrice !== undefined) {
      updateFields.push(`buy_price = $${paramCount++}`);
      values.push(updates.buyPrice);
    }

    if (updateFields.length === 0) {
      return null;
    }

    values.push(holdingId, userId);

    const result = await pool.query(
      `UPDATE portfolio SET ${updateFields.join(', ')} WHERE id = $${paramCount++} AND user_id = $${paramCount} RETURNING id, symbol, shares, buy_price`,
      values
    );

    return result.rowCount > 0 ? result.rows[0] : null;
  }
}




export default new PortfolioDataService();