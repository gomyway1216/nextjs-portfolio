'use client';

import { useState, useCallback, useRef, useEffect, type DragEvent, type ChangeEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from '@/components/ui/button';
import { FileText, Upload, Clipboard, Pencil, Eye, X } from 'lucide-react';
import { cn } from '@/lib/utils/util';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

export default function MarkdownPreviewPage() {
  const { t } = useTranslation();
  const [markdown, setMarkdown] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const p = (key: string, options?: Record<string, string>) =>
    t(`tools.markdownPreview.page.${key}`, options);

  const hasContent = markdown.length > 0;

  // Push a history entry when content is loaded so browser back returns to the drop zone
  const pushPreviewState = useCallback(() => {
    window.history.pushState({ mdPreview: true }, '');
  }, []);

  useEffect(() => {
    const onPopState = (e: PopStateEvent) => {
      // If we were in preview and user pressed back, clear content
      if (!e.state?.mdPreview) {
        setMarkdown('');
        setFileName(null);
        setEditMode(false);
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const handleFileRead = useCallback((file: File) => {
    if (!file.name.endsWith('.md') && !file.name.endsWith('.markdown') && !file.name.endsWith('.mdx') && !file.name.endsWith('.txt')) {
      toast.error(p('invalidFileType'));
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result;
      if (typeof text === 'string') {
        pushPreviewState();
        setMarkdown(text);
        setFileName(file.name);
        setEditMode(false);
        toast.success(p('fileLoaded', { name: file.name }));
      }
    };
    reader.onerror = () => {
      toast.error(p('fileReadError'));
    };
    reader.readAsText(file);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, pushPreviewState]);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileRead(files[0]);
    }
  }, [handleFileRead]);

  const handleFileSelect = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileRead(files[0]);
    }
    // reset input so the same file can be selected again
    e.target.value = '';
  }, [handleFileRead]);

  const handlePaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        pushPreviewState();
        setMarkdown(text);
        setFileName(null);
        setEditMode(false);
        toast.success(p('pastedFromClipboard'));
      } else {
        toast.error(p('clipboardEmpty'));
      }
    } catch {
      toast.error(p('clipboardDenied'));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, pushPreviewState]);

  const handleClear = useCallback(() => {
    setMarkdown('');
    setFileName(null);
    setEditMode(false);
  }, []);

  // Empty state / drop zone
  if (!hasContent) {
    return (
      <div
        className="fixed inset-0 flex flex-col items-center justify-center bg-background"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div
          className={cn(
            'flex flex-col items-center gap-8 rounded-2xl border-2 border-dashed p-16 transition-colors',
            isDragging
              ? 'border-primary bg-primary/5'
              : 'border-muted-foreground/25'
          )}
        >
          <FileText className="h-16 w-16 text-muted-foreground/50" />
          <div className="text-center">
            <h1 className="text-2xl font-bold">Markdown Preview</h1>
            <p className="mt-2 text-muted-foreground">
              {p('dropOrPaste')}
            </p>
          </div>
          <div className="flex gap-4">
            <Button
              variant="outline"
              size="lg"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="mr-2 h-4 w-4" />
              {p('selectFile')}
            </Button>
            <Button
              variant="outline"
              size="lg"
              onClick={handlePaste}
            >
              <Clipboard className="mr-2 h-4 w-4" />
              {p('paste')}
            </Button>
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".md,.markdown,.mdx,.txt"
          className="hidden"
          onChange={handleFileSelect}
        />
      </div>
    );
  }

  // Preview / Edit mode
  return (
    <div
      className="fixed inset-0 flex flex-col bg-background"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4 rounded-2xl border-2 border-dashed border-primary p-16">
            <Upload className="h-12 w-12 text-primary" />
            <p className="text-lg font-medium text-primary">{p('dropFile')}</p>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between border-b px-4 py-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <FileText className="h-4 w-4" />
          {fileName ? (
            <span>{fileName}</span>
          ) : (
            <span>{p('fromClipboard')}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={editMode ? 'default' : 'outline'}
            size="sm"
            onClick={() => setEditMode(!editMode)}
          >
            {editMode ? (
              <>
                <Eye className="mr-1 h-3.5 w-3.5" />
                {p('preview')}
              </>
            ) : (
              <>
                <Pencil className="mr-1 h-3.5 w-3.5" />
                {p('edit')}
              </>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="mr-1 h-3.5 w-3.5" />
            {p('anotherFile')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handlePaste}
          >
            <Clipboard className="mr-1 h-3.5 w-3.5" />
            {p('paste')}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleClear}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-auto">
        {editMode ? (
          <textarea
            ref={textareaRef}
            value={markdown}
            onChange={(e) => setMarkdown(e.target.value)}
            className="h-full w-full resize-none border-none bg-background p-8 font-mono text-sm outline-none"
            autoFocus
          />
        ) : (
          <article className="prose prose-neutral dark:prose-invert mx-auto max-w-4xl p-8">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {markdown}
            </ReactMarkdown>
          </article>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".md,.markdown,.mdx,.txt"
        className="hidden"
        onChange={handleFileSelect}
      />
    </div>
  );
}
