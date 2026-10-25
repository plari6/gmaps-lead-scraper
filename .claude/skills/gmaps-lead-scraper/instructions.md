---
name: gmaps-lead-scraper
description: Generate fresh B2B lead lists from Google Maps searches (e.g. "plumbers in Miami") with this project's stealth Puppeteer scraper, then filter and export them to CSV/JSON. Use when the user wants local business leads, prospect lists, or Google Maps data.
---

# Google Maps Lead Scraper

## What it does
Runs a Google Maps search, scrolls the results list, opens each business listing and extracts:
`name, rating, reviewCount, category, address, phone, websiteUrl, googleMapsUrl`.
Results are cleaned, deduplicated, filtered and saved as CSV (Excel-friendly) plus JSON.

## How to run it
From the project root:

```bash
npm start -- "<business type> in <city>" [options]
```

| Option | Effect |
|---|---|
| `--max <n>` | Number of businesses to collect (default from `MAX_RESULTS`) |
| `--out <file>` | CSV path; a `.json` file is written alongside |
| `--min-rating <n>` | Drop low-rated businesses |
| `--min-reviews <n>` | Drop businesses with few reviews (often inactive or unverified) |
| `--require-phone` / `--require-website` | Keep only reachable businesses |
| `--no-website` | Keep only businesses without a website (web agency prospects) |
| `--show-browser` | Run Chrome visibly, for debugging |

With no query, it uses `DEFAULT_SEARCH_QUERY` from `.env`.

## Picking options for the user's goal
- **Cold calling**: `--require-phone --min-reviews 5`
- **Premium or high-quality prospects**: `--min-rating 4.5 --min-reviews 50`
- **Selling websites or SEO**: `--no-website`
- **Email or web outreach**: `--require-website` (then crawl the sites for contact emails)
- Name the output file after the search, e.g. `--out data/miami-plumbers.csv`.

## Stealth features
- `puppeteer-extra-plugin-stealth` hides headless and automation fingerprints.
- Real Chrome desktop user agent, 1280x800 viewport and `Accept-Language` header.
- Randomized human-like delays between scrolls and page visits.
- Handles the Google cookie consent page automatically.
- Blocks images, fonts and media on listing pages to stay fast and light.

## Code entry points
- `src/scraper.js` → `scrapeGoogleMaps(query, maxResults, { headless, concurrency, onProgress })`
- `src/exporter.js` → `filterLeads`, `dedupeLeads`, `exportLeads(leads, outputFile)`
- `src/config.js` → `.env` settings

## Troubleshooting
- **0 results**: run with `--show-browser` to check for a CAPTCHA or consent page; lower `CONCURRENCY`; wait before retrying.
- **Empty phone or website for every row**: Google changed its markup. Check the selectors in `extractPlaceDetails` (`button[data-item-id^="phone:tel:"]`, `a[data-item-id="authority"]`, `button[data-item-id="address"]`).
- **Empty address for some rows**: normal for service-area businesses that hide their address.
- Run `npm test` after changing any cleaning logic.

## Business value
Replaces hours of manual copy-pasting from Google Maps with a fresh, targeted lead list in under a minute: about 20 businesses in roughly 25 seconds, 30 in roughly 35 seconds.
