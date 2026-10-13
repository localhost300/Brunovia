export type UserRole = "SUPER_ADMIN" | "HR_MANAGER" | "MANAGER" | "EMPLOYEE";
export interface AppUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}
export type AttendanceStatus =
  "PRESENT" | "LATE" | "ABSENT" | "EARLY_DEPARTURE" | "OVERTIME";
export type LeaveStatus =
  "PENDING_MANAGER" | "PENDING_HR" | "APPROVED" | "REJECTED" | "CANCELLED";
export interface Employee {
  id: string;
  employee_id: string;
  user_id: string | null;
  department_id: string | null;
  manager_id: string | null;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  position: string;
  employment_type: string;
  employment_date: string;
  status: string;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}
export interface AttendanceRecord {
  id: string;
  employee_id: string;
  shift_id: string;
  work_date: string;
  clock_in: string | null;
  clock_out: string | null;
  location: string | null;
  device_id: string | null;
  status: AttendanceStatus;
  created_at: string;
}
export type FinanceTransactionType = "INCOME" | "EXPENSE";
export type FinanceTransactionStatus = "DRAFT" | "PENDING" | "APPROVED" | "REJECTED" | "VOID";
export interface FinanceTransaction {
  id: string;
  reference: string;
  transaction_date: string;
  transaction_type: FinanceTransactionType;
  category_id: string;
  description: string;
  amount: number;
  status: FinanceTransactionStatus;
  created_by: string;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
}
