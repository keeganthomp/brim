import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';

const inter = localFont({
  src: '../../../web/public/fonts/inter-latin-variable.woff2',
  variable: '--brim-sans',
  display: 'swap',
  weight: '100 900',
  fallback: ['Arial', 'sans-serif'],
  adjustFontFallback: 'Arial',
});

// The dashboard's mono, so numbers and code read the same on every Brim surface.
const mono = localFont({
  src: '../../../web/public/fonts/jetbrains-mono-latin-variable.woff2',
  variable: '--brim-mono-font',
  display: 'swap',
  weight: '100 800',
  fallback: ['ui-monospace', 'monospace'],
  adjustFontFallback: false,
});

export const metadata: Metadata = {
  title: { default: 'Brim | Spend controls for AI agents', template: '%s | Brim' },
  description:
    'Give AI agents scoped spending policies for USDC payments on Solana. Try Brim with the local x402 quickstart.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // Smooth in-page anchors; Next keeps route changes instant with this attribute.
    <html lang="en" className={`${inter.variable} ${mono.variable}`} data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  );
}
