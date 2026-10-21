export type PayrollInput = {
  basicSalary: number;
  allowances?: number;
  bonuses?: number;
  overtimeHours?: number;
  overtimeRate?: number;
  unpaidLeaveDays?: number;
  workingDays?: number;
  otherDeductions?: number;
};

export type PayrollCalculation = {
  basicSalary: number;
  allowances: number;
  bonuses: number;
  overtime: number;
  grossPay: number;
  unpaidLeaveDeduction: number;
  otherDeductions: number;
  totalDeductions: number;
  netPay: number;
};

const money = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100;
const nonNegative = (value = 0) =>
  Math.max(0, Number.isFinite(value) ? value : 0);

export function calculatePayroll(input: PayrollInput): PayrollCalculation {
  const basicSalary = money(nonNegative(input.basicSalary));
  const allowances = money(nonNegative(input.allowances));
  const bonuses = money(nonNegative(input.bonuses));
  const overtime = money(
    nonNegative(input.overtimeHours) * nonNegative(input.overtimeRate),
  );
  const workingDays = Math.max(
    1,
    Math.floor(nonNegative(input.workingDays ?? 22)),
  );
  const unpaidLeaveDeduction = money(
    (basicSalary / workingDays) * nonNegative(input.unpaidLeaveDays),
  );
  const grossPay = money(basicSalary + allowances + bonuses + overtime);
  const otherDeductions = money(nonNegative(input.otherDeductions));
  const totalDeductions = money(
    unpaidLeaveDeduction + otherDeductions,
  );
  return {
    basicSalary,
    allowances,
    bonuses,
    overtime,
    grossPay,
    unpaidLeaveDeduction,
    otherDeductions,
    totalDeductions,
    netPay: money(Math.max(0, grossPay - totalDeductions)),
  };
}

export function payrollVariance(current: number, previous: number) {
  const amount = money(current - previous);
  return {
    amount,
    percentage: previous === 0 ? null : money((amount / previous) * 100),
  };
}

export function canTransitionPayroll(from: string, to: string) {
  const transitions: Record<string, string[]> = {
    DRAFT: ["AWAITING_APPROVAL"],
    AWAITING_APPROVAL: ["DRAFT", "APPROVED", "REJECTED"],
    REJECTED: ["DRAFT"],
    APPROVED: ["LOCKED"],
    LOCKED: ["PAID"],
    PAID: [],
  };
  return transitions[from]?.includes(to) ?? false;
}
