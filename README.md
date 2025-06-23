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
- ✉️ **Email Client:** Read, send, and manage your emails directly in-app with a modern, responsive interface.
- 🗑️ **Email Management:** Move emails to trash from both the inbox list and email detail view with confirmation dialogs.
- 👁️ **Email Tracking:** See when recipients open your emails, with open counts, badges, and detailed open event history (including timestamps) via modals.

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

### Nightly Email Report Cron Job (Render)
You can automate nightly (or hourly) email KPI reports using a Render Cron Job:

1. In your Render dashboard, click **New > Cron Job**.
2. Connect your repo and set the root directory to `backend`.
3. **Build command:**
   ```sh
   npm install && npm run build
   ```
4. **Start command (command to run periodically):**
   ```sh
   node dist/src/sendNightlyReports.js
   ```
5. **Schedule:**
   - For hourly: `0 * * * *`
   - For nightly at 1am UTC: `0 1 * * *`
   - For testing (every 5 min): `*/5 * * * *`
6. **Environment variables:** Add the same variables as your backend web service:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_KEY`
   - `RESEND_API_KEY`
   - `BASE_URL` (should match your backend URL)
7. Deploy the cron job. Check logs after the first run to confirm reports are being sent.

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

## Email Client & Tracking

**Email Client:**
- Full-featured in-app email client for reading, composing, and sending emails.
- Modern UI with sidebar navigation, message list, and detailed message view.
- Supports Gmail OAuth integration for secure access.
- **Email Management:** Move emails to trash from both the inbox list and email detail view with confirmation dialogs.
- **Email Actions:** Reply, reply all, and move to trash functionality with intuitive button placement.
- **Real-time Updates:** Email list updates immediately after deletion, with automatic pagination handling.

**Email Tracking:**
- Track when and how many times each recipient opens your emails.
- Visual open count badges next to each tracked email.
- Clickable badges and "View Details" buttons open a modal with a full list of open events (timestamps for each view).
- See at-a-glance which emails have never been opened (shows 0 badge and eye-off icon).
- All tracking is privacy-conscious and only visible to the authenticated user.
