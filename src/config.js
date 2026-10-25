const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const toInt = (value, fallback) => {
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const toFloat = (value, fallback) => {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
};

const toBool = (value, fallback) => {
  if (value === undefined || value === '') return fallback;
  return ['true', '1', 'yes', 'on'].includes(String(value).toLowerCase());
};

const config = {
  defaultQuery: process.env.DEFAULT_SEARCH_QUERY || 'dental clinics in casablanca',
  maxResults: toInt(process.env.MAX_RESULTS, 20),
  headless: toBool(process.env.HEADLESS, true),
  concurrency: toInt(process.env.CONCURRENCY, 3),
  language: process.env.LANGUAGE || 'en',
  outputFile: process.env.OUTPUT_FILE || 'data/leads.csv',
  filters: {
    minRating: toFloat(process.env.MIN_RATING, 0),
    minReviews: toInt(process.env.MIN_REVIEWS, 0),
    requirePhone: toBool(process.env.REQUIRE_PHONE, false),
    requireWebsite: toBool(process.env.REQUIRE_WEBSITE, false),
  },
};

module.exports = { config, toInt, toFloat, toBool };
