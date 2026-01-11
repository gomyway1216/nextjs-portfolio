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
import { useWarikanMutations } from '@/hooks/useWarikan';
import { Currency, CURRENCY_NAMES, type CreateMemberInput } from '@/types/warikan';

export default function NewWarikanGroupPage() {
  const router = useRouter();
  const { createGroup, loading } = useWarikanMutations();

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
      toast.error('グループ名を入力してください');
      return;
    }

    const validMembers = members.filter((m) => m.name.trim());
    if (validMembers.length < 2) {
      toast.error('2人以上のメンバーを追加してください');
      return;
    }

    if (usePasscode && passcode.length < 4) {
      toast.error('パスコードは4桁以上で入力してください');
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

      toast.success('グループを作成しました');
      router.push(`/tools/warikan/${result.id}`);
    } catch {
      toast.error('グループの作成に失敗しました');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/tools/warikan">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <h1 className="text-2xl font-bold">新しいグループを作成</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Group Info */}
        <Card>
          <CardHeader>
            <CardTitle>グループ情報</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">グループ名 *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="沖縄旅行 2024"
                required
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">説明 (任意)</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="3泊4日の沖縄旅行"
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="currency">通貨</Label>
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
                      {key} - {label}
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
                  <Label htmlFor="usePasscode">パスコードで保護</Label>
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
                  <Label htmlFor="passcode">パスコード</Label>
                  <Input
                    id="passcode"
                    type="password"
                    value={passcode}
                    onChange={(e) => setPasscode(e.target.value)}
                    placeholder="4桁以上のパスコード"
                    minLength={4}
                    disabled={loading}
                  />
                  <p className="text-xs text-muted-foreground">
                    グループにアクセスする際にパスコードの入力が必要になります
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
              メンバー
            </CardTitle>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addMember}
              disabled={loading}
            >
              <Plus className="h-4 w-4 mr-1" />
              追加
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              参加メンバーの名前を入力してください（後から追加・変更できます）
            </p>
            {members.map((member, index) => (
              <div key={index} className="flex gap-2">
                <Input
                  value={member.name}
                  onChange={(e) => updateMemberName(index, e.target.value)}
                  placeholder={`メンバー ${index + 1}`}
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
        <div className="flex gap-4">
          <Link href="/tools/warikan" className="flex-1">
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={loading}
            >
              キャンセル
            </Button>
          </Link>
          <Button type="submit" className="flex-1" disabled={loading}>
            {loading ? '作成中...' : 'グループを作成'}
          </Button>
        </div>
      </form>
    </div>
  );
}
