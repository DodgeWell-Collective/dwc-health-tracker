import type { Metadata, Viewport } from "next";
import { SideNav, TabBar } from "../components/nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Health",
  description: "Daily targets, workouts and meal planning",
  appleWebApp: { capable: true, title: "Health", statusBarStyle: "black-translucent" },
  icons: {
    icon: "/pwa/favicon-32.png",
    apple: "/pwa/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#059669",
};

// If a script chunk fails (e.g. a 404/503 the browser cached during a deploy), the app
// never hydrates and every tap becomes a full page load. Refetch the failed chunks past
// the cache, then reload once per session.
const HEAL_CHUNKS = `(function(){var bad=[],t;addEventListener("error",function(e){var el=e.target,u=el&&(el.src||el.href);if(!u||u.indexOf("/_next/static/")<0||bad.indexOf(u)>=0)return;bad.push(u);clearTimeout(t);t=setTimeout(heal,100)},true);function heal(){try{if(sessionStorage.getItem("healed"))return;sessionStorage.setItem("healed","1")}catch(e){return}Promise.all(bad.map(function(u){return fetch(u,{cache:"reload"}).catch(function(){})})).then(function(){location.reload()})}})();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: HEAL_CHUNKS }} />
        {/* Sign-in guards the site, so the manifest request must carry the session cookie. */}
        <link rel="manifest" href="/pwa/manifest.webmanifest" crossOrigin="use-credentials" />
      </head>
      <body className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
        {/* Status-bar backdrop so scrolled content doesn't run under the clock (zero height in Safari tabs). */}
        <div className="fixed inset-x-0 top-0 z-10 h-[env(safe-area-inset-top)] bg-zinc-50/90 backdrop-blur md:hidden dark:bg-zinc-950/90" />
        <SideNav />
        <div className="md:pl-48">
          {/* Clears the status bar in the Home Screen app (black-translucent draws under it). */}
          <main className="mx-auto max-w-5xl px-4 pt-[calc(1.5rem+env(safe-area-inset-top))] pb-[calc(5rem+env(safe-area-inset-bottom))] md:px-8 md:pb-8">{children}</main>
        </div>
        <TabBar />
      </body>
    </html>
  );
}
