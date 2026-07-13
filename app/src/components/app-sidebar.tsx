"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Film, Play, Users, Settings2, UserCog, LogOut } from "lucide-react";
import { useSession } from "@/context/session-context";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
} from "@/components/ui/sidebar";

const navItems = [
  { title: "Videos", href: "/videos", icon: Film },
  { title: "Run Pipeline", href: "/run", icon: Play, adminOnly: true },
  { title: "Creators", href: "/creators", icon: Users },
  { title: "Configs", href: "/configs", icon: Settings2 },
  { title: "Team", href: "/team", icon: UserCog, adminOnly: true },
];

export function AppSidebar() {
  const pathname = usePathname();
  const { user, isAdmin, signOut } = useSession();
  const [lastRun, setLastRun] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/videos")
      .then((r) => r.json())
      .then((videos: { dateAdded: string }[]) => {
        if (videos.length > 0 && videos[0].dateAdded) {
          setLastRun(videos[0].dateAdded);
        }
      })
      .catch(() => {});
  }, []);

  const visibleItems = navItems.filter((item) => !item.adminOnly || isAdmin);

  return (
    <Sidebar className="border-r border-white/[0.06] bg-[#111113]">
      <SidebarHeader className="px-4 py-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-2.5">
          <div className="flex h-6 w-6 items-center justify-center rounded-[6px] bg-[#5e6ad2]">
            <Film className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="text-[13px] font-semibold text-[#e2e2e5] tracking-tight">Virality System</span>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2 py-3">
        <SidebarGroup>
          <SidebarGroupLabel className="px-2 mb-1 text-[11px] font-medium text-[#4a4a55] uppercase tracking-widest">
            Workspace
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {visibleItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      className={`h-8 rounded-[6px] px-2.5 text-[13px] transition-colors duration-100 ${
                        isActive
                          ? "bg-white/[0.08] text-[#e2e2e5]"
                          : "text-[#8a8a96] hover:bg-white/[0.05] hover:text-[#e2e2e5]"
                      }`}
                    >
                      <Link href={item.href} className="flex items-center gap-2.5">
                        <item.icon className={`h-3.5 w-3.5 ${isActive ? "text-[#5e6ad2]" : ""}`} />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="px-3 py-3 border-t border-white/[0.06] gap-2">
        {lastRun && (
          <p className="px-1 text-[11px] text-[#4a4a55]">
            Last run: <span className="text-[#6e6e7a]">{lastRun}</span>
          </p>
        )}
        {user && (
          <div className="flex items-center justify-between gap-2 rounded-[6px] bg-white/[0.03] px-2.5 py-2">
            <div className="min-w-0">
              <p className="truncate text-[12px] font-medium text-[#e2e2e5]">{user.name}</p>
              <p className="text-[10.5px] uppercase tracking-wider text-[#5e6ad2]">{user.role}</p>
            </div>
            <button
              onClick={() => void signOut()}
              title="Sign out"
              className="shrink-0 rounded-[5px] p-1.5 text-[#6e6e7a] transition-colors hover:bg-white/[0.06] hover:text-[#e2e2e5]"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
