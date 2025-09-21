import { Router } from "express";
import pool from "../db.js";
import { sendNotifications } from "../getNotifs.js";

const savePortfolioRouter = Router();

savePortfolioRouter.post("/:userId", async (req,res) => {
    try {
        const userId = req.params.userId;
        const { ticker , shares , buyPrice } = req.body;
        await pool.query("INSERT INTO portfolio(user_id , symbol ,shares , buy_price) VALUES($1 , $2 , $3 , $4) RETURNING symbol , shares , buy_price",[userId , ticker , shares , buyPrice]);
        sendNotifications("portfolio-updated" , {
            message:`Portfolio updated: ${ticker} added`
        },userId);

        res.status(200).json({message: "Added to portfolio"});
    } catch(err) {
        console.log(err);
        res.status(500).json(err.message);
    }
})

export default savePortfolioRouter