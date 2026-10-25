const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { config } = require('./config');

puppeteer.use(StealthPlugin());

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const humanDelay = (min = 400, max = 1200) => sleep(min + Math.random() * (max - min));

// ---------- Cleaning helpers (pure, unit-tested) ----------

function cleanText(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[-]/g, '').replace(/\s+/g, ' ').trim();
}

function parseRating(value) {
  const match = cleanText(value).replace(',', '.').match(/\d+(\.\d+)?/);
  return match ? parseFloat(match[0]) : null;
}

function parseReviewCount(value) {
  const text = cleanText(value);
  if (!text) return null;
  // Handles "(1,234)", "1.234 reviews", "1 234", "1.2K"
  const k = text.match(/(\d+(?:[.,]\d+)?)\s*[kK]/);
  if (k) return Math.round(parseFloat(k[1].replace(',', '.')) * 1000);
  const digits = text.replace(/[^\d]/g, '');
  return digits ? parseInt(digits, 10) : null;
}

function cleanPhone(value) {
  let text = cleanText(value).replace(/^tel:/i, '');
  if (!text) return '';
  const hasPlus = text.startsWith('+') || text.startsWith('00');
  let digits = text.replace(/\D/g, '');
  if (text.startsWith('00')) digits = digits.slice(2);
  if (digits.length < 6) return '';
  return hasPlus ? `+${digits}` : digits;
}

function cleanWebsite(value) {
  let url = cleanText(value);
  if (!url) return '';
  try {
    let parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    // Google sometimes wraps outbound links in a redirect: /url?q=<real-url>
    if (/google\./.test(parsed.hostname) && parsed.searchParams.get('q')) {
      parsed = new URL(parsed.searchParams.get('q'));
    }
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].forEach((p) =>
      parsed.searchParams.delete(p)
    );
    let out = parsed.toString();
    if (out.endsWith('/') && parsed.pathname === '/' && !parsed.search) out = out.slice(0, -1);
    return out;
  } catch {
    return '';
  }
}

function cleanMapsUrl(value) {
  // The /place/<name>/data=... path is enough to open the listing; drop tracking params.
  return cleanText(value).split('?')[0];
}

// ---------- Browser helpers ----------

async function acceptConsent(page) {
  // EU/Morocco visitors are often redirected to consent.google.com first.
  if (!page.url().includes('consent.')) return;
  const clicked = await page.evaluate(() => {
    const labels = ['accept all', 'reject all', 'tout accepter', 'tout refuser', 'alle akzeptieren'];
    const buttons = [...document.querySelectorAll('button, input[type="submit"]')];
    const btn = buttons.find((b) => labels.includes((b.innerText || b.value || '').trim().toLowerCase()));
    if (btn) {
      btn.click();
      return true;
    }
    return false;
  });
  if (clicked) await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
}

async function newStealthPage(browser) {
  const page = await browser.newPage();
  await page.setUserAgent(USER_AGENT);
  await page.setViewport({ width: 1280, height: 800 });
  await page.setExtraHTTPHeaders({ 'Accept-Language': `${config.language},en;q=0.9` });
  // Skip heavy assets on detail pages to speed things up.
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const type = req.resourceType();
    if (type === 'image' || type === 'media' || type === 'font') req.abort();
    else req.continue();
  });
  return page;
}

/**
 * Scrolls the results feed until `maxResults` cards are loaded or the list ends.
 * Returns basic info for each card (name, rating, reviews, Maps URL).
 */
async function collectResultCards(page, maxResults) {
  const feedSelector = 'div[role="feed"]';
  const hasFeed = await page.waitForSelector(feedSelector, { timeout: 20000 }).then(() => true).catch(() => false);

  if (!hasFeed) {
    // Google jumps straight to a place page when the query matches a single business.
    const isPlace = await page.$('h1');
    return isPlace ? [{ googleMapsUrl: page.url() }] : [];
  }

  let lastCount = 0;
  let stagnantRounds = 0;

  while (true) {
    const { count, reachedEnd } = await page.evaluate((sel) => {
      const feed = document.querySelector(sel);
      feed.scrollBy(0, feed.scrollHeight);
      const endText = feed.innerText.toLowerCase();
      return {
        count: feed.querySelectorAll('a.hfpxzc').length,
        reachedEnd:
          !!feed.querySelector('span.HlvSq') ||
          endText.includes("you've reached the end of the list") ||
          endText.includes('vous êtes arrivé à la fin de la liste'),
      };
    }, feedSelector);

    if (count >= maxResults || reachedEnd) break;
    stagnantRounds = count === lastCount ? stagnantRounds + 1 : 0;
    if (stagnantRounds >= 6) break; // nothing new after several scrolls
    lastCount = count;
    await humanDelay(1200, 2200);
  }

  const cards = await page.evaluate(() =>
    [...document.querySelectorAll('div[role="feed"] a.hfpxzc')].map((a) => {
      const card = a.closest('div.Nv2PK') || a.parentElement;
      return {
        name: a.getAttribute('aria-label') || '',
        googleMapsUrl: a.href,
        rating: card?.querySelector('span.MW4etd')?.textContent || '',
        reviewCount: card?.querySelector('span.UY7F9')?.textContent || '',
      };
    })
  );

  // De-duplicate by URL (sponsored results can repeat).
  const seen = new Set();
  return cards.filter((c) => (seen.has(c.googleMapsUrl) ? false : seen.add(c.googleMapsUrl))).slice(0, maxResults);
}

/** Opens a place page and extracts all lead fields. */
async function extractPlaceDetails(browser, card) {
  const page = await newStealthPage(browser);
  try {
    await page.goto(card.googleMapsUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await acceptConsent(page);
    await page.waitForSelector('h1', { timeout: 20000 });
    // Contact buttons render shortly after the heading.
    await page.waitForSelector('button[data-item-id="address"], button[data-item-id^="phone"]', { timeout: 6000 }).catch(() => {});

    const raw = await page.evaluate(() => {
      const text = (el) => (el ? el.innerText || el.textContent || '' : '');
      const attr = (sel, name) => document.querySelector(sel)?.getAttribute(name) || '';
      const ratingBox = document.querySelector('div.F7nice');
      const reviewEl =
        ratingBox?.querySelector('span[aria-label*="review" i]') ||
        ratingBox?.querySelector('span[aria-label*="avis" i]') ||
        ratingBox?.querySelectorAll('span')[ratingBox.querySelectorAll('span').length - 1];
      const phoneId = attr('button[data-item-id^="phone:tel:"]', 'data-item-id');

      return {
        name: text(document.querySelector('h1.DUwDvf') || document.querySelector('h1')),
        rating: text(ratingBox?.querySelector('span[aria-hidden="true"]')),
        reviewCount: reviewEl ? reviewEl.getAttribute('aria-label') || text(reviewEl) : '',
        category: text(document.querySelector('button.DkEaL')),
        address:
          text(document.querySelector('button[data-item-id="address"] .Io6YTe')) ||
          attr('button[data-item-id="address"]', 'aria-label').replace(/^[^:]+:\s*/, ''),
        phone:
          phoneId.replace('phone:tel:', '') ||
          text(document.querySelector('button[data-item-id^="phone"] .Io6YTe')),
        websiteUrl: attr('a[data-item-id="authority"]', 'href'),
      };
    });

    return {
      name: cleanText(raw.name || card.name),
      rating: parseRating(raw.rating || card.rating),
      reviewCount: parseReviewCount(raw.reviewCount || card.reviewCount) ?? 0,
      category: cleanText(raw.category),
      address: cleanText(raw.address),
      phone: cleanPhone(raw.phone),
      websiteUrl: cleanWebsite(raw.websiteUrl),
      googleMapsUrl: cleanMapsUrl(card.googleMapsUrl || page.url()),
    };
  } catch (err) {
    console.warn(`  ! Failed to read details for "${card.name || card.googleMapsUrl}": ${err.message}`);
    // Keep whatever the list card gave us rather than losing the lead.
    return {
      name: cleanText(card.name),
      rating: parseRating(card.rating),
      reviewCount: parseReviewCount(card.reviewCount) ?? 0,
      category: '',
      address: '',
      phone: '',
      websiteUrl: '',
      googleMapsUrl: cleanMapsUrl(card.googleMapsUrl),
    };
  } finally {
    await page.close().catch(() => {});
  }
}

/** Runs `worker` over `items` with at most `limit` running at once. */
async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i], i);
      await humanDelay(300, 900);
    }
  });
  await Promise.all(runners);
  return results;
}

/**
 * Searches Google Maps and returns an array of business leads.
 * @param {string} query e.g. "plumbers in miami"
 * @param {number} maxResults how many businesses to collect
 * @param {object} [options] { headless, concurrency, onProgress }
 */
async function scrapeGoogleMaps(query, maxResults = config.maxResults, options = {}) {
  if (!query || !query.trim()) throw new Error('A search query is required.');
  const headless = options.headless ?? config.headless;
  const concurrency = options.concurrency ?? config.concurrency;
  const onProgress = options.onProgress || (() => {});

  const browser = await puppeteer.launch({
    headless,
    args: ['--no-sandbox', '--disable-setuid-sandbox', `--lang=${config.language}`, '--window-size=1280,800'],
  });

  try {
    const page = await newStealthPage(browser);
    const url = `https://www.google.com/maps/search/${encodeURIComponent(query.trim())}?hl=${config.language}`;
    onProgress(`Opening ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await acceptConsent(page);

    const cards = await collectResultCards(page, maxResults);
    onProgress(`Found ${cards.length} result(s) in the list. Reading details...`);
    await page.close();

    let done = 0;
    const leads = await mapWithConcurrency(cards, concurrency, async (card) => {
      const lead = await extractPlaceDetails(browser, card);
      done += 1;
      onProgress(`  [${done}/${cards.length}] ${lead.name || '(unnamed)'}`);
      return lead;
    });

    return leads.filter((l) => l && l.name);
  } finally {
    await browser.close();
  }
}

module.exports = {
  scrapeGoogleMaps,
  cleanText,
  parseRating,
  parseReviewCount,
  cleanPhone,
  cleanWebsite,
};
