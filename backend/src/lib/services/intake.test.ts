import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  canonicalizeUrl,
  generateDedupeKey,
  isAllowedDomain,
  parseRssFeed,
  getRailsWithEnvOverrides,
} from './intake.js';
import type { IntakeRails } from '@ledger/shared';

describe('intake service', () => {
  describe('canonicalizeUrl', () => {
    const stripParams = ['utm_source', 'utm_medium', 'utm_campaign', 'fbclid', 'gclid'];

    it('removes tracking parameters', () => {
      const url =
        'https://www.ftc.gov/news/press-releases/2024/01/example?utm_source=email&utm_medium=newsletter';
      const result = canonicalizeUrl(url, stripParams);
      expect(result).toBe('https://www.ftc.gov/news/press-releases/2024/01/example');
    });

    it('preserves non-tracking parameters', () => {
      const url = 'https://www.sec.gov/news?id=12345&page=2&utm_source=twitter';
      const result = canonicalizeUrl(url, stripParams);
      expect(result).toContain('id=12345');
      expect(result).toContain('page=2');
      expect(result).not.toContain('utm_source');
    });

    it('sorts remaining query params for consistency', () => {
      const url1 = 'https://example.com/page?b=2&a=1';
      const url2 = 'https://example.com/page?a=1&b=2';
      expect(canonicalizeUrl(url1, [])).toBe(canonicalizeUrl(url2, []));
    });

    it('removes trailing slash from pathname', () => {
      const url = 'https://www.ftc.gov/news/press-releases/';
      const result = canonicalizeUrl(url, []);
      expect(result).toBe('https://www.ftc.gov/news/press-releases');
    });

    it('preserves root path slash', () => {
      const url = 'https://www.ftc.gov/';
      const result = canonicalizeUrl(url, []);
      expect(result).toBe('https://www.ftc.gov/');
    });

    it('handles URLs without query string', () => {
      const url = 'https://www.ftc.gov/news/press-releases/2024/01/example';
      const result = canonicalizeUrl(url, stripParams);
      expect(result).toBe('https://www.ftc.gov/news/press-releases/2024/01/example');
    });

    it('returns original URL if parsing fails', () => {
      const badUrl = 'not-a-valid-url';
      const result = canonicalizeUrl(badUrl, stripParams);
      expect(result).toBe(badUrl);
    });
  });

  describe('generateDedupeKey', () => {
    it('generates consistent hash for same inputs', () => {
      const url = 'https://www.ftc.gov/news/example';
      const date = '2024-01-15T10:00:00.000Z';

      const key1 = generateDedupeKey(url, date);
      const key2 = generateDedupeKey(url, date);

      expect(key1).toBe(key2);
      expect(key1).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hex
    });

    it('generates different hash for different URLs', () => {
      const date = '2024-01-15T10:00:00.000Z';

      const key1 = generateDedupeKey('https://www.ftc.gov/news/example1', date);
      const key2 = generateDedupeKey('https://www.ftc.gov/news/example2', date);

      expect(key1).not.toBe(key2);
    });

    it('generates different hash for different dates', () => {
      const url = 'https://www.ftc.gov/news/example';

      const key1 = generateDedupeKey(url, '2024-01-15T10:00:00.000Z');
      const key2 = generateDedupeKey(url, '2024-01-16T10:00:00.000Z');

      expect(key1).not.toBe(key2);
    });
  });

  describe('isAllowedDomain', () => {
    const allowedDomains = ['ftc.gov', 'www.sec.gov', 'justice.gov'];

    it('allows exact domain match', () => {
      expect(isAllowedDomain('https://ftc.gov/news', allowedDomains)).toBe(true);
      expect(isAllowedDomain('https://www.sec.gov/news', allowedDomains)).toBe(true);
    });

    it('allows subdomain of allowed domain', () => {
      expect(isAllowedDomain('https://www.ftc.gov/news', allowedDomains)).toBe(true);
      expect(isAllowedDomain('https://subdomain.ftc.gov/news', allowedDomains)).toBe(true);
    });

    it('rejects non-allowed domains', () => {
      expect(isAllowedDomain('https://example.com/news', allowedDomains)).toBe(false);
      expect(isAllowedDomain('https://malicious-ftc.gov/news', allowedDomains)).toBe(false);
    });

    it('is case-insensitive', () => {
      expect(isAllowedDomain('https://WWW.FTC.GOV/news', allowedDomains)).toBe(true);
    });

    it('returns false for invalid URLs', () => {
      expect(isAllowedDomain('not-a-url', allowedDomains)).toBe(false);
    });
  });

  describe('parseRssFeed', () => {
    it('parses basic RSS feed items', () => {
      const xml = `
        <?xml version="1.0" encoding="UTF-8"?>
        <rss version="2.0">
          <channel>
            <title>FTC Press Releases</title>
            <item>
              <title>FTC Takes Action Against Company</title>
              <link>https://www.ftc.gov/news/press-releases/2024/01/example</link>
              <pubDate>Mon, 15 Jan 2024 10:00:00 GMT</pubDate>
              <guid>ftc-2024-001</guid>
              <description>The FTC today announced...</description>
              <category>Enforcement</category>
              <category>Consumer Protection</category>
            </item>
          </channel>
        </rss>
      `;

      const items = parseRssFeed(xml);

      expect(items).toHaveLength(1);
      expect(items[0].title).toBe('FTC Takes Action Against Company');
      expect(items[0].link).toBe('https://www.ftc.gov/news/press-releases/2024/01/example');
      expect(items[0].pubDate).toBe('Mon, 15 Jan 2024 10:00:00 GMT');
      expect(items[0].guid).toBe('ftc-2024-001');
      expect(items[0].description).toBe('The FTC today announced...');
      expect(items[0].categories).toEqual(['Enforcement', 'Consumer Protection']);
    });

    it('parses CDATA content', () => {
      const xml = `
        <rss version="2.0">
          <channel>
            <item>
              <title><![CDATA[FTC & SEC Joint Statement]]></title>
              <link>https://www.ftc.gov/news</link>
            </item>
          </channel>
        </rss>
      `;

      const items = parseRssFeed(xml);

      expect(items).toHaveLength(1);
      expect(items[0].title).toBe('FTC & SEC Joint Statement');
    });

    it('decodes HTML entities', () => {
      const xml = `
        <rss version="2.0">
          <channel>
            <item>
              <title>Company &amp; Partners &quot;Agreement&quot;</title>
              <link>https://www.ftc.gov/news</link>
            </item>
          </channel>
        </rss>
      `;

      const items = parseRssFeed(xml);

      expect(items).toHaveLength(1);
      expect(items[0].title).toBe('Company & Partners "Agreement"');
    });

    it('handles multiple items', () => {
      const xml = `
        <rss version="2.0">
          <channel>
            <item>
              <title>First Item</title>
              <link>https://www.ftc.gov/1</link>
            </item>
            <item>
              <title>Second Item</title>
              <link>https://www.ftc.gov/2</link>
            </item>
            <item>
              <title>Third Item</title>
              <link>https://www.ftc.gov/3</link>
            </item>
          </channel>
        </rss>
      `;

      const items = parseRssFeed(xml);

      expect(items).toHaveLength(3);
      expect(items.map((i) => i.title)).toEqual(['First Item', 'Second Item', 'Third Item']);
    });

    it('skips items without title or link', () => {
      const xml = `
        <rss version="2.0">
          <channel>
            <item>
              <title>Has Title Only</title>
            </item>
            <item>
              <link>https://www.ftc.gov/has-link-only</link>
            </item>
            <item>
              <title>Valid Item</title>
              <link>https://www.ftc.gov/valid</link>
            </item>
          </channel>
        </rss>
      `;

      const items = parseRssFeed(xml);

      expect(items).toHaveLength(1);
      expect(items[0].title).toBe('Valid Item');
    });

    it('handles empty feed', () => {
      const xml = `
        <rss version="2.0">
          <channel>
            <title>Empty Feed</title>
          </channel>
        </rss>
      `;

      const items = parseRssFeed(xml);
      expect(items).toHaveLength(0);
    });

    it('handles SEC litigation releases format with newlines in link tags', () => {
      // SEC litigation releases have newlines between URL and closing tag
      const xml = `
        <?xml version="1.0" encoding="utf-8"?>
        <rss version="2.0" xml:base="https://www.sec.gov/">
          <channel>
            <title>Litigation Releases</title>
            <item>
              <title>David J. Bradford and Gerardo L. Linarducci</title>
              <link>https://www.sec.gov/enforcement-litigation/litigation-releases/lr-26456
</link>
              <description>David J. Bradford and Gerardo L. Linarducci</description>
              <pubDate>Tue, 30 Dec 2025 17:27:40 -0500</pubDate>
              <dc:creator>LR-26456</dc:creator>
              <guid isPermaLink="false">9a667d43-6c25-4baa-a54d-f12922530803</guid>
            </item>
            <item>
              <title>Caroline Ellison, Gary Wang, and Nishad Singh</title>
              <link>https://www.sec.gov/enforcement-litigation/litigation-releases/lr-26450
</link>
              <description>Caroline Ellison, Gary Wang, and Nishad Singh</description>
              <pubDate>Fri, 19 Dec 2025 11:39:26 -0500</pubDate>
              <dc:creator>LR-26450</dc:creator>
              <guid isPermaLink="false">00487736-b86f-411c-bb5e-17660121d154</guid>
            </item>
          </channel>
        </rss>
      `;

      const items = parseRssFeed(xml);

      expect(items).toHaveLength(2);
      expect(items[0].title).toBe('David J. Bradford and Gerardo L. Linarducci');
      expect(items[0].link).toBe('https://www.sec.gov/enforcement-litigation/litigation-releases/lr-26456');
      expect(items[0].pubDate).toBe('Tue, 30 Dec 2025 17:27:40 -0500');
      expect(items[0].guid).toBe('9a667d43-6c25-4baa-a54d-f12922530803');

      expect(items[1].title).toBe('Caroline Ellison, Gary Wang, and Nishad Singh');
      expect(items[1].link).toBe('https://www.sec.gov/enforcement-litigation/litigation-releases/lr-26450');
    });
  });

  describe('getRailsWithEnvOverrides', () => {
    const baseRails: IntakeRails = {
      maxItemsPerRun: 20,
      maxPerFeedPerRun: 5,
      maxRequestsPerHostPerMinute: 30,
      minDelayMsBetweenRequestsSameHost: 750,
      fetchTimeoutMs: 15000,
      maxHtmlSnapshotBytes: 5242880,
      maxPdfBytes: 26214400,
      allowedDomains: ['ftc.gov', 'sec.gov'],
      stripQueryParams: ['utm_source'],
    };

    beforeEach(() => {
      // Clear env vars before each test
      delete process.env.INTAKE_MAX_ITEMS_PER_RUN;
      delete process.env.INTAKE_MAX_PER_FEED_PER_RUN;
      delete process.env.INTAKE_FETCH_TIMEOUT_MS;
    });

    afterEach(() => {
      // Clean up after each test
      delete process.env.INTAKE_MAX_ITEMS_PER_RUN;
      delete process.env.INTAKE_MAX_PER_FEED_PER_RUN;
      delete process.env.INTAKE_FETCH_TIMEOUT_MS;
    });

    it('returns base rails unchanged when no env vars set', () => {
      const result = getRailsWithEnvOverrides(baseRails);

      expect(result.maxItemsPerRun).toBe(20);
      expect(result.maxPerFeedPerRun).toBe(5);
      expect(result.fetchTimeoutMs).toBe(15000);
    });

    it('overrides maxItemsPerRun from INTAKE_MAX_ITEMS_PER_RUN', () => {
      process.env.INTAKE_MAX_ITEMS_PER_RUN = '100';

      const result = getRailsWithEnvOverrides(baseRails);

      expect(result.maxItemsPerRun).toBe(100);
      expect(result.maxPerFeedPerRun).toBe(5); // unchanged
    });

    it('overrides maxPerFeedPerRun from INTAKE_MAX_PER_FEED_PER_RUN', () => {
      process.env.INTAKE_MAX_PER_FEED_PER_RUN = '10';

      const result = getRailsWithEnvOverrides(baseRails);

      expect(result.maxPerFeedPerRun).toBe(10);
      expect(result.maxItemsPerRun).toBe(20); // unchanged
    });

    it('overrides fetchTimeoutMs from INTAKE_FETCH_TIMEOUT_MS', () => {
      process.env.INTAKE_FETCH_TIMEOUT_MS = '30000';

      const result = getRailsWithEnvOverrides(baseRails);

      expect(result.fetchTimeoutMs).toBe(30000);
    });

    it('applies multiple overrides simultaneously', () => {
      process.env.INTAKE_MAX_ITEMS_PER_RUN = '50';
      process.env.INTAKE_MAX_PER_FEED_PER_RUN = '15';
      process.env.INTAKE_FETCH_TIMEOUT_MS = '60000';

      const result = getRailsWithEnvOverrides(baseRails);

      expect(result.maxItemsPerRun).toBe(50);
      expect(result.maxPerFeedPerRun).toBe(15);
      expect(result.fetchTimeoutMs).toBe(60000);
    });

    it('ignores invalid non-numeric values', () => {
      process.env.INTAKE_MAX_ITEMS_PER_RUN = 'invalid';

      const result = getRailsWithEnvOverrides(baseRails);

      expect(result.maxItemsPerRun).toBe(20); // unchanged
    });

    it('ignores zero or negative values', () => {
      process.env.INTAKE_MAX_ITEMS_PER_RUN = '0';
      process.env.INTAKE_MAX_PER_FEED_PER_RUN = '-5';

      const result = getRailsWithEnvOverrides(baseRails);

      expect(result.maxItemsPerRun).toBe(20); // unchanged
      expect(result.maxPerFeedPerRun).toBe(5); // unchanged
    });

    it('does not mutate the original rails object', () => {
      process.env.INTAKE_MAX_ITEMS_PER_RUN = '100';

      const result = getRailsWithEnvOverrides(baseRails);

      expect(result.maxItemsPerRun).toBe(100);
      expect(baseRails.maxItemsPerRun).toBe(20); // original unchanged
    });

    it('preserves non-overridable rails properties', () => {
      process.env.INTAKE_MAX_ITEMS_PER_RUN = '100';

      const result = getRailsWithEnvOverrides(baseRails);

      expect(result.allowedDomains).toEqual(['ftc.gov', 'sec.gov']);
      expect(result.stripQueryParams).toEqual(['utm_source']);
      expect(result.maxHtmlSnapshotBytes).toBe(5242880);
      expect(result.maxPdfBytes).toBe(26214400);
    });
  });
});