import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import Navbar from "@/components/Navbar";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Fleet Dispatch Optimizer",
  description:
    "Interactive autonomous-vehicle fleet dispatch demo: demand forecasting, exact assignment optimization, and A/B experiment analysis.",
};

// Runs before paint so the saved theme never flashes.
const themeScript = `try{var t=localStorage.getItem('theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t)}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${geistMono.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full flex flex-col bg-bg text-fg">
        <Navbar />
        <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 py-6">{children}</main>
        <footer className="border-t border-line text-sm text-muted">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 flex flex-wrap items-center justify-between gap-2">
            <span>
              Built by Raguraja Krishnan ·{" "}
              <a className="underline hover:text-fg" href="https://github.com/ragurajakrishnan15/Fleet-Dispatch-Optimizer">
                GitHub
              </a>
            </span>
            <span>All data is synthetic and simulated.</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
