import axios from 'axios';

const finnhubClient = axios.create({
  baseURL: 'https://finnhub.io/api/v1',
  headers: {
    'X-Finnhub-Token': process.env.FINN_KEY,
  },
});

export default finnhubClient