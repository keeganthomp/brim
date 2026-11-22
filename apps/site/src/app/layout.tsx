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

export const metadata: Metadata = {
  title: { default: 'Brim | Spend controls for AI agents', template: '%s | Brim' },
  description:
    'Give AI agents scoped spending policies for USDC payments on Solana. Try Brim with the local x402 quickstart.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
