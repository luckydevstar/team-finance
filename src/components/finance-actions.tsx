"use client";

import { PlusOutlined } from "@ant-design/icons";
import { Button } from "antd";
import dayjs from "dayjs";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { draftFrom, TransactionDialog } from "@/components/transaction-dialog";
import { currentMonth, monthKey, monthRange, type Month } from "@/lib/month";
import type { Member } from "@/lib/types";

/**
 * An admin's Add transaction, on both pages. A new transaction is
 * dated today when the page shows the current month, otherwise the month's
 * first day — the 20th of the month before.
 */
export function FinanceActions({ month, members }: { month: Month | null; members: Member[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState<number | null>(null);

  const isThisMonth = !month || monthKey(month) === monthKey(currentMonth());
  const defaultDate = isThisMonth ? dayjs() : dayjs(monthRange(month!).from);

  return (
    <>
      <Button type="primary" icon={<PlusOutlined />} onClick={() => setAdding(Date.now())}>
        Add transaction
      </Button>
      {adding !== null && (
        <TransactionDialog
          key={adding}
          open
          initial={draftFrom(null, defaultDate)}
          members={members}
          onClose={(saved) => {
            setAdding(null);
            if (saved) router.refresh();
          }}
        />
      )}
    </>
  );
}
