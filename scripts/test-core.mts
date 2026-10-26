/**
 * The pure parts: the split preview (which must agree with the database's),
 * money on screen, and month arithmetic. `npm run test:core`.
 */
import assert from "node:assert/strict";

import { money, signedMoney, splitEvenly } from "../src/lib/money";
import { currentMonth, monthKey, monthLabel, monthOf, monthRange, monthSpan, parseMonth, shiftMonth } from "../src/lib/month";

let passed = 0;
const check = (name: string, fn: () => void) => {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
};

console.log("split");
check("an even split is even", () => assert.deepEqual(splitEvenly(90, 3), [30, 30, 30]));
check("odd cents go to the first members, as the schema does", () =>
  assert.deepEqual(splitEvenly(100, 3), [33.34, 33.33, 33.33]),
);
check("the parts always add up to the whole", () => {
  for (const [amount, count] of [[233.8, 14], [0.05, 3], [1234.56, 7], [10, 6]] as const) {
    const cents = splitEvenly(amount, count).reduce((s, v) => s + Math.round(v * 100), 0);
    assert.equal(cents, Math.round(amount * 100));
  }
});
check("$233.80 between 14 is $16.70 each", () => assert.ok(splitEvenly(233.8, 14).every((v) => v === 16.7)));
check("nothing to split, nothing back", () => {
  assert.deepEqual(splitEvenly(0, 3), []);
  assert.deepEqual(splitEvenly(10, 0), []);
});

console.log("money");
check("dollars with cents and separators", () => assert.equal(money(3476.57), "$3,476.57"));
check("losses with a real minus sign", () => assert.equal(money(-16.7), "−$16.70"));
check("gains signed", () => assert.equal(signedMoney(91841.18), "+$91,841.18"));

console.log("months: the 20th to the 19th, as finance_period() in the schema");
check("Oct 19 is October", () => assert.deepEqual(monthOf("2026-10-19"), { year: 2026, month: 10 }));
check("Oct 20 is November", () => assert.deepEqual(monthOf("2026-10-20"), { year: 2026, month: 11 }));
check("Dec 20 is next January", () => assert.deepEqual(monthOf("2026-12-20"), { year: 2027, month: 1 }));
check("November runs Oct 20 to Nov 19", () => {
  assert.deepEqual(monthRange({ year: 2026, month: 11 }), { from: "2026-10-20", to: "2026-11-20", last: "2026-11-19" });
  assert.equal(monthSpan({ year: 2026, month: 11 }), "Oct 20 – Nov 19");
});
check("January runs Dec 20 to Jan 19", () =>
  assert.deepEqual(monthRange({ year: 2027, month: 1 }), { from: "2026-12-20", to: "2027-01-20", last: "2027-01-19" }),
);
check("today counts by New York's calendar", () => {
  // 03:00 UTC on Oct 20 is still Oct 19 in New York: October.
  assert.deepEqual(currentMonth(new Date("2026-10-20T03:00:00Z")), { year: 2026, month: 10 });
  // Noon on Oct 23 is November's.
  assert.deepEqual(currentMonth(new Date("2026-10-23T16:00:00Z")), { year: 2026, month: 11 });
});
check("reads 2026-10, refuses anything else", () => {
  assert.deepEqual(parseMonth("2026-10"), { year: 2026, month: 10 });
  for (const bad of ["2026-13", "2026-1", "26-10", "", null, "2026-10-01"]) assert.equal(parseMonth(bad), null);
});
check("steps across a year", () => {
  assert.deepEqual(shiftMonth({ year: 2026, month: 12 }, 1), { year: 2027, month: 1 });
  assert.deepEqual(shiftMonth({ year: 2026, month: 1 }, -1), { year: 2025, month: 12 });
});
check("keys and labels", () => {
  assert.equal(monthKey({ year: 2026, month: 3 }), "2026-03");
  assert.equal(monthLabel({ year: 2026, month: 11 }), "November 2026");
});

console.log(`\n✓ ${passed} checks passed`);
