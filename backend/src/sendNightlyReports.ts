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

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const user of users) {
      if (!user.email) continue;

      // Get all emails for the user from yesterday
      const { data: emails, error: emailsError } = await supabase
        .from('sent_emails')
        .select('email_id, user_id, sent_at, to_email, to_name, subject, body')
        .eq('user_id', user.user_id)
        .gte('sent_at', yesterday.toISOString())
        .lt('sent_at', today.toISOString())
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
        .gte('date', yesterday.toISOString())
        .lt('date', today.toISOString());
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
        .gte('date', yesterday.toISOString())
        .lt('date', today.toISOString());
      if (consecutiveInboxZeroDaysError) throw consecutiveInboxZeroDaysError;

      // Calculate business days for inbox zero
      const { count: businessDays, error: businessDaysError } = await supabase
        .from('inbox_zero_day')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.user_id)
        .eq('business_day', true)
        .gte('date', yesterday.toISOString())
        .lt('date', today.toISOString());
      if (businessDaysError) throw businessDaysError;

      // Send daily report
      await delay(1000);
      try {
        await sendEmail({
          to: user.email,
          subject: `Your Daily Email KPI Report for ${yesterday.toLocaleDateString()}`,
          react: DailyReportEmail({
            date: yesterday.toISOString(),
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
          }),
        });
        logger.info(`Successfully sent daily report to ${user.email}`);
      } catch (error) {
        logger.error('Failed to send daily report', { error, userId: user.user_id, email: user.email });
      }

      // Add delay before sending real-time report
      await delay(1000);

      // Send real-time report
      try {
        await sendEmail({
          to: user.email,
          subject: `Your Real-Time Email KPI Report for ${today.toLocaleDateString()}`,
          react: RealTimeReportEmail({
            date: today.toISOString(),
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
          }),
        });
        logger.info(`Successfully sent real-time report to ${user.email}`);
      } catch (error) {
        logger.error('Failed to send real-time report', { error, userId: user.user_id, email: user.email });
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