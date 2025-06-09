import { Resend } from 'resend';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const resend = new Resend(process.env.RESEND_API_KEY);

async function main() {
  try {
    const { data, error } = await resend.emails.send({
      from: 'onboarding@resend.dev',
      to: 'joshua.winningham@gmail.com',
      subject: 'Test Email from Minimal Script',
      html: '<p>This is a test email sent from a minimal script.</p>',
    });
    console.log('API response:', { data, error });
    if (error) {
      console.error('Failed to send email:', error);
      process.exit(1);
    }
    console.log('Email sent successfully:', data);
    process.exit(0);
  } catch (err) {
    console.error('Unexpected error:', err);
    process.exit(1);
  }
}

main(); 