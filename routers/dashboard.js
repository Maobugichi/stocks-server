import { Router } from "express";
import pool from "../db.js";

const dashRouter = Router();

dashRouter.get("/", async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      "SELECT id, username, email, onboarded, onboarding_step FROM users WHERE id = $1",
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(result.rows[0]); 
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong" });
  }
});

export default dashRouter;
