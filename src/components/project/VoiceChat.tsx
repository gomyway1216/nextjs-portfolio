'use client';
import React, { useState } from 'react';
import MicRecorder from 'mic-recorder-to-mp3';
import * as voiceChatApi from '@/services/voiceChatService';

const recorder = new MicRecorder({
  bitRate: 128,
  encoder: 'mp3',
  numberOfChannels: 1,
  sampleRate: 44100,
});

const VoiceChat = () => {
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [botAudioURL, setBotAudioURL] = useState<string>('');

  const startRecording = () => {
    recorder.start().then(() => {
      setIsRecording(true);
    });
  };

  const stopRecording = () => {
    recorder.stop().getMp3().then(async ([buffer, blob]) => {
      const file = new File(buffer, 'input.mp3', {
        type: blob.type,
        lastModified: Date.now(),
      });

      const formData = new FormData();
      formData.append('audio', file, 'input.mp3');

      try {
        const response = await voiceChatApi.getResponse(formData);

        const base64Audio = await response?.text();
        const audioBlob = await fetch(`data:audio/wav;base64,${base64Audio}`).then((res) => res.blob());
        const audioURL = URL.createObjectURL(audioBlob);
        setBotAudioURL(audioURL);
      } catch (error) {
        console.error('Error:', error);
      }

      setIsRecording(false);
    });
  };

  return (
    <div>
      <h2>Voice Chat</h2>
      <button onClick={isRecording ? stopRecording : startRecording}>
        {isRecording ? 'Stop Recording' : 'Start Recording'}
      </button>
      {botAudioURL && (
        <audio src={botAudioURL} controls>
          Your browser does not support the audio element.
        </audio>
      )}
    </div>
  );
};

export default VoiceChat;
