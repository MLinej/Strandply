import { Compass, ShieldAlert } from 'lucide-react';
import { useNavigate } from 'react-router';
import { Button, Card, EmptyState } from '@/components/ui';

export function Forbidden({ what }: { what: string }) {
  const navigate = useNavigate();
  return (
    <div className="p-6">
      <Card>
        <EmptyState
          icon={ShieldAlert}
          title={`You don’t have access to ${what}`}
          description="Ask the administrator to add it to your role if you need it."
          action={<Button onClick={() => navigate('/')}>Go to Home</Button>}
        />
      </Card>
    </div>
  );
}

export function NotFound() {
  const navigate = useNavigate();
  return (
    <div className="p-6">
      <Card>
        <EmptyState
          icon={Compass}
          title="This page doesn’t exist"
          description="The link may be from the old app. Press Ctrl K to search for the page you want."
          action={<Button onClick={() => navigate('/')}>Go to Home</Button>}
        />
      </Card>
    </div>
  );
}
