import { Suspense } from 'react';
import VoiceTaskPage from '@/page/voiceTask/VoiceTaskPage';

export default function VoiceTask() {
  return (
    <Suspense fallback={null}>
      <VoiceTaskPage />
    </Suspense>
  );
}
