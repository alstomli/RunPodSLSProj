import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FLUX Images",
  description: "Make Images from prompts with our FLUX.1-dev Endpoint",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
