"use client";

import { Card, Empty, Typography } from "antd";
import type { ApexOptions } from "apexcharts";
import dynamic from "next/dynamic";
import { useMemo } from "react";

import { Signed } from "@/components/figures";
import { MonthSwitcher } from "@/components/month-switcher";
import { money, signedMoney } from "@/lib/money";
import { monthLabel, monthSpan, type Month } from "@/lib/month";

// ApexCharts draws into the DOM, so it loads in the browser only.
const Chart = dynamic(() => import("react-apexcharts"), {
  ssr: false,
  loading: () => <div style={{ height: CHART_HEIGHT }} />,
});

const CHART_HEIGHT = 320;

/**
 * Gain and loss. Indigo, the app's accent, rather than green: red against
 * green is the pair red-green colour blindness can't tell apart (validated —
 * ΔE 5 for deutan, against 29.8 for this pair). A bar's side of zero says it
 * too, so colour is never the only cue.
 */
const GAIN = "#4f46e5";
const LOSS = "#dc2626";

/** A member's month: their money in and out, base fees and transfers aside. */
export type EarningsMember = { key: string; name: string; removed: boolean; in: number; out: number };

const escape = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** $12k, −$850 — short enough for an axis. */
const compact = (value: number) => {
  const abs = Math.abs(value);
  const text =
    abs >= 1000
      ? `$${(abs / 1000).toFixed(abs >= 10_000 ? 0 : 1).replace(/\.0$/, "")}k`
      : `$${Math.round(abs)}`;
  return value < 0 ? `−${text}` : text;
};

/**
 * Round steps for the axis: about five gridlines from the lowest bar to the
 * highest, each a 1, 2, 2.5 or 5 of some power of ten — $0, $5k, $10k
 * rather than $4.6k, $9.8k.
 */
function niceScale(low: number, high: number) {
  const span = Math.max(high - Math.min(low, 0), 100);
  const rough = span / 5;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].find((m) => m * power >= rough)! * power;
  const min = low < 0 ? -Math.ceil(-low / step) * step : 0;
  const max = Math.max(Math.ceil(high / step) * step, step);
  return { min, max, ticks: Math.round((max - min) / step) };
}

/**
 * Every member's earnings for one month, in one chart: a bar per member, the
 * month's in minus out with base fees and transfers not counted; hover for the in and out
 * behind it. Months run from the 20th to the 19th; the switcher picks one.
 */
export function MemberEarnings({ month, members }: { month: Month; members: EarningsMember[] }) {
  const nets = members.map((m) => Math.round((m.in - m.out) * 100) / 100);
  const total = Math.round(nets.reduce((sum, v) => sum + v, 0) * 100) / 100;
  const empty = members.every((m) => !m.in && !m.out);

  const options = useMemo<ApexOptions>(() => {
    const { min, max, ticks } = niceScale(Math.min(0, ...nets), Math.max(0, ...nets));
    return {
      chart: {
        type: "bar",
        toolbar: { show: false },
        zoom: { enabled: false },
        animations: { enabled: false },
        fontFamily: "inherit",
        parentHeightOffset: 0,
      },
      colors: [GAIN],
      plotOptions: {
        bar: {
          columnWidth: members.length > 8 ? "70%" : "44%",
          borderRadius: 4,
          borderRadiusApplication: "end",
          colors: { ranges: [{ from: -1e12, to: -0.005, color: LOSS }] },
        },
      },
      dataLabels: { enabled: false },
      legend: { show: false },
      grid: { borderColor: "#eef2f7", strokeDashArray: 3, padding: { left: 8, right: 8, top: -8, bottom: 0 } },
      xaxis: {
        categories: members.map((m) => (m.removed ? `${m.name} (removed)` : m.name)),
        axisBorder: { show: false },
        axisTicks: { show: false },
        labels: { style: { colors: "#475569", fontSize: "12px" }, trim: true, hideOverlappingLabels: false },
        tooltip: { enabled: false },
        crosshairs: { show: false },
      },
      yaxis: {
        min,
        max,
        tickAmount: ticks,
        labels: { formatter: compact, style: { colors: "#94a3b8", fontSize: "11px" } },
      },
      states: { active: { filter: { type: "none" } } },
      tooltip: {
        // Anywhere in a member's column, so a bar of a few dollars can still be hovered.
        intersect: false,
        shared: true,
        custom: ({ dataPointIndex }: { dataPointIndex: number }) => {
          const member = members[dataPointIndex];
          const net = nets[dataPointIndex];
          return `
            <div style="padding:10px 12px;min-width:200px;font-size:12px;line-height:1.6;color:#0f172a">
              <div style="font-weight:600">${escape(member.name)}</div>
              <div style="color:#64748b;margin-bottom:6px">${escape(monthLabel(month))} · ${escape(monthSpan(month))}</div>
              <div style="display:flex;justify-content:space-between;gap:16px">
                <span style="color:#64748b">Earned</span>
                <b style="color:${net < 0 ? LOSS : GAIN}">${escape(signedMoney(net))}</b>
              </div>
              <div style="display:flex;justify-content:space-between;gap:16px">
                <span style="color:#64748b">In</span><span>${escape(money(member.in))}</span>
              </div>
              <div style="display:flex;justify-content:space-between;gap:16px">
                <span style="color:#64748b">Out</span><span>${escape(money(member.out))}</span>
              </div>
            </div>`;
        },
      },
    };
    // The members are the data; the options rebuild when they or the month change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members, month]);

  return (
    <Card
      variant="borderless"
      title={
        <span>
          Earnings · {monthLabel(month)}{" "}
          <Typography.Text type="secondary" style={{ fontWeight: 400, fontSize: 13 }}>
            {monthSpan(month)}
          </Typography.Text>
        </span>
      }
      extra={<MonthSwitcher month={month} />}
    >
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
        <Typography.Text type="secondary" style={{ fontSize: 13 }}>
          In minus out, base fees and transfers not counted · hover a bar for its in and out
        </Typography.Text>
        <span style={{ fontSize: 13 }}>
          <Typography.Text type="secondary">Everyone </Typography.Text>
          <Signed value={total} strong />
        </span>
      </div>
      {empty ? (
        <div style={{ height: CHART_HEIGHT, display: "grid", placeItems: "center" }}>
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={`Nothing recorded in ${monthLabel(month)}.`} />
        </div>
      ) : (
        <Chart type="bar" height={CHART_HEIGHT} options={options} series={[{ name: "Earned", data: nets }]} />
      )}
    </Card>
  );
}
