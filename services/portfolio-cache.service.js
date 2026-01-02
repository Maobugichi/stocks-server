import { PORTFOLIO_CONFIG } from "../configs/portfolio.config.js";

class PortfolioCacheService {
    constructor() {
        this.cache = new Map();
        this.ttl = PORTFOLIO_CONFIG.CACHE_TTL
    }

    getCacheKey(userId, type = 'portfolio') {
        return `${userId}:${type}`;
    }

    get(userId, type = 'portfolio') {
        const key = this.getCacheKey(userId, type);
        const cached = this.cache.get(key);

        if (cached && Date.now() - cached.timestamp < this.ttl) {
            return cached.data
        }

        this.cache.delete(key);
        return null
    }

    set(userId , data , type = 'portfolio') {
        const key = this.getCacheKey(userId, type);
        this.cache.set(key, { data, timestamp: Date.now() });
    }

    clearUser(userId) {
        const key = this.getCacheKey(userId,'portfolio');
        this.cache.delete(key);
        console.log(`Cleared cache for user ${userId}`)
    }

    clearAll() {
        const size = this.cache.size;
        this.cache.clear();
        console.log(`Cleared all cache (${size} entries)`);
        return size;
    }

    getSize() {
        return this.cache.size;
    }
}

export default new PortfolioCacheService();