import { Resend } from 'resend';
import React from 'react';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendEmail({ to, subject, react }: { to: string; subject: string; react: React.ReactElement }) {
  const { data, error } = await resend.emails.send({
    from: 'onboarding@resend.dev',
    to,
    subject,
    react,
  });

  if (error) {
    console.error('Failed to send email:', error);
    throw error;
  }

  return data;
} 