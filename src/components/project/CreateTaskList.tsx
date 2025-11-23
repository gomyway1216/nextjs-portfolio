'use client';
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import * as voiceTaskApi from '@/services/voiceTaskService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Loader2 } from 'lucide-react';

const TEST_USER_ID = 'aoUPpC4gz7QlvbMcpNH5';

const CreateTaskList = () => {
  const [listName, setListName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleCreateList = async () => {
    try {
      setIsLoading(true);
      const response = await voiceTaskApi.createTaskList(TEST_USER_ID, listName);
      const { task_id } = response;
      console.log('Created list with ID:', task_id);
      router.push(`/voice-task?selectedListId=${task_id}&selectedListName=${encodeURIComponent(listName)}`);
    } catch (error) {
      console.error('Error creating list:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="create-list">
      <div className="flex items-center justify-between p-4 bg-primary text-primary-foreground">
        <Button variant="ghost" size="icon" onClick={() => router.back()} className="text-primary-foreground hover:bg-primary-foreground/10">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h2 className="text-xl font-semibold">Create new list</h2>
        <Button variant="ghost" onClick={handleCreateList} className="text-primary-foreground hover:bg-primary-foreground/10">
          Done
        </Button>
      </div>
      <div className="p-4">
        <Label htmlFor="list-name">Enter list title</Label>
        <Input
          id="list-name"
          autoFocus
          value={listName}
          onChange={(e) => setListName(e.target.value)}
        />
      </div>
      {isLoading && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}
    </div>
  );
};

export default CreateTaskList;