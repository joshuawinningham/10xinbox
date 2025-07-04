# Gemini Project Configuration

This file provides instructions to Gemini to customize its behavior for the `email-kpi` project.

## Project Overview

The `email-kpi` project is a full-stack application designed to track and analyze email-based Key Performance Indicators (KPIs). It consists of a React frontend and a Node.js (TypeScript) backend.

- **Frontend:** The frontend is a Vite-powered React application using TypeScript, Tailwind CSS, and various UI components from `radix-ui` and `shadcn/ui`. It interacts with the backend to display email statistics and user settings.
- **Backend:** The backend is a Fastify server written in TypeScript. It connects to the Gmail API to fetch email data, stores metrics in a Supabase (PostgreSQL) database, and serves the data to the frontend.

## Development Environment

- **Package Manager:** This project uses `npm` for dependency management in both the `frontend` and `d` directories.
- **Monorepo Structure:** The project is structured as a monorepo with two main packages:
  - `frontend/`: The React web application.
  - `backend/`: The Node.js API server.

## Important Commands

When asked to perform tasks, use the following commands from the appropriate directory:

### Frontend (`/frontend`)

- **Install Dependencies:** `npm install`
- **Run Development Server:** `npm run dev`
- **Build for Production:** `npm run build`
- **Lint Files:** `npm run lint`

### Backend (`/backend`)

- **Install Dependencies:** `npm install`
- **Run Development Server:** `npm run dev`
- **Build for Production:** `npm run build`
- **Start Production Server:** `npm run start`

## Coding Style and Conventions

- **Language:** Use TypeScript for both frontend and backend development.
- **Formatting:** Adhere to the existing code formatting. The frontend uses ESLint for linting.
- **Architecture:**
  - **Frontend:** Follow the existing structure of components, hooks, and pages. Utilize `shadcn/ui` components where appropriate.
  - **Backend:** Follow the Fastify plugin and service structure. Use the existing Supabase client for database interactions.
- **API Keys:** All secret keys, including the `GOOGLE_AI_API_KEY`, are stored in the `backend/.env.local` file. Do not hardcode secrets.

## Task-Specific Instructions

- When adding new features, ensure they are covered by tests (if a testing structure exists).
- When modifying dependencies, update the `package.json` file and run `npm install`.
- When creating new components, follow the naming and file structure conventions in `frontend/src/components`.
