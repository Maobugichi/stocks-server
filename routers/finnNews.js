import { Router } from "express";
import axios from "axios";

const finnRouter = Router();
const finKey = process.env.FINN_KEY;


finnRouter.get("/category", async (req, res) => {
  const { category = "general" } = req.query;
  const item = category || "general";

  try {
    const response = await axios.get(
      `https://finnhub.io/api/v1/news?category=${item}&token=${finKey}`
    );
    res.json(response.data);
  } catch (err) {
    console.error("Finnhub category error:", err.message);
    res.status(500).json({ error: "Failed to fetch category news" });
  }
});



finnRouter.get("/company-news/:symbol", async (req, res) => {
  const { symbol } = req.params;
  const { from, to } = req.query; 

  if (!symbol) {
    return res.status(400).json({ error: "Symbol is required" });
  }

  
  const formatDate = (unix) => {
    if (!unix) return null;
    return new Date(parseInt(unix) * 1000).toISOString().split("T")[0];
  };

  const fromDate = formatDate(from);
  const toDate = formatDate(to);

  try {
    const response = await axios.get(
      `https://finnhub.io/api/v1/company-news?symbol=${symbol}&from=${fromDate}&to=${toDate}&token=${finKey}`
    );
    res.json(response.data);
  } catch (err) {
    console.error("Finnhub company error:", err.response?.data || err.message);
    res.status(500).json(err.response?.data || { error: "Failed to fetch company news" });
  }
});

export default finnRouter;



