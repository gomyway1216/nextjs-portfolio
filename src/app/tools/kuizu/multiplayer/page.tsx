'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Plus, LogIn, ArrowLeft, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/providers/AuthProvider';
import { KuizuLogo } from '@/components/kuizu/KuizuLogo';
import { CategorySelector } from '@/components/kuizu/CategorySelector';
import { DifficultySelector } from '@/components/kuizu/DifficultySelector';
import { useKuizuMultiplayer, useKuizuMutations } from '@/hooks/useKuizu';
import { QuizCategory, QuizDifficulty, QUIZ_CATEGORY_LABELS, QUIZ_DIFFICULTY_LABELS } from '@/types/kuizu';

export default function KuizuMultiplayerPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { currentUser } = useAuth();
  const playerId = currentUser?.uid || `anon_${Date.now()}`;
  const { createRoom, joinRoom } = useKuizuMultiplayer(playerId);
  const { generateQuiz } = useKuizuMutations();

  const [playerName, setPlayerName] = useState(currentUser?.displayName || '');
  const [roomPassword, setRoomPassword] = useState('');
  const [joinRoomId, setJoinRoomId] = useState('');
  const [joinPassword, setJoinPassword] = useState('');
  const [category, setCategory] = useState<QuizCategory | null>(null);
  const [difficulty, setDifficulty] = useState<QuizDifficulty>(QuizDifficulty.NORMAL);
  const [creating, setCreating] = useState(false);
  const [joiningRoom, setJoiningRoom] = useState(false);

  const handleCreate = async () => {
    if (!playerName.trim()) { toast.error(t('kuizu.multiplayer.enterName', 'Please enter your name')); return; }
    if (!category) { toast.error(t('kuizu.multiplayer.selectCategory', 'Please select a category')); return; }
    setCreating(true);
    try {
      const quiz = await generateQuiz({
        title: `${QUIZ_CATEGORY_LABELS[category]} - ${QUIZ_DIFFICULTY_LABELS[difficulty]}`,
        category, difficulty, questionCount: 10, timePerQuestion: 30,
      });
      const roomId = await createRoom(playerName, roomPassword, quiz);
      if (roomId) router.push(`/tools/kuizu/multiplayer/${roomId}`);
    } catch {
      toast.error(t('kuizu.multiplayer.createFailed', 'Failed to create room'));
    } finally { setCreating(false); }
  };

  const handleJoin = async () => {
    if (!playerName.trim()) { toast.error(t('kuizu.multiplayer.enterName', 'Please enter your name')); return; }
    if (!joinRoomId.trim()) { toast.error(t('kuizu.multiplayer.enterRoomCode', 'Please enter a room code')); return; }
    setJoiningRoom(true);
    try {
      const success = await joinRoom(joinRoomId.trim(), playerName, joinPassword);
      if (success) router.push(`/tools/kuizu/multiplayer/${joinRoomId.trim()}`);
      else toast.error(t('kuizu.multiplayer.joinFailed', 'Failed to join room'));
    } catch {
      toast.error(t('kuizu.multiplayer.joinFailed', 'Failed to join room'));
    } finally { setJoiningRoom(false); }
  };

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50/50 to-amber-50/50">
        <div className="container mx-auto px-4 py-8 max-w-md">
          <div className="flex items-center gap-4 mb-8">
            <Link href="/tools/kuizu"><Button variant="ghost" size="icon"><ArrowLeft className="h-5 w-5" /></Button></Link>
            <KuizuLogo size={32} showText />
          </div>
          <Card className="border-orange-200">
            <CardContent className="p-8 text-center space-y-4">
              <Users className="h-16 w-16 mx-auto text-orange-400" />
              <h2 className="text-xl font-bold text-orange-900">{t('kuizu.multiplayer.signInRequired', 'Sign In Required')}</h2>
              <p className="text-muted-foreground">{t('kuizu.multiplayer.signInDescription', 'Sign in to create or join multiplayer rooms.')}</p>
              <Link href="/signin"><Button className="bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600" style={{ borderRadius: '9999px' }}>{t('common.signIn', 'Sign In')}</Button></Link>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50/50 to-amber-50/50">
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <div className="flex items-center gap-4 mb-8">
          <Link href="/tools/kuizu"><Button variant="ghost" size="icon"><ArrowLeft className="h-5 w-5" /></Button></Link>
          <KuizuLogo size={32} showText />
        </div>

        <Card className="border-orange-200 mb-6">
          <CardContent className="pt-6">
            <Label htmlFor="playerName" className="text-base font-semibold">{t('kuizu.multiplayer.yourName', 'Your Name')}</Label>
            <Input id="playerName" value={playerName} onChange={(e) => setPlayerName(e.target.value)} placeholder={t('kuizu.multiplayer.namePlaceholder', 'Enter your display name')} className="mt-2" maxLength={20} />
          </CardContent>
        </Card>

        <Tabs defaultValue="create">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="create">{t('kuizu.multiplayer.createRoom', 'Create Room')}</TabsTrigger>
            <TabsTrigger value="join">{t('kuizu.multiplayer.joinRoom', 'Join Room')}</TabsTrigger>
          </TabsList>

          <TabsContent value="create">
            <Card className="border-orange-200">
              <CardHeader><CardTitle className="text-orange-900">{t('kuizu.multiplayer.createNewRoom', 'Create a New Room')}</CardTitle></CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <Label className="text-base font-semibold mb-3 block">{t('kuizu.play.selectCategory', 'Select Category')}</Label>
                  <CategorySelector selected={category ?? undefined} onSelect={setCategory} />
                </div>
                <div>
                  <Label className="text-base font-semibold mb-3 block">{t('kuizu.play.selectDifficulty', 'Difficulty')}</Label>
                  <DifficultySelector selected={difficulty} onSelect={setDifficulty} />
                </div>
                <div>
                  <Label htmlFor="roomPassword">{t('kuizu.multiplayer.roomPassword', 'Room Password')} ({t('common.optional', 'optional')})</Label>
                  <Input id="roomPassword" type="password" value={roomPassword} onChange={(e) => setRoomPassword(e.target.value)} placeholder={t('kuizu.multiplayer.passwordPlaceholder', 'Leave empty for open room')} className="mt-1" />
                </div>
                <Button onClick={handleCreate} disabled={creating || !category || !playerName.trim()} className="w-full bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white" size="lg">
                  {creating ? <Loader2 className="h-5 w-5 mr-2 animate-spin" /> : <Plus className="h-5 w-5 mr-2" />}
                  {t('kuizu.multiplayer.create', 'Create Room')}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="join">
            <Card className="border-orange-200">
              <CardHeader><CardTitle className="text-orange-900">{t('kuizu.multiplayer.joinExistingRoom', 'Join an Existing Room')}</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="joinRoomId">{t('kuizu.multiplayer.roomCode', 'Room Code')}</Label>
                  <Input id="joinRoomId" value={joinRoomId} onChange={(e) => setJoinRoomId(e.target.value.toUpperCase())} placeholder={t('kuizu.multiplayer.roomCodePlaceholder', 'Enter room code')} className="mt-1 font-mono text-center uppercase tracking-widest" maxLength={10} />
                </div>
                <div>
                  <Label htmlFor="joinPassword">{t('kuizu.multiplayer.roomPassword', 'Room Password')} ({t('common.optional', 'optional')})</Label>
                  <Input id="joinPassword" type="password" value={joinPassword} onChange={(e) => setJoinPassword(e.target.value)} placeholder={t('kuizu.multiplayer.passwordIfRequired', 'If the room has a password')} className="mt-1" />
                </div>
                <Button onClick={handleJoin} disabled={joiningRoom || !joinRoomId.trim() || !playerName.trim()} className="w-full bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white" size="lg">
                  {joiningRoom ? <Loader2 className="h-5 w-5 mr-2 animate-spin" /> : <LogIn className="h-5 w-5 mr-2" />}
                  {t('kuizu.multiplayer.join', 'Join Room')}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
