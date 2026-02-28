'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Users, ChevronRight, CheckCircle2 } from 'lucide-react';
import type { SettliGroup } from '@/types/settli';
import { formatAmount } from '@/lib/settliAlgorithm';

interface GroupCardProps {
  group: SettliGroup;
  totalAmount?: number;
}

export function GroupCard({ group, totalAmount }: GroupCardProps) {
  const activeMembers = group.members.filter((m) => m.isActive !== false);

  return (
    <Link
      href={`/tools/settli/${group.id}`}
      className="flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm truncate">{group.name}</span>
          {group.isSettled && (
            <Badge variant="secondary" className="text-[10px] px-1 py-0 shrink-0">
              <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />
              済
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
          <span className="flex items-center gap-0.5">
            <Users className="h-3 w-3" />
            {activeMembers.length}人
          </span>
          {totalAmount !== undefined && (
            <span className="font-medium text-foreground">
              {formatAmount(totalAmount, group.currency)}
            </span>
          )}
        </div>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
    </Link>
  );
}
