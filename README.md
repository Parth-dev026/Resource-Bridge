# ResourceBridge

**A resource-sharing and booking platform for educational institutions.**

ResourceBridge helps students and staff discover shared institutional resources, request bookings, manage approvals, and record the condition of resources before and after use.

> **Project status:** Functional MVP deployed for testing. Feature status below reflects the workflows tested during development; deployment and security should be independently verified before production use.

## Live Demo and Repository

- **Live application:** [[Working DEMO model URL]](https://resource-bridge-cdwa.onrender.com)
- **Source code:** https://github.com/Parth-dev026/Resource_Bridge
- **Database:** Supabase (PostgreSQL)
- **Deployment:** Render

## 1. Problem Statement

Educational institutions share resources such as laboratories, equipment, workspaces, and other facilities. Managing access to these resources can become difficult when booking requests, approvals, availability, and usage records are handled separately.

This can lead to scheduling conflicts, unclear resource availability, and limited visibility into the condition or usage history of shared equipment.

## 2. Our Solution

ResourceBridge provides a central platform for managing shared institutional resources.

Students can discover resources and request bookings. Staff can manage resources and approve or reject requests. Supported check-in/check-out and condition-report workflows help track resource usage, while incident reporting and audit history improve operational visibility.

The goal is to make resource sharing more organised, traceable, and reliable.

## 3. Features

### Resource Discovery and Management
- View available institutional resources.
- Add and edit resources through the staff/admin workflow.
- Make resources visible to students.
- Persist resource changes in the database.

### Booking Management
- Request bookings for resources.
- Prevent conflicting bookings for the same resource and time slot.
- View booking status.
- Approve or reject pending requests through the staff/admin workflow.
- Persist booking information and status changes.

### Check-in, Check-out and Condition Reports
- Check in to an approved booking.
- Record resource condition information.
- Complete the check-out workflow.
- Record return-condition information.
- Preserve saved records after refreshing the application.

### Incident Reporting and Audit History
- Report incidents associated with resource usage.
- Preserve submitted incident records.
- Allow staff to review incidents.
- Maintain audit history for supported actions.
- Restrict audit-history access according to the tested role permissions.

### Authentication and Access Control
- Sign in using the configured authentication system.
- Separate student and staff/admin workflows.
- Enforce role restrictions for protected operations.
- Use database access controls to help protect private records.

## 4. User Roles

| Role | Responsibilities |
|---|---|
| Student | Discover resources, request bookings, view booking status, and use supported resource-usage workflows. |
| Staff/Admin | Manage resources, approve or reject bookings, review incidents, and access authorised operational records. |

Available actions depend on the permissions configured for each account.

## 5. Technology Stack

| Technology | Purpose |
|---|---|
| React | User interface |
| TypeScript | Type-safe application development |
| Vite | Frontend development and production build |
| Express.js | Backend API and server-side logic |
| Supabase | Authentication and PostgreSQL database services |
| PostgreSQL | Persistent application data |
| Row Level Security (RLS) | Database-level access restrictions |
| Render | Application hosting and deployment |
| Bun | Dependency installation and application scripts |

## 6. System Architecture

The application follows a client-server architecture.

1. **Frontend:** The React application provides the student and staff/admin interfaces.
2. **Backend:** The Express server handles application requests and database operations.
3. **Authentication:** Supabase authentication verifies user identity.
4. **Database:** PostgreSQL stores users, resources, bookings, incidents, audit events, and platform policy data.
5. **Access control:** Backend checks and database permissions restrict protected operations.
6. **Deployment:** Render hosts the application, while Supabase provides the database and authentication services.

### High-level workflow

```text
Student / Staff
      |
      v
React + TypeScript Frontend
      |
      v
Express Backend
      |
      +---- Authentication and role checks
      |
      v
Supabase / PostgreSQL
      |
      +---- Resources
      +---- Bookings
      +---- Incidents
      +---- Audit Events
      +---- User Profiles
```

The diagram represents the intended application architecture; implementation details should be confirmed against the current source code.

## 7. Testing and Validation

The following workflows have been manually tested and reported as passing during development.

| Test area | Reported result |
|---|---|
| Login | Passed |
| Booking creation | Passed |
| Booking conflict prevention | Passed |
| Booking persistence | Passed |
| Staff approval and rejection | Passed |
| Student-side booking status updates | Passed |
| Resource listing | Passed |
| Adding and editing resources | Passed |
| Resource persistence and student visibility | Passed |
| Check-in and check-out | Passed |
| Condition and return-condition reports | Passed |
| Incident submission and persistence | Passed |
| Staff incident review | Passed |
| Audit history | Passed |
| Audit access control | Passed |
| Production security checklist | Reported verified; not an independent security audit |

These results describe manual testing and are not a substitute for automated tests, independent security testing, or verification by an evaluator.

## 8. Local Setup

### Prerequisites

- Git
- Bun
- A Supabase project
- Node.js if required by your chosen tooling or scripts

### Clone the repository

```bash
git clone https://github.com/Parth-dev026/Resource_Bridge.git
cd Resource_Bridge
```

### Install dependencies

```bash
bun install
```

### Configure environment variables

Create a local `.env` file using the variable names expected by the application.

Example placeholders:

```dotenv
SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVER_ONLY_SECRET
SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_KEY
VITE_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_KEY
```

Replace the placeholders with credentials from your own Supabase project. Never commit `.env` or expose `SUPABASE_SERVICE_ROLE_KEY` to the frontend.

**Security note:** Variables prefixed with `VITE_` may be included in the browser bundle. Only use public client credentials in these variables; never put service-role credentials there.

### Set up the database

Apply the supplied database migration:

`supabase/migrations/20261029000000_resourcebridge_schema.sql`

Use your Supabase SQL tooling or the migration workflow supported by the project. Review the schema, permissions, and policies before applying migrations to an existing production database.

### Build and run

The following commands reflect the current deployment scripts; confirm them against `package.json` if they change.

```bash
bun run build
bun run start
```

If you change environment variables, restart the server. Frontend environment variables generally need to be present when the frontend is built.

## 9. Environment and Deployment

ResourceBridge is deployed using Render and Supabase.

Before deploying a new version:

1. Configure the required environment variables in the hosting provider.
2. Confirm that the backend and frontend point to the same Supabase project.
3. Verify that production mode is enabled and demo mode is disabled.
4. Keep service-role credentials server-side.
5. Confirm that authentication and role checks work in a fresh browser session.
6. Review server logs for configuration and database errors.
7. Test the primary booking workflow after deployment.

Do not publish credentials, personal user information, or private database records in logs, screenshots, or documentation.

## 10. Future Improvements

The following items are proposed improvements, not claims about existing functionality.

### User Experience
- Email invitations and reliable account onboarding.
- Password-reset and account-recovery flows.
- Clearer booking notifications and status updates.
- Better mobile responsiveness and accessibility.

### Resource Operations
- Availability calendars and clearer scheduling views.
- Search, filtering, and resource categorisation.
- Maintenance schedules and temporary resource unavailability.
- QR-based resource identification and check-in.
- Improved condition-report attachments and history.

### Institutional Management
- Organisation and department management.
- Fine-grained permissions for different staff roles.
- Resource utilisation reports and analytics.
- Exportable booking, incident, and audit reports.
- Configurable booking policies and approval rules.

### Reliability and Security
- Automated tests for booking conflicts and permissions.
- Rate limiting and improved input validation.
- Monitoring, backups, and recovery procedures.
- Stronger audit coverage and security reviews.
- Improved production error handling and observability.

### Integrations
- Email or institutional notification integrations.
- Calendar integrations.
- Optional integration with existing campus management systems.

Future work will be prioritised according to user needs, security requirements, and available development time.

## 11. Limitations

- The MVP has been tested through selected manual workflows; broader testing is still needed.
- Email invitations and password recovery should not be considered available unless verified in the deployed application.
- Notifications and external institutional integrations are future improvements unless implemented separately.
- Production readiness requires independent review of authentication, authorisation, database policies, backups, and deployment configuration.
- The application is intended as a resource-management solution; integration with any specific institution's systems depends on future implementation.

## 12. Hackathon Submission Notes

For Code Conqueror India 2026, the final submission should include:

- A working application link.
- The source-code repository.
- The project PDF in the organisers' required format.
- A description of the problem, solution, and primary workflow.
- A list of completed features and known limitations.
- The technology stack and system architecture.
- Testing notes for the main user journeys.
- Future improvements.
- Accurate participant details and each participant's actual contribution.

Disclose the significant AI, low-code, and no-code tools used during development, as required by the organisers. Also disclose any reused templates or earlier code where applicable. Ensure that the development timeline and contribution claims are accurate.

## 13. Project Vision

ResourceBridge aims to help educational institutions use shared resources more effectively by connecting resource discovery, booking, approvals, usage records, and incident reporting in one platform.

The long-term vision is to make institutional resource sharing more transparent, accountable, and easier to manage.

---

**Repository:** https://github.com/Parth-dev026/Resource_Bridge

**Maintainer:** Parth

**Project status:** Functional MVP; ongoing testing and improvement.
