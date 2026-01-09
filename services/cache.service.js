import NodeCache from "node-cache";
import { CACHE_CONFIG, CONFIG } from "../configs/yahoo-finance.config.js";

class CacheService {
    constructor() {
      
        this.globalCache = new NodeCache({
            ...CACHE_CONFIG,
            stdTTL: 60, 
        });

       
        this.userCache = new NodeCache({
            ...CACHE_CONFIG,
            stdTTL: 300, 
        });

       
        this.stats = {
            globalHits: 0,
            globalMisses: 0,
            userHits: 0,
            userMisses: 0,
            lastReset: Date.now()
        };
    }

   
    getGlobal(key) {
        const cached = this.globalCache.get(key);
        if (cached) {
            this.stats.globalHits++;
            return { 
                data: cached.data, 
                cachedAt: cached.cachedAt, 
                hit: true,
                age: Date.now() - cached.cachedAt 
            };
        }
        this.stats.globalMisses++;
        return { data: null, hit: false };
    }

    
    setGlobal(key, data, ttl = 60) {
        this.globalCache.set(key, { 
            data, 
            cachedAt: Date.now() 
        }, ttl);
    }

   
    getUser(userId, key) {
        const userKey = `user_${userId}_${key}`;
        const cached = this.userCache.get(userKey);
        if (cached) {
            this.stats.userHits++;
            return { 
                data: cached.data, 
                cachedAt: cached.cachedAt, 
                hit: true,
                age: Date.now() - cached.cachedAt 
            };
        }
        this.stats.userMisses++;
        return { data: null, hit: false };
    }

    
    setUser(userId, key, data, ttl = 300) {
        const userKey = `user_${userId}_${key}`;
        this.userCache.set(userKey, { 
            data, 
            cachedAt: Date.now() 
        }, ttl);
    }

    
    get(key) {
        return this.getGlobal(key);
    }

   
    set(key, data, ttl = 60) {
        this.setGlobal(key, data, ttl);
    }

    
    deleteGlobal(key) {
        return this.globalCache.del(key);
    }

   
    deleteUser(userId, key) {
        const userKey = `user_${userId}_${key}`;
        return this.userCache.del(userKey);
    }

    deleteUserAll(userId) {
        const userKeys = this.userCache.keys().filter(k => k.startsWith(`user_${userId}_`));
        return this.userCache.del(userKeys);
    }

   
    delete(key) {
        return this.deleteGlobal(key);
    }

   
    flushGlobal() {
        this.globalCache.flushAll();
        console.log('🗑️ Global cache flushed');
    }

    flushUser() {
        this.userCache.flushAll();
        console.log('User cache flushed');
    }

   
    flush() {
        this.flushGlobal();
        this.flushUser();
        this.resetStats();
    }

   
    keysGlobal() {
        return this.globalCache.keys();
    }

    keysUser() {
        return this.userCache.keys();
    }

    keys() {
        return this.keysGlobal();
    }

 
    getStats() {
        const globalStats = this.globalCache.getStats();
        const userStats = this.userCache.getStats();

        const totalHits = this.stats.globalHits + this.stats.userHits;
        const totalMisses = this.stats.globalMisses + this.stats.userMisses;
        const totalRequests = totalHits + totalMisses;
        const hitRate = totalRequests > 0 ? (totalHits / totalRequests * 100).toFixed(2) : 0;

        return {
            global: {
                keys: globalStats.keys,
                hits: this.stats.globalHits,
                misses: this.stats.globalMisses,
                hitRate: this.stats.globalHits + this.stats.globalMisses > 0 
                    ? ((this.stats.globalHits / (this.stats.globalHits + this.stats.globalMisses)) * 100).toFixed(2) 
                    : 0
            },
            user: {
                keys: userStats.keys,
                hits: this.stats.userHits,
                misses: this.stats.userMisses,
                hitRate: this.stats.userHits + this.stats.userMisses > 0 
                    ? ((this.stats.userHits / (this.stats.userHits + this.stats.userMisses)) * 100).toFixed(2) 
                    : 0
            },
            combined: {
                totalHits,
                totalMisses,
                totalRequests,
                hitRate: `${hitRate}%`
            },
            uptime: Math.floor((Date.now() - this.stats.lastReset) / 1000)
        };
    }

    
    resetStats() {
        this.stats = {
            globalHits: 0,
            globalMisses: 0,
            userHits: 0,
            userMisses: 0,
            lastReset: Date.now()
        };
    }

 
    isStaleGlobal(key, thresholdMs = CONFIG.STALE_THRESHOLD_MS) {
        const cached = this.globalCache.get(key);
        if (!cached?.cachedAt) return false;
        return Date.now() - cached.cachedAt > thresholdMs;
    }

    isStaleUser(userId, key, thresholdMs = CONFIG.STALE_THRESHOLD_MS) {
        const userKey = `user_${userId}_${key}`;
        const cached = this.userCache.get(userKey);
        if (!cached?.cachedAt) return false;
        return Date.now() - cached.cachedAt > thresholdMs;
    }

    isStale(key, thresholdMs = CONFIG.STALE_THRESHOLD_MS) {
        return this.isStaleGlobal(key, thresholdMs);
    }

    
    async getOrSetGlobal(key, fetchFn, ttl = 60) {
        const cached = this.getGlobal(key);
        if (cached.hit) {
            return cached.data;
        }

        const data = await fetchFn();
        this.setGlobal(key, data, ttl);
        return data;
    }

    async getOrSetUser(userId, key, fetchFn, ttl = 300) {
        const cached = this.getUser(userId, key);
        if (cached.hit) {
            return cached.data;
        }

        const data = await fetchFn();
        this.setUser(userId, key, data, ttl);
        return data;
    }

  
    invalidatePattern(pattern, cacheType = 'global') {
        const cache = cacheType === 'global' ? this.globalCache : this.userCache;
        const keys = cache.keys().filter(key => key.includes(pattern));
        cache.del(keys);
        console.log(`Invalidated ${keys.length} keys matching pattern: ${pattern}`);
        return keys.length;
    }

   
    async warmUp(dataFetchers = {}) {
        console.log('Warming up cache...');
        const results = {};

        for (const [key, fetchFn] of Object.entries(dataFetchers)) {
            try {
                const data = await fetchFn();
                this.setGlobal(key, data);
                results[key] = 'success';
                console.log(`Warmed up: ${key}`);
            } catch (err) {
                results[key] = 'failed';
                console.error(`Failed to warm up ${key}:`, err.message);
            }
        }

        return results;
    }

   
    getMemoryUsage() {
        const globalKeys = this.globalCache.keys().length;
        const userKeys = this.userCache.keys().length;
        
       
        const estimatedMB = ((globalKeys + userKeys) * 1) / 1024;

        return {
            globalKeys,
            userKeys,
            totalKeys: globalKeys + userKeys,
            estimatedMB: estimatedMB.toFixed(2)
        };
    }
}

export default new CacheService();