import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Accounting Portal - Arc Eye DC",
  description: "Accounting portal for Arc Eye DC finance and admin workflows.",
};

export default function AccountingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
