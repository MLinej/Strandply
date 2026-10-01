import { Hammer } from 'lucide-react';
import { useMatches } from 'react-router';
import { Card, EmptyState } from '@/components/ui';
import { MODULE_BY_KEY } from '../modules';
import type { RouteHandle } from '../route-handle';
import { firmScopeLabel, useFirmScope } from '../session';

/** Rendered by any module route whose page component doesn't exist yet. */
export function PlaceholderPage() {
  const handle = useMatches().at(-1)?.handle as RouteHandle | undefined;
  const firm = useFirmScope();
  if (!handle) return null;
  const mod = MODULE_BY_KEY[handle.moduleKey];

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-h1 font-bold tracking-tight">{handle.crumb.page}</h1>
        <p className="text-base text-muted">
          {mod.label}
          {mod.legacyName && <> · replaces “{mod.legacyName}”</>} · {firmScopeLabel(firm)}
        </p>
      </div>
      <Card>
        <EmptyState icon={Hammer} title="Not built yet" description={`${mod.label} is scheduled for Phase ${mod.phase} in PLAN.md.`} />
      </Card>
    </div>
  );
}
