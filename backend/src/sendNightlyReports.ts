// Script for Render Cron Job: Send nightly email KPI reports to all users
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';
import { google, gmail_v1 } from 'googleapis';
import { Resend } from 'resend';
import { render } from '@react-email/render';
import DailyReportEmail from '../emails/DailyReportEmail';
import React from 'react';
import { DateTime } from 'luxon';
import { GaxiosResponse } from 'gaxios';
import { sendEmail } from "./email";
import RealTimeReportEmail from "../emails/RealTimeReportEmail";
import { formatDistanceToNow } from "date-fns";
import logger from './utils/logger';

// Initialize Resend client
const resend = new Resend(process.env.RESEND_API_KEY);

// Add delay function at the top of the file after imports
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

interface Email {
  id: string;
  userId: string;
  direction: 'sent' | 'received';
  date: Date;
  threadId?: string;
  senderEmail?: string;
  senderName?: string;
  recipientEmail?: string;
  recipientName?: string;
  isRead: boolean;
}

interface User {
  id: string;
  email: string | null;
}

const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

async function main() {
  try {
    logger.info('Starting nightly report generation');
    const { data: users, error } = await supabase
      .from('gmail_tokens')
      .select('user_id, email')
      .not('email', 'is', null);
    if (error) throw error;

    logger.info(`Found ${users.length} users to process`);

    for (const user of users) {
      if (!user.email) continue;

      // Fetch user's time zone from user_settings
      let tz = 'UTC';
      const { data: settingsRow, error: settingsError } = await supabase
        .from('user_settings')
        .select('time_zone')
        .eq('user_id', user.user_id)
        .single();
      if (settingsRow && settingsRow.time_zone) {
        tz = settingsRow.time_zone;
      }
      // Calculate yesterday and today in user's local time zone
      const now = DateTime.now().setZone(tz);
      const yesterday = now.minus({ days: 1 }).startOf('day');
      const today = now.startOf('day');
      const yesterdayISO = yesterday.toISO();
      const todayISO = today.toISO();
      const yesterdayDateStr = yesterday.toISODate();

      // Get all emails for the user from yesterday (user's local time)
      const { data: emails, error: emailsError } = await supabase
        .from('sent_emails')
        .select('email_id, user_id, sent_at, to_email, to_name, subject, body')
        .eq('user_id', user.user_id)
        .gte('sent_at', yesterdayISO)
        .lt('sent_at', todayISO)
        .order('sent_at', { ascending: true });

      if (emailsError) {
        logger.error('Error fetching emails', { error: emailsError, userId: user.user_id });
        throw emailsError;
      }

      // Calculate basic metrics
      const emailsSent = emails.length;
      const emailsReceived = 0;

      // Calculate inbox zero days
      const { count: inboxZeroDays, error: inboxZeroDaysError } = await supabase
        .from('inbox_zero_day')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.user_id)
        .gte('date', yesterdayISO)
        .lt('date', todayISO);
      if (inboxZeroDaysError) throw inboxZeroDaysError;

      // Calculate hourly breakdown
      const hourlySent = new Array(24).fill(0);
      emails.forEach((email) => {
        const hour = new Date(email.sent_at).getHours();
        hourlySent[hour]++;
      });
      const hourlyReceived = new Array(24).fill(0); // No received emails

      // Find peak activity hour
      const peakActivityHour = hourlySent.indexOf(Math.max(...hourlySent));
      const busiestHour = 0; // No received emails

      // Calculate consecutive inbox zero days
      const { count: consecutiveInboxZeroDays, error: consecutiveInboxZeroDaysError } = await supabase
        .from('inbox_zero_day')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.user_id)
        .eq('consecutive', true)
        .gte('date', yesterdayISO)
        .lt('date', todayISO);
      if (consecutiveInboxZeroDaysError) throw consecutiveInboxZeroDaysError;

      // Calculate business days for inbox zero
      const { count: businessDays, error: businessDaysError } = await supabase
        .from('inbox_zero_day')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.user_id)
        .eq('business_day', true)
        .gte('date', yesterdayISO)
        .lt('date', todayISO);
      if (businessDaysError) throw businessDaysError;

      // Build sentEmailsWithViews for the report
      const sentEmailsWithViews = await Promise.all(
        emails.map(async (email) => {
          const { data: opens, error: opensError } = await supabase
            .from('email_opens')
            .select('id')
            .eq('user_id', user.user_id)
            .eq('email_id', email.email_id);
          return {
            name: email.to_name || '',
            email: email.to_email || '',
            subject: email.subject || '',
            views: opens ? opens.length : 0,
          };
        })
      );

      // Send daily report
      await delay(1000);
      try {
        await sendEmail({
          to: user.email,
          subject: `Your Daily Email KPI Report for ${yesterdayDateStr}`,
          react: DailyReportEmail({
            date: yesterdayISO || '',
            emailsSent,
            emailsReceived,
            avgResponseTime: 'N/A',
            inboxZeroBusinessDays: businessDays ?? 0,
            consecutiveInboxZeroDays: consecutiveInboxZeroDays ?? 0,
            hourlySent,
            hourlyReceived,
            topSenders: [],
            topRecipients: [],
            responseTimeDistribution: [],
            peakActivityHour,
            busiestHour,
            totalResponseTime: 0,
            quickestResponseTime: undefined,
            slowestResponseTime: undefined,
            emailThreads: 0,
            averageThreadLength: 0,
            longestThread: 0,
            sentEmailsWithViews,
          }),
        });
        logger.info(`Successfully sent daily report to ${user.email}`);
        // Insert a row into reports_sent to mark the report as sent
        await supabase.from('reports_sent').insert({
          user_id: user.user_id,
          date: yesterdayDateStr, // YYYY-MM-DD
          sent_at: new Date().toISOString()
        });
      } catch (error) {
        logger.error('Failed to send daily report', { error, userId: user.user_id, email: user.email });
      }
    }
    logger.info('Completed nightly report generation');
  } catch (error) {
    logger.error('Failed to send reports:', { error });
    if (error instanceof Error) {
      logger.error('Error details:', {
        message: error.message,
        stack: error.stack
      });
    } else {
      try {
        logger.error('Error details:', { error: JSON.stringify(error) });
      } catch (e) {
        logger.error('Error could not be stringified');
      }
    }
  }
}

main(); 