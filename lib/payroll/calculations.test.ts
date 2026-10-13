import { describe, expect, it } from "vitest";
import {
  calculatePayroll,
  canTransitionPayroll,
  payrollVariance,
} from "./calculations";

describe("calculatePayroll", () => {
  it("calculates earnings and deductions deterministically", () => {
    expect(
      calculatePayroll({
        basicSalary: 220_000,
        allowances: 30_000,
        overtimeHours: 5,
        overtimeRate: 2_000,
        unpaidLeaveDays: 1,
        workingDays: 22,
        taxRate: 0.075,
        pensionRate: 0.08,
        otherDeductions: 2_500,
      }),
    ).toEqual({
      basicSalary: 220_000,
      allowances: 30_000,
      bonuses: 0,
      overtime: 10_000,
      grossPay: 260_000,
      tax: 19_500,
      pension: 17_600,
      unpaidLeaveDeduction: 10_000,
      otherDeductions: 2_500,
      totalDeductions: 49_600,
      netPay: 210_400,
    });
  });
  it("never produces a negative payment", () =>
    expect(
      calculatePayroll({ basicSalary: 100, otherDeductions: 500 }).netPay,
    ).toBe(0));
});

describe("payroll governance", () => {
  it("calculates period variance", () =>
    expect(payrollVariance(110, 100)).toEqual({ amount: 10, percentage: 10 }));
  it("requires approval before locking", () => {
    expect(canTransitionPayroll("DRAFT", "APPROVED")).toBe(false);
    expect(canTransitionPayroll("APPROVED", "LOCKED")).toBe(true);
    expect(canTransitionPayroll("LOCKED", "DRAFT")).toBe(false);
  });
});
