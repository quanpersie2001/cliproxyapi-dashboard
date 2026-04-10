"use client";

import { usePathname } from "next/navigation";
import { ToastProvider } from "@/components/ui/toast";
import { MobileSidebarProvider } from "@/components/mobile-sidebar-context";
import { MobileTopBar } from "@/components/mobile-top-bar";
import { LazyUpdateNotification } from "@/components/lazy-update-notification";
import { ProxyUpdateNotification } from "@/components/proxy-update-notification";
import { DashboardShell } from "@/components/dashboard-shell";
import { DashboardNav } from "@/components/dashboard-nav";

interface DashboardClientLayoutProps {
  children: React.ReactNode;
}

export function DashboardClientLayout({ children }: DashboardClientLayoutProps) {
  const pathname = usePathname();
  const isAnalyticsHeavyRoute = pathname === "/dashboard" || pathname === "/dashboard/usage";

  return (
    <ToastProvider>
      <MobileSidebarProvider>
        <MobileTopBar />
        <div className="grid h-screen grid-cols-1 overflow-hidden lg:grid-cols-[auto_minmax(0,1fr)]">
          <DashboardNav />
          <main
            id="main-content"
            className={`min-h-0 min-w-0 overflow-y-auto px-3 pb-4 pt-16 ${isAnalyticsHeavyRoute ? "lg:px-8 lg:pb-8 lg:pt-6 xl:px-10" : "lg:px-6 lg:pb-6 lg:pt-6"}`}
          >
            <div className="w-full min-w-0">
              <DashboardShell>{children}</DashboardShell>
            </div>
          </main>
        </div>
        <LazyUpdateNotification />
        <ProxyUpdateNotification />
      </MobileSidebarProvider>
    </ToastProvider>
  );
}
