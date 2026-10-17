import { Suspense } from "react";
import { AttendanceTableSkeleton } from "@/components/attendance-table";
import { Dashboard } from "@/components/dashboard";
import { SummaryCardsSkeleton } from "@/components/summary-cards";
import { lireSession } from "@/lib/auth";

export const instant = false;

async function UserDashboard() {
  const session = await lireSession();
  const userRole = session?.role ?? "admin";
  return <Dashboard userRole={userRole} />;
}

export default function Home() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6">
          <h1 className="text-2xl font-semibold tracking-tight">Pointages du personnel</h1>
          <SummaryCardsSkeleton />
          <AttendanceTableSkeleton />
        </main>
      }
    >
      <UserDashboard />
    </Suspense>
  );
}
