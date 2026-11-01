import "./globals.css";
import { ThemeProvider } from "../components/ThemeProvider";
import { AppShell } from "../components/AppShell";
import { SkipLink } from "../components/ui/SkipLink";

export const metadata = {
  title: "FlowForge — Enterprise Workflow Automation Platform",
  description:
    "FlowForge Control Plane: Visual workflow editor, distributed execution engine, and business automation platform.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('flowforge-theme');var d=t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(d){document.documentElement.classList.add('dark');document.documentElement.setAttribute('data-theme','dark');}else{document.documentElement.classList.remove('dark');document.documentElement.setAttribute('data-theme','light');}}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 antialiased selection:bg-indigo-500 selection:text-white transition-colors duration-150">
        <ThemeProvider>
          <SkipLink targetId="main-content" />
          <AppShell>{children}</AppShell>
        </ThemeProvider>
      </body>
    </html>
  );
}
