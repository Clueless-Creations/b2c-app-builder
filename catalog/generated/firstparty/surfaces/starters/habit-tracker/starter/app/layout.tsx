import type { Metadata } from "next";
import { AnalyticsProvider } from "@/components/analytics-provider";
import { strings } from "@/lib/strings";

// Metadata reads from lib/strings.ts; the copy pass replaces the fictional
// example brand from product/copy/COPY_DECK.md before anything ships.
export const metadata: Metadata = {
  title: strings.meta.title,
  description: strings.meta.description,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AnalyticsProvider>{children}</AnalyticsProvider>
      </body>
    </html>
  );
}
