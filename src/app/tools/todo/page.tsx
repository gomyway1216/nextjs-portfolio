'use client';

import { useState, useCallback, useRef, useEffect, type DragEvent } from 'react';
import { useAuth } from '@/providers/AuthProvider';
import {
  extractTasksFromImage,
  extractTasksFromText,
  createTask as apiCreateTask,
  getIncompleteTasks,
  getCompletedTasks,
  markTaskCompleted,
  markTaskIncomplete,
  deleteTask as apiDeleteTask,
  type ExtractedTask,
  type Task,
} from '@/services/todoService';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/util';
import { toast } from 'sonner';
import {
  Image as ImageIcon,
  FileText,
  Plus,
  Check,
  Undo2,
  Trash2,
  Loader2,
  Upload,
  Clipboard,
  ChevronDown,
  ChevronRight,
  Sparkles,
  X,
  Circle,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type InputMode = 'idle' | 'image' | 'text' | 'manual';

interface PendingExtraction {
  tasks: ExtractedTask[];
  summary: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TodoPage() {
  const { currentUser } = useAuth();

  // Task lists
  const [incompleteTasks, setIncompleteTasks] = useState<Task[]>([]);
  const [completedTasks, setCompletedTasks] = useState<Task[]>([]);
  const [showCompleted, setShowCompleted] = useState(false);

  // Input state
  const [inputMode, setInputMode] = useState<InputMode>('idle');
  const [isDragging, setIsDragging] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [pendingExtraction, setPendingExtraction] = useState<PendingExtraction | null>(null);
  const [textInput, setTextInput] = useState('');
  const [manualInput, setManualInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ---------------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------------

  const loadTasks = useCallback(async () => {
    if (!currentUser) return;
    setIsLoading(true);
    try {
      const [incomplete, completed] = await Promise.all([
        getIncompleteTasks(),
        getCompletedTasks(),
      ]);
      setIncompleteTasks(incomplete);
      setCompletedTasks(completed);
    } catch (err) {
      console.error('Failed to load tasks:', err);
    } finally {
      setIsLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  // ---------------------------------------------------------------------------
  // Image input
  // ---------------------------------------------------------------------------

  const handleImageFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }

    setIsExtracting(true);
    setInputMode('image');
    try {
      const result = await extractTasksFromImage(file);
      setPendingExtraction(result);
      toast.success(`Found ${result.tasks.length} tasks`);
    } catch (err) {
      console.error('Image extraction failed:', err);
      toast.error('Failed to extract tasks from image');
      setInputMode('idle');
    } finally {
      setIsExtracting(false);
    }
  }, []);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleImageFile(file);
  }, [handleImageFile]);

  const handlePasteImage = useCallback(async () => {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imageType = item.types.find(t => t.startsWith('image/'));
        if (imageType) {
          const blob = await item.getType(imageType);
          const file = new File([blob], 'clipboard.png', { type: imageType });
          handleImageFile(file);
          return;
        }
      }
      toast.error('No image found in clipboard');
    } catch {
      toast.error('Clipboard access denied');
    }
  }, [handleImageFile]);

  // ---------------------------------------------------------------------------
  // Text input
  // ---------------------------------------------------------------------------

  const handleTextExtract = useCallback(async () => {
    if (!textInput.trim()) return;

    setIsExtracting(true);
    try {
      const result = await extractTasksFromText(textInput.trim());
      setPendingExtraction(result);
      toast.success(`Found ${result.tasks.length} tasks`);
    } catch (err) {
      console.error('Text extraction failed:', err);
      toast.error('Failed to extract tasks from text');
    } finally {
      setIsExtracting(false);
    }
  }, [textInput]);

  // ---------------------------------------------------------------------------
  // Save extracted tasks
  // ---------------------------------------------------------------------------

  const handleSaveExtracted = useCallback(async (tasks: ExtractedTask[]) => {
    try {
      for (const task of tasks) {
        await apiCreateTask({
          name: task.name,
          description: task.description,
          priority: task.priority,
          category: task.category,
        });
      }
      toast.success(`${tasks.length} tasks added`);
      setPendingExtraction(null);
      setInputMode('idle');
      setTextInput('');
      loadTasks();
    } catch (err) {
      console.error('Failed to save tasks:', err);
      toast.error('Failed to save tasks');
    }
  }, [loadTasks]);

  // ---------------------------------------------------------------------------
  // Manual task creation
  // ---------------------------------------------------------------------------

  const handleManualCreate = useCallback(async () => {
    if (!manualInput.trim()) return;
    try {
      await apiCreateTask({ name: manualInput.trim() });
      toast.success('Task added');
      setManualInput('');
      setInputMode('idle');
      loadTasks();
    } catch (err) {
      console.error('Failed to create task:', err);
      toast.error('Failed to create task');
    }
  }, [manualInput, loadTasks]);

  // ---------------------------------------------------------------------------
  // Task actions
  // ---------------------------------------------------------------------------

  const handleComplete = useCallback(async (taskId: string) => {
    try {
      await markTaskCompleted(taskId);
      setIncompleteTasks(prev => prev.filter(t => t.id !== taskId));
      loadTasks();
    } catch (err) {
      console.error('Failed to complete task:', err);
      toast.error('Failed to complete task');
    }
  }, [loadTasks]);

  const handleUncomplete = useCallback(async (taskId: string) => {
    try {
      await markTaskIncomplete(taskId);
      setCompletedTasks(prev => prev.filter(t => t.id !== taskId));
      loadTasks();
    } catch (err) {
      console.error('Failed to uncomplete task:', err);
      toast.error('Failed to uncomplete task');
    }
  }, [loadTasks]);

  const handleDelete = useCallback(async (taskId: string, listId = 'default') => {
    try {
      await apiDeleteTask(listId, taskId);
      setIncompleteTasks(prev => prev.filter(t => t.id !== taskId));
      setCompletedTasks(prev => prev.filter(t => t.id !== taskId));
      toast.success('Task deleted');
    } catch (err) {
      console.error('Failed to delete task:', err);
      toast.error('Failed to delete task');
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Not authenticated
  // ---------------------------------------------------------------------------

  if (!currentUser) {
    return (
      <div className="flex min-h-[calc(100vh-3rem)] items-center justify-center">
        <div className="text-center space-y-4">
          <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground" />
          <h1 className="text-2xl font-bold">Todo</h1>
          <p className="text-muted-foreground">Please sign in to use the task manager.</p>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div
      className="relative mx-auto max-w-3xl px-4 py-8"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Global drag overlay */}
      {isDragging && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4 rounded-2xl border-2 border-dashed border-primary p-16">
            <Upload className="h-12 w-12 text-primary" />
            <p className="text-lg font-medium text-primary">Drop image to extract tasks</p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Todo</h1>
        <p className="mt-1 text-muted-foreground">
          AI-powered task manager
        </p>
      </div>

      {/* Input modes */}
      <div className="mb-6 space-y-4">
        {/* Mode selector buttons */}
        {inputMode === 'idle' && !pendingExtraction && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => setInputMode('image')}
              className="gap-2"
            >
              <ImageIcon className="h-4 w-4" />
              Screenshot
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setInputMode('text');
                setTimeout(() => textareaRef.current?.focus(), 100);
              }}
              className="gap-2"
            >
              <FileText className="h-4 w-4" />
              Text
            </Button>
            <Button
              variant="outline"
              onClick={() => setInputMode('manual')}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              Manual
            </Button>
          </div>
        )}

        {/* Image input */}
        {inputMode === 'image' && !pendingExtraction && (
          <div className="rounded-xl border-2 border-dashed border-muted-foreground/25 p-8">
            <div className="flex flex-col items-center gap-4">
              {isExtracting ? (
                <>
                  <Loader2 className="h-10 w-10 animate-spin text-primary" />
                  <p className="text-muted-foreground">Analyzing image with AI...</p>
                </>
              ) : (
                <>
                  <ImageIcon className="h-10 w-10 text-muted-foreground/50" />
                  <p className="text-muted-foreground">
                    Drop an image, paste from clipboard, or select a file
                  </p>
                  <div className="flex gap-3">
                    <Button
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload className="mr-2 h-4 w-4" />
                      Select File
                    </Button>
                    <Button variant="outline" onClick={handlePasteImage}>
                      <Clipboard className="mr-2 h-4 w-4" />
                      Paste
                    </Button>
                    <Button variant="ghost" onClick={() => setInputMode('idle')}>
                      Cancel
                    </Button>
                  </div>
                </>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleImageFile(file);
                e.target.value = '';
              }}
            />
          </div>
        )}

        {/* Text input */}
        {inputMode === 'text' && !pendingExtraction && (
          <div className="space-y-3">
            <textarea
              ref={textareaRef}
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="Paste article, meeting notes, or any text. AI will extract actionable tasks..."
              className="w-full min-h-[150px] rounded-lg border bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/50 resize-y"
            />
            <div className="flex gap-2">
              <Button
                onClick={handleTextExtract}
                disabled={!textInput.trim() || isExtracting}
                className="gap-2"
              >
                {isExtracting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                Extract Tasks
              </Button>
              <Button variant="ghost" onClick={() => { setInputMode('idle'); setTextInput(''); }}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Manual input */}
        {inputMode === 'manual' && (
          <div className="flex gap-2">
            <input
              type="text"
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleManualCreate()}
              placeholder="What do you need to do?"
              className="flex-1 rounded-lg border bg-background px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50"
              autoFocus
            />
            <Button onClick={handleManualCreate} disabled={!manualInput.trim()}>
              Add
            </Button>
            <Button variant="ghost" onClick={() => { setInputMode('idle'); setManualInput(''); }}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Pending extraction preview */}
        {pendingExtraction && (
          <div className="rounded-xl border bg-card p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  AI Extracted Tasks
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {pendingExtraction.summary}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => { setPendingExtraction(null); setInputMode('idle'); setTextInput(''); }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <ul className="space-y-2">
              {pendingExtraction.tasks.map((task, i) => (
                <li key={i} className="flex items-start gap-3 rounded-lg border px-4 py-3">
                  <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm">{task.name}</p>
                    {task.description && (
                      <p className="text-xs text-muted-foreground mt-0.5">{task.description}</p>
                    )}
                    <div className="flex gap-2 mt-1">
                      {task.priority && (
                        <span className={cn(
                          'text-xs px-1.5 py-0.5 rounded-full',
                          task.priority === 'high' && 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
                          task.priority === 'medium' && 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
                          task.priority === 'low' && 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
                        )}>
                          {task.priority}
                        </span>
                      )}
                      {task.category && (
                        <span className="text-xs px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                          {task.category}
                        </span>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            <div className="flex gap-2">
              <Button onClick={() => handleSaveExtracted(pendingExtraction.tasks)} className="gap-2">
                <Check className="h-4 w-4" />
                Add All ({pendingExtraction.tasks.length})
              </Button>
              <Button
                variant="ghost"
                onClick={() => { setPendingExtraction(null); setInputMode('idle'); setTextInput(''); }}
              >
                Discard
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Task list */}
      {isLoading && incompleteTasks.length === 0 ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Incomplete tasks */}
          {incompleteTasks.length === 0 && completedTasks.length === 0 && !pendingExtraction ? (
            <div className="text-center py-16 text-muted-foreground">
              <Circle className="h-12 w-12 mx-auto mb-4 opacity-30" />
              <p>No tasks yet.</p>
              <p className="text-sm mt-1">
                Add a task manually, or use AI to extract tasks from a screenshot or text.
              </p>
            </div>
          ) : (
            <>
              <ul className="space-y-1">
                {incompleteTasks.map((task) => (
                  <li
                    key={task.id}
                    className="group flex items-start gap-3 rounded-lg px-4 py-3 hover:bg-muted/50 transition-colors"
                  >
                    <button
                      onClick={() => handleComplete(task.id)}
                      className="mt-0.5 shrink-0 text-muted-foreground hover:text-primary transition-colors"
                    >
                      <Circle className="h-5 w-5" />
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">{task.name}</p>
                      {task.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">{task.description}</p>
                      )}
                      <div className="flex gap-2 mt-1">
                        {task.priority && (
                          <span className={cn(
                            'text-xs px-1.5 py-0.5 rounded-full',
                            task.priority === 'high' && 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
                            task.priority === 'medium' && 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
                            task.priority === 'low' && 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
                          )}>
                            {task.priority}
                          </span>
                        )}
                        {task.category && (
                          <span className="text-xs px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                            {task.category}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDelete(task.id, task.list_id)}
                      className="shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>

              {/* Completed tasks */}
              {completedTasks.length > 0 && (
                <div>
                  <button
                    onClick={() => setShowCompleted(!showCompleted)}
                    className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2"
                  >
                    {showCompleted ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                    Completed ({completedTasks.length})
                  </button>

                  {showCompleted && (
                    <ul className="space-y-1">
                      {completedTasks.map((task) => (
                        <li
                          key={task.id}
                          className="group flex items-start gap-3 rounded-lg px-4 py-3 hover:bg-muted/50 transition-colors"
                        >
                          <button
                            onClick={() => handleUncomplete(task.id)}
                            className="mt-0.5 shrink-0 text-primary transition-colors"
                          >
                            <CheckCircle2 className="h-5 w-5" />
                          </button>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm line-through text-muted-foreground">{task.name}</p>
                          </div>
                          <button
                            onClick={() => handleDelete(task.id, task.list_id)}
                            className="shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
