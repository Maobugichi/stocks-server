import { CONFIG } from "../configs/yahoo-finance.config.js";

export const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export function withTimeout(promise, timeoutMs, errorMsg = 'Operation timed out') {
  return Promise.race([
    promise,
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error(errorMsg)), timeoutMs)
    )
  ]);
}

export async function fetchWithRetry(fetchFn, options = {}) {
  const {
    maxRetries = CONFIG.RETRY.MAX_ATTEMPTS,
    timeoutMs = CONFIG.RETRY.TIMEOUT_MS,
    context = 'unknown',
  } = options;

  let lastError;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const result = await Promise.race([
        fetchFn(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Request timeout')), timeoutMs)
        )
      ]);
      
      if (attempt > 0) await delay(CONFIG.RATE_LIMIT.DELAY_MS);
      
      return result;
    } catch (err) {
      lastError = err;
      const is429 = err.message?.includes('429') || err.message?.includes('Too Many Requests');
      const isTimeout = err.message?.includes('timeout');
      const isLastAttempt = attempt === maxRetries - 1;
      
      if ((is429 || isTimeout) && !isLastAttempt) {
        const backoffDelay = Math.min(
          CONFIG.RETRY.BASE_BACKOFF_MS * Math.pow(2, attempt),
          5000
        );
        console.log(`[${context}] ${isTimeout ? 'Timeout' : 'Rate limited'}. Retry ${attempt + 1}/${maxRetries} in ${backoffDelay}ms`);
        await delay(backoffDelay);
      } else {
        console.error(`❌ [${context}] Failed after ${attempt + 1} attempts:`, err.message);
        break;
      }
    }
  }
  
  throw lastError;
}