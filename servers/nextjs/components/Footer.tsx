"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, Plus, LayoutGrid } from "lucide-react";
import { Logo } from "@/components/brand/Logo";

/** Global footer — brand lockup, real product links, and the legal line. */
export function Footer() {
  const router = useRouter();
  const year = new Date().getFullYear();

  return (
    <footer className="relative mt-24">
      {/* gradient top divider */}
      <div className="h-px w-full bg-gradient-to-r from-transparent via-brand/40 to-transparent" />

      <div className="max-w-7xl mx-auto px-6 py-14">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-12">
          {/* Brand */}
          <div className="max-w-sm">
            <Logo />
            <p className="text-muted text-sm mt-4 leading-relaxed">
              AI presentations that write, design, and illustrate themselves —
              from a single idea to a deck you&apos;d actually present.
            </p>
            <div className="flex items-center gap-2 mt-5 text-xs text-faint">
              <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
              All systems operational
            </div>
          </div>

          {/* Quick actions + links */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-12 gap-y-8">
            <FooterCol title="Workspace">
              <FooterAction icon={<LayoutGrid className="w-3.5 h-3.5" />} label="Dashboard"
                onClick={() => router.push("/dashboard")} />
              <FooterAction icon={<Plus className="w-3.5 h-3.5" />} label="New presentation"
                onClick={() => router.push("/new")} />
            </FooterCol>

            <FooterCol title="Ecosystem">
              <FooterLink href="https://sagestudio.zsapiens.com" label="SageStudio" external />
              <FooterLink href="https://zsapiens.com" label="ZSapiens" external />
            </FooterCol>

            <FooterCol title="Support">
              <FooterLink href="mailto:hello@zsapiens.com" label="Contact" />
              <FooterLink href="https://zsapiens.com" label="About" external />
            </FooterCol>
          </div>
        </div>

        {/* Legal bar */}
        <div className="mt-14 pt-6 border-t border-line flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-faint text-xs text-center sm:text-left">
            © {year}{" "}
            <span className="text-muted font-medium">ZSAPIENS SOFTECH PRIVATE LIMITED</span>.
            All rights reserved.
          </p>
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="flex items-center gap-1.5 text-xs text-muted hover:text-text transition-colors group"
          >
            Back to top
            <span className="w-6 h-6 rounded-md border border-line group-hover:border-line-strong flex items-center justify-center transition-colors">
              <ArrowUp className="w-3.5 h-3.5" />
            </span>
          </button>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-text text-xs font-bold uppercase tracking-wider mb-4">{title}</p>
      <ul className="space-y-3">{children}</ul>
    </div>
  );
}

function FooterLink({ href, label, external }: { href: string; label: string; external?: boolean }) {
  return (
    <li>
      <a
        href={href}
        {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        className="text-muted hover:text-text text-sm transition-colors"
      >
        {label}
      </a>
    </li>
  );
}

function FooterAction({ icon, label, onClick }: {
  icon: React.ReactNode; label: string; onClick: () => void;
}) {
  return (
    <li>
      <button onClick={onClick} className="flex items-center gap-2 text-muted hover:text-text text-sm transition-colors">
        <span className="text-faint">{icon}</span>{label}
      </button>
    </li>
  );
}
