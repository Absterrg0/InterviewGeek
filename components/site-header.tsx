"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { StageBar, type StageBarInvestigation } from "@/components/investigation/stage-bar";
import { Brand, DesktopNav, MobileNav } from "@/components/site-nav";

/**
 * The one bar at the top of every page: the brand, the sections, and on small screens a menu.
 * Inside an investigation's stages it grows a second row for moving between them.
 */
export function SiteHeader({ investigations }: { investigations: StageBarInvestigation[] }) {
  const pathname = usePathname();
  // The design round is a blank page on purpose: no stage navigation under the bar.
  const match = pathname.match(/^\/investigations\/([^/]+)\/(?!design(?:\/|$))([^/]+)/);
  const investigation = match ? investigations.find((inv) => inv.id === match[1]) : undefined;
  const [open, setOpen] = useState(false);
  const [openedAt, setOpenedAt] = useState(pathname);

  // Navigating anywhere, including back and forward, closes the menu.
  if (open && openedAt !== pathname) {
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <header className="glass sticky top-0 z-40 border-b border-rule-soft">
      <div className="shell flex h-14 items-center gap-8">
        <Brand onNavigate={() => setOpen(false)} />
        <DesktopNav />
        <button
          type="button"
          className="knob ml-auto size-9 text-ink lg:hidden"
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => {
            setOpenedAt(pathname);
            setOpen((v) => !v);
          }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <path
              d={open ? "M4.5 4.5l9 9M13.5 4.5l-9 9" : "M3 6h12M3 12h12"}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
      {investigation && match?.[2] && !open && <StageBar investigation={investigation} current={match[2]} />}
      {open && (
        <div
          id="mobile-nav"
          className="h-[calc(100dvh-3.5rem)] overflow-y-auto border-t border-rule-soft bg-paper lg:hidden"
        >
          <div className="shell py-6">
            <MobileNav onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}
    </header>
  );
}
