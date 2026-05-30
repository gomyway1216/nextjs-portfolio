'use client';
import React, { useState } from 'react';
import MicRecorder from 'mic-recorder-to-mp3';
import { Button } from '@/components/ui/button';
import { Mic, Square } from 'lucide-react';

const recorder = new MicRecorder({
  bitRate: 128,
  encoder: 'mp3',
  numberOfChannels: 1,
  sampleRate: 44100,
});

interface RecorderProps {
  onRecordingComplete: (file: File) => void;
}

const Recorder = ({ onRecordingComplete }: RecorderProps) => {
  const [isRecording, setIsRecording] = useState<boolean>(false);

  const startRecording = () => {
    recorder.start().then(() => {
      setIsRecording(true);
    });
  };

  const stopRecording = () => {
    recorder.stop().getMp3().then(([buffer, blob]) => {
      const file = new File(buffer, 'input.mp3', { type: blob.type, lastModified: Date.now() });
      onRecordingComplete(file);
      setIsRecording(false);
    });
  };

  return (
    <Button
      type="button"
      variant={isRecording ? 'destructive' : 'default'}
      size="icon"
      className="h-14 w-14 rounded-full"
      aria-label={isRecording ? 'stop recording' : 'start recording'}
      onClick={isRecording ? stopRecording : startRecording}
    >
      {isRecording ? <Square className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
    </Button>
  );
};

export default Recorder;
