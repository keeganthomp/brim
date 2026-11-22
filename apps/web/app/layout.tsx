import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';

const inter = localFont({
  src: '../public/fonts/inter-latin-variable.woff2',
  variable: '--font-inter',
  display: 'swap',
  weight: '100 900',
  fallback: ['Arial', 'sans-serif'],
  adjustFontFallback: 'Arial',
});

const mono = localFont({
  src: '../public/fonts/jetbrains-mono-latin-variable.woff2',
  variable: '--font-mono',
  display: 'swap',
  weight: '100 800',
  fallback: ['Courier New', 'monospace'],
  adjustFontFallback: false,
});

export const metadata: Metadata = {
  title: 'Brim — Agent treasury',
  description: 'Manage agent spending, vault balances, and USDC payments on Solana.',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
