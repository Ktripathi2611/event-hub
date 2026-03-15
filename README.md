# EventHub

EventHub is a comprehensive full-stack platform for discovering, hosting, and managing campus events, underground gigs, and tech summits. Built with React (Vite), Express, SQLite, and WebSockets, it provides real-time community messaging, ticketing, and event management features.

## Table of Contents
- [Directory Structure](#directory-structure)
- [Directory Explanations & Key Files](#directory-explanations--key-files)
- [Dependencies & Architecture](#dependencies--architecture)
- [Usage Notes & Setup](#usage-notes--setup)
- [Best Practices & Contributing](#best-practices--contributing)

## Directory Structure

```text
event-hub/
├── public/                 # Static assets and user uploads
│   └── uploads/            # Auto-generated directory for uploaded event/profile images
├── src/                    # Frontend React application source code
│   ├── App.tsx             # Main React component containing routes, pages, and UI logic
│   ├── index.css           # Global Tailwind CSS and custom design system styles
│   ├── main.tsx            # React application entry point
│   └── types.ts            # TypeScript interfaces for shared data models (User, Event, etc.)
├── .env.example            # Environment variables template
├── .gitignore              # Git ignored files and directories
├── db.ts                   # Database configuration, schema definitions, and seeding logic
├── events.db               # SQLite database file (generated on runtime)
├── index.html              # Base HTML template for the Vite React app
├── package.json            # Project dependencies, metadata, and npm scripts
├── server.ts               # Express backend server and WebSocket implementation
├── tsconfig.json           # TypeScript compiler configuration
└── vite.config.ts          # Vite bundler configuration
```

## Directory Explanations & Key Files

### Root Directory
The root directory orchestrates the full-stack setup, acting as the bridge between the backend Node.js environment and the frontend Vite build tool.

| File | Purpose |
|------|---------|
| `server.ts` | **Backend Entry Point**: Configures the Express server. Handles REST API routes for authentication, event management, ticketing, and communities. Sets up a WebSocket server for real-time chat. |
| `db.ts` | **Database Initialization**: Connects to `better-sqlite3` and provisions the schema (Users, Events, Bookings, Communities). Triggers initial seed data for easy development testing. |
| `package.json` | Defines npm scripts (e.g., `npm run dev`) and lists dependencies like `express`, `better-sqlite3`, `react`, and `tailwindcss`. |
| `vite.config.ts` | Configures Vite, including React plugins, to build the frontend. |

### `src/`
**Purpose:** Contains the entire frontend presentation layer, built with React, React Router, and Tailwind CSS.

| File | Purpose |
|------|---------|
| `App.tsx` | Contains the core frontend layout (Navbar), React Router definitions, and monolithic page components (Home, Events, Profile, Admin/Host Dashboards). |
| `index.css` | The main stylesheet integrating Tailwind directives alongside specialized custom "luxury" design variables (`btn-luxury`, `glass`). |
| `types.ts` | Centralized TypeScript models ensuring type safety between the frontend UI and the data structures returned by the Express API. |

### `public/`
**Purpose:** Stores assets that must remain statically accessible to the browser, bypassing the Vite bundler.

- **`uploads/`**: A dynamically utilized folder where the backend `multer` middleware saves images uploaded by hosts or users.

## Dependencies & Architecture

- **Frontend -> Backend**: The React frontend (served via Vite during development) makes HTTP requests to the Express server defining the REST API.
- **WebSocket Connection**: The `server.ts` leverages `ws` mapped to individual `communityId`s to push real-time chat messages to the frontend.
- **Database Layer**: The Express APIs directly query `events.db` using synchronous SQL queries powered by `better-sqlite3` initialized inside `db.ts`.
- **File Storage**: User and Event picture uploads are handled by `multer` in `server.ts` and saved locally to `public/uploads/`, which is served statically by Express.

## Usage Notes & Setup

### Prerequisites
- Node.js (v18 or higher recommended)
- `npm` package manager

### Standard Setup Workflow
1. **Install Dependencies:**
   ```bash
   npm install
   ```
2. **Environment Variables:**
   Copy the example config and adjust as necessary:
   ```bash
   cp .env.example .env
   ```
3. **Run the Development Server:**
   Start both the frontend and backend concurrently via `tsx`:
   ```bash
   npm run dev
   ```
   The server will launch with Vite middleware handling the frontend, available by default at `http://localhost:3000`.

### Development Tips
- **Database Seeding**: On the first start, `db.ts` will securely generate `events.db` and pre-fill it with test accounts (e.g., `admin@eventhub.com`, `host@eventhub.com`).
- **Styles**: We use TailwindCSS. When creating new components, stick to the utility classes and the custom theme variables configured in `index.css`.

## Best Practices & Contributing

- **Component Organization**: Consider refactoring the current `src/App.tsx` file by modularizing specific pages (e.g., Home, Dashboard) and components into dedicated subdirectories like `src/components/` and `src/pages/` as the project scales.
- **Database Migrations**: Currently, `db.ts` uses `CREATE TABLE IF NOT EXISTS`. When extending the schema, consider introducing an explicit migration tool if data persistence becomes critical.
- **Type Safety**: Always update `src/types.ts` when altering table schemas in `db.ts` to ensure frontend interfaces remain synchronized with backend data.
- **Extending the API**: Add new REST endpoints in `server.ts` under the appropriate domain comments (e.g., `// Events`, `// Auth`).
