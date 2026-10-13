# PeopleFlow production audit

Audit date: 2026-09-30

## Executive summary

PeopleFlow is a responsive Next.js PWA prototype with a broad PostgreSQL schema, Supabase authentication, row-level security, role-aware navigation, and working database integration for role administration and part of finance. The production build and strict TypeScript check pass.

It is not production-ready yet. Most HR workflows render realistic in-memory sample data and success messages without persisting a business operation. The largest component combines navigation, fixtures, calculations, forms, and nearly every HR workspace in one 3,690-line client file. The next milestone should be a vertical employee-management slice backed by Supabase, followed by attendance and leave—not additional visual modules.

## Current architecture

- Next.js App Router, React 19, TypeScript strict mode, Tailwind CSS.
- Client-rendered single-page workspace selected through component state; only `/` and `/offline` are application pages.
- Supabase email/password authentication and PostgreSQL migrations `001`–`014`.
- Browser-only Supabase access protected by database RLS; there are no API routes or server actions.
- Recharts dashboards, React Hook Form and Zod on login, jsPDF reports, and a service-worker-based PWA shell.
- Roles: `SUPER_ADMIN`, `HR_MANAGER`, `MANAGER`, and `EMPLOYEE`.

## What is working

- Production compilation and TypeScript validation.
- Authentication, session restoration, logout, and automatic public-user profile provisioning.
- Role-specific navigation and a super-admin-only role assignment RPC.
- Finance transaction reads, inserts, approvals, and CSV/PDF export when Supabase is configured.
- Database definitions for employees, attendance, shifts, leave, payroll, performance, recognition, finance, assets, announcements, notifications, audit logs, and biometric references.
- RLS is enabled on sensitive tables, and privileged RPCs contain role or ownership checks.
- Responsive shell, dark mode, offline page, install prompt, and biometric gateway abstraction.

## Critical gaps

### Data integrity and workflows

- Employee directory/profile, leave, attendance, payroll, performance, shifts, recognition, reports, notifications, recruitment, training, assets, announcements, and general settings are primarily demo state.
- Several buttons display success notifications without writing data. These must be marked as demo-only or replaced with real mutations before production.
- Recruitment has no dedicated schema or persisted applicant pipeline.
- Leave balances/policies, employee document storage policies, payslip storage, and notification delivery are incomplete.
- Seed data creates only departments and shifts; it cannot create Supabase Auth identities.

### Architecture

- `components/app-shell.tsx` owns most domain UI and business calculations. Split it by module and move queries/mutations into typed service functions or hooks.
- Module selection is local state rather than routable URLs, preventing deep links, browser history, and route-level code splitting.
- Database types are handwritten and incomplete. Generate them from the deployed Supabase schema in CI.
- There is no server-side authorization boundary. RLS remains mandatory; sensitive exports and future privileged operations should use server-side handlers.

### Security

- RLS needs role-by-role integration tests. Policy presence is not proof of the intended reporting hierarchy.
- Managers currently receive broad access in several policies instead of explicit direct-report scoping.
- Employee documents and receipts need private storage buckets, MIME/size validation, signed URLs, and retention rules.
- Salary details are embedded in demo client code and should be removed once payroll is connected.
- Security-definer functions require explicit execute grants. Migration `014` begins that hardening.
- Audit-log access, immutable retention, and administrator review need an explicit policy and UI.

### Reliability and quality

- No automated unit, integration, RLS, accessibility, or end-to-end test suite exists.
- No lint script or checked-in ESLint configuration exists.
- Most forms do not share a validation schema or consistent pending/error states.
- There are no application-level error boundaries.
- Database errors are often reduced to generic toasts and cannot be correlated operationally.

### Performance and accessibility

- The monolithic client component ships all HR modules together and prevents useful lazy loading.
- Large tables are client-rendered without server pagination or virtualization.
- Multiple compact, one-line JSX sections are difficult to audit and maintain.
- Dialogs need focus trapping, Escape handling, `aria-modal`, and focus restoration.
- Icon-only controls and form labelling require a full keyboard/screen-reader pass.

### Operations

- The repository has no Supabase CLI project configuration, CI workflow, deployment runbook, monitoring, or backup/restore procedure.
- The original README migration step was incomplete; every numbered migration must be applied in order.
- Generated build artifacts were historically tracked. They should be removed from version control in a deliberate cleanup commit now that `.gitignore` excludes them.

## Recommended delivery sequence

1. **Foundation:** link Supabase CLI, generate database types, add CI typecheck/build/lint, add error boundaries, and write RLS tests for all four roles.
2. **Employee vertical slice:** real paginated employee/department queries, create/edit/profile flows, validated document uploads, loading/empty/error states, and audit events.
3. **Attendance and leave:** persist clock events and leave requests, direct-manager approval rules, policy/balance calculations, and notification records.
4. **Payroll:** isolate salary data, implement deterministic calculations with tests, approval/lock workflow, secure payslips, and reconciliation reports.
5. **Performance and shifts:** connect KPIs, reviews, roster generation, and manager scoping.
6. **Recruitment and onboarding:** add jobs, applicants, stages, interviews, evaluations, and an auditable conversion into an employee.
7. **Reporting and operations:** database-backed reports, export authorization, observability, backups, accessibility testing, and performance budgets.

## Definition of the next milestone

The employee-management slice is complete when an authorized HR user can list, search, paginate, create, edit, and deactivate employees against Supabase; an employee can view only their allowed profile data; managers can view only authorized reports; every mutation is validated and audited; and the four-role test matrix passes.
