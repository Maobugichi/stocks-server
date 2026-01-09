// test-sparkline.js
// Run this to debug your Finnhub sparkline issue

import axios from 'axios';
import 'dotenv/config';

const FINNHUB_API_KEY = process.env.FINN_KEY;
const BASE_URL = 'https://finnhub.io/api/v1';

async function testSparkline() {
  console.log('🔍 Testing Finnhub Sparkline Data\n');
  console.log('=================================\n');

  // Check API key
  if (!FINNHUB_API_KEY) {
    console.error('❌ FINNHUB_API_KEY not found in environment variables!');
    console.log('Add it to your .env file: FINNHUB_API_KEY=your_key_here');
    process.exit(1);
  }

  console.log('✅ API Key found:', FINNHUB_API_KEY.substring(0, 10) + '...\n');

  const symbol = 'AAPL';
  const to = Math.floor(Date.now() / 1000);
  const from = to - (7 * 24 * 60 * 60); // 7 days ago

  console.log(`📊 Testing symbol: ${symbol}`);
  console.log(`   From: ${new Date(from * 1000).toISOString()}`);
  console.log(`   To:   ${new Date(to * 1000).toISOString()}`);
  console.log(`   Resolution: D (daily)\n`);

  try {
    const url = `${BASE_URL}/stock/candle`;
    const params = {
      symbol,
      resolution: 'D',
      from,
      to,
      token: FINNHUB_API_KEY
    };

    console.log('🌐 Making request to:', url);
    console.log('   Params:', { ...params, token: params.token.substring(0, 10) + '...' });
    console.log('');

    const response = await axios.get(url, { params });
    const data = response.data;

    console.log('📦 Response received:\n');
    console.log(JSON.stringify(data, null, 2));
    console.log('');

    // Analyze response
    if (data.s === 'no_data') {
      console.log('❌ Status: no_data');
      console.log('\nPossible reasons:');
      console.log('1. Symbol not found or not supported by Finnhub');
      console.log('2. No trading data for the specified date range');
      console.log('3. Market was closed during this period');
      console.log('4. Invalid API key or permissions');
      
    } else if (data.s === 'ok') {
      console.log('✅ Status: ok');
      console.log(`   Data points: ${data.t?.length || 0}`);
      
      if (data.t && data.t.length > 0) {
        console.log(`   First timestamp: ${new Date(data.t[0] * 1000).toLocaleDateString()}`);
        console.log(`   Last timestamp:  ${new Date(data.t[data.t.length - 1] * 1000).toLocaleDateString()}`);
        console.log(`   First close: $${data.c[0]}`);
        console.log(`   Last close:  $${data.c[data.c.length - 1]}`);
        
        console.log('\n📈 Sample data:');
        for (let i = 0; i < Math.min(3, data.t.length); i++) {
          console.log(`   ${new Date(data.t[i] * 1000).toLocaleDateString()}: $${data.c[i]}`);
        }
      }
    } else {
      console.log(`⚠️ Unexpected status: ${data.s}`);
    }

    // Test with different symbols
    console.log('\n\n🔄 Testing additional symbols...\n');
    const testSymbols = ['GOOGL', 'MSFT', 'TSLA', 'INVALID_SYMBOL'];
    
    for (const testSymbol of testSymbols) {
      try {
        const testResponse = await axios.get(url, {
          params: { ...params, symbol: testSymbol }
        });
        
        const status = testResponse.data.s;
        const count = testResponse.data.t?.length || 0;
        
        if (status === 'ok') {
          console.log(`✅ ${testSymbol.padEnd(15)} ${status.padEnd(10)} ${count} data points`);
        } else {
          console.log(`❌ ${testSymbol.padEnd(15)} ${status.padEnd(10)}`);
        }
        
        // Respect rate limits
        await new Promise(resolve => setTimeout(resolve, 1100));
        
      } catch (err) {
        console.log(`❌ ${testSymbol.padEnd(15)} ERROR: ${err.message}`);
      }
    }

    // Test API key validity with quote endpoint
    console.log('\n\n🔑 Testing API key with quote endpoint...\n');
    try {
      const quoteResponse = await axios.get(`${BASE_URL}/quote`, {
        params: { symbol: 'AAPL', token: FINNHUB_API_KEY }
      });
      
      console.log('✅ Quote endpoint works!');
      console.log('   Current price:', quoteResponse.data.c);
      console.log('   Change %:', quoteResponse.data.dp);
    } catch (err) {
      console.log('❌ Quote endpoint failed:', err.message);
      if (err.response?.status === 401) {
        console.log('\n⚠️ Your API key appears to be invalid!');
        console.log('   Get a new key at: https://finnhub.io/dashboard');
      }
    }

  } catch (error) {
    console.error('\n❌ Error occurred:\n');
    console.error('Message:', error.message);
    
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
      
      if (error.response.status === 401) {
        console.log('\n⚠️ Authentication failed! Check your API key.');
      } else if (error.response.status === 429) {
        console.log('\n⚠️ Rate limit exceeded! Wait a minute and try again.');
      }
    }
    
    process.exit(1);
  }
}

// Run the test
testSparkline().then(() => {
  console.log('\n\n✅ Test complete!\n');
}).catch((err) => {
  console.error('\n❌ Test failed:', err.message);
  process.exit(1);
});