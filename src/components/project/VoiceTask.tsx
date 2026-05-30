'use client';
import { Accordion,AccordionContent,AccordionItem,AccordionTrigger } from '@/components/ui/accordion';
import { Avatar,AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Dialog,DialogContent,DialogFooter,DialogHeader,DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs,TabsList,TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import type { VoiceTask as VoiceTaskItem,VoiceTaskList } from '@/services/voiceTaskService';
import * as voiceTaskApi from '@/services/voiceTaskService';
import {
CheckCircle,
Loader2,
Plus,
Star,
Trash2,
Undo2,
User
} from 'lucide-react';
import { useRouter,useSearchParams } from 'next/navigation';
import { useEffect,useState } from 'react';
import { toast } from 'sonner';
import Recorder from './Recorder';

const TEST_USER_ID = 'aoUPpC4gz7QlvbMcpNH5';

const VoiceTask = () => {
  const [completedTasks, setCompletedTasks] = useState<VoiceTaskItem[]>([]);
  const [incompleteTasks, setIncompleteTasks] = useState<VoiceTaskItem[]>([]);

  const [openDialog, setOpenDialog] = useState<boolean>(false);
  const [newTaskName, setNewTaskName] = useState<string>('');
  const [newTaskDescription, setNewTaskDescription] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [completedExpanded, setCompletedExpanded] = useState<string | undefined>(undefined);

  const [selectedListId, setSelectedListId] = useState<string>('default');
  const [lists, setLists] = useState<VoiceTaskList[]>([]);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const listId = searchParams.get('selectedListId');
    const listName = searchParams.get('selectedListName');
    if (listId && listName) {
      lists.push({ id: listId, name: listName });
      setLists(lists);
      setSelectedListId(listId);
      // Clear query params from URL
      window.history.replaceState({}, document.title, window.location.pathname);
      fetchTasks(listId);
    } else {
      fetchTasks('default');
    }
  }, [searchParams]);

  useEffect(() => {
    fetchLists();
  }, []);

  const fetchLists = async () => {
    try {
      const listsData = await voiceTaskApi.getAllTaskLists(TEST_USER_ID);
      setLists(listsData);
    } catch (error) {
      console.error('Error fetching lists:', error);
    }
  };

  const fetchTasks = async (selectedId?: string) => {
    try {
      setIsLoading(true);
      const incompleteTasksData =
        await voiceTaskApi.getIncompleteTasks(TEST_USER_ID, selectedId ? selectedId : selectedListId);
      // const completedTasksData = await voiceTaskApi.getCompletedTasks(TEST_USER_ID, selectedListId);
      // setCompletedTasks(completedTasksData);
      setIncompleteTasks(incompleteTasksData);
    } catch (error) {
      console.error('Error fetching tasks:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchStarredTasks = async () => {
    try {
      setIsLoading(true);
      const starredTasksData = await voiceTaskApi.getStarredTasks(TEST_USER_ID);
      setIncompleteTasks(starredTasksData);
    } catch (error) {
      console.error('Error fetching starred tasks:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleListChange = (_event: unknown, newListId: string) => {
    setSelectedListId(newListId);
    setCompletedTasks([]);
    setCompletedExpanded(undefined);
    if (newListId === 'Favorites') {
      fetchStarredTasks();
    } else {
      fetchTasks(newListId);
    }
  };

  const handleCreateList = () => {
    router.push('/voice-tasks/create-list');
  };

  const handleCreateTask = async () => {
    const taskData = {
      name: newTaskName,
      list_id: selectedListId,
      description: newTaskDescription,
      created_at: new Date().toISOString(),
    };

    try {
      const response = await voiceTaskApi.createTask(TEST_USER_ID, taskData);
      const { task_id } = response;

      setIncompleteTasks((prevTasks) => [
        ...prevTasks,
        { id: task_id, ...taskData, listId: selectedListId, completed: false },
      ]);

      setOpenDialog(false);
      setNewTaskName('');
      setNewTaskDescription('');
    } catch (error) {
      console.error('Error creating task:', error);
      toast.error('Failed to create task');
    }
  };

  const fetchIncompleteTasks = async () => {
    try {
      const incompleteTasksData = await voiceTaskApi.getIncompleteTasks(TEST_USER_ID, selectedListId);
      setIncompleteTasks(incompleteTasksData);
    } catch (error) {
      console.error('Error fetching incomplete tasks:', error);
    }
  };

  const handleRecordingComplete = async (file: File) => {
    setIsLoading(true);
    const formData = new FormData();
    formData.append('audio', file, 'input.mp3');
    formData.append('user_id', TEST_USER_ID);
    formData.append('list_id', selectedListId);
    try {
      await voiceTaskApi.getResponse(formData);
      await fetchIncompleteTasks(); // Fetch tasks after receiving the response
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleTaskCompletion = async (taskId: string, completed: boolean) => {
    if (completed) {
      setCompletedTasks((prevTasks) => prevTasks.filter((task) => task.id !== taskId));
      setIncompleteTasks((prevTasks) => {
        const taskToAdd = completedTasks.find((task) => task.id === taskId);
        if (taskToAdd) {
          return [...prevTasks, { ...taskToAdd, completed: false }];
        }
        return prevTasks;
      });
      try {
        await voiceTaskApi.markTaskAsIncomplete(TEST_USER_ID, taskId);
      } catch (error) {
        console.error('Error marking task as incomplete:', error);
        setIncompleteTasks((prevTasks) => prevTasks.filter((task) => task.id !== taskId));
        const taskToRestore = completedTasks.find((task) => task.id === taskId);
        if (taskToRestore) {
          setCompletedTasks((prevTasks) => [...prevTasks, taskToRestore]);
        }
      }
    } else {
      setIncompleteTasks((prevTasks) => prevTasks.filter((task) => task.id !== taskId));
      setCompletedTasks((prevTasks) => {
        const taskToAdd = incompleteTasks.find((task) => task.id === taskId);
        if (taskToAdd) {
          return [...prevTasks, { ...taskToAdd, completed: true }];
        }
        return prevTasks;
      });
      try {
        await voiceTaskApi.markTaskAsCompleted(TEST_USER_ID, taskId);
      } catch (error) {
        console.error('Error marking task as completed:', error);
        setCompletedTasks((prevTasks) => prevTasks.filter((task) => task.id !== taskId));
        const taskToRestore = incompleteTasks.find((task) => task.id === taskId);
        if (taskToRestore) {
          setIncompleteTasks((prevTasks) => [...prevTasks, taskToRestore]);
        }
      }
    }
  };

  const toggleTaskStar = async (taskId: string, starred: boolean) => {
    let removedTask: VoiceTaskItem | undefined;
    try {
      // change the star color of the task in imcompleted task before the api call and undo when receiving an erro
      // update incomplete tasks
      setIncompleteTasks((prevTasks) => prevTasks.map((task) => {
        if (task.id === taskId) {
          return { ...task, starred: !starred };
        }
        return task;
      }));

      let taskListId = selectedListId;
      if (selectedListId === 'Favorites') {
        removedTask = incompleteTasks.find((task) => task.id === taskId);
        taskListId = removedTask?.list_id || selectedListId;
      } else {
        setIncompleteTasks((prevTasks) => prevTasks.map((task) => {
          if (task.id === taskId) {
            return { ...task, starred: !starred };
          }
          return task;
        }));
      }

      if (starred) {
        // remove the unstarred task from the starred task view
        if (selectedListId === 'Favorites') {
          setIncompleteTasks((prevTasks) => prevTasks.filter((task) => task.id !== taskId));
        }
        await voiceTaskApi.unstarTask(TEST_USER_ID, taskListId, taskId);
      } else {
        await voiceTaskApi.starTask(TEST_USER_ID, taskListId, taskId);
      }
    } catch (error) {
      console.error('Error updating task star:', error);
      toast.error('Failed to update task star');
      // undo the star color change
      if (selectedListId === 'Favorites') {
        // add back removedTask
        const taskToRestore = removedTask;
        if (taskToRestore) {
          setIncompleteTasks((prevTasks) => [...prevTasks, taskToRestore]);
        }
      } else {
        setIncompleteTasks((prevTasks) => prevTasks.map((task) => {
          if (task.id === taskId) {
            return { ...task, starred: !starred };
          }
          return task;
        }));
      }
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    setCompletedTasks((prevTasks) => prevTasks.filter((task) => task.id !== taskId));
    setIncompleteTasks((prevTasks) => prevTasks.filter((task) => task.id !== taskId));
    try {
      await voiceTaskApi.deleteTask(TEST_USER_ID, selectedListId, taskId);
    } catch (error) {
      console.error('Error deleting task:', error);
      await fetchTasks(selectedListId);
    }
  };

  const handleCompletedExpand = async (value: string) => {
    setCompletedExpanded(value);
    if (value === 'completed') {
      try {
        const completedTasksData = await voiceTaskApi.getCompletedTasks(TEST_USER_ID, selectedListId);
        setCompletedTasks(completedTasksData);
      } catch (error) {
        console.error('Error fetching completed tasks:', error);
      }
    }
  };

  return (
    <div className="voice-chat">
      <div className="flex items-center justify-between p-4 bg-primary text-primary-foreground">
        <h2 className="text-xl font-semibold">Tasks</h2>
        <Avatar>
          <AvatarFallback>
            <User className="h-5 w-5" />
          </AvatarFallback>
        </Avatar>
      </div>
      <Tabs value={selectedListId} onValueChange={(value) => {
        if (value === 'new_list') {
          handleCreateList();
        } else {
          handleListChange(null, value);
        }
      }}>
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="Favorites">
            <Star className="h-4 w-4" />
          </TabsTrigger>
          <TabsTrigger value="default">My Tasks</TabsTrigger>
          {lists.map((list) => (
            <TabsTrigger key={list.id} value={list.id}>{list.name}</TabsTrigger>
          ))}
          <Button variant="ghost" size="sm" onClick={handleCreateList}>+ New list</Button>
        </TabsList>
      </Tabs>

      <div className="task-lists">
        <div className="task-list">
          <h3 className="text-lg font-semibold p-4">Pending Tasks</h3>
          <div className="space-y-2">
            {incompleteTasks.map((task) => (
              <div key={task.id} className="flex items-center gap-2 p-3 hover:bg-muted rounded-lg cursor-pointer" onClick={() => router.push(`/voice-tasks/${task.id}`)}>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleTaskCompletion(task.id, task.completed);
                  }}
                >
                  <CheckCircle className="h-5 w-5 text-primary" />
                </Button>
                <div className="flex-1">
                  <div className="font-medium">{task.name}</div>
                  <div className="text-sm text-muted-foreground">{new Date(task.created_at).toLocaleString()}</div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleTaskStar(task.id, task.starred ?? false);
                  }}
                >
                  <Star className={`h-5 w-5 ${task.starred ? 'fill-yellow-400 text-yellow-400' : ''}`} />
                </Button>
              </div>
            ))}
          </div>
        </div>
      </div>

      <Accordion type="single" collapsible value={completedExpanded} onValueChange={handleCompletedExpand}>
        <AccordionItem value="completed">
          <AccordionTrigger className="px-4">
            <h3 className="text-lg font-semibold">Completed Tasks</h3>
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-2 px-4">
              {completedTasks.map((task) => (
                <div key={task.id} className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                  <div className="flex-1">
                    <div className="font-medium line-through">{task.name}</div>
                    <div className="text-sm text-muted-foreground">{new Date(task.created_at).toLocaleString()}</div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => toggleTaskCompletion(task.id, task.completed)}
                  >
                    <Undo2 className="h-5 w-5 text-primary" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDeleteTask(task.id)}
                  >
                    <Trash2 className="h-5 w-5 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <div className="fab-container">
        <Button
          className="rounded-full h-14 w-14 fixed bottom-20 right-4 shadow-lg"
          size="icon"
          onClick={() => setOpenDialog(true)}
        >
          <Plus className="h-6 w-6" />
        </Button>
        <Recorder onRecordingComplete={handleRecordingComplete} />
      </div>

      {isLoading && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Task</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="task-name">Task Name</Label>
              <Input
                id="task-name"
                autoFocus
                value={newTaskName}
                onChange={(e) => setNewTaskName(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="task-description">Description</Label>
              <Textarea
                id="task-description"
                rows={4}
                value={newTaskDescription}
                onChange={(e) => setNewTaskDescription(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenDialog(false)}>Cancel</Button>
            <Button onClick={handleCreateTask}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default VoiceTask;
