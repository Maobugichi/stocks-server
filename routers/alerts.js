import { Router } from "express";
import pool from "../db.js";
import { sendNotifications } from "../getNotifs.js";

const alertRouter = Router();

alertRouter.post("/:userId" , async (req,res) => {
    const { userId } = req.params
    const { symbol , conditions } = req.body
    
    try {
        let result 

        for (let cond of conditions) {
            result = await pool.query(`
            INSERT INTO alerts(user_id , symbol) VALUES($1 , $2) returning id    
            `, [userId , symbol]);
        }
       

        const alerId = result.rows[0].id;
        
        for (const cond of conditions) {
            await pool.query(
                `INSERT INTO alert_conditions (alert_id , condition_type, value) 
                 VALUES($1 , $2 , $3)
                `, [alerId , cond.condition_type , cond.value]
            )
        }

         sendNotifications("alert-created" , {
            message:`Alert created for: ${symbol}`
         },userId);
        res.json({success:true , alerId});
    } catch(err) {
        console.log(err)
        res.status(500).json({ error:err})
    }
})

alertRouter.get("/:userId" , async (req, res) => {
    try {
        const { rows } = await pool.query(
         `SELECT a.id AS alert_id, a.symbol , a.active,
            json_agg(json_build_object(
             'condition_type', c.condition_type,
             'value', c.value
            )) AS conditions
            FROM alerts a 
            JOIN alert_conditions c ON a.id = c.alert_id
            WHERE a.user_id = $1 AND a.active = TRUE
            GROUP BY a.id 
         `,
         [req.params.userId]
        );

        res.json(rows)
    } catch(err) {
        console.log(err);
        res.status(500).json(err)
    }
});

alertRouter.patch("/:userId/:id", async (req, res) => {
    const { userId, id } = req.params;
    const { condition, value, active } = req.body;

    try {
        let result;
       
        if (active !== undefined) {
            const alertQuery = `UPDATE alerts SET active = $1 WHERE id = $2 RETURNING *`;
            result = await pool.query(alertQuery, [active, id]);
        }

       
        if (condition !== undefined && condition.length !== 0 || value !== undefined && value.length !== 0) {
            const updates = [];
            const params = [];
            let paramsIndex = 1;
            console.log("hello")

            if (condition !== undefined && condition.length !== 0) {
                updates.push(`condition_type = $${paramsIndex++}`);
                params.push(condition);
            }

            if (value !== undefined && value.length !== 0) {
                updates.push(`value = $${paramsIndex++}`);
                params.push(parseInt(value));
            }

            params.push(id);
            const conditionQuery = `UPDATE alert_conditions SET ${updates.join(", ")}
            WHERE alert_id = $${paramsIndex}
            RETURNING *`;
            
            result = await pool.query(conditionQuery, params);
        }

        if (!result || result.rows.length === 0) {
            return res.status(404).json({ error: "Alert not found" });
        }

        res.json(result.rows[0]);
    } catch (err) {
        console.log(err.message);
        res.status(500).json(err);
    }
});



export default alertRouter