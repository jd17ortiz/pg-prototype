import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/client-auth";
import Nav from "@/components/Nav";
import { ToastProvider } from "@/components/Toast";

export const metadata: Metadata = {
  title: "Digital Process Guideline System",
  description: "PASS 1 Prototype",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased" suppressHydrationWarning>
        <AuthProvider>
          <ToastProvider>
            <Nav />
            <main className="max-w-7xl mx-auto px-4 py-6">{children}</main>
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
