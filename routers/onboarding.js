import { Router } from "express";
import pool from "../db.js";
import { checkAuth } from "../checkAuth.js";

const onboardRouter =  Router();

onboardRouter.use(checkAuth)

onboardRouter.get("/onboarding/me", async (req,res) => {
    try {
        const userId = req.user.id
        const result = await pool.query(
            "SELECT id, username ,email, onboarded, onboarding_step FROM users WHERE id = $1",
            [userId]
        )
        res.json(result.rows)
    } catch(err) {
        res.status(500).json({ error:err.message })
    }
})

onboardRouter.post("/onboarding/step", async (req,res) => {
    try {
        const userId  = req.user.id;
        const { step } = req.body;
        await pool.query("update USERS set onboarding_step = $1 WHERE id = $2",
            [step,userId]
        );
        res.json({success: true})
    } catch(err) {
        res.status(500).json({ error: err.message })
    }
})

onboardRouter.post("/onboarding/complete", async (req, res) => {
  try {
    const userId = req.user.id
    await pool.query(
      "UPDATE users SET onboarded = true, onboarding_step = $1 WHERE id = $2",
      [4, userId] 
    )
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

onboardRouter.post("/onboarding" , async (req,res) => {
    const { userId , experienceLevel, currency, preferredMarkets, notifications, sectors } = req.body;

    try {
        await pool.query(
            `INSERT INTO user_preferences(user_id , experience_level , currency,preferred_markets)
             VALUES ($1, $2, $3,$4)
             ON CONFLICT (user_id) DO UPDATE SET
               experience_level = EXCLUDED.experience_level,
               currency = EXCLUDED.currency,
               preferred_markets = EXCLUDED.preferred_markets
            `,
            [userId, experienceLevel,currency, preferredMarkets]
        );

        await pool.query("DELETE FROM user_notifications WHERE user_id=$1", [userId]);
        await pool.query("DELETE FROM user_sectors WHERE user_id=$1", [userId]);

        for (const type of notifications) {
            await pool.query(
                "INSERT INTO user_notifications (user_id, type) VALUES ($1 ,$2)",
                [userId, type]
            )
        }

        for (const sector of sectors) {
            await pool.query(
                "INSERT INTO user_sectors (user_id , sector) VALUES ($1 ,$2)",
                [userId,sector]
            )
        }
        res.json({ success:true })
    } catch(err) {
        console.log(err)
        res.status(500).json(err)
    }
})

export default onboardRouter