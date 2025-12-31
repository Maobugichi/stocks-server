import pLimit from "p-limit";
import { CONFIG } from "../configs/yahoo-finance.config.js";

export const limiter = pLimit(CONFIG.RATE_LIMIT.MAX_CONCURRENT);