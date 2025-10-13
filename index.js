import express from "express";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import router from "./routers/signup.js";
import stockrouter from "./routers/fetchData.js";
import cors from  "cors";
import tickerRouter from "./routers/stockTickers.js";
import { checkAuth } from "./checkAuth.js";
import dashRouter from "./routers/dashboard.js";
import loginRouter from "./routers/login.js";
import savePortfolioRouter from "./routers/saveToPorfolio.js";
import http from "http";
import { initSocket } from "./socket.js";
import portfolioRouter from "./routers/portfolio.js";
import addWatchlistRouter from "./routers/addWatch.js";
import watchListRouter from "./routers/getWatchList.js";
import newsRouter from "./routers/news.js";
import trendingRouter from "./routers/getTrendingNews.js";
import alertRouter from "./routers/alerts.js";
import sentimentRouter from "./routers/sentiment.js";
import finnRouter from "./routers/finnNews.js";
import oauthRouter from "./routers/oauth.js";
import onboardRouter from "./routers/onboarding.js";
import trendingPageRouter from "./routers/trending.js";


dotenv.config();

const app = express();
const port = 3000;
const allowedOrigins = ["http://localhost:5173","https://maobugichi.github.io"]
const server = http.createServer(app);

initSocket(server);

app.use(express.json());
app.use(cookieParser());

app.use(
  cors({
    origin: (origin, callback) => {
      
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        callback(null, true); 
      } else {
        callback(new Error("Not allowed by CORS")); 
      }
    },
    credentials: true, 
  })
);


app.use("/api/sign-up/",router);
app.use("/api/login/",loginRouter);
app.use("/api/",checkAuth,dashRouter);
app.use("/api/stocks/",stockrouter);
app.use("/api/ticker/", tickerRouter);
app.use("/api/save-port",savePortfolioRouter);
app.use("/api/portfolio/",portfolioRouter);
app.use("/api/watchlist/",addWatchlistRouter);
app.use("/api/getList/", checkAuth , watchListRouter);
app.use("/api/news/", newsRouter);
app.use("/api/trending-news/",trendingRouter);
app.use("/api/alerts", alertRouter);
app.use("/api/", sentimentRouter);
app.use("/api/newsList" , finnRouter);
app.use("/oauth", oauthRouter);
app.use("/api/", onboardRouter);
app.use("/api/", checkAuth, trendingPageRouter);

server.listen(port,() => {
    console.log(`server started on port ${port}`);
});




