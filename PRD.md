# Product Requirements Document (PRD)
# 10XInbox - Email Analytics & Productivity Platform

## Executive Summary

10XInbox is a comprehensive email analytics and productivity platform that integrates with Gmail to provide users with actionable insights into their email habits, response times, and inbox management. The platform helps professionals achieve Inbox Zero, track email productivity metrics, and maintain better email hygiene through automated reports and real-time analytics.

## Product Overview

### Vision
To transform email from a source of stress into a well-managed communication channel by providing users with data-driven insights and tools to optimize their email productivity.

### Mission
Empower professionals to take control of their inbox by providing real-time analytics, automated tracking, and personalized insights that lead to better email management habits and improved work-life balance.

### Target Users
- **Primary:** Knowledge workers and professionals who spend significant time managing email
- **Secondary:** Teams and managers looking to improve organizational email efficiency
- **Tertiary:** Freelancers and consultants who need to track client communications

## Core Features

### 1. Dashboard & Analytics

#### 1.1 Real-time Email Metrics
- **Emails Received Today**: Track incoming email volume with percentage change from yesterday
- **Outgoing Emails Today**: Monitor sent emails broken down by new threads vs. replies
- **Average Response Time**: Calculate and display mean response time for email replies
- **Inbox Zero Tracking**: 
  - Days achieved Inbox Zero this month (working days only)
  - Current consecutive streak
  - Visual calendar showing Inbox Zero achievement
- **Hourly/Daily/Monthly/Yearly Views**: Visualize email patterns across different time periods

#### 1.2 Email Volume Visualization
- Interactive charts (Bar and Line) showing email sent/received patterns
- Time-based breakdowns [[memory:90823089575265489]]:
  - Hourly: Display in user's local timezone
  - Daily: Week view
  - Monthly: Current month
  - Yearly: Last 12 months

### 2. Email Client

#### 2.1 Full Gmail Integration
- Read, compose, and send emails directly within the app
- Folder navigation (Inbox, Sent, Drafts, Spam, Trash, Archive)
- Email search with advanced operators (from:, to:, subject:, has:attachment, etc.)
- Recent search history with autocomplete suggestions

#### 2.2 Email Management
- Move emails to trash with confirmation dialog
- Undo functionality for deleted emails
- Reply and Reply All capabilities
- Pagination controls for navigating large inboxes
- Real-time refresh functionality

#### 2.3 Compose Features
- Rich text editor with formatting options (bold, italic, underline, lists, links, etc.)
- File attachments support
- Contact autocomplete [[memory:7507105087664418351]] (includes both senders and recipients)
- Minimizable compose window
- Automatic signature insertion

### 3. Email Tracking

#### 3.1 Open Tracking
- Track when recipients open sent emails
- Visual indicators (eye icon for opened, eye-off for unopened)
- Open count badges showing total views per email
- Detailed open event history with timestamps

#### 3.2 Open Type Detection
- Differentiate between:
  - Human opens (actual recipients)
  - Gmail proxy opens (automatic pre-loading)
  - Email client opens (Outlook, Apple Mail, etc.)
  - Bot/crawler opens (filtered out)

### 4. Top Senders Analysis

- Identify most frequent email senders
- Customizable date range filtering
- Visual representation via bar chart and sortable table
- Export capabilities for further analysis

### 5. Inbox Zero Features

#### 5.1 Working Hours Configuration
- Set custom working hours (start/end times)
- Define working days (Monday-Sunday selection)
- Inbox Zero buffer time (emails received after buffer don't count)

#### 5.2 Visual Calendar
- Monthly calendar view showing Inbox Zero achievement
- Color-coded days:
  - Green: Inbox Zero achieved
  - Gray: Working day with emails remaining
  - Light gray: Non-working days

### 6. Automated Daily Reports

#### 6.1 Email Report Contents
- Previous day's email statistics
- Response time metrics
- Top senders and recipients
- Hourly activity breakdown
- Email tracking summary (sent emails with view counts)
- Inbox Zero progress

#### 6.2 Report Delivery
- Automated daily email delivery
- Time zone aware scheduling [[memory:8232772761107988319]]
- Beautiful HTML email template
- Direct links to full dashboard

### 7. User Settings & Preferences

#### 7.1 Profile Settings
- Gmail account connection/disconnection
- Time zone selection
- Theme customization (multiple color themes)
- Email signature management with rich text editor

#### 7.2 Working Hours
- Customizable work schedule
- Inbox Zero buffer time configuration
- Working days selection

## Technical Architecture

### Frontend
- **Framework**: React with TypeScript
- **Build Tool**: Vite
- **UI Components**: Radix UI, shadcn/ui
- **Styling**: Tailwind CSS
- **Charts**: Recharts
- **State Management**: React hooks
- **Rich Text**: TipTap editor

### Backend
- **Framework**: Fastify (Node.js)
- **Language**: TypeScript
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth
- **Email Service**: Gmail API, Resend (for reports)
- **Job Scheduling**: node-cron

### Infrastructure
- **Frontend Hosting**: Vercel
- **Backend Hosting**: Render
- **Database**: Supabase Cloud

## Data Model

### Core Tables
- **users**: User authentication and profile data
- **gmail_tokens**: OAuth tokens for Gmail access
- **email_stats**: Daily email sent/received counts
- **inbox_zero_days**: Daily inbox count tracking
- **sent_emails**: Tracking for sent emails
- **email_opens**: Open event tracking
- **user_settings**: Time zone, working hours, preferences
- **response_time_cache**: Cached response time calculations
- **reports_sent**: Track sent daily reports

## Security & Privacy

### Authentication
- Secure OAuth 2.0 flow for Gmail integration
- Supabase Auth for user management
- Row-level security on all database tables

### Data Protection
- Encrypted storage of OAuth tokens
- No email content stored (only metadata)
- User data isolation
- HTTPS encryption for all API calls

## Performance Requirements

- Dashboard load time: < 2 seconds
- Email list pagination: 20 emails per page
- Real-time metrics update: < 5 seconds
- Chart rendering: < 1 second
- Email send time: < 3 seconds

## Future Enhancements

### Phase 2
- Team analytics and shared dashboards
- Email templates and snippets
- Advanced email scheduling
- Multi-account support
- Mobile app (iOS/Android)

### Phase 3
- AI-powered email insights
- Automated email responses
- Integration with other email providers (Outlook, Yahoo)
- Slack/Teams notifications
- API for third-party integrations

## Success Metrics

### User Engagement
- Daily active users (DAU)
- Average session duration
- Feature adoption rates
- Email tracking usage

### Business Impact
- User retention rate
- Average response time improvement
- Inbox Zero achievement rate
- User satisfaction (NPS)

### Technical Performance
- System uptime (99.9% target)
- API response times
- Error rates
- Gmail API quota usage

## Release Strategy

### MVP (Current)
- Core dashboard with email metrics
- Gmail integration
- Basic email tracking
- Daily reports
- User settings

### V1.1
- Enhanced email client features
- Advanced tracking analytics
- Team features
- Performance optimizations

### V2.0
- Mobile applications
- AI-powered insights
- Multi-provider support
- Enterprise features

## Support & Documentation

### User Support
- In-app help documentation
- Email support
- FAQ section
- Video tutorials

### Developer Documentation
- API documentation
- Integration guides
- Webhook documentation
- Security best practices

## Compliance & Legal

- GDPR compliance for EU users
- CAN-SPAM compliance for email tracking
- Privacy policy and terms of service
- Data retention policies
- User data export capabilities

---

*Last Updated: [Current Date]*
*Version: 1.0* 