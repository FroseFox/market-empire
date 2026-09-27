"use client";
import type { LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/ui";

export default function ComingSoon({ icon, title, subtitle, phase, points }: { icon: LucideIcon; title: string; subtitle: string; phase: string; points: string[] }) {
  return (
    <>
      <PageHeader icon={icon} title={title} subtitle={subtitle} />
      <div className="card p-8 max-w-2xl appear">
        <span className="inline-block text-[11px] font-semibold uppercase tracking-wide rounded-full bg-primary-soft text-primary px-2.5 py-1 mb-4">{phase}</span>
        <h2 className="text-[20px] font-semibold mb-3">Cette section arrive bientôt</h2>
        <ul className="space-y-2 text-[14px] text-muted list-disc pl-5">
          {points.map((p) => <li key={p}>{p}</li>)}
        </ul>
      </div>
    </>
  );
}
