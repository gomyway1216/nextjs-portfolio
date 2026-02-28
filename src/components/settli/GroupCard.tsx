'use client';

import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Users, Calendar, CheckCircle2 } from 'lucide-react';
import type { SettliGroup } from '@/types/settli';
import { formatAmount } from '@/lib/settliAlgorithm';

interface GroupCardProps {
  group: SettliGroup;
  totalAmount?: number;
}

export function GroupCard({ group, totalAmount }: GroupCardProps) {
  const activeMembers = group.members.filter((m) => m.isActive !== false);
  const createdDate = new Date(group.createdAt).toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  return (
    <Link href={`/tools/settli/${group.id}`}>
      <Card className="hover:border-primary/50 transition-colors cursor-pointer">
        <CardContent className="p-4">
          <div className="flex items-start justify-between mb-2">
            <div>
              <h3 className="font-semibold text-lg">{group.name}</h3>
              {group.description && (
                <p className="text-sm text-muted-foreground line-clamp-1">
                  {group.description}
                </p>
              )}
            </div>
            {group.isSettled && (
              <Badge variant="secondary" className="shrink-0">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                精算済み
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Users className="h-4 w-4" />
              {activeMembers.length}人
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              {createdDate}
            </span>
            {totalAmount !== undefined && (
              <span className="font-medium text-foreground">
                {formatAmount(totalAmount, group.currency)}
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
