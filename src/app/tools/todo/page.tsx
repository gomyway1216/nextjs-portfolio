'use client';

import { useState, useCallback, useRef, useEffect, type DragEvent } from 'react';
import { useAuth } from '@/providers/AuthProvider';
import {
  extractTasksFromImage,
  extractTasksFromText,
  createTask as apiCreateTask,
  updateTask as apiUpdateTask,
  getIncompleteTasks,
  getCompletedTasks,
  markTaskCompleted,
  markTaskIncomplete,
  deleteTask as apiDeleteTask,
  // Groups
  createTaskGroup,
  getTaskGroups,
  joinTaskGroup,
  leaveTaskGroup,
  createGroupTask,
  getGroupTasks,
  updateGroupTask,
  deleteGroupTask as apiDeleteGroupTask,
  type ExtractedTask,
  type Task,
  type TaskGroup,
} from '@/services/todoService';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/util';
import { toast } from 'sonner';
import {
  Image as ImageIcon,
  FileText,
  Plus,
  Check,
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
  Users,
  Link2,
  LogOut,
  Calendar,
  Copy,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type InputMode = 'idle' | 'image' | 'text' | 'manual';
type ViewMode = 'personal' | 'group';

interface PendingExtraction {
  tasks: ExtractedTask[];
  summary: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDueDate(dateStr?: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diff = d.getTime() - now.getTime();
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));

  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days <= 7) return `${days}d`;
  return d.toLocaleDateString();
}

function dueDateColor(dateStr?: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diff = d.getTime() - now.getTime();
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));

  if (days < 0) return 'text-red-500';
  if (days === 0) return 'text-orange-500';
  if (days <= 2) return 'text-yellow-600 dark:text-yellow-400';
  return 'text-muted-foreground';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TodoPage() {
  const { currentUser } = useAuth();

  // View mode
  const [viewMode, setViewMode] = useState<ViewMode>('personal');
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  // Task lists
  const [incompleteTasks, setIncompleteTasks] = useState<Task[]>([]);
  const [completedTasks, setCompletedTasks] = useState<Task[]>([]);
  const [showCompleted, setShowCompleted] = useState(false);

  // Groups
  const [groups, setGroups] = useState<TaskGroup[]>([]);
  const [showGroupPanel, setShowGroupPanel] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [joinName, setJoinName] = useState('');

  // Input state
  const [inputMode, setInputMode] = useState<InputMode>('idle');
  const [isDragging, setIsDragging] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [pendingExtraction, setPendingExtraction] = useState<PendingExtraction | null>(null);
  const [textInput, setTextInput] = useState('');
  const [manualInput, setManualInput] = useState('');
  const [manualDueDate, setManualDueDate] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Editing due date
  const [editingDueDateId, setEditingDueDateId] = useState<string | null>(null);
  const [editingDueDateValue, setEditingDueDateValue] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const selectedGroup = groups.find(g => g.id === selectedGroupId);

  // ---------------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------------

  const loadPersonalTasks = useCallback(async () => {
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

  const loadGroupTasks = useCallback(async (groupId: string) => {
    if (!currentUser) return;
    setIsLoading(true);
    try {
      const [incomplete, completed] = await Promise.all([
        getGroupTasks(groupId, false),
        getGroupTasks(groupId, true),
      ]);
      setIncompleteTasks(incomplete);
      setCompletedTasks(completed);
    } catch (err) {
      console.error('Failed to load group tasks:', err);
    } finally {
      setIsLoading(false);
    }
  }, [currentUser]);

  const loadGroups = useCallback(async () => {
    if (!currentUser) return;
    try {
      const g = await getTaskGroups();
      setGroups(g);
    } catch (err) {
      console.error('Failed to load groups:', err);
    }
  }, [currentUser]);

  const loadTasks = useCallback(() => {
    if (viewMode === 'group' && selectedGroupId) {
      return loadGroupTasks(selectedGroupId);
    }
    return loadPersonalTasks();
  }, [viewMode, selectedGroupId, loadPersonalTasks, loadGroupTasks]);

  useEffect(() => {
    loadTasks();
    loadGroups();
  }, [loadTasks, loadGroups]);

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

  const handleDragOver = useCallback((e: DragEvent) => { e.preventDefault(); setIsDragging(true); }, []);
  const handleDragLeave = useCallback((e: DragEvent) => { e.preventDefault(); setIsDragging(false); }, []);
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
  // Save tasks
  // ---------------------------------------------------------------------------

  const handleSaveExtracted = useCallback(async (tasks: ExtractedTask[]) => {
    try {
      for (const task of tasks) {
        if (viewMode === 'group' && selectedGroupId) {
          await createGroupTask(selectedGroupId, {
            name: task.name,
            description: task.description,
            priority: task.priority,
            category: task.category,
          });
        } else {
          await apiCreateTask({
            name: task.name,
            description: task.description,
            priority: task.priority,
            category: task.category,
          });
        }
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
  }, [loadTasks, viewMode, selectedGroupId]);

  const handleManualCreate = useCallback(async () => {
    if (!manualInput.trim()) return;
    try {
      if (viewMode === 'group' && selectedGroupId) {
        await createGroupTask(selectedGroupId, {
          name: manualInput.trim(),
          ...(manualDueDate ? { due_date: manualDueDate } : {}),
        });
      } else {
        await apiCreateTask({
          name: manualInput.trim(),
          ...(manualDueDate ? { due_date: manualDueDate } : {}),
        });
      }
      toast.success('Task added');
      setManualInput('');
      setManualDueDate('');
      setInputMode('idle');
      loadTasks();
    } catch (err) {
      console.error('Failed to create task:', err);
      toast.error('Failed to create task');
    }
  }, [manualInput, manualDueDate, loadTasks, viewMode, selectedGroupId]);

  // ---------------------------------------------------------------------------
  // Task actions
  // ---------------------------------------------------------------------------

  const handleComplete = useCallback(async (taskId: string) => {
    try {
      if (viewMode === 'group' && selectedGroupId) {
        await updateGroupTask(selectedGroupId, taskId, { completed: true });
      } else {
        await markTaskCompleted(taskId);
      }
      setIncompleteTasks(prev => prev.filter(t => t.id !== taskId));
      loadTasks();
    } catch (err) {
      console.error('Failed:', err);
      toast.error('Failed to complete task');
    }
  }, [loadTasks, viewMode, selectedGroupId]);

  const handleUncomplete = useCallback(async (taskId: string) => {
    try {
      if (viewMode === 'group' && selectedGroupId) {
        await updateGroupTask(selectedGroupId, taskId, { completed: false });
      } else {
        await markTaskIncomplete(taskId);
      }
      setCompletedTasks(prev => prev.filter(t => t.id !== taskId));
      loadTasks();
    } catch (err) {
      console.error('Failed:', err);
      toast.error('Failed to uncomplete task');
    }
  }, [loadTasks, viewMode, selectedGroupId]);

  const handleDelete = useCallback(async (taskId: string, listId = 'default') => {
    try {
      if (viewMode === 'group' && selectedGroupId) {
        await apiDeleteGroupTask(selectedGroupId, taskId);
      } else {
        await apiDeleteTask(listId, taskId);
      }
      setIncompleteTasks(prev => prev.filter(t => t.id !== taskId));
      setCompletedTasks(prev => prev.filter(t => t.id !== taskId));
      toast.success('Task deleted');
    } catch (err) {
      console.error('Failed:', err);
      toast.error('Failed to delete task');
    }
  }, [viewMode, selectedGroupId]);

  const handleSetDueDate = useCallback(async (taskId: string, dueDate: string) => {
    try {
      if (viewMode === 'group' && selectedGroupId) {
        await updateGroupTask(selectedGroupId, taskId, { due_date: dueDate || null });
      } else {
        await apiUpdateTask(taskId, { due_date: dueDate || null });
      }
      setEditingDueDateId(null);
      loadTasks();
    } catch (err) {
      console.error('Failed:', err);
      toast.error('Failed to set due date');
    }
  }, [loadTasks, viewMode, selectedGroupId]);

  // ---------------------------------------------------------------------------
  // Group actions
  // ---------------------------------------------------------------------------

  const handleCreateGroup = useCallback(async () => {
    if (!newGroupName.trim()) return;
    try {
      const displayName = currentUser?.displayName || currentUser?.email || 'User';
      await createTaskGroup(newGroupName.trim(), undefined, displayName);
      toast.success('Group created');
      setNewGroupName('');
      loadGroups();
    } catch (err) {
      console.error('Failed:', err);
      toast.error('Failed to create group');
    }
  }, [newGroupName, currentUser, loadGroups]);

  const handleJoinGroup = useCallback(async () => {
    if (!joinCode.trim() || !joinName.trim()) return;
    try {
      await joinTaskGroup(joinCode.trim().toUpperCase(), joinName.trim());
      toast.success('Joined group');
      setJoinCode('');
      setJoinName('');
      loadGroups();
    } catch (err) {
      console.error('Failed:', err);
      toast.error('Failed to join group');
    }
  }, [joinCode, joinName, loadGroups]);

  const handleLeaveGroup = useCallback(async (groupId: string) => {
    try {
      await leaveTaskGroup(groupId);
      toast.success('Left group');
      if (selectedGroupId === groupId) {
        setViewMode('personal');
        setSelectedGroupId(null);
      }
      loadGroups();
    } catch (err) {
      console.error('Failed:', err);
      toast.error('Failed to leave group');
    }
  }, [selectedGroupId, loadGroups]);

  const handleCopyShareCode = useCallback((code: string) => {
    navigator.clipboard.writeText(code);
    toast.success('Share code copied');
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
  // Task item renderer
  // ---------------------------------------------------------------------------

  const renderTaskItem = (task: Task, isCompleted: boolean) => (
    <li
      key={task.id}
      className="group flex items-start gap-3 rounded-lg px-4 py-3 hover:bg-muted/50 transition-colors"
    >
      <button
        onClick={() => isCompleted ? handleUncomplete(task.id) : handleComplete(task.id)}
        className={cn(
          'mt-0.5 shrink-0 transition-colors',
          isCompleted ? 'text-primary' : 'text-muted-foreground hover:text-primary',
        )}
      >
        {isCompleted ? <CheckCircle2 className="h-5 w-5" /> : <Circle className="h-5 w-5" />}
      </button>
      <div className="min-w-0 flex-1">
        <p className={cn('text-sm', isCompleted && 'line-through text-muted-foreground')}>
          {task.name}
        </p>
        {task.description && !isCompleted && (
          <p className="text-xs text-muted-foreground mt-0.5">{task.description}</p>
        )}
        <div className="flex flex-wrap gap-2 mt-1">
          {task.priority && !isCompleted && (
            <span className={cn(
              'text-xs px-1.5 py-0.5 rounded-full',
              task.priority === 'high' && 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
              task.priority === 'medium' && 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
              task.priority === 'low' && 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
            )}>
              {task.priority}
            </span>
          )}
          {task.category && !isCompleted && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
              {task.category}
            </span>
          )}
          {/* Due date */}
          {!isCompleted && (
            editingDueDateId === task.id ? (
              <span className="flex items-center gap-1">
                <input
                  type="date"
                  value={editingDueDateValue}
                  onChange={(e) => setEditingDueDateValue(e.target.value)}
                  onBlur={() => handleSetDueDate(task.id, editingDueDateValue)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSetDueDate(task.id, editingDueDateValue);
                    if (e.key === 'Escape') setEditingDueDateId(null);
                  }}
                  className="text-xs border rounded px-1.5 py-0.5 bg-background outline-none"
                  autoFocus
                />
              </span>
            ) : (
              <button
                onClick={() => {
                  setEditingDueDateId(task.id);
                  setEditingDueDateValue(task.due_date || '');
                }}
                className={cn(
                  'flex items-center gap-1 text-xs hover:underline',
                  task.due_date ? dueDateColor(task.due_date) : 'text-muted-foreground/50',
                )}
              >
                <Calendar className="h-3 w-3" />
                {task.due_date ? formatDueDate(task.due_date) : 'Set date'}
              </button>
            )
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
  );

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
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Todo</h1>
          <p className="mt-1 text-muted-foreground">
            {viewMode === 'group' && selectedGroup
              ? `${selectedGroup.name} (${selectedGroup.members.length} members)`
              : 'AI-powered task manager'}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowGroupPanel(!showGroupPanel)}
          className="gap-2"
        >
          <Users className="h-4 w-4" />
          Groups
        </Button>
      </div>

      {/* Group panel */}
      {showGroupPanel && (
        <div className="mb-6 rounded-xl border bg-card p-5 space-y-4">
          {/* View tabs */}
          <div className="flex gap-2 border-b pb-3">
            <button
              onClick={() => { setViewMode('personal'); setSelectedGroupId(null); }}
              className={cn(
                'text-sm px-3 py-1.5 rounded-lg transition-colors',
                viewMode === 'personal'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted',
              )}
            >
              My Tasks
            </button>
            {groups.map(g => (
              <button
                key={g.id}
                onClick={() => { setViewMode('group'); setSelectedGroupId(g.id); }}
                className={cn(
                  'text-sm px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5',
                  viewMode === 'group' && selectedGroupId === g.id
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted',
                )}
              >
                <Users className="h-3.5 w-3.5" />
                {g.name}
              </button>
            ))}
          </div>

          {/* Selected group info */}
          {viewMode === 'group' && selectedGroup && (
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-3">
                <span className="text-muted-foreground">Share code:</span>
                <code className="bg-muted px-2 py-0.5 rounded text-xs font-mono">
                  {selectedGroup.share_code}
                </code>
                <button
                  onClick={() => handleCopyShareCode(selectedGroup.share_code)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {selectedGroup.members.map(m => m.name).join(', ')}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-destructive"
                  onClick={() => handleLeaveGroup(selectedGroup.id)}
                >
                  <LogOut className="h-3 w-3 mr-1" />
                  Leave
                </Button>
              </div>
            </div>
          )}

          {/* Create / Join */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Create Group</p>
              <div className="flex gap-2">
                <input
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateGroup()}
                  placeholder="Group name"
                  className="flex-1 rounded-lg border bg-background px-3 py-1.5 text-sm outline-none"
                />
                <Button size="sm" onClick={handleCreateGroup} disabled={!newGroupName.trim()}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Join Group</p>
              <div className="flex gap-2">
                <input
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  placeholder="Share code"
                  className="w-24 rounded-lg border bg-background px-3 py-1.5 text-sm outline-none font-mono uppercase"
                />
                <input
                  value={joinName}
                  onChange={(e) => setJoinName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleJoinGroup()}
                  placeholder="Your name"
                  className="flex-1 rounded-lg border bg-background px-3 py-1.5 text-sm outline-none"
                />
                <Button size="sm" onClick={handleJoinGroup} disabled={!joinCode.trim() || !joinName.trim()}>
                  <Link2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Input modes */}
      <div className="mb-6 space-y-4">
        {inputMode === 'idle' && !pendingExtraction && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setInputMode('image')} className="gap-2">
              <ImageIcon className="h-4 w-4" />
              Screenshot
            </Button>
            <Button
              variant="outline"
              onClick={() => { setInputMode('text'); setTimeout(() => textareaRef.current?.focus(), 100); }}
              className="gap-2"
            >
              <FileText className="h-4 w-4" />
              Text
            </Button>
            <Button variant="outline" onClick={() => setInputMode('manual')} className="gap-2">
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
                  <p className="text-muted-foreground">Drop an image, paste from clipboard, or select a file</p>
                  <div className="flex gap-3">
                    <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                      <Upload className="mr-2 h-4 w-4" />Select File
                    </Button>
                    <Button variant="outline" onClick={handlePasteImage}>
                      <Clipboard className="mr-2 h-4 w-4" />Paste
                    </Button>
                    <Button variant="ghost" onClick={() => setInputMode('idle')}>Cancel</Button>
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
              <Button onClick={handleTextExtract} disabled={!textInput.trim() || isExtracting} className="gap-2">
                {isExtracting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Extract Tasks
              </Button>
              <Button variant="ghost" onClick={() => { setInputMode('idle'); setTextInput(''); }}>Cancel</Button>
            </div>
          </div>
        )}

        {/* Manual input */}
        {inputMode === 'manual' && (
          <div className="space-y-2">
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
              <Button onClick={handleManualCreate} disabled={!manualInput.trim()}>Add</Button>
              <Button variant="ghost" onClick={() => { setInputMode('idle'); setManualInput(''); setManualDueDate(''); }}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex items-center gap-2 pl-1">
              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="date"
                value={manualDueDate}
                onChange={(e) => setManualDueDate(e.target.value)}
                className="text-xs border rounded px-2 py-1 bg-background outline-none text-muted-foreground"
              />
              {manualDueDate && (
                <button onClick={() => setManualDueDate('')} className="text-muted-foreground hover:text-foreground">
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
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
                <p className="text-sm text-muted-foreground mt-1">{pendingExtraction.summary}</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => { setPendingExtraction(null); setInputMode('idle'); setTextInput(''); }}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <ul className="space-y-2">
              {pendingExtraction.tasks.map((task, i) => (
                <li key={i} className="flex items-start gap-3 rounded-lg border px-4 py-3">
                  <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm">{task.name}</p>
                    {task.description && <p className="text-xs text-muted-foreground mt-0.5">{task.description}</p>}
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
                        <span className="text-xs px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">{task.category}</span>
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
              <Button variant="ghost" onClick={() => { setPendingExtraction(null); setInputMode('idle'); setTextInput(''); }}>
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
                {incompleteTasks.map((task) => renderTaskItem(task, false))}
              </ul>

              {completedTasks.length > 0 && (
                <div>
                  <button
                    onClick={() => setShowCompleted(!showCompleted)}
                    className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2"
                  >
                    {showCompleted ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    Completed ({completedTasks.length})
                  </button>
                  {showCompleted && (
                    <ul className="space-y-1">
                      {completedTasks.map((task) => renderTaskItem(task, true))}
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
