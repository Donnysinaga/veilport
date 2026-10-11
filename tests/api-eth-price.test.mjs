import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

describe('ETH/USD Market Price Service Integration Suite', () => {
  const SERVER_URL = 'http://localhost:3000/api/prices/eth';

  test('retrieves live ETH/USD price from /api/prices/eth with correct schema', async () => {
    const res = await fetch(SERVER_URL);
    assert.equal(res.status, 200, 'Expected HTTP 200 from price endpoint');

    const cacheHeader = res.headers.get('cache-control');
    assert.ok(cacheHeader, 'Expected Cache-Control header to be present');
    assert.ok(cacheHeader.includes('s-maxage=60'), 'Expected 60s cache max-age');

    const data = await res.json();
    assert.equal(data.symbol, 'ETH', 'symbol should be ETH');
    assert.equal(data.currency, 'USD', 'currency should be USD');
    assert.equal(typeof data.price, 'number', 'price should be a number');
    assert.ok(data.price > 500 && data.price < 50000, `price ${data.price} is within reasonable ETH range`);
    assert.ok(data.source.toLowerCase().includes('coingecko'), 'source should indicate coingecko');
    assert.equal(typeof data.lastUpdatedAt, 'number', 'lastUpdatedAt should be timestamp');
    assert.equal(typeof data.fetchedAt, 'number', 'fetchedAt should be timestamp');
    assert.equal(typeof data.isStale, 'boolean', 'isStale should be boolean');
  });

  test('cached price is returned on subsequent request within TTL window', async () => {
    const res1 = await fetch(SERVER_URL);
    const data1 = await res1.json();

    const res2 = await fetch(SERVER_URL);
    const data2 = await res2.json();

    assert.equal(data1.price, data2.price, 'Cached price should match');
    assert.equal(data1.fetchedAt, data2.fetchedAt, 'Cached fetchedAt should match');
  });

  test('never returns hardcoded $3,000 or zero price', async () => {
    const res = await fetch(SERVER_URL);
    const data = await res.json();

    assert.notEqual(data.price, 3000, 'Price must not be the deprecated $3,000 static benchmark');
    assert.notEqual(data.price, 0, 'Price must not be zero');
  });
});
