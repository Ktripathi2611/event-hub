
# 🚀 Event-Hub: Next-Gen Event & Community Platform

Event-Hub is a comprehensive, full-stack application designed to streamline event management, community engagement, and social interaction. Built with a modern tech stack including React, Express, and SQLite, it features real-time messaging, secure booking with QR codes, and AI-powered enhancements.

---

## 📋 Table of Contents
- [Project Overview](#project-overview)
- [Directory Structure](#directory-structure)
- [Key Files & Roles](#key-files--roles)
- [Technology Stack](#technology-stack)
- [Features](#features)
- [Architecture & Workflow](#architecture--workflow)
- [Setup & Installation](#setup--installation)
- [Environment Variables](#environment-variables)
- [Best Practices for Contribution](#best-practices-for-contribution)

---

## 🌟 Project Overview
Event-Hub provides a dual-interface for users: a student/attendee facing platform for discovering and booking events, and a host/admin dashboard for managing event lifecycles, communities, and moderation.

---

## 📂 Directory Structure

```text
event-hub/
├── .env.example           # Template for environment variables
├── .gitignore             # Standard git exclusion list
├── db.ts                  # Database schema & initialization logic
├── events.db              # SQLite database file (persistence layer)
├── index.html             # Main entry point for the SPA
├── package.json           # Project dependencies and scripts
├── server.ts              # Express backend with WebSocket & API logic
├── tsconfig.json          # TypeScript configuration
├── vite.config.ts         # Vite build tool configuration
├── public/                # Static assets
│   └── uploads/           # User-uploaded images (events/profile)
└── src/                   # Frontend source code
    ├── App.tsx            # Main React application logic & routing
    ├── main.tsx           # React entry point
    ├── types.ts           # Shared TypeScript interfaces
    └── index.css          # Global styles & Tailwind directives
```

### Directory Explained
- **Root Directory**: Contains the core configuration files for both the build system (Vite) and the runtime environment (Node.js/Express).
- **`src/`**: Houses the entire frontend application, including UI components, state management, and business logic.
- **`public/uploads/`**: A persistent storage area for dynamic content like event posters and user avatars.

---

## 🛠️ Key Files & Roles

| File | Role | Key Functionality |
| :--- | :--- | :--- |
| `server.ts` | Backend Core | Handles API routes, WebSocket connections, and file uploads. |
| `db.ts` | Data Layer | Defines the SQLite schema, initializes tables, and seeds sample data. |
| `App.tsx` | Frontend Root | Manages application state, routing, and primary UI layout. |
| `types.ts` | Type Safety | Defines unified interfaces for Users, Events, Bookings, and Communities. |
| `vite.config.ts` | Build System | Configures React, Tailwind, and environment variable injection. |

---

## 💻 Technology Stack

### Frontend
- **Framework**: [React 19](https://react.dev/)
- **Build Tool**: [Vite](https://vitejs.dev/)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/)
- **Animations**: [Motion](https://motion.dev/) (Framer Motion)
- **Icons**: [Lucide React](https://lucide.dev/)

### Backend
- **Runtime**: [Node.js](https://nodejs.org/) (via `tsx` in development)
- **Framework**: [Express](https://expressjs.com/)
- **Database**: [SQLite](https://www.sqlite.org/) (via [better-sqlite3](https://github.com/WiseLibs/node-better-sqlite3))
- **Real-time**: [ws](https://github.com/websockets/ws) (WebSocket)
- **File Handling**: [Multer](https://github.com/expressjs/multer)

### AI & Utilities
- **AI Integration**: [@google/genai](https://www.npmjs.com/package/@google/genai) (Gemini AI)
- **QR Codes**: [qrcode](https://www.npmjs.com/package/qrcode)
- **ID Generation**: [uuid](https://www.npmjs.com/package/uuid)

---

## ✨ Features
- **Event Lifecycle**: Create, approve, reject, and manage events with ease.
- **Smart Booking**: Instant booking with automated QR code generation for ticket verification.
- **Community Hubs**: Join professional or social communities, post content, and chat in real-time.
- **Advanced Moderation**: Reporting system for events to ensure a safe environment.
- **Dual Dashboard**: Separate views for Hosts (Event creators) and Admins (Platform moderators).
- **Persistence**: Efficient data storage using a local SQLite database.

---

## 🏗️ Architecture & Workflow

### 1. Data Flow
The application follows a standard Client-Server architecture:
- **Client (React)** → Makes RESTful API calls to **Server (Express)**.
- **Server** → Interacts with **Database (SQLite)** for persistence.
- **Real-time Chat** → Uses **WebSockets** for instant message broadcasting across community members.

### 2. Dependencies
- The frontend relies on types defined in `src/types.ts` to ensure consistency with backend responses.
- `server.ts` depends on `db.ts` for database access and schema integrity.
- File uploads are managed via `multer` and served statically through the `/uploads` route.

---

## ⚙️ Setup & Installation

### Prerequisites
- Node.js (v18 or higher)
- npm or yarn

### Steps
1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd event-hub
   ```
2. **Install dependencies**:
   ```bash
   npm install
   ```
3. **Configure environment**:
   Create a `.env` file based on `.env.example`:
   ```bash
   cp .env.example .env
   ```
4. **Start development server**:
   ```bash
   npm run dev
   ```
   *The app will be available at `http://localhost:3000`.*

---

## 🔑 Environment Variables
| Variable | Description | Source |
| :--- | :--- | :--- |
| `GEMINI_API_KEY` | Required for Gemini AI features. | [Google AI](https://aistudio.google.com/) |
| `APP_URL` | The public URL of the application. | Deployment specific |

---

## 🤝 Best Practices for Contribution
1. **Type Safety**: Always update `src/types.ts` when modifying database schemas.
2. **Component Isolation**: Keep React components modular and reusable under `src/components/` (if created).
3. **API Consistency**: Follow the existing naming convention in `server.ts` (`/api/...`).
4. **Clean Code**: Use descriptive variable names and document complex business logic.
5. **Linting**: Run `npm run lint` before committing to check for TypeScript errors.

---
*Created and maintained by the Event-Hub Team.*
