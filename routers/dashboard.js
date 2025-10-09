import { Router } from "express";
import { checkAuth } from "../checkAuth";

const dashboardRouter = Router();

dashboardRouter.get("/", checkAuth, (req, res) => {
  res.json({ message: "Dashboard data", user: req.user });
});

export default dashboardRouter;