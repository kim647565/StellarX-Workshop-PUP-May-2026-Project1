import type { Metadata } from 'next';
import { Bricolage_Grotesque, IBM_Plex_Mono } from 'next/font/google';
import { WalletProvider } from '@/hooks/useWallet';
import './globals.css';

const displayFont = Bricolage_Grotesque({
  variable: '--font-display',
  subsets: ['latin'],
});

const monoFont = IBM_Plex_Mono({
  variable: '--font-tingifi-mono',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
});

export const metadata: Metadata = {
  title: 'TingiFi | Stellar micro-loans for sari-sari stores',
  description: 'Community-funded USDC loans on Stellar testnet for sari-sari store inventory financing.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${displayFont.variable} ${monoFont.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <WalletProvider>{children}</WalletProvider>
      </body>
    </html>
  );
}
