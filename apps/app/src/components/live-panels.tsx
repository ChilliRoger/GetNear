"use client";

import { Card } from "@/components/card";
import { RateChart } from "@/components/rate-chart";
import { LiveFeed } from "@/components/live-feed";

/** Rate history chart + streaming agent feed, side by side. */
export function LivePanels({ defaultHours = 6 }: { defaultHours?: number }) {
  return (
    <div className="grid gap-8 pt-3 lg:grid-cols-5">
      <Card title="Rate history" subtitle="1Click dry quote vs ECB reference" className="lg:col-span-3">
        <RateChart height={250} defaultHours={defaultHours} />
      </Card>
      <Card title="Live agent feed" subtitle="Decisions and settlements as they happen" className="lg:col-span-2">
        <LiveFeed rows={8} />
      </Card>
    </div>
  );
}
