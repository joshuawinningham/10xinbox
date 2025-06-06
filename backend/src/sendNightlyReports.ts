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
import { prisma } from "./db";
import { sendEmail } from "./email";
import RealTimeReportEmail from "../emails/RealTimeReportEmail";
import { formatDistanceToNow } from "date-fns";

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

const resend = new Resend(process.env.RESEND_API_KEY);

function formatDuration(seconds: number | null): string {
  if (seconds == null) return '--';
  if (seconds < 60) return `${seconds}s`;
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  if (min < 60) return `${min}m${sec > 0 ? ` ${sec}s` : ''}`;
  const hr = Math.floor(min / 60);
  const remMin = min % 60;
  return `${hr}h${remMin > 0 ? ` ${remMin}m` : ''}${sec > 0 ? ` ${sec}s` : ''}`;
}

async function getValidAccessToken(user_id: string) {
  const { data, error } = await supabase
    .from('gmail_tokens')
    .select('*')
    .eq('user_id', user_id)
    .single();
  if (error || !data) throw new Error('No tokens found for user');
  const { access_token, refresh_token, expires_at } = data;
  if (new Date(expires_at) > new Date()) {
    return access_token;
  }
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${BASE_URL}/api/auth/google/callback`
  );
  oauth2Client.setCredentials({ refresh_token });
  const { token: newAccessToken } = await oauth2Client.getAccessToken();
  const newExpiry = oauth2Client.credentials.expiry_date;
  await supabase
    .from('gmail_tokens')
    .update({
      access_token: newAccessToken,
      expires_at: new Date(newExpiry!).toISOString(),
    })
    .eq('user_id', user_id);
  return newAccessToken;
}

// Helper to format duration as "X hours Y minutes"
function formatDurationMinutes(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} minutes`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (remainingMinutes === 0) {
    return `${hours} hours`;
  }
  return `${hours} hours ${remainingMinutes} minutes`;
}

// Helper to get time range for response time distribution
function getResponseTimeRange(minutes: number): string {
  if (minutes < 15) return "Under 15 minutes";
  if (minutes < 30) return "15-30 minutes";
  if (minutes < 60) return "30-60 minutes";
  if (minutes < 120) return "1-2 hours";
  if (minutes < 240) return "2-4 hours";
  if (minutes < 480) return "4-8 hours";
  if (minutes < 1440) return "8-24 hours";
  return "Over 24 hours";
}

async function main() {
  try {
    const users = await prisma.user.findMany({
      where: {
        email: {
          not: null,
        },
      },
    });

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const user of users) {
      if (!user.email) continue;

      // Get all emails for the user from yesterday
      const emails = await prisma.email.findMany({
        where: {
          userId: user.id,
          date: {
            gte: yesterday,
            lt: today,
          },
        },
        include: {
          thread: true,
        },
        orderBy: {
          date: "asc",
        },
      }) as Email[];

      // Get current inbox count
      const currentInboxCount = await prisma.email.count({
        where: {
          userId: user.id,
          isRead: false,
        },
      });

      // Calculate basic metrics
      const emailsSent = emails.filter((e: Email) => e.direction === "sent").length;
      const emailsReceived = emails.filter((e: Email) => e.direction === "received").length;

      // Calculate response times
      const responseTimes: number[] = [];
      let totalResponseTime = 0;
      let quickestResponseTime: number | null = null;
      let slowestResponseTime: number | null = null;

      for (let i = 0; i < emails.length; i++) {
        const email = emails[i];
        if (email.direction === "received") {
          // Find the next sent email in the thread
          const nextSentEmail = emails.find(
            (e: Email) =>
              e.direction === "sent" &&
              e.threadId === email.threadId &&
              e.date > email.date
          );

          if (nextSentEmail) {
            const responseTimeMinutes = Math.round(
              (nextSentEmail.date.getTime() - email.date.getTime()) / (1000 * 60)
            );
            responseTimes.push(responseTimeMinutes);
            totalResponseTime += responseTimeMinutes;

            if (quickestResponseTime === null || responseTimeMinutes < quickestResponseTime) {
              quickestResponseTime = responseTimeMinutes;
            }
            if (slowestResponseTime === null || responseTimeMinutes > slowestResponseTime) {
              slowestResponseTime = responseTimeMinutes;
            }
          }
        }
      }

      // Calculate response time distribution
      const responseTimeDistribution = responseTimes.reduce((acc, minutes) => {
        const range = getResponseTimeRange(minutes);
        acc[range] = (acc[range] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const responseTimeDistributionArray = Object.entries(responseTimeDistribution).map(
        ([range, count]) => ({ range, count })
      );

      // Calculate thread metrics
      const threads = new Map<string, number>();
      emails.forEach((email: Email) => {
        if (email.threadId) {
          threads.set(email.threadId, (threads.get(email.threadId) || 0) + 1);
        }
      });

      const emailThreads = threads.size;
      const averageThreadLength =
        emailThreads > 0
          ? Math.round(
              Array.from(threads.values()).reduce((sum, count) => sum + count, 0) / emailThreads
            )
          : 0;
      const longestThread = Math.max(...Array.from(threads.values()), 0);

      // Calculate hourly breakdown
      const hourlySent = new Array(24).fill(0);
      const hourlyReceived = new Array(24).fill(0);

      emails.forEach((email: Email) => {
        const hour = email.date.getHours();
        if (email.direction === "sent") {
          hourlySent[hour]++;
            } else {
          hourlyReceived[hour]++;
            }
      });

      // Find peak activity and busiest hours
      const peakActivityHour = hourlySent.indexOf(Math.max(...hourlySent));
      const busiestHour = hourlyReceived.indexOf(Math.max(...hourlyReceived));

      // Calculate top senders and recipients
      const senderCounts = new Map<string, { email: string; name: string; count: number }>();
      const recipientCounts = new Map<string, { email: string; name: string; count: number }>();

      emails.forEach((email: Email) => {
        if (email.direction === "received") {
          const key = email.senderEmail || '';
          const current = senderCounts.get(key) || { email: key, name: email.senderName || "", count: 0 };
          senderCounts.set(key, { ...current, count: current.count + 1 });
        } else {
          const key = email.recipientEmail || '';
          const current = recipientCounts.get(key) || { email: key, name: email.recipientName || "", count: 0 };
          recipientCounts.set(key, { ...current, count: current.count + 1 });
        }
      });

      const topSenders = Array.from(senderCounts.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      const topRecipients = Array.from(recipientCounts.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      // Calculate inbox zero days
      const inboxZeroDays = await prisma.inboxZeroDay.count({
        where: {
          userId: user.id,
          date: {
            gte: yesterday,
            lt: today,
          },
        },
          });

      // Calculate consecutive inbox zero days
      const consecutiveInboxZeroDays = await prisma.inboxZeroDay.count({
        where: {
          userId: user.id,
          date: {
            lte: today,
          },
        },
        orderBy: {
          date: "desc",
        },
      });

      // Calculate business days for inbox zero
      const businessDays = await prisma.inboxZeroDay.count({
        where: {
          userId: user.id,
          date: {
            gte: yesterday,
            lt: today,
          },
          isBusinessDay: true,
        },
      });

      // Calculate average response time
      const avgResponseTime =
        responseTimes.length > 0
          ? formatDurationMinutes(Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length))
          : "N/A";

      // Send daily report
      await sendEmail({
        to: user.email,
        subject: `Your Daily Email KPI Report for ${yesterday.toLocaleDateString()}`,
        react: DailyReportEmail({
          date: yesterday.toISOString(),
          emailsSent,
          emailsReceived,
          avgResponseTime,
          inboxZeroBusinessDays: businessDays,
          consecutiveInboxZeroDays,
          hourlySent,
          hourlyReceived,
          topSenders,
          topRecipients,
          responseTimeDistribution: responseTimeDistributionArray,
          peakActivityHour,
          busiestHour,
          totalResponseTime: Math.round(totalResponseTime / 60), // Convert to hours
          quickestResponseTime: quickestResponseTime ? formatDurationMinutes(quickestResponseTime) : undefined,
          slowestResponseTime: slowestResponseTime ? formatDurationMinutes(slowestResponseTime) : undefined,
          emailThreads,
          averageThreadLength,
          longestThread,
        }),
      });

      // Send real-time report
      await sendEmail({
        to: user.email,
        subject: `Your Real-Time Email KPI Report for ${today.toLocaleDateString()}`,
        react: RealTimeReportEmail({
          date: today.toISOString(),
          emailsSent,
          emailsReceived,
          avgResponseTime,
          inboxZeroBusinessDays: businessDays,
          consecutiveInboxZeroDays,
          hourlySent,
          hourlyReceived,
          topSenders,
          topRecipients,
          responseTimeDistribution: responseTimeDistributionArray,
          currentInboxCount,
          peakActivityHour,
          busiestHour,
        }),
      });
    }
    process.exit(0);
  } catch (error) {
    console.error('Failed to send reports:', error);
    process.exit(1);
  }
}

main(); 