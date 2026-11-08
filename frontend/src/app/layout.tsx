import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/context/Providers";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { connection } from "next/server";
import { api } from "@/lib/api";
import { USE_MOCK } from "@/lib/config";

export const metadata: Metadata = {
  title: { default: "Threads | Clothing Store", template: "%s | Threads" },
  description: "Demo e-commerce clothing store: Next.js frontend for Django + FastAPI microservices.",
};

/**
 * Root layout (server component): wraps every page. It fetches the top-level
 * categories on the server and passes them to the client Navbar as props.
 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // With the real backend, render at request time: the APIs are not reachable
  // while `next build` runs inside Docker, and data should always be fresh.
  if (!USE_MOCK) await connection();

  const categories = (await api.getCategories()).filter((c) => c.parent === null);

  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col">
        <Providers>
          <Navbar categories={categories} />
          <main className="flex-1">{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
