import { describe, it, expect } from 'vitest';
import type { SiteConfig } from '../src/lib/config.ts';
import { buildRobotsTxt, buildRobotsDocument } from '../src/lib/robots.ts';

const mockSiteConfig: SiteConfig = {
  site: {
    title: { zh: '测试站点', en: 'Test Site' },
    url: 'https://example.com',
  },
  profile: {
    name: { zh: '张三', en: 'San Zhang' },
  },
  github: {
    username: 'testuser',
  },
  seo: {
    sitemap: {
      enabled: true,
    },
    robots: {
      enabled: true,
      allow: ['/'],
      disallow: ['/assets/private/', '/tmp/'],
      crawl_delay: 5,
    },
  },
};

describe('buildRobotsTxt', () => {
  it('generates standard robots.txt with allow, disallow, crawl-delay and sitemap', () => {
    const txt = buildRobotsTxt(mockSiteConfig, {
      siteUrl: 'https://example.com',
      baseUrl: '/',
    });
    expect(txt).not.toBeNull();
    expect(txt).toContain('User-agent: *');
    expect(txt).toContain('Allow: /');
    expect(txt).toContain('Disallow: /assets/private/');
    expect(txt).toContain('Disallow: /tmp/');
    expect(txt).toContain('Crawl-delay: 5');
    expect(txt).toContain('Sitemap: https://example.com/sitemap.xml');
  });

  it('omits sitemap link when sitemap is disabled', () => {
    const txt = buildRobotsTxt(mockSiteConfig, {
      siteUrl: 'https://example.com',
      sitemapEnabled: false,
    });
    expect(txt).not.toContain('Sitemap:');
  });

  it('returns null when robots is disabled', () => {
    const disabledConfig: SiteConfig = {
      ...mockSiteConfig,
      seo: { robots: { enabled: false } },
    };
    expect(buildRobotsTxt(disabledConfig)).toBeNull();
  });

  it('buildRobotsDocument reads project data and generates robots.txt', async () => {
    const doc = await buildRobotsDocument({ siteUrl: 'https://example.com' });
    expect(doc).not.toBeNull();
    expect(doc).toContain('User-agent: *');
    expect(doc).toContain('Sitemap:');
  });
});
