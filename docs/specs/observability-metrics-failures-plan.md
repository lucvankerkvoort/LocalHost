# Technical Spec: Observability, Failures, and Product Metrics Baseline (v1)

**Status**: PROPOSED  
**Author**: Architect Agent  
**Date**: 2026-03-01

## 1. Objective
Implement a single, consistent observability baseline that covers:
- runtime failures and release stability (`Bugsnag`)
- product usage and conversion funnels (`Mixpanel`)
- web performance and Core Web Vitals over time (`DebugBear`)

The baseline MUST support production triage, regression detection, and product decision-making without requiring additional tooling in v1.

## 2. Scope
### 2.1 In Scope
- Account provisioning and access setup for `Bugsnag`, `Mixpanel`, and `DebugBear`.
- Environment-specific configuration for `development`, `staging`, and `production`.
- Event taxonomy v1 (named events, required properties, and trigger points).
- Failure and performance alert thresholds.
- Dashboard requirements and ownership.
- Verification requirements and binary acceptance criteria.

### 2.2 Out of Scope
- Replacing existing app business logic.
- Introducing a full APM stack (Datadog/New Relic/OpenTelemetry collectors) in v1.
- Session replay tooling (can be added in v2).
- Custom BI warehouse pipelines.

## 3. Must-Not-Change Contracts
- Existing product flows (signup, trip planning, booking) MUST NOT change behavior because telemetry is added.
- Telemetry failures MUST NOT block rendering, API responses, or user actions.
- Existing route structure in `src/app/` MUST NOT be changed as part of this implementation.

## 4. Non-Negotiable Invariants
### 4.1 Correlation Invariant
Every telemetry payload MUST include:
- `environment` (`development` | `staging` | `production`)
- `release` (commit SHA or immutable build identifier)
- `session_id`
- one of `user_id` or `anonymous_id`
- `timestamp`

### 4.2 Event Schema Invariant
- Event names MUST be snake_case and stable after release.
- Required properties for each event MUST always be present (null allowed only where specified).
- `event_version` MUST be included and set to `1` for v1.

### 4.3 PII Invariant
The following raw values MUST NOT be sent to Mixpanel or Bugsnag metadata:
- email addresses
- phone numbers
- free-form chat message bodies
- payment method details

Allowed identifiers:
- internal UUIDs (`user_id`, `trip_id`, `booking_id`, `host_id`, `experience_id`)

### 4.4 Reliability Invariant
- Browser and API error reporting MUST include `release` and `environment`.
- Source maps MUST be uploaded for production builds before deployment is marked complete.

## 5. Required Account Signups and Access
Create or confirm the following accounts before implementation starts.

| Service | Signup URL | Required Artifacts | Owner Role Required | Blocking |
|---|---|---|---|---|
| Bugsnag | `https://www.bugsnag.com/` | Org, Project `localhost-web`, Project `localhost-api`, project API keys, alert integration | Engineering owner/admin | Yes |
| Mixpanel | `https://mixpanel.com/` | Org, Project `localhost`, project token, dashboard access | Product + engineering owner/admin | Yes |
| DebugBear | `https://www.debugbear.com/` | Project `localhost-web`, monitored URLs, alert channels, API token (if CI integration used) | Engineering owner/admin | Yes |
| Slack (integration target) | Existing workspace | Channels for alerts and service integrations | Workspace admin | Yes |
| Netlify (config target) | Existing team/site | Environment variable access for all deploy contexts | Netlify admin | Yes |
| GitHub (CI secrets) | Existing org/repo | Repository secrets access for source maps and monitor automation | Repo admin | Yes |

## 6. Secrets and Configuration Checklist
The following variables MUST exist before rollout to production.

| Variable | Environment(s) | Purpose |
|---|---|---|
| `NEXT_PUBLIC_APP_ENV` | dev/staging/prod | Environment tag for telemetry |
| `NEXT_PUBLIC_RELEASE` | dev/staging/prod | Release/build identifier |
| `NEXT_PUBLIC_BUGSNAG_API_KEY` | dev/staging/prod | Browser Bugsnag reporting |
| `BUGSNAG_SERVER_API_KEY` | staging/prod | API/server Bugsnag reporting |
| `NEXT_PUBLIC_MIXPANEL_TOKEN` | dev/staging/prod | Browser event tracking |
| `DEBUGBEAR_API_KEY` | CI/staging/prod (if API used) | DebugBear automation/integration |
| `DEBUGBEAR_PROJECT_ID` | CI/staging/prod (if API used) | DebugBear target project |

Configuration storage:
- Netlify environment variables for runtime values.
- GitHub Actions secrets for CI-only values.
- `.env.example` MUST include non-secret placeholders for required keys.

## 7. Event Taxonomy v1 (Mixpanel)
### 7.1 Global Properties (Required for Every Event)
- `event_version` (number, fixed `1`)
- `environment`
- `release`
- `session_id`
- `user_id` or `anonymous_id`
- `page_path`
- `timestamp`

### 7.2 Required Events and Trigger Contracts
| Event Name | Trigger Contract | Required Event-Specific Properties |
|---|---|---|
| `page_view` | On route render/transition once per page load | `referrer_path` |
| `signup_started` | User initiates signup submission | `method` |
| `signup_completed` | Signup flow reaches confirmed authenticated state | `method` |
| `auth_failed` | Signup/signin fails | `method`, `error_code` |
| `trip_create_started` | User starts trip creation flow | `entry_point` |
| `trip_create_completed` | Trip persisted successfully | `trip_id` |
| `itinerary_generate_requested` | User requests AI plan generation | `trip_id`, `prompt_length` |
| `itinerary_generate_completed` | Plan generation success | `trip_id`, `plan_id`, `duration_ms` |
| `itinerary_generate_failed` | Plan generation failure | `trip_id`, `error_code`, `duration_ms` |
| `host_profile_opened` | User opens host detail | `host_id`, `source` |
| `booking_started` | User starts booking/payment flow | `booking_id`, `trip_id`, `experience_id`, `price_cents` |
| `booking_completed` | Booking/payment confirmed | `booking_id`, `trip_id`, `experience_id`, `price_cents` |
| `booking_failed` | Booking attempt fails | `booking_id`, `error_code` |
| `share_clicked` | User clicks share action | `trip_id`, `surface` |

## 8. Failure Monitoring Contract (Bugsnag)
### 8.1 Required Coverage
- Browser runtime exceptions and unhandled promise rejections.
- API route exceptions and explicit reporting of handled fatal errors.
- User context and release metadata on every error report.

### 8.2 Alert Thresholds
Configure alerts with these exact thresholds:
1. `Crash-free sessions < 99.5%` in 60 minutes -> warning.
2. `Crash-free sessions < 99.0%` in 60 minutes -> critical.
3. New error introduced in latest release affecting `>= 20 users` in 30 minutes -> critical.
4. Error occurrence rate for any single issue doubles 7-day baseline -> critical.

## 9. Performance Monitoring Contract (DebugBear)
### 9.1 Monitored Routes (Staging and Production)
- `/`
- `/trips`
- `/experiences`
- `/auth/signup`
- `/auth/signin`

Optional once a stable seeded trip exists:
- `/trips/[tripId]` via a fixed seeded trip URL in staging.

### 9.2 Performance Budgets
1. LCP p75: warning `> 2.5s`, critical `> 4.0s`
2. INP p75: warning `> 200ms`, critical `> 500ms`
3. CLS p75: warning `> 0.10`, critical `> 0.25`

## 10. Dashboard Requirements
### 10.1 Bugsnag Dashboard
- By `release`, `environment`, and top impacted users.
- Include widget for new errors in latest release.

### 10.2 Mixpanel Dashboard
- Funnel 1: `signup_started` -> `signup_completed`
- Funnel 2: `itinerary_generate_requested` -> `itinerary_generate_completed`
- Funnel 3: `booking_started` -> `booking_completed`
- Breakdown by `environment` and `release`.

### 10.3 DebugBear Dashboard
- Trend lines for LCP/INP/CLS.
- Route-level alert history.

## 11. Implementation Phases
### Phase 0: Provisioning
- Create all required accounts.
- Confirm admin access for engineering owner and one backup owner.
- Add all required secrets in Netlify and GitHub.

Exit gate:
- Pass only if all services are accessible and all required keys exist in staging config.

### Phase 1: SDK/Client Wiring
- Initialize Bugsnag client and server reporting.
- Initialize Mixpanel client wrapper with global property injection.
- Add release/environment propagation to telemetry layer.

Exit gate:
- Pass only if test events and test errors are visible in staging across all services.

### Phase 2: Event Instrumentation
- Implement all required v1 events in Section 7 with exact names and required properties.
- Enforce schema validation in tracking wrapper.

Exit gate:
- Pass only if every required event is observed with complete required properties in staging.

### Phase 3: Alerts and Dashboards
- Configure thresholds exactly as defined in Sections 8 and 9.
- Configure Slack alert routing for warnings and critical alerts.

Exit gate:
- Pass only if synthetic test alerts are delivered to Slack channels.

### Phase 4: Production Rollout
- Deploy with source maps and release tags.
- Verify production telemetry ingestion and dashboards.

Exit gate:
- Pass only if all acceptance criteria in Section 13 pass.

## 12. Test Requirements
### 12.1 Unit Tests (Required)
- Tracking wrapper injects all global properties.
- Missing required event-specific properties are rejected.
- Telemetry calls do not throw when provider SDK is unavailable.

### 12.2 Integration Tests (Required)
- Browser error reporting includes `release` and `environment`.
- API error reporting includes request correlation metadata.

### 12.3 Playwright Coverage (Required for User-Visible Flows)
- Signup flow emits `signup_started` and `signup_completed`.
- Trip generation flow emits `itinerary_generate_requested` and completion/failure event.
- Booking flow emits `booking_started` and completion/failure event.

### 12.4 Manual Verification (Required)
- Trigger test browser error and confirm Bugsnag issue ingestion.
- Trigger one event per required Mixpanel event and confirm Live View ingestion.
- Confirm DebugBear monitors run for each required route.

## 13. Binary Acceptance Criteria (Pass/Fail)
1. All required accounts in Section 5 are provisioned and accessible to the named owners.
2. All required secrets in Section 6 are configured in staging and production.
3. All required events in Section 7 are emitted with required properties and `event_version=1`.
4. No prohibited PII (Section 4.3) appears in sampled telemetry payloads.
5. Bugsnag alerts configured exactly to Section 8 thresholds and verified with a test incident.
6. DebugBear monitors and budgets configured exactly to Section 9 and verified with at least one completed run per route.
7. Required unit, integration, and Playwright tests in Section 12 pass in CI.
8. Source maps are uploaded for production release before rollout completion.

If any criterion fails, rollout is incomplete.

