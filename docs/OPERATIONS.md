# Production operations

- Liveness: `GET /api/health/live` confirms the web process responds.
- Readiness: `GET /api/health/ready` verifies Supabase Auth reachability with a three-second timeout.
- Logs are structured JSON and include environment, service, level, time, and error context. Forward stdout/stderr to the hosting provider and alert on readiness failures, HTTP 5xx rates, dead-letter growth, and critical security events.
- The built-in API limiter is a per-instance safety net. Configure distributed rate limiting at the CDN/API gateway for production because serverless instances do not share memory.
- Deploy first to staging, apply migrations there, run unit/build/E2E checks, verify backup restoration, and require approval before production promotion.
- Roll back application releases through the hosting provider. Roll database changes forward with compensating migrations as described in the disaster-recovery guide.
