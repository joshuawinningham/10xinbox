# Email KPI

**Email KPI** is a full-stack web application for tracking and visualizing your email productivity. Connect your Gmail account to view detailed analytics, including emails sent/received, response times, top senders, and your progress toward Inbox Zero.

---

## Features

- 📊 **Dashboard:** Visualize email activity (sent/received) by hour, day, month, and year.
- ⏱️ **Response Time:** Track your average email response time.
- 🏆 **Inbox Zero:** See how many days you achieved Inbox Zero and your current streak.
- 🥇 **Top Senders:** Identify your most frequent email contacts.
- ⚙️ **Settings:** Manage your account and preferences, including time zone.
- 🔒 **Authentication:** Secure login and account management via Supabase.
- 📧 **Gmail Integration:** Connect your Gmail for real-time analytics.

---

## Tech Stack

- **Frontend:** React, TypeScript, Vite, Tailwind CSS, Radix UI, Recharts
- **Backend:** Fastify, TypeScript, Supabase, Google APIs, Resend, Node.js
- **Other:** Luxon (date/time), ESLint, Prettier

---

## Directory Structure

```
email-kpi/
  backend/         # Fastify API, Gmail integration, email processing
    src/
    emails/
  frontend/        # React app, UI components, pages, hooks
    src/
      components/
      pages/
      hooks/
      lib/
```

---

## Getting Started (Local Development)

### Prerequisites
- Node.js (v18+ recommended)
- npm (or yarn)

### 1. Clone the repository
```bash
git clone <your-repo-url>
cd email-kpi
```

### 2. Install dependencies
```bash
cd frontend && npm install
cd ../backend && npm install
```

### 3. Environment Variables

#### Backend (`backend/.env.local` or `backend/.env.production`)
- `GOOGLE_CLIENT_ID` (from Google Cloud Console)
- `GOOGLE_CLIENT_SECRET` (from Google Cloud Console)
- `SUPABASE_URL` (from Supabase project)
- `SUPABASE_SERVICE_KEY` (from Supabase project)
- `RESEND_API_KEY` (from Resend.com)
- `BASE_URL` (optional, defaults to `http://localhost:3001`)
- `PORT` (optional, defaults to `3001`)

#### Frontend (`frontend/.env.local` or `frontend/.env.production`)
- `VITE_API_URL` (URL of your backend, e.g. `http://localhost:3001` for local dev, or your Render URL in prod)
- `VITE_SUPABASE_URL` (from Supabase project)
- `VITE_SUPABASE_ANON_KEY` (from Supabase project)

> **Note:** `.env.local` is for local development, `.env.production` is for production. Both are git-ignored by default.

### 4. Run the app locally

#### Start the backend
```bash
cd backend
npm run build   # Compile TypeScript
npm run start   # Start the server (default: http://localhost:3001)
```

#### Start the frontend
```bash
cd frontend
npm run dev     # Start Vite dev server (default: http://localhost:5173)
```

---

## Production Deployment

### Frontend (Vercel)
1. Push your code to GitHub.
2. Import the repo in [Vercel](https://vercel.com/).
3. Set the project root to `frontend`.
4. Add the following environment variables in the Vercel dashboard:
   - `VITE_API_URL` (your Render backend URL)
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Use the default build/install/output commands (Vercel auto-detects Vite projects).
6. Deploy!

### Backend (Render)
1. Push your code to GitHub.
2. Create a new Web Service in [Render](https://render.com/), root directory: `backend`.
3. Build command: `npm install && npm run build`
4. Start command: `npm run start`
5. Add the following environment variables in the Render dashboard:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_KEY`
   - `RESEND_API_KEY`
   - `BASE_URL` (should match your Render backend URL)
   - `PORT` (optional, Render sets this automatically)
6. Deploy!

---

## Build & Lint Commands

### Frontend
- **Build:** `npm run build` (outputs to `frontend/dist`)
- **Lint:** `npm run lint`
- **Preview:** `npm run preview` (serves production build locally)

### Backend
- **Build:** `npm run build` (outputs to `backend/dist`)
- **Start:** `npm run start` (runs compiled server)

---

## .env and .gitignore
- All `.env*` files are git-ignored by default (see `.gitignore`).
- **Never commit secrets or credentials.**
- Set environment variables in Vercel/Render dashboards for production.

---

## License

This project is licensed under the ISC License (see `backend/package.json`).
