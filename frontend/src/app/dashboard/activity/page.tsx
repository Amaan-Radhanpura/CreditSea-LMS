import { AuditFeed } from '@/components/dashboard/AuditFeed';
import { PageHeader } from '@/components/dashboard/DashboardShell';
import { Card } from '@/components/ui/Feedback';

export default function MyActivityPage() {
  return (
    <>
      <PageHeader title="My activity" description="Everything you have done in the system, newest first" />
      <Card>
        <AuditFeed path="/audit/me" emptyText="You haven't done anything yet" />
      </Card>
    </>
  );
}
