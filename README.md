# Email KPI

**Email KPI** is a full-stack web application for tracking and visualizing your email productivity. Connect your Gmail account to view detailed analytics, including emails sent/received, response times, top senders, and your progress toward Inbox Zero.

## Features

- 📊 **Dashboard:** Visualize email activity (sent/received) by hour, day, month, and year.
- ⏱️ **Response Time:** Track your average email response time.
- 🏆 **Inbox Zero:** See how many days you achieved Inbox Zero and your current streak.
- 🥇 **Top Senders:** Identify your most frequent email contacts.
- ⚙️ **Settings:** Manage your account and preferences, including time zone.
- 🔒 **Authentication:** Secure login and account management via Supabase.
- 📧 **Gmail Integration:** Connect your Gmail for real-time analytics.

## Tech Stack

- **Frontend:** React, TypeScript, Vite, Tailwind CSS, Radix UI, Recharts
- **Backend:** Fastify, TypeScript, Supabase, Google APIs, Resend, Node.js
- **Other:** Luxon (date/time), ESLint, Prettier

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

## Getting Started

### Prerequisites

- Node.js (v18+ recommended)
- npm or yarn

### 1. Clone the repository

```bash
git clone <your-repo-url>
cd email-kpi
```

### 2. Install dependencies

#### Frontend

```bash
cd frontend
npm install
```

#### Backend

```bash
cd ../backend
npm install
```

### 3. Environment Variables

- Set up your Supabase and Gmail API credentials.
- Create a `.env` file in both `frontend` and `backend` directories as needed.

### 4. Run the app

#### Start the backend

```bash
cd backend
npm run dev
```

#### Start the frontend

```bash
cd ../frontend
npm run dev
```

- The frontend will typically run on [http://localhost:5173](http://localhost:5173)
- The backend will typically run on [http://localhost:3001](http://localhost:3001)

## Development

- **Lint:** `npm run lint` (frontend)
- **Build:** `npm run build`
- **Preview:** `npm run preview` (frontend)

## License

This project is licensed under the ISC License (see `backend/package.json`). You can update this section if you wish to use a different license.
