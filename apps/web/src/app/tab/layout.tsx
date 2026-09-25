import { requireUser } from "@/lib/session";

export default async function TabRootLayout({ children }: { children: React.ReactNode }) {
  await requireUser("/tab");
  return children;
}
