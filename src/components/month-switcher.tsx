"use client";

import { LeftOutlined, RightOutlined } from "@ant-design/icons";
import { Button, DatePicker, Space } from "antd";
import dayjs from "dayjs";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { currentMonth, monthKey, shiftMonth, type Month } from "@/lib/month";

/**
 * ‹ Nov 2026 › — the month in view, kept in the address (`?m=2026-11`) along
 * with whatever else is there, so a filter survives a change of month.
 */
export function MonthSwitcher({ month }: { month: Month }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const go = (value: Month) => {
    const next = new URLSearchParams(params.toString());
    next.set("m", monthKey(value));
    router.push(`${pathname}?${next.toString()}`);
  };
  const isThisMonth = monthKey(month) === monthKey(currentMonth());

  return (
    <Space wrap size={8}>
      <Space.Compact>
        <Button icon={<LeftOutlined />} aria-label="Previous month" onClick={() => go(shiftMonth(month, -1))} />
        <DatePicker
          picker="month"
          allowClear={false}
          value={dayjs(`${monthKey(month)}-01`)}
          format="MMM YYYY"
          style={{ width: 130 }}
          onChange={(d) => d && go({ year: d.year(), month: d.month() + 1 })}
        />
        <Button icon={<RightOutlined />} aria-label="Next month" onClick={() => go(shiftMonth(month, 1))} />
      </Space.Compact>
      {!isThisMonth && <Button onClick={() => go(currentMonth())}>This month</Button>}
    </Space>
  );
}
