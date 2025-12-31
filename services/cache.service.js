import NodeCache from "node-cache";
import { CACHE_CONFIG , CONFIG } from "../configs/yahoo-finance.config.js";

class CacheService {
    constructor() {
        this.cache = new NodeCache(CACHE_CONFIG);
    }

    get(key) {
        const cached = this.cache.get(key);
        if (cached) return { data:cached.data, cachedAt:cached.cachedAt , hit:true }
        return { data:null , hit:false }
    }

    set(key , data , ttl = CONFIG.CACHE_TTL.FULL_RESPONSE) {
        this.cache.set(key, { data, cachedAt: Date.now() } , ttl);
    }

    delete(key) {
        return this.cache.del(key)
    }

    flush() {
        this.cache.flushAll();
    }

    keys() {
        return this.cache.keys();
    }

    getStats() {
        return this.cache.getStats();
    }

    isStale(key, thresholdMs = CONFIG.STALE_THRESHOLD_MS) {
        const cached = this.cache.get(key);
        if (!cached?.cachedAt) return false;
        return Date.now() - cached.cachedAt > thresholdMs
    }
}


export default new CacheService()