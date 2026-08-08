import type { MetadataRoute } from 'next'
import { publicEnv } from '@/lib/env'

/**
 * Crawl rules.
 *
 * The hidden admin path is deliberately absent: naming it in a Disallow rule
 * would publish the one thing it depends on staying unguessable. It is blocked
 * by proxy.ts and noindex headers instead.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/listing/'],
        disallow: [
          '/api/',
          '/chats',
          '/saved',
          '/notifications',
          '/settings',
          '/onboarding',
          '/sell',
        ],
      },
    ],
    sitemap: `${publicEnv.appUrl}/sitemap.xml`,
    host: publicEnv.appUrl,
  }
}
