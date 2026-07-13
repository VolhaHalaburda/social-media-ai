import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TopBar } from "@/components/top-bar";
import { PipelineProvider } from "@/context/pipeline-context";

// Chrome for every signed-in page. The login page lives outside this group and
// renders without the sidebar.
export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <TooltipProvider>
      <PipelineProvider>
        <SidebarProvider>
          <AppSidebar />
          <main className="flex-1 overflow-auto min-h-screen">
            <TopBar />
            <div className="mx-auto max-w-6xl px-6 py-6">{children}</div>
          </main>
        </SidebarProvider>
      </PipelineProvider>
    </TooltipProvider>
  );
}
