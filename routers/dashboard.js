import { Router } from "express";


const dashboardRouter = Router();

dashboardRouter.get("/", (req, res) => {
  res.json({ message: "Dashboard data", user: req.user });
});

export default dashboardRouter;