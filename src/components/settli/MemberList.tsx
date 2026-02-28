'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Users, UserPlus, Edit2, Trash2, Scale } from 'lucide-react';
import type { Member } from '@/types/settli';
import { MemberForm } from './MemberForm';
import { useTranslation } from 'react-i18next';

interface MemberListProps {
  members: Member[];
  onAddMember: (name: string, email?: string, weight?: number) => Promise<void>;
  onUpdateMember: (memberId: string, name: string, weight: number) => Promise<void>;
  onRemoveMember: (memberId: string) => Promise<void>;
  loading?: boolean;
}

export function MemberList({
  members,
  onAddMember,
  onUpdateMember,
  onRemoveMember,
  loading,
}: MemberListProps) {
  const { t } = useTranslation();
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingMember, setEditingMember] = useState<Member | null>(null);

  const activeMembers = members.filter((m) => m.isActive !== false);
  const inactiveMembers = members.filter((m) => m.isActive === false);

  const handleAdd = async (name: string, email?: string, weight?: number) => {
    await onAddMember(name, email, weight);
    setShowAddForm(false);
  };

  const handleUpdate = async (name: string, _email?: string, weight?: number) => {
    if (editingMember) {
      await onUpdateMember(editingMember.id, name, weight ?? 1);
      setEditingMember(null);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          {t('settli.member.members')} ({t('settli.common.memberCount', { count: activeMembers.length })})
        </CardTitle>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowAddForm(true)}
          disabled={loading}
        >
          <UserPlus className="h-4 w-4 mr-1" />
          {t('settli.common.add')}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {showAddForm && (
          <MemberForm
            onSubmit={handleAdd}
            onCancel={() => setShowAddForm(false)}
            loading={loading}
          />
        )}

        {editingMember && (
          <MemberForm
            initialName={editingMember.name}
            initialEmail={editingMember.email}
            initialWeight={editingMember.weight}
            onSubmit={handleUpdate}
            onCancel={() => setEditingMember(null)}
            loading={loading}
            isEdit
          />
        )}

        {activeMembers.length === 0 && !showAddForm ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            {t('settli.member.empty')}
          </p>
        ) : (
          <ul className="space-y-2">
            {activeMembers.map((member) => (
              <li
                key={member.id}
                className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium">
                    {member.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <span className="font-medium">{member.name}</span>
                    {member.weight !== 1 && (
                      <Badge variant="secondary" className="ml-2">
                        <Scale className="h-3 w-3 mr-1" />
                        {member.weight}
                      </Badge>
                    )}
                    {member.email && (
                      <p className="text-xs text-muted-foreground">
                        {member.email}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setEditingMember(member)}
                    disabled={loading || editingMember?.id === member.id}
                  >
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onRemoveMember(member.id)}
                    disabled={loading}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {inactiveMembers.length > 0 && (
          <div className="mt-4 pt-4 border-t">
            <p className="text-sm text-muted-foreground mb-2">
              {t('settli.member.inactive')} ({t('settli.common.memberCount', { count: inactiveMembers.length })})
            </p>
            <ul className="space-y-1">
              {inactiveMembers.map((member) => (
                <li
                  key={member.id}
                  className="flex items-center gap-2 p-2 text-muted-foreground text-sm"
                >
                  <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs">
                    {member.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="line-through">{member.name}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
