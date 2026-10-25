const fs = require('fs');
const path = require('path');
const { Parser } = require('json2csv');

const FIELDS = [
  { label: 'Name', value: 'name' },
  { label: 'Rating', value: 'rating' },
  { label: 'Review Count', value: 'reviewCount' },
  { label: 'Category', value: 'category' },
  { label: 'Address', value: 'address' },
  { label: 'Phone', value: 'phone' },
  { label: 'Website', value: 'websiteUrl' },
  { label: 'Has Website', value: (row) => (row.websiteUrl ? 'yes' : 'no') },
  { label: 'Google Maps URL', value: 'googleMapsUrl' },
];

/** Removes duplicates (same Maps URL, or same name + phone). */
function dedupeLeads(leads) {
  const seen = new Set();
  return leads.filter((lead) => {
    const keys = [lead.googleMapsUrl, `${lead.name}|${lead.phone}`.toLowerCase()].filter(Boolean);
    if (keys.some((k) => seen.has(k))) return false;
    keys.forEach((k) => seen.add(k));
    return true;
  });
}

/** Drops low-rated or incomplete businesses based on the filter settings. */
function filterLeads(leads, filters = {}) {
  const { minRating = 0, minReviews = 0, requirePhone = false, requireWebsite = false } = filters;
  return leads.filter((lead) => {
    if (minRating > 0 && (lead.rating ?? 0) < minRating) return false;
    if (minReviews > 0 && (lead.reviewCount ?? 0) < minReviews) return false;
    if (requirePhone && !lead.phone) return false;
    if (requireWebsite && !lead.websiteUrl) return false;
    return true;
  });
}

function toCsv(leads) {
  const parser = new Parser({ fields: FIELDS, withBOM: true }); // BOM so Excel shows accents correctly
  return parser.parse(leads.map((l) => ({ ...l, rating: l.rating ?? '' })));
}

/**
 * Writes leads to CSV (and a matching .json file next to it).
 * @returns {{ csvPath: string, jsonPath: string, count: number }}
 */
function exportLeads(leads, outputFile = 'data/leads.csv') {
  const csvPath = path.resolve(outputFile);
  const jsonPath = csvPath.replace(/\.csv$/i, '') + '.json';
  fs.mkdirSync(path.dirname(csvPath), { recursive: true });
  fs.writeFileSync(csvPath, toCsv(leads), 'utf8');
  fs.writeFileSync(jsonPath, JSON.stringify(leads, null, 2), 'utf8');
  return { csvPath, jsonPath, count: leads.length };
}

module.exports = { exportLeads, toCsv, filterLeads, dedupeLeads, FIELDS };
