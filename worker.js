import cron, { validate } from "node-cron";
import yahooFinance from "yahoo-finance2";
import pool from "./db.js";

async function checkAlerts() {
    const { rows:alerts } = await pool.query(`
        SELECT a.id as alert_id , a.symbol, u.email , u.phone,
            json_agg(json_build_object(
             'condition_type', c.condition_type,
             'value', c.value
            )) AS conditions
        FROM alerts a
        JOIN users u ON a.user_id = u.id 
        JOIN alert_conditions c ON a.id = c.alert_id 
        WHERE a.active = TRUE
        GROUP BY a.id , u.email, u.phone     
        `);

    if (!alerts.length) return;

    const symbols = [...new Set(alerts.map(a => a.symbol))];
    const quotes = await yahooFinance.quote(symbols);

    const quoteMap = Array.isArray(quotes) 
     ? Object.fromEntries(quotes.map(q => [q.symbol , q]))
     : { [quotes.symbol]: quotes}

     for (const alert of alerts) {
        const stock = quoteMap[alert.symbol];

        if (!stock) continue

        let allMet = true;
        let msgParts = [];

        for (const cond of alert.conditions) {
            const type = cond.condition_type;
            const val = cond.value

            if (type == "price_above") {
                if (!(stock.regularMarketPrice > val)) allMet = false;
                msgParts.push(`price > ${val}`);
            }
            if (type == "price_below") {
                if (!(stock.regularMarketPrice < val)) allMet = false;
                msgParts.push(`price < ${val}`)
            }
            if (type === "volume_above") {
                if (!(stock.regularMarketVolume > val)) allMet = false;
                msgParts.push(`volume > ${val}`)
            }
            if (type === "pct_change_above") {
                if (!(stock.regularMarketChangePercent > val)) allMet = false;
                msgParts.push(`pct_change > ${val}%`)
            }
        }
        if (allMet) {
            const message = `${alert.symbol} met conditions met conditions: ${msgParts.join(" AND ")} (price=${stock.regularMarketPrice}, volume=${stock.regularMarketVolume})`

            await pool.query(
                `INSERT INTO alert_logs (alert_id, message) VALUES ($1, $2)`,
                [alert.alert_id , message]
            )
            console.log("🚨 ALERT:", message, "→", alert.email || alert.phone);
        }
     }
}

cron.schedule("* * * * *", checkAlerts);

console.log("Alert worker started");