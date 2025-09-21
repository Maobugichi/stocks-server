// @ts-nocheck
import { Router } from "express";
import winkSentiment from "wink-sentiment";

const sentimentRouter = Router();

const financeWeights = {
  
  surge: 3, soar: 3, skyrocket: 3, breakout: 3, boom: 4,
  bullish: 3, moon: 4, rocket: 3, explosive: 3,
  
 
  rally: 2, beats: 2, growth: 2, outperform: 2, gains: 2,
  strong: 1, up: 1, rise: 1, climb: 1, advance: 1,
  profit: 2, earnings: 1, revenue: 1, buy: 1, bullish: 2,
  momentum: 1, uptrend: 2, recovery: 2, rebound: 2,
  

  drop: -2, plunge: -2, loss: -2, miss: -2, fall: -2,
  weak: -1, decline: -1, sell: -1, bearish: -2, crash: -3,
 
  collapse: -4, plummet: -4, tank: -3, dump: -3, crater: -4,
  bloodbath: -4, massacre: -3, disaster: -3,
  
  // Market conditions
  volatile: -1, uncertainty: -1, risk: -1, bubble: -2,
  overbought: -1, oversold: 1, correction: -1,
  
  // Company fundamentals
  dividend: 1, buyback: 1, merger: 1, acquisition: 1,
  bankruptcy: -4, layoffs: -2, lawsuit: -2, scandal: -3,
  
  // Technical analysis
  support: 1, resistance: -1, breakout: 2, breakdown: -2,
  golden_cross: 2, death_cross: -2, dip: -1, squeeze: 2
};

// Negation handling
const negations = ['not', 'no', 'never', 'nothing', 'nowhere', 'neither', 'nobody', 'none'];

// Intensity modifiers
const intensifiers = {
  very: 1.5, extremely: 2, highly: 1.3, really: 1.2,
  absolutely: 1.8, completely: 1.7, totally: 1.6,
  slightly: 0.7, somewhat: 0.8, a_bit: 0.6
};

// Market context multipliers
const marketContexts = {
  // Bull market conditions
  bull_market: 1.2, recovery: 1.1, expansion: 1.1,
  // Bear market conditions  
  bear_market: 0.8, recession: 0.7, crash: 0.6,
  // Neutral
  sideways: 1.0, consolidation: 1.0
};

function getSentimentLabel(normalizedScore) {
  if (normalizedScore >= 2) return { label: "Very Bullish", strength: Math.min(100, Math.abs(normalizedScore) * 20) };
  if (normalizedScore >= 0.5) return { label: "Bullish", strength: Math.min(100, Math.abs(normalizedScore) * 25) };
  if (normalizedScore >= -0.5) return { label: "Neutral", strength: Math.min(100, Math.abs(normalizedScore) * 30) };
  if (normalizedScore >= -2) return { label: "Bearish", strength: Math.min(100, Math.abs(normalizedScore) * 25) };
  return { label: "Very Bearish", strength: Math.min(100, Math.abs(normalizedScore) * 20) };
}

function handleNegation(tokens) {
  const processedTokens = [...tokens];
  
  for (let i = 0; i < processedTokens.length - 1; i++) {
    const currentWord = processedTokens[i].value.toLowerCase();
    
    if (negations.includes(currentWord)) {
      // Flip the sentiment of the next 1-3 words
      for (let j = i + 1; j < Math.min(i + 4, processedTokens.length); j++) {
        if (processedTokens[j].score) {
          processedTokens[j].score *= -1;
        }
        const word = processedTokens[j].value.toLowerCase();
        if (financeWeights[word]) {
          financeWeights[word] *= -1;
        }
      }
    }
  }
  
  return processedTokens;
}

function applyIntensifiers(tokens) {
  for (let i = 0; i < tokens.length - 1; i++) {
    const currentWord = tokens[i].value.toLowerCase();
    
    if (intensifiers[currentWord]) {
      const multiplier = intensifiers[currentWord];
      // Apply to next word
      if (i + 1 < tokens.length && tokens[i + 1].score) {
        tokens[i + 1].score *= multiplier;
      }
    }
  }
  
  return tokens;
}

sentimentRouter.post("/analyze-sentiment", async (req, res) => {
  try {
    const { text, marketContext = 'neutral', timeWeight = 1.0 } = req.body;
    const result = winkSentiment(text);
    
    // Handle negations and intensifiers
    let processedTokens = handleNegation(result.tokenizedPhrase);
    processedTokens = applyIntensifiers(processedTokens);
    
    const positiveWords = processedTokens
      .filter((t) => t.score && t.score > 0)
      .map((t) => t.value);

    const negativeWords = processedTokens
      .filter((t) => t.score && t.score < 0)
      .map((t) => t.value);

    // Calculate weighted score with enhanced logic
    let weightedScore = processedTokens.reduce((sum, token) => {
      return sum + (token.score || 0);
    }, 0);

    // Apply financial domain weights
    processedTokens.forEach((token) => {
      const word = token.value.toLowerCase();
      if (financeWeights[word]) {
        weightedScore += financeWeights[word];
      }
    });

    // Apply market context
    const contextMultiplier = marketContexts[marketContext] || 1.0;
    weightedScore *= contextMultiplier;

    // Apply time decay (more recent = higher weight)
    weightedScore *= timeWeight;

    const posCount = positiveWords.length;
    const negCount = negativeWords.length;
    const totalWords = processedTokens.length;

    // Enhanced scoring with word count balance
    const balanceScore = (posCount - negCount) * 0.5;
    const finalScore = weightedScore + balanceScore;

    // Improved normalization using tanh for better distribution
    const finalNormalizedScore = Math.tanh(finalScore / Math.sqrt(totalWords)) * 5;
    
    const sentiment = getSentimentLabel(finalNormalizedScore);
    
    // Calculate confidence based on word count and score consistency
    const confidence = Math.min(100, 
      (Math.abs(finalNormalizedScore) * 20) + 
      Math.min(50, totalWords * 2)
    );

    res.json({
      score: finalScore,
      normalizedScore: finalNormalizedScore,
      sentiment: sentiment.label,
      strength: sentiment.strength,
      confidence: Math.round(confidence),
      positive: positiveWords,
      negative: negativeWords,
      wordCount: totalWords,
      marketContext,
      timeWeight,
      breakdown: {
        baseScore: result.score,
        financeAdjustment: weightedScore - result.score,
        contextMultiplier,
        balanceScore
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Sentiment analysis failed" });
  }
});

export default sentimentRouter;