import MailDashboard from "../components/MailDashboard";
import PageHeading from '@/components/PageHeading';

export default function Mail() {
  return (
    <div className="max-w-screen-2xl mx-auto p-0 pt-0 mt-0 min-h-screen">
      <PageHeading>Mail</PageHeading>
      <MailDashboard />
    </div>
  );
} 