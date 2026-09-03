'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Plus, X, Users, Lock } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { useSettliMutations } from '@/hooks/useSettli';
import { SettliLogo } from '@/components/settli';
import { Currency, CURRENCY_NAMES, type CreateMemberInput } from '@/types/settli';
import { useTranslation } from 'react-i18next';

export default function NewSettliGroupPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { createGroup, loading } = useSettliMutations();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [currency, setCurrency] = useState<Currency>(Currency.JPY);
  const [usePasscode, setUsePasscode] = useState(false);
  const [passcode, setPasscode] = useState('');
  const [members, setMembers] = useState<CreateMemberInput[]>([
    { name: '' },
    { name: '' },
  ]);

  const addMember = () => {
    setMembers([...members, { name: '' }]);
  };

  const removeMember = (index: number) => {
    if (members.length > 2) {
      setMembers(members.filter((_, i) => i !== index));
    }
  };

  const updateMemberName = (index: number, name: string) => {
    const newMembers = [...members];
    newMembers[index] = { ...newMembers[index], name };
    setMembers(newMembers);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast.error(t('settli.new.toast.enterGroupName'));
      return;
    }

    const validMembers = members.filter((m) => m.name.trim());
    if (validMembers.length < 2) {
      toast.error(t('settli.new.toast.addTwoMembers'));
      return;
    }

    if (usePasscode && passcode.length < 4) {
      toast.error(t('settli.new.toast.passcodeMin'));
      return;
    }

    try {
      const result = await createGroup({
        name: name.trim(),
        description: description.trim() || undefined,
        currency,
        members: validMembers.map((m) => ({ name: m.name.trim() })),
        passcode: usePasscode && passcode ? passcode : undefined,
      });

      toast.success(t('settli.new.toast.created'));
      router.push(`/tools/settli/${result.id}`);
    } catch {
      toast.error(t('settli.new.toast.createFailed'));
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/tools/settli">
          <Button variant="ghost" size="icon" className="rounded-full">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex items-center gap-3">
          <SettliLogo size={32} />
          <h1 className="text-2xl font-bold">{t('settli.new.title')}</h1>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Group Info */}
        <Card>
          <CardHeader>
            <CardTitle>{t('settli.new.groupInfo')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">{t('settli.new.groupName')} *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('settli.new.groupNamePlaceholder')}
                required
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">{t('settli.new.description')} ({t('settli.common.optional')})</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('settli.new.descriptionPlaceholder')}
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="currency">{t('settli.new.currency')}</Label>
              <Select
                value={currency}
                onValueChange={(v) => setCurrency(v as Currency)}
              >
                <SelectTrigger id="currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CURRENCY_NAMES).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {key} - {t(`settli.currency.${key}`, { defaultValue: label })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Passcode Section */}
            <div className="space-y-4 pt-4 border-t">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Lock className="h-4 w-4 text-muted-foreground" />
                  <Label htmlFor="usePasscode">{t('settli.new.protectWithPasscode')}</Label>
                </div>
                <Switch
                  id="usePasscode"
                  checked={usePasscode}
                  onCheckedChange={setUsePasscode}
                  disabled={loading}
                />
              </div>
              {usePasscode && (
                <div className="space-y-2">
                  <Label htmlFor="passcode">{t('settli.new.passcode')}</Label>
                  <Input
                    id="passcode"
                    type="password"
                    value={passcode}
                    onChange={(e) => setPasscode(e.target.value)}
                    placeholder={t('settli.new.passcodePlaceholder')}
                    minLength={4}
                    disabled={loading}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t('settli.new.passcodeHint')}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Members */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              {t('settli.member.members')}
            </CardTitle>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addMember}
              disabled={loading}
            >
              <Plus className="h-4 w-4 mr-1" />
              {t('settli.common.add')}
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {t('settli.new.memberHint')}
            </p>
            {members.map((member, index) => (
              <div key={index} className="flex gap-2">
                <Input
                  value={member.name}
                  onChange={(e) => updateMemberName(index, e.target.value)}
                  placeholder={`${t('settli.member.memberN')} ${index + 1}`}
                  disabled={loading}
                />
                {members.length > 2 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeMember(index)}
                    disabled={loading}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Submit */}
        <div className="flex flex-col-reverse gap-4 sm:flex-row">
          <Link href="/tools/settli" className="flex-1">
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={loading}
            >
              {t('settli.common.cancel')}
            </Button>
          </Link>
          <Button type="submit" className="flex-1" disabled={loading}>
            {loading ? t('settli.new.creating') : t('settli.new.createGroup')}
          </Button>
        </div>
      </form>
    </div>
  );
}
