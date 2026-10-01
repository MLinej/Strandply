import { ListChecks } from 'lucide-react';
import { FirmSwitcher } from '@/app/FirmSwitcher';
import { useSession } from '@/app/session';
import { Card, EmptyState } from '@/components/ui';

function greeting(hour: number) {
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
}

const today = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

/** Home — my work list (Home.dc.html). Header and firm switch now; KPIs and the pending list fill in per module. */
export function HomePage() {
  const { user } = useSession();
  const now = new Date();
  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-h1 font-bold tracking-tight">
            {greeting(now.getHours())}, {user.name}
          </h1>
          <p className="text-base text-muted">
            Pending approvals, overdue items and today’s figures for your role · {today.format(now).replace(/\bSep\b/, 'Sept')}
          </p>
        </div>
        <FirmSwitcher />
      </div>
      <Card>
        <EmptyState
          icon={ListChecks}
          title="Your work list fills in as modules are built"
          description="Each module adds its ‘Pending my action’ rows, alerts and at-a-glance card here."
        />
      </Card>
    </div>
  );
}
