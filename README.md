# PeopleFlow

A production-oriented workforce management PWA built with Next.js App Router, TypeScript, Tailwind CSS, Supabase, Recharts, React Hook Form, and Zod.

## Included

- Premium responsive dashboard shell with light/dark modes and collapsible navigation
- Shareable, browser-history-aware module URLs such as `/employees`, `/payroll`, and `/reports`
- Lazy-loaded operational workspaces so the initial dashboard does not eagerly load every module
- Organization membership switching with tenant-scoped roles and active-membership validation
- Enterprise identity administration with invitations, membership suspension, last-admin protection, MFA/session/domain policy, and SSO configuration readiness
- Compliance and observability workspace with append-only audit evidence, security-event triage, retention/legal-hold controls, evidence exports, and service-health history
- Durable background jobs with exponential retry, dead-letter recovery, scheduled report dispatch, invitation delivery, signed outbound webhooks, and administrator monitoring
- Liveness/readiness probes, request correlation, API safety limiting, structured operational logs, verified-backup tooling, disaster-recovery guidance, and desktop/mobile critical-flow tests
- Validated authentication UI and Supabase browser client architecture
- Workforce analytics, searchable employee directory, employee creation workflow
- Real-time-ready biometric attendance UI and leave approval workflow
- Fingerprint enrollment during employee onboarding and fingerprint-verified clock-in/out
- Independent daily attendance records for Morning and Evening shifts
- Verified attendance event RPC with duplicate-event protection and audit logging
- Policy-aware leave balances, overlap validation, holidays, and manager-to-HR approvals
- Automatically alternating weekly Morning/Evening rosters with manager overrides
- Individual fingerprint clock-in/clock-out: each scan identifies the employee, then opens or closes only that employee's shift record
- Payroll creation workflow with attendance/leave sync, calculations, preview, and approval submission
- Versioned payroll runs with compensation snapshots, four-eyes approval, immutable locks, variance reporting, secure payslips, and bank exports
- Role-controlled manual salary deductions and automatic late-arrival penalties with audit logging
- Page-based KPI creation, employee scorecards, manager reviews, and performance analytics
- Dedicated recognition, report generation, and organization/security settings workflows
- Private one-vote-per-employee recognition elections with admin-only result publication
- Functional module workspaces for shifts, performance, recognition, payroll, recruitment, training, assets, announcements, reports, and settings
- Auditable recruitment pipeline with interviews, evaluations, offers, hire conversion, and generated onboarding checklists
- KPI assignment and review lifecycle with employee acknowledgement and development plans
- Training catalogue, staff assignments, completion scores, certificate storage, and renewal tracking
- Asset inventory with auditable custody transfers, returns, condition, and maintenance history
- Scheduled, audience-targeted announcements with acknowledgement tracking
- Authorized workforce reporting with queued exports, saved definitions, schedules, private downloads, and audit history
- Installable PWA manifest, offline caching service worker, and push-ready event handler
- PostgreSQL schema, indexes, constraints, RLS policies, Realtime publication, and seed data

## Setup

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env.local` and add your Supabase project URL and anon key.
3. Apply every SQL file in `supabase/migrations` in numeric order (`001` through the latest migration), then run `supabase/seed.sql`. Prefer the Supabase CLI so migration history is repeatable.
4. Start locally with `npm run dev`.

## Verification

- `npm run lint` checks the application with the Next.js ESLint rules.
- `npm run test:run` runs the workforce calculation tests once.
- `npm run check` runs lint, strict TypeScript, tests, and a production build.
- `npm run test:e2e` runs critical flows in desktop and mobile Chromium.
- GitHub Actions runs the same quality gate for every push and pull request.

## GitHub push

Run `npm run check:repo` before committing; it rejects generated/private directories, obvious credentials, and individual files larger than 20 MiB. Then run `npm run check`, `git add -A`, review `git status`, commit, and push. Build output, test artifacts, local environment files, backup archives, and TypeScript caches are ignored. Historical commits in this repository still contain an old `.next` directory; removing that history requires a separately coordinated history rewrite and force-push.

Operational procedures are documented in `docs/OPERATIONS.md` and `docs/DISASTER_RECOVERY.md`. The release-candidate workflow validates tagged or manually dispatched builds against the staging environment before an artifact is promoted.

Authentication uses Supabase email/password and restores existing sessions. The application requires `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`; it does not provide local fallback accounts.

The seed file creates reference departments and shifts only. Create authentication users through Supabase Auth; migrations `011` and `013` automatically provision their `public.users` profiles. Promote the first administrator deliberately in SQL, then use the in-app role manager for subsequent assignments.

## Biometric device integration

The browser does not receive raw fingerprint data. A local device gateway communicates with the ZKTeco, Suprema, or Hikvision SDK and returns only an opaque template reference or verification result. Set `NEXT_PUBLIC_BIOMETRIC_GATEWAY_URL` to that gateway. Apply `002_biometrics.sql` to store protected enrollment references.

## Background worker

Migration `028` installs the durable job queue. Deploy `supabase/functions/job-worker`, then configure its server-side `WORKER_SECRET`, `RESEND_API_KEY`, `INVITATION_FROM_EMAIL`, and `APP_URL` secrets. Invoke the function on a short schedule with `Authorization: Bearer <WORKER_SECRET>`. Webhook endpoints store only a secret environment-variable reference; configure the referenced signing secret in the Edge Function environment rather than placing secret material in the database or browser.

## Security notes

RLS is enabled for every sensitive table. Employee records are scoped to self/manager/HR access, payroll is restricted to the employee and HR, and writes require explicit privileged roles. Migration `025` adds organization membership, tenant-specific roles, organization switching, tenant-owned business rows, and restrictive tenant RLS that must pass alongside the existing authorization policies. The Next.js server also emits baseline content-security, framing, referrer, MIME-sniffing, permissions, and opener-isolation headers. Runtime failures display a support reference while retaining detailed logs for operators. Keep the service-role key server-only.
