# EventHub Workspace Map

This document maps the repository structure, explains each directory, highlights key files, and captures setup and extension guidance for contributors.

## EventHub at a Glance

EventHub is a full-stack TypeScript platform for event discovery, ticket booking, sponsorship collaboration, and community engagement.

- Frontend: React + Vite + Tailwind
- Backend: Express + WebSocket
- Database (current): SQLite via better-sqlite3
- Target production path: PostgreSQL + Redis + object storage

## Overall System Design Architecture

The platform currently runs as a modular monolith on a single Express backend and SQLite database, with role-gated APIs and WebSocket-based real-time notifications/community updates.

Implementation accuracy notes:

- Current DB runtime is one SQLite file with multiple domain tables, not separate physical databases.
- Current real-time transport is WebSocket for notifications and community messaging.
- Payments API, external Maps provider API, and Email/SMS provider are roadmap integrations and are not fully wired in the current backend routes.

### 1. System Flow (End-to-End)

```mermaid
flowchart TD

%% CLIENT LAYER
A[Client App Student / Host / Sponsor / Admin]

%% ENTRY
A --> B[Express API Backend]

%% AUTH
B --> C[Auth Middleware JWT]
C --> D{Role Check}

%% ROLE ROUTING
D -->|Student| E[Booking and Waitlist Module]
D -->|Host| F[Event Module]
D -->|Sponsor| G[Sponsorship Module]
D -->|Admin| H[Admin Moderation Module]

%% CORE SERVICES
F --> I[(SQLite DB Events and Related Tables)]
E --> I
G --> I
H --> I

%% CROSS-MODULE
F --> G
E --> F

%% MESSAGING
G --> L[Deal and Community Messaging]
L --> I

%% NOTIFICATIONS
E --> N[Notification Module]
F --> N
G --> N
N --> I

%% REAL-TIME + CACHE
B --> W[WebSocket Server ws]
B --> P[(In-memory Analytics Cache)]

%% PLANNED EXTERNAL INTEGRATIONS
B -. planned .-> Q[Payments API]
B -. planned .-> R[Maps Provider API]
B -. planned .-> S[Email or SMS Service]
```

### 2. Detailed Role Interaction Flow

```mermaid
flowchart LR

Student -->|Browse Events| EventService
Student -->|Book Ticket| BookingService
Student -->|Join Waitlist| BookingService

Host -->|Create or Update Event| EventService
Host -->|Manage Attendees and Check-ins| BookingService
Host -->|Create Sponsor Requests and Spots| SponsorshipService

Sponsor -->|View Sponsorship Opportunities| SponsorshipService
Sponsor -->|Submit Request or Bid| SponsorshipService
Sponsor -->|Negotiate Deals| SponsorshipService

Admin -->|Approve or Moderate Events| EventService
Admin -->|Moderate Reports| AdminService
Admin -->|Review Sponsorship Requests| SponsorshipService

EventService --> DB1[(Events Domain Tables)]
BookingService --> DB2[(Bookings and Waitlist Tables)]
SponsorshipService --> DB3[(Sponsorship Tables)]
AdminService --> DB1
AdminService --> DB3

DB1 -. same sqlite runtime .- DB2
DB2 -. same sqlite runtime .- DB3
```

### 3. Sponsorship and Bidding Workflow

```mermaid
sequenceDiagram

participant Sponsor
participant Backend
participant SponsorshipService
participant Host
participant DB

Sponsor->>Backend: View sponsorship requests or spots
Backend->>SponsorshipService: Fetch opportunities
SponsorshipService->>DB: Query sponsorship tables
DB-->>SponsorshipService: Opportunities list
SponsorshipService-->>Backend: Response
Backend-->>Sponsor: Display opportunities

Sponsor->>Backend: Submit request or bid
Backend->>SponsorshipService: Create request or bid
SponsorshipService->>DB: Store request or bid

Host->>Backend: View incoming requests
Backend->>SponsorshipService: Fetch incoming queue
SponsorshipService->>DB: Query pending requests
DB-->>SponsorshipService: Request list
SponsorshipService-->>Host: Request list

Host->>Backend: Accept or reject
Backend->>SponsorshipService: Update request and deal
SponsorshipService->>DB: Persist status and deal row

SponsorshipService->>Backend: Trigger notification
Backend-->>Sponsor: Notify result
```

### 4. Messaging (Real-Time)

```mermaid
sequenceDiagram

participant UserA as Sponsor or Host
participant WS as WebSocket
participant Backend
participant DB as SQLite
participant UserB as Other Participant

UserA->>WS: Send real-time message or event update
WS->>Backend: Forward payload
Backend->>DB: Persist notification or community message
Backend->>UserB: Deliver live update

UserB->>WS: Reply
WS->>Backend: Forward payload
Backend->>DB: Persist reply
Backend->>UserA: Deliver live update
```

### 5. RBAC (Authorization Flow)

```mermaid
flowchart TD

A[Incoming Request] --> B[JWT Authentication]

B --> C{Valid Token}

C -->|No| D[Reject Request 401]
C -->|Yes| E[Extract User Role]

E --> F{Check Role Permissions}

F -->|Allowed| G[Proceed to Route Handler]
F -->|Denied| H[Return 403 Forbidden]

G --> I[Service Logic]
I --> J[Database Access]
```

### How to Use These Diagrams

- Use Diagram 1 in architecture presentations for complete system flow.
- Use Diagram 2 to explain what each role can do in the product.
- Use Diagram 3 to highlight the sponsorship negotiation differentiator.
- Use Diagram 4 to explain real-time collaboration behavior.
- Use Diagram 5 for backend security and interview discussions.

## Architecture & Research Documents

Detailed design, workflows, market analysis, scalability, compliance, and IEEE-style synthesis are documented in the EVENT-HUB-PAPERS folder.

- Location: EVENT-HUB-PAPERS/
- Key files:
  - 01-system-architecture.md
  - 02-role-based-design.md
  - 03-feature-design.md
  - 04-technical-architecture.md
  - 05-workflows-and-business-logic.md
  - 06-market-analysis-and-differentiation.md
  - 07-scalability-and-devops.md
  - 08-security-and-compliance.md
  - 09-go-to-market-and-roi.md
  - 10-ieee-research-paper.md

## Table of Contents

1. [EventHub at a Glance](#eventhub-at-a-glance)
2. [Overall System Design Architecture](#overall-system-design-architecture)
3. [Architecture & Research Documents](#architecture--research-documents)
4. [Project Snapshot](#project-snapshot)
5. [Hierarchy Tree](#hierarchy-tree)
6. [Directory Dependency Map](#directory-dependency-map)
7. [Directory Reference](#directory-reference)
8. [Setup and Environment Requirements](#setup-and-environment-requirements)
9. [Workflow Notes](#workflow-notes)
10. [Best Practices for Contributing and Extending](#best-practices-for-contributing-and-extending)

## Project Snapshot

- Project type: Full-stack TypeScript monolith
- Frontend: React + Vite + Tailwind
- Backend: Express + WebSocket
- Database: SQLite via better-sqlite3
- Runtime default URL: http://localhost:3000

## Hierarchy Tree

Notes:

- This tree includes all project-visible top-level directories and the full project-owned source/config files.
- Tool-managed directories are listed but not deeply expanded to keep documentation usable.

```text
event-hub/
|-- .git/                        # Git metadata (tool-managed)
|-- dist/                        # Production build output (generated)
|   |-- assets/
|   |-- icon-192.svg
|   |-- icon-512.svg
|   |-- index.html
|   |-- manifest.webmanifest
|   |-- sw.js
|   |-- uploads/
|   `-- workbox-78ef5c9b.js
|-- node_modules/                # Installed dependencies (tool-managed)
|-- public/                      # Static public assets
|   |-- icon-192.svg
|   |-- icon-512.svg
|   `-- uploads/
|-- scripts/                     # Utility script folder (currently empty)
|-- src/                         # Frontend source
|   |-- App.tsx
|   |-- index.css
|   |-- main.tsx
|   |-- types.ts
|   `-- vite-env.d.ts
|-- .env.example
|-- .gitignore
|-- db.ts
|-- events.db
|-- index.html
|-- metadata.json
|-- package-lock.json
|-- package.json
|-- README.md
|-- server.ts
|-- tsconfig.json
`-- vite.config.ts
```

## Directory Dependency Map

| Source Directory/File | Depends On                      | Why It Depends On                                                                |
| --------------------- | ------------------------------- | -------------------------------------------------------------------------------- |
| src/                  | server.ts API routes            | Frontend fetches data, performs auth, bookings, sponsorship, notifications, etc. |
| src/main.tsx          | vite-plugin-pwa output          | Registers service worker and enables PWA behavior.                               |
| src/App.tsx           | src/types.ts                    | Uses shared interfaces for typed UI state and API payloads.                      |
| server.ts             | db.ts                           | Imports DB connection and queries SQLite tables.                                 |
| server.ts             | public/uploads                  | Serves uploaded files and stores upload paths.                                   |
| server.ts (prod mode) | dist/                           | Serves built frontend assets in production.                                      |
| db.ts                 | events.db                       | Initializes and migrates runtime database schema.                                |
| vite.config.ts        | public/ icons                   | Uses icon files in generated web manifest.                                       |
| package.json scripts  | server.ts, vite.config.ts, src/ | Drives dev/build/preview/start workflows.                                        |

## Directory Reference

### Root Directory: event-hub/

Name and Purpose:

- Repository root containing runtime entrypoints, build configs, and database/runtime artifacts.

Key Files:

| File              | Role                                                          |
| ----------------- | ------------------------------------------------------------- |
| package.json      | Project scripts and dependency declarations.                  |
| package-lock.json | Locked dependency versions for reproducible installs.         |
| server.ts         | Express API server, middleware, uploads, and WebSocket logic. |
| db.ts             | SQLite schema creation, additive migrations, and seed data.   |
| events.db         | Runtime SQLite DB file used by the backend.                   |
| tsconfig.json     | TypeScript compiler behavior for project code.                |
| vite.config.ts    | Vite, React, Tailwind, and PWA configuration.                 |
| index.html        | Frontend HTML entry shell for Vite app.                       |
| .env.example      | Environment variable template.                                |
| metadata.json     | App metadata descriptor.                                      |
| .gitignore        | Exclusion rules for git-tracked files.                        |

Dependencies:

- Root runtime starts through server.ts, which uses db.ts and serves frontend assets from dist/ or Vite middleware.
- Frontend build and dev behavior is governed by package.json scripts + vite.config.ts + tsconfig.json.

Usage Notes:

- Keep backend bound to localhost:3000 for current architecture expectations.
- Treat events.db as local runtime data; schema source of truth stays in db.ts.
- Use npm scripts from package.json rather than ad-hoc start commands.

### Directory: src/

Name and Purpose:

- Frontend React application source code.

Key Files:

| File              | Role                                                                         |
| ----------------- | ---------------------------------------------------------------------------- |
| src/main.tsx      | React bootstrap; mounts app and registers PWA SW.                            |
| src/App.tsx       | Main SPA composition: routes, views, fetch calls, role-gated UI, dashboards. |
| src/types.ts      | Shared TS interfaces for domain models and API data.                         |
| src/index.css     | Global styles, Tailwind-driven styling, app-level tokens/utilities.          |
| src/vite-env.d.ts | Type declarations for Vite client environment.                               |

Dependencies:

- Consumes backend endpoints from server.ts.
- Uses PWA assets generated/configured via vite.config.ts.
- Depends on dependency graph declared in package.json.

Usage Notes:

- App.tsx is monolithic; when extending features, prefer extracting feature modules/components.
- Keep types.ts synchronized with backend payload changes to avoid runtime mismatch.

### Directory: public/

Name and Purpose:

- Static files served directly by Vite/dev server and copied into production output.

Key Files:

| File                | Role                                              |
| ------------------- | ------------------------------------------------- |
| public/icon-192.svg | PWA app icon, 192px variant.                      |
| public/icon-512.svg | PWA app icon, 512px variant.                      |
| public/uploads/     | Filesystem target for uploaded user/event images. |

Dependencies:

- vite.config.ts references icons for manifest generation.
- server.ts serves upload assets and writes uploaded files here.

Usage Notes:

- Ensure write permission exists for public/uploads in local and deployed environments.

### Directory: public/uploads/

Name and Purpose:

- Runtime storage for uploaded assets.

Key Files:

- No source-controlled key files by default; content is runtime-generated.

Dependencies:

- Populated by multer storage in server.ts.
- Paths are stored in DB rows and rendered by frontend.

Usage Notes:

- Add retention/cleanup policy if storage growth becomes a concern.

### Directory: dist/

Name and Purpose:

- Generated production build output from Vite.

Key Files:

| File/Folder               | Role                                                  |
| ------------------------- | ----------------------------------------------------- |
| dist/index.html           | Built frontend entrypoint used in production serving. |
| dist/assets/              | Bundled and hashed JS/CSS assets.                     |
| dist/sw.js                | Service worker generated for PWA support.             |
| dist/manifest.webmanifest | Web app manifest consumed by browsers.                |
| dist/workbox-\*.js        | Workbox runtime chunk for caching strategy.           |
| dist/uploads/             | Copied upload/static folder in build output context.  |

Dependencies:

- Produced by npm run build.
- Served by server.ts in production mode.

Usage Notes:

- Do not edit dist files manually; regenerate via build script.

### Directory: scripts/

Name and Purpose:

- Reserved space for operational and maintenance scripts.

Key Files:

- Currently empty.

Dependencies:

- Optional; typically used to automate DB tasks, migrations, or maintenance commands.

Usage Notes:

- Keep scripts idempotent and document expected side effects.

### Directory: node_modules/

Name and Purpose:

- Installed npm packages.

Key Files:

- Tool-managed dependency contents; no manual edits.

Dependencies:

- Populated from package.json and package-lock.json using npm install.

Usage Notes:

- Never hand-edit files here.
- Reinstall instead of patching dependency code directly.

### Directory: .git/

Name and Purpose:

- Git repository metadata.

Key Files:

- Internal VCS state (refs, objects, hooks, config snapshots).

Dependencies:

- Used by git CLI tooling and source-control features.

Usage Notes:

- Never modify internals manually unless you are repairing repository state intentionally.

## Setup and Environment Requirements

### Prerequisites

- Node.js 20+ recommended
- npm 10+
- Windows, macOS, or Linux shell

### Environment

Copy values from .env.example and set as needed:

| Variable       | Required | Description                                               |
| -------------- | -------- | --------------------------------------------------------- |
| JWT_SECRET     | Yes      | Secret used for JWT signing/verification in backend auth. |
| GEMINI_API_KEY | Optional | Optional browser-exposed API key use-case.                |
| APP_URL        | Optional | Reserved absolute URL setting.                            |
| DISABLE_HMR    | Optional | Set true to disable Vite HMR in development.              |

### Install

```bash
npm install
```

### Run (Development)

```bash
npm run dev
```

### Build (Production Assets)

```bash
npm run build
```

### Preview Built Frontend

```bash
npm run preview
```

### Start Server

```bash
npm run start
```

### Type Check

```bash
npm run lint
```

## Workflow Notes

- Development entrypoint uses tsx server.ts, so backend and Vite dev behavior are coordinated from one process.
- Backend defaults to port 3000 and hosts API plus frontend.
- SQLite file events.db is local and mutable; keep backups before risky schema experiments.
- Upload handling accepts JPEG/PNG/WEBP with configured size limits in server middleware.
- Role model currently supports student, host, admin, sponsor.

## Best Practices for Contributing and Extending

1. Keep architecture boundaries explicit

- Add backend logic in focused modules instead of growing server.ts further.
- Add frontend pages/components outside App.tsx and compose through routes.

2. Maintain contract consistency

- Update src/types.ts whenever backend response payloads change.
- Prefer explicit response schemas and centralized API helpers.

3. Protect data integrity

- For DB changes, update db.ts migration-safe logic first.
- Use transactions for multi-step writes (bookings, bidding, waitlist promotions).

4. Respect role-based access

- Add authorization checks server-side for all new sensitive routes.
- Treat frontend role gating as UX only, not security.

5. Preserve reproducibility

- Commit package-lock.json with dependency updates.
- Avoid manual edits in dist/, node_modules/, and .git/.

6. Improve maintainability incrementally

- Break large features into dedicated directories (for example src/features/_, server/routes/_).
- Add tests for critical flows before broad refactors.

7. Document changes

- Update this README when adding new directories, build steps, or runtime services.
