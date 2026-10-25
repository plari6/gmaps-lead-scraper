#!/usr/bin/env node
const { config } = require('./config');
const { scrapeGoogleMaps } = require('./scraper');
const { exportLeads, filterLeads, dedupeLeads } = require('./exporter');

const HELP = `
Usage: node src/index.js [query] [options]

  query                   Search text, e.g. "plumbers in miami"
                          (defaults to DEFAULT_SEARCH_QUERY in .env)

Options:
  -m, --max <n>           Max businesses to collect      (default: ${config.maxResults})
  -o, --out <file>        CSV output path                (default: ${config.outputFile})
      --min-rating <n>    Drop businesses rated below n  (default: ${config.filters.minRating})
      --min-reviews <n>   Drop businesses with fewer reviews
      --require-phone     Keep only businesses with a phone number
      --require-website   Keep only businesses with a website
      --no-website        Keep only businesses WITHOUT a website (web agency prospects)
      --show-browser      Run Chrome visibly instead of headless
  -h, --help              Show this help

Examples:
  npm start -- "plumbers in miami" --max 50 --min-rating 4
  npm start -- "dental clinics in casablanca" --require-phone --out data/dentists.csv
`;

function parseArgs(argv) {
  const opts = { ...config.filters, max: config.maxResults, out: config.outputFile, headless: config.headless };
  const queryParts = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => argv[++i];
    switch (arg) {
      case '-h':
      case '--help':
        opts.help = true;
        break;
      case '-m':
      case '--max':
        opts.max = parseInt(next(), 10);
        break;
      case '-o':
      case '--out':
        opts.out = next();
        break;
      case '--min-rating':
        opts.minRating = parseFloat(next());
        break;
      case '--min-reviews':
        opts.minReviews = parseInt(next(), 10);
        break;
      case '--require-phone':
        opts.requirePhone = true;
        break;
      case '--require-website':
        opts.requireWebsite = true;
        break;
      case '--no-website':
        opts.noWebsite = true;
        break;
      case '--show-browser':
        opts.headless = false;
        break;
      default:
        if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`);
        queryParts.push(arg);
    }
  }
  opts.query = queryParts.join(' ').trim() || config.defaultQuery;
  if (!Number.isFinite(opts.max) || opts.max < 1) throw new Error('--max must be a positive number');
  return opts;
}

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`Error: ${err.message}\n${HELP}`);
    process.exit(1);
  }
  if (opts.help) {
    console.log(HELP);
    return;
  }

  console.log(`\nGoogle Maps Lead Scraper`);
  console.log(`  Query: "${opts.query}"  |  Max results: ${opts.max}\n`);
  const started = Date.now();

  const rawLeads = await scrapeGoogleMaps(opts.query, opts.max, {
    headless: opts.headless,
    onProgress: (msg) => console.log(msg),
  });

  let leads = filterLeads(dedupeLeads(rawLeads), opts);
  if (opts.noWebsite) leads = leads.filter((l) => !l.websiteUrl);

  const { csvPath, jsonPath, count } = exportLeads(leads, opts.out);
  const secs = ((Date.now() - started) / 1000).toFixed(1);

  console.log(`\nDone in ${secs}s`);
  console.log(`  Scraped: ${rawLeads.length}  |  After filters: ${count}`);
  console.log(`  With phone: ${leads.filter((l) => l.phone).length}  |  With website: ${leads.filter((l) => l.websiteUrl).length}`);
  console.log(`  CSV:  ${csvPath}`);
  console.log(`  JSON: ${jsonPath}\n`);
}

main().catch((err) => {
  console.error(`\nScrape failed: ${err.message}`);
  process.exit(1);
});
