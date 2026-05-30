'use client';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover,PopoverContent,PopoverTrigger } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import type { VoiceSubTask } from '@/services/voiceTaskService';
import * as voiceTaskApi from '@/services/voiceTaskService';
import { format } from 'date-fns';
import {
ArrowLeft,
Calendar as CalendarIcon,
Circle,
CornerDownRight,
FileText
} from 'lucide-react';
import { useParams,useRouter } from 'next/navigation';
import React,{ useState } from 'react';

const TEST_USER_ID = 'aoUPpC4gz7QlvbMcpNH5';

const VoiceTaskItem = () => {
  const [taskName, _setTaskName] = useState<string>('hello');
  const [subtasks, setSubtasks] = useState<VoiceSubTask[]>([]);
  const [detailsText, setDetailsText] = useState<string>('');
  const [isDetailsOpen, setIsDetailsOpen] = useState<boolean>(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const { taskId } = useParams();
  const router = useRouter();

  const _handleSubtaskToggle = (index: number) => {
    const updatedSubtasks = [...subtasks];
    updatedSubtasks[index].completed = !updatedSubtasks[index].completed;
    setSubtasks(updatedSubtasks);
  };

  const handleDetailsToggle = () => {
    setIsDetailsOpen(!isDetailsOpen);
  };

  const handleDetailsTextChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setDetailsText(event.target.value);
  };

  const handleCreateSubTask = async () => {
    try {
      // create and set subtask for a task, then call api. If error, show error message and remove subtask
      const newSubtask = { name: 'subtask', completed: false };
      setSubtasks([...subtasks, newSubtask]);
      const id = Array.isArray(taskId) ? taskId[0] : taskId || '';
      await voiceTaskApi.createSubTask(TEST_USER_ID, id, newSubtask);
    } catch (error) {
      console.error('Error:', error);
      setSubtasks(subtasks.filter((subtask, index) => index !== subtasks.length - 1));
    }
  };

  return (
    <div className="p-4">
      <div className="flex items-center gap-2 mb-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-semibold flex-1">
          {taskName}
        </h1>
      </div>

      <div className="space-y-4">
        <div className="flex items-start gap-2">
          <Button variant="ghost" size="icon" className="mt-1">
            <FileText className="h-5 w-5" />
          </Button>
          {isDetailsOpen ? (
            <Textarea
              placeholder="Add details"
              value={detailsText}
              onChange={handleDetailsTextChange}
              autoFocus
              className="flex-1 border-none shadow-none"
            />
          ) : (
            <p className="flex-1 cursor-pointer text-muted-foreground py-2" onClick={handleDetailsToggle}>
              Add details
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon">
            <CalendarIcon className="h-5 w-5" />
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="flex-1 justify-start text-left font-normal">
                {selectedDate ? format(selectedDate, 'PPP') : <span className="text-muted-foreground">Pick a date</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={setSelectedDate}
                autoFocus
              />
            </PopoverContent>
          </Popover>
        </div>

        <div className="flex items-start gap-2">
          <Button variant="ghost" size="icon" className="mt-1">
            <CornerDownRight className="h-5 w-5" />
          </Button>
          <div className="flex-1 space-y-2">
            {subtasks.map((subtask, index) => (
              <div key={'subTask' + index} className="flex items-start gap-2">
                <Button variant="ghost" size="icon" className="mt-1">
                  <Circle className="h-4 w-4" />
                </Button>
                <Textarea
                  placeholder="Add details"
                  value={detailsText}
                  onChange={handleDetailsTextChange}
                  autoFocus
                  className="flex-1 border-none shadow-none"
                />
              </div>
            ))}
            <p className="cursor-pointer text-sm text-muted-foreground pl-10" onClick={handleCreateSubTask}>
              Add subtasks
            </p>
          </div>
        </div>
      </div>

      <p className="text-center text-sm text-muted-foreground mt-8">
        Mark completed
      </p>
    </div>
  );
};

export default VoiceTaskItem;
