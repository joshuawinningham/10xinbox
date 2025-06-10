import { Resend } from 'resend';
import React from 'react';
import dotenv from 'dotenv';
import logger from './utils/logger';
import { render } from '@react-email/render';

dotenv.config({ path: '.env.local' });

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendEmail({ to, subject, react }: { to: string; subject: string; react: React.ReactElement }) {
  try {
    if (!process.env.RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY is not set in environment variables');
    }

    const html = await render(react);
    console.log('Email content:', html);

  const { data, error } = await resend.emails.send({
    from: 'onboarding@resend.dev',
    to,
    subject,
      html,
    });
    console.log('API response:', { data, error });

    logger.info('Resend API response', {
      to,
      subject,
      data,
      error,
      errorType: error ? typeof error : undefined,
      errorKeys: error ? Object.keys(error) : undefined,
      dataType: data ? typeof data : undefined,
      dataKeys: data ? Object.keys(data) : undefined,
  });

  if (error) {
      logger.error('Failed to send email (detailed):', {
        error,
        to,
        subject,
        errorType: typeof error,
        errorKeys: Object.keys(error),
        errorString: JSON.stringify(error),
        data,
      });
      throw error;
    }

    logger.info('Email sent successfully', { to, subject, messageId: data?.id });
    return data;
  } catch (error) {
    logger.error('Unexpected error while sending email (detailed):', {
      error,
      to,
      subject,
      errorType: typeof error,
      errorKeys: error && typeof error === 'object' ? Object.keys(error) : undefined,
      errorString: error && typeof error === 'object' ? JSON.stringify(error) : String(error),
      errorStack: error instanceof Error ? error.stack : undefined
    });
    throw error;
  }
} 