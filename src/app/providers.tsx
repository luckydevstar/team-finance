"use client";

import { App, ConfigProvider, theme } from "antd";

/**
 * antd's App wrapper, which is what makes `App.useApp()` work — message and
 * modal calls outside it silently do nothing in v6.
 *
 * The tokens: one indigo accent, slate neutrals, soft corners. The same
 * values are CSS variables in globals.css, for inline styles that antd
 * tokens cannot reach.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ConfigProvider
      theme={{
        algorithm: theme.defaultAlgorithm,
        token: {
          colorPrimary: "#4f46e5",
          colorInfo: "#4f46e5",
          colorError: "#dc2626",
          colorSuccess: "#16a34a",
          colorWarning: "#d97706",
          colorText: "#0f172a",
          colorTextSecondary: "#64748b",
          colorBorder: "#e2e8f0",
          colorBorderSecondary: "#edf0f5",
          borderRadius: 10,
          borderRadiusLG: 14,
          fontFamily:
            'var(--font-sans), -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        },
        components: {
          Button: {
            controlHeight: 34,
            fontWeight: 500,
            primaryShadow: "0 6px 16px -8px rgba(79, 70, 229, 0.65)",
          },
          Select: { controlHeight: 34 },
          Segmented: { itemSelectedColor: "#4f46e5" },
          Modal: { titleFontSize: 17 },
          Table: { headerBg: "#f8fafc", headerColor: "#64748b", rowHoverBg: "#f8fafc" },
          Card: { headerFontSize: 15 },
        },
      }}
    >
      <App>{children}</App>
    </ConfigProvider>
  );
}
