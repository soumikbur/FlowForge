import './globals.css';
import { Navigation } from '../components/Navigation';

export const metadata = {
  title: 'FlowForge — Resilient Business Workflow Automation',
  description: 'Visual workflow editor, distributed execution engine, and approval inbox.'
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 flex flex-col">
        <Navigation />
        <main className="flex-1 flex flex-col">{children}</main>
      </body>
    </html>
  );
}
