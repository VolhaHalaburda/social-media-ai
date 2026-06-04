"use client";

import { usePathname } from "next/navigation";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ChevronRight } from "lucide-react";

const pageTitles: Record<string, string> = {
  "/videos": "Videos",
  "/run": "Run Pipeline",
  "/creators": "Creators",
  "/configs": "Configs",
};

export function TopBar() {
  const pathname = usePathname();
  const title = pageTitles[pathname] || "Virality System";

  return (
    <div className="sticky top-0 z-10 flex h-11 items-center gap-2 border-b border-white/[0.06] bg-[#0f0f11]/90 px-4 backdrop-blur-xl">
      <SidebarTrigger className="h-6 w-6 text-[#6e6e7a] hover:text-[#a8a8b3] transition-colors" />
      <div className="flex items-center gap-1.5 text-[13px]">
        <span className="text-[#4a4a55]">Virality System</span>
        <ChevronRight className="h-3 w-3 text-[#4a4a55]" />
        <span className="text-[#a8a8b3] font-medium">{title}</span>
      </div>
    </div>
  );
}
