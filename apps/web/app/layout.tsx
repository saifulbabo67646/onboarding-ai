import '@livekit/components-styles';
import '../styles/globals.css';
import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: {
    default: 'Onboarding AI - live demos presented by AI',
    template: '%s · Onboarding AI',
  },
  description:
    'Give an AI presenter a goal. It joins a call, shares its screen and demos your product or presents your slides - like a person would.',
  icons: { icon: '/favicon.ico' },
};

export const viewport: Viewport = {
  themeColor: '#0b0d12',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body data-lk-theme="default">{children}</body>
    </html>
  );
}
