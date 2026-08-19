import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '../context/AuthContext';

export const metadata: Metadata = {
  title: 'Dihadi.Co Worker Portal - Manage Jobs & Earnings',
  description: 'Worker dashboard for Dihadi.Co - Accept job requests, transition job status, upload verification documents, and track earnings with dignity.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
