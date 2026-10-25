# gmaps-lead-scraper

Turn any Google Maps search, like *"plumbers in Miami"* or *"dental clinics in Casablanca"*, into a clean, filtered B2B lead list in CSV and JSON.

Sales teams and agencies spend hours copying business names, phone numbers and websites from Google Maps into spreadsheets. Bought lead lists are often stale. This tool gets fresh data in seconds, straight from live Google Maps listings.

## What you get

For each business:

| Field | Example |
|---|---|
| Name | DENTAL CLINIC |
| Rating | 4.9 |
| Review Count | 47 |
| Category | Dentist |
| Address | 394 rue Brahim Nakhai Maarif, Casablanca 20100 |
| Phone | 0522254020 / +13054400878 |
| Website | https://www.dentalclinic.ma |
| Has Website | yes / no |
| Google Maps URL | https://www.google.com/maps/place/... |

## Features

- **Stealth browsing**: `puppeteer-extra` with the stealth plugin, a real desktop user agent, a 1280x800 viewport and randomized human-like delays.
- **Auto-scroll**: scrolls the results list until it has `MAX_RESULTS` businesses or reaches the end of the list.
- **Full detail extraction**: opens each listing (3 in parallel by default) to read the phone, website, address and category.
- **Data cleaning**: normalizes phone numbers, unwraps Google redirect links, strips UTM tags and removes tracking parameters from Maps URLs.
- **Lead filters**: minimum rating, minimum reviews, phone required, website required, or *no website* (useful for web agencies prospecting businesses without a site).
- **Deduplication** of repeated or sponsored results.
- **Cookie consent handling** for EU and Moroccan visitors who get redirected to Google's consent page.
- **Excel-friendly CSV** (UTF-8 with BOM, so accented characters display correctly), plus a JSON copy of the same data.

## Setup

Requires Node.js 18 or newer.

```bash
npm install
cp .env.example .env   # then edit if you like
```

If Chrome didn't download during install, run `npx puppeteer browsers install chrome`.

## Usage

```bash
# Uses DEFAULT_SEARCH_QUERY and MAX_RESULTS from .env
npm start

# Custom query
npm start -- "plumbers in miami" --max 50

# Only well-rated businesses that have a phone number
npm start -- "dental clinics in casablanca" --min-rating 4.5 --require-phone

# Businesses with no website (prospects for a web design agency)
npm start -- "restaurants in marrakech" --no-website --out data/no-website.csv

# Watch the browser work
npm start -- "gyms in rabat" --show-browser
```

| Option | Description |
|---|---|
| `-m, --max <n>` | Maximum businesses to collect |
| `-o, --out <file>` | CSV output path (a `.json` file is written next to it) |
| `--min-rating <n>` | Drop businesses rated below `n` |
| `--min-reviews <n>` | Drop businesses with fewer than `n` reviews |
| `--require-phone` | Keep only businesses with a phone number |
| `--require-website` | Keep only businesses with a website |
| `--no-website` | Keep only businesses without a website |
| `--show-browser` | Run Chrome visibly instead of headless |

### `.env` settings

| Variable | Default | Description |
|---|---|---|
| `DEFAULT_SEARCH_QUERY` | `dental clinics in casablanca` | Query used when none is passed |
| `MAX_RESULTS` | `20` | Businesses to collect |
| `HEADLESS` | `true` | Set to `false` to see the browser |
| `CONCURRENCY` | `3` | Listings read in parallel |
| `MIN_RATING` / `MIN_REVIEWS` | `0` | Default filters |
| `REQUIRE_PHONE` / `REQUIRE_WEBSITE` | `false` | Default filters |
| `LANGUAGE` | `en` | Google Maps interface language |
| `OUTPUT_FILE` | `data/leads.csv` | Output path |

### Use it from code

```js
const { scrapeGoogleMaps } = require('./src/scraper');
const { exportLeads, filterLeads } = require('./src/exporter');

const leads = await scrapeGoogleMaps('plumbers in miami', 30);
exportLeads(filterLeads(leads, { minRating: 4 }), 'data/miami.csv');
```

## Tests

```bash
npm test
```

The tests cover the data cleaning, filtering, deduplication and CSV output.

## Project structure

```
gmaps-lead-scraper/
├── data/leads.csv         # Sample output (other generated files are git-ignored)
├── src/
│   ├── config.js          # .env loader and defaults
│   ├── scraper.js         # Stealth Puppeteer Google Maps extractor and cleaners
│   ├── exporter.js        # Filters, dedupe, CSV and JSON export
│   └── index.js           # CLI entry point
├── test/                  # Unit tests (node:test)
├── .claude/skills/gmaps-lead-scraper/instructions.md
├── .env.example
└── package.json
```

## Notes

- Some businesses (often service-area businesses like plumbers) don't show an address on Google Maps, so that column stays empty for them.
- Google changes its page layout from time to time. If fields start coming back empty, update the selectors in `src/scraper.js`.
- Scrape responsibly: keep volumes reasonable, respect Google's Terms of Service and local data-protection laws (GDPR, Morocco's Law 09-08) when contacting leads.
