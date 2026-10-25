const test = require('node:test');
const assert = require('node:assert');
const { parseRating, parseReviewCount, cleanPhone, cleanWebsite, cleanText } = require('../src/scraper');
const { filterLeads, dedupeLeads, toCsv } = require('../src/exporter');

test('parseRating handles dot and comma decimals', () => {
  assert.strictEqual(parseRating('4.7'), 4.7);
  assert.strictEqual(parseRating('4,5'), 4.5);
  assert.strictEqual(parseRating(''), null);
});

test('parseReviewCount handles common formats', () => {
  assert.strictEqual(parseReviewCount('(1,234)'), 1234);
  assert.strictEqual(parseReviewCount('449 reviews'), 449);
  assert.strictEqual(parseReviewCount('1.2K'), 1200);
  assert.strictEqual(parseReviewCount(''), null);
});

test('cleanPhone keeps digits and international prefix', () => {
  assert.strictEqual(cleanPhone('05 22-25 40 20'), '0522254020');
  assert.strictEqual(cleanPhone('+1 (305) 555-0199'), '+13055550199');
  assert.strictEqual(cleanPhone('00212 522 254020'), '+212522254020');
  assert.strictEqual(cleanPhone('tel:+212600000000'), '+212600000000');
  assert.strictEqual(cleanPhone('123'), '');
});

test('cleanWebsite unwraps Google redirects and strips UTM tags', () => {
  assert.strictEqual(
    cleanWebsite('https://www.google.com/url?q=https://example.com/&sa=U'),
    'https://example.com'
  );
  assert.strictEqual(
    cleanWebsite('https://shop.example.com/?utm_source=gmb&utm_medium=organic'),
    'https://shop.example.com'
  );
  assert.strictEqual(cleanWebsite('example.ma'), 'https://example.ma');
  assert.strictEqual(cleanWebsite(''), '');
});

test('cleanText removes icon glyphs and extra whitespace', () => {
  assert.strictEqual(cleanText('  12 Main   St \n'), '12 Main St');
});

const sample = [
  { name: 'A', rating: 4.8, reviewCount: 120, phone: '0522', websiteUrl: 'https://a.com', googleMapsUrl: 'u1' },
  { name: 'B', rating: 3.2, reviewCount: 5, phone: '', websiteUrl: '', googleMapsUrl: 'u2' },
  { name: 'A', rating: 4.8, reviewCount: 120, phone: '0522', websiteUrl: 'https://a.com', googleMapsUrl: 'u1' },
];

test('dedupeLeads removes repeated businesses', () => {
  assert.strictEqual(dedupeLeads(sample).length, 2);
});

test('filterLeads applies rating, review and contact filters', () => {
  assert.strictEqual(filterLeads(sample, { minRating: 4 }).length, 2);
  assert.strictEqual(filterLeads(sample, { minReviews: 10 }).length, 2);
  assert.strictEqual(filterLeads(sample, { requirePhone: true }).length, 2);
  assert.strictEqual(filterLeads(sample, { requireWebsite: true, minRating: 4 }).length, 2);
  assert.strictEqual(filterLeads(sample, {}).length, 3);
});

test('toCsv writes the expected header and rows', () => {
  const csv = toCsv(dedupeLeads(sample));
  const lines = csv.replace(/^﻿/, '').split('\n');
  assert.match(lines[0], /"Name","Rating","Review Count","Category","Address","Phone","Website","Has Website","Google Maps URL"/);
  assert.strictEqual(lines.length, 3);
  assert.match(lines[2], /"no"/);
});
