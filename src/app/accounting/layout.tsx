import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Accounting Portal - DOB",
  description: "Accounting portal for Doctor of Bat finance and admin workflows.",
};

export default function AccountingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
