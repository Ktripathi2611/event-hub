# 🎫 Event-Hub: Premium Campus Engagement Platform

[![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
[![React](https://img.shields.io/badge/React_19-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://reactjs.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_4-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![SQLite](https://img.shields.io/badge/SQLite_3-07405E?style=for-the-badge&logo=sqlite&logoColor=white)](https://www.sqlite.org/)

**Event-Hub** is a high-end, full-stack event management and community platform tailored for campus ecosystems. Built with a focus on premium aesthetics and real-time interaction, it bridges the gap between event organizers (Hosts) and attendees (Students) through an intuitive, glassmorphism-inspired interface.

---

## 🚀 Vision & Problem Statement

In fragmented campus environments, event discovery is often chaotic—hidden in emails, social groups, or physical posters. **Event-Hub** centralizes this experience, providing professional tools for organizers and a seamless discovery engine for students.

- **For Students**: A single source of truth for campus life, featuring peer reviews, community discussions, and easy booking.
- **For Hosts**: A powerful dashboard to manage ticket tiers, track sales in real-time, and verify attendees via QR codes.
- **For Admins**: A robust moderation suite to ensure platform safety and quality.

---

## ✨ Key Features

### 👤 Multi-Role Architecture
- **Student Portal**: Discover events, follow favorite hosts, join community feeds, and manage bookings.
- **Host Center**: Create events with custom ticket tiers, FAQs, and image uploads. Manage event lifecycles (Approve -> Complete/Cancel).
- **Admin Command Center**: Moderate pending events, handle user reports, and maintain platform integrity.

### 📅 Event Engineering
- **Dynamic Ticketing**: Support for multiple price tiers (VIP, General, etc.) with real-time inventory management.
- **QR Verification**: Automated QR code generation for every booking to facilitate rapid on-site check-ins.
- **Interactive FAQs**: Custom Q&A sections for every event to reduce support overhead.

### 🤝 Real-time Social Layer
- **Live Communities**: Interest-based groups with dedicated feeds and real-time chat powered by WebSockets.
- **Social Graph**: Follow/Unfollow system for hosts and users to build a personalized campus network.
- **Feedback Loop**: Star ratings and text reviews for past events.

---

## 🛠️ Technology Stack

### Frontend: Modern & Immersive
- **Core**: React 19 with Vite for ultra-fast development and optimized builds.
- **Styling**: Tailwind CSS v4 featuring the latest utility-first capabilities.
- **Animations**: Framer Motion for high-end micro-interactions and page transitions.
- **Icons**: Lucide React for a clean, consistent visual language.
- **Routing**: React Router 7 for fluid Single Page Application navigation.

### Backend: Performance & Scalability
- **Runtime**: Node.js with `tsx` for modern TypeScript execution.
- **Framework**: Express.js handling robust RESTful API endpoints.
- **Real-time**: `ws` (WebSockets) for low-latency community chat broadcasting.
- **Data Layer**: SQLite powered by `better-sqlite3` for high-performance, synchronous I/O.
- **Utilities**: `Multer` (Disk storage for uploads), `QRCode` (Dynamic ticket generation), `UUID` (Secure ID management).

---

## 📂 Repository Anatomy

| Path | Responsibility |
| :--- | :--- |
| `server.ts` | **The Brain**: Express server setup, API route definitions, and WebSocket server logic. |
| `db.ts` | **The Memory**: SQLite schema definitions, database initialization, and initial seeding logic. |
| `src/App.tsx` | **The Heart**: Monolithic frontend hub containing routing and core functional components. |
| `src/types.ts` | **The Blueprint**: Shared TypeScript interfaces for consistent data structures across the app. |
| `src/index.css` | **The Skin**: Global Design System using Tailwind v4, custom theme variables, and luxury utilities. |
| `public/uploads/` | **The Vault**: Persistent storage for event posters and user-generated media. |

---

## ⚡ Quick Start

### Prerequisites
- Node.js (v18+)
- npm

### Installation
1. **Clone & Enter**:
   ```bash
   git clone <repository-url>
   cd event-hub
   ```
2. **Install Dependencies**:
   ```bash
   npm install
   ```
3. **Configure Environment**:
   ```bash
   cp .env.example .env
   # Edit .env with your specific configuration
   ```
4. **Launch Development Environment**:
   ```bash
   npm run dev
   ```
   *Access the app at `http://localhost:3000`*

---

## 📡 API Reference (Snapshot)

All API requests should be sent to the base URL: `/api`.

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/auth/login` | `POST` | Authenticate user and retrieve profile. |
| `/events` | `GET` | Fetch list of approved/pending events with filters. |
| `/events` | `POST` | Create a new event (Host only). |
| `/bookings` | `POST` | Finalize a ticket purchase and generate QR code. |
| `/communities/:id/messages` | `GET/POST` | Manage real-time chat history. |
| `/admin/events/:id/status` | `PATCH` | Update event approval status (Admin only). |

---

## 🗺️ Roadmap & Future Vision

- [ ] **Payments**: Full Stripe/Razorpay integration for secure ticket transactions.
- [ ] **Cloud Assets**: Transition from local disk storage to AWS S3/Cloudinary.
- [ ] **AI-Enhanced Discovery**: Personalized event recommendations using Google Gemini API.
- [ ] **Mobile App**: Dedicated iOS/Android companion app using React Native.
- [ ] **Advanced Analytics**: Detailed ticket sales and engagement reporting for hosts.

---

*Built with ❤️ for vibrant campus communities.*
