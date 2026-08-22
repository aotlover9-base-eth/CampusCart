import type { Metadata, Viewport } from 'next'
import { Inter, Outfit } from 'next/font/google'
import { ThemeProvider } from '@/components/theme/theme-provider'
import { ThemeScript } from '@/components/theme/theme-script'
import { ServiceWorkerRegistration } from '@/components/pwa/service-worker'
import { publicEnv } from '@/lib/env'
import '@/app/globals.css'

const fontSans = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
})

const fontDisplay = Outfit({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: `${publicEnv.appName} - The VIT Bhopal marketplace`,
    template: `%s · ${publicEnv.appName}`,
  },
  description:
    'Buy and sell across VIT Bhopal. Electronics, books, cycles, furniture, services - everything students need.',
  applicationName: publicEnv.appName,
  keywords: [
    'VIT Bhopal',
    'student marketplace',
    'buy sell campus',
    'college marketplace',
    'used books',
    'hostel essentials',
  ],
  authors: [{ name: publicEnv.appName }],
  creator: publicEnv.appName,
  publisher: publicEnv.appName,
  formatDetection: { telephone: false },
  metadataBase: new URL(publicEnv.appUrl),
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: 'en_IN',
    siteName: publicEnv.appName,
    title: `${publicEnv.appName} - The VIT Bhopal marketplace`,
    description: 'Buy and sell across VIT Bhopal.',
    url: publicEnv.appUrl,
    images: [
      {
        url: '/og.png',
        width: 1200,
        height: 630,
        alt: `${publicEnv.appName} - the VIT Bhopal student marketplace`,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: `${publicEnv.appName} - The VIT Bhopal marketplace`,
    description: 'Buy and sell across VIT Bhopal.',
    images: ['/og.png'],
  },
  robots: { index: true, follow: true },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    title: publicEnv.appName,
    statusBarStyle: 'black-translucent',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0b' },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className={`${fontSans.variable} ${fontDisplay.variable} font-sans`}>
        <ThemeProvider>
          {children}
        </ThemeProvider>
        <ServiceWorkerRegistration />
      </body>
    </html>
  )
}
