'use client';

import { useState, useCallback, useRef, useEffect, type DragEvent, type ChangeEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from '@/components/ui/button';
import { FileText, Upload, Clipboard, Pencil, Eye, X, Replace } from 'lucide-react';
import { cn } from '@/lib/utils/util';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

// Fallback translations so keys never show as raw text
const FALLBACKS: Record<string, Record<string, string>> = {
  en: {
    dropOrPaste: 'Drop a file or paste from clipboard',
    selectFile: 'Select File',
    paste: 'Paste',
    dropFile: 'Drop file',
    fromClipboard: 'From clipboard',
    preview: 'Preview',
    edit: 'Edit',
    changeContent: 'Change',
    fileLoaded: '{{name}} loaded',
    pastedFromClipboard: 'Pasted from clipboard',
    invalidFileType: 'Please select a markdown file (.md, .markdown, .mdx, .txt)',
    fileReadError: 'Failed to read file',
    clipboardEmpty: 'No text in clipboard',
    clipboardDenied: 'Clipboard access denied',
  },
  ja: {
    dropOrPaste: 'ファイルをドロップするか、クリップボードから貼り付けてください',
    selectFile: 'ファイルを選択',
    paste: '貼り付け',
    dropFile: 'ファイルをドロップ',
    fromClipboard: 'クリップボードから',
    preview: 'プレビュー',
    edit: '編集',
    changeContent: '変更',
    fileLoaded: '{{name}} を読み込みました',
    pastedFromClipboard: 'クリップボードから貼り付けました',
    invalidFileType: 'Markdownファイル (.md, .markdown, .mdx, .txt) を選択してください',
    fileReadError: 'ファイルの読み込みに失敗しました',
    clipboardEmpty: 'クリップボードにテキストがありません',
    clipboardDenied: 'クリップボードへのアクセスが拒否されました',
  },
};

export default function MarkdownPreviewPage() {
  const { t, i18n } = useTranslation();
  const [markdown, setMarkdown] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [showChangeOverlay, setShowChangeOverlay] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Translation helper with inline fallback
  const p = useCallback((key: string, options?: Record<string, string>) => {
    const i18nKey = `tools.markdownPreview.page.${key}`;
    const result = t(i18nKey, { ...options, defaultValue: '' });
    if (result && result !== i18nKey) return result;
    // Use fallback
    const lang = i18n.language?.startsWith('ja') ? 'ja' : 'en';
    let fallback = FALLBACKS[lang]?.[key] ?? FALLBACKS.en[key] ?? key;
    if (options) {
      Object.entries(options).forEach(([k, v]) => {
        fallback = fallback.replace(`{{${k}}}`, v);
      });
    }
    return fallback;
  }, [t, i18n.language]);

  const hasContent = markdown.length > 0;

  // Push a history entry when content is loaded so browser back returns to the drop zone
  const pushPreviewState = useCallback(() => {
    window.history.pushState({ mdPreview: true }, '');
  }, []);

  useEffect(() => {
    const onPopState = (e: PopStateEvent) => {
      if (!e.state?.mdPreview) {
        setMarkdown('');
        setFileName(null);
        setEditMode(false);
        setShowChangeOverlay(false);
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
        if (!hasContent) pushPreviewState();
        setMarkdown(text);
        setFileName(file.name);
        setEditMode(false);
        setShowChangeOverlay(false);
        toast.success(p('fileLoaded', { name: file.name }));
      }
    };
    reader.onerror = () => {
      toast.error(p('fileReadError'));
    };
    reader.readAsText(file);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p, pushPreviewState, hasContent]);

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
    e.target.value = '';
  }, [handleFileRead]);

  const handlePaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        if (!hasContent) pushPreviewState();
        setMarkdown(text);
        setFileName(null);
        setEditMode(false);
        setShowChangeOverlay(false);
        toast.success(p('pastedFromClipboard'));
      } else {
        toast.error(p('clipboardEmpty'));
      }
    } catch {
      toast.error(p('clipboardDenied'));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p, pushPreviewState, hasContent]);

  const handleClear = useCallback(() => {
    setMarkdown('');
    setFileName(null);
    setEditMode(false);
    setShowChangeOverlay(false);
  }, []);

  // Drop zone content (reused in both initial screen and change overlay)
  const dropZoneContent = (
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
  );

  // Initial empty state
  if (!hasContent) {
    return (
      <div
        className="flex min-h-[calc(100vh-3rem)] flex-col items-center justify-center bg-background"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {dropZoneContent}
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
      className="relative flex h-[calc(100vh-3rem)] flex-col bg-background"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {isDragging && !showChangeOverlay && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4 rounded-2xl border-2 border-dashed border-primary p-16">
            <Upload className="h-12 w-12 text-primary" />
            <p className="text-lg font-medium text-primary">{p('dropFile')}</p>
          </div>
        </div>
      )}

      {/* Change content overlay */}
      {showChangeOverlay && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-background/90 backdrop-blur-sm">
          <div className="relative">
            <Button
              variant="ghost"
              size="icon"
              className="absolute -top-2 -right-2 z-50"
              onClick={() => setShowChangeOverlay(false)}
            >
              <X className="h-5 w-5" />
            </Button>
            {dropZoneContent}
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
          {/* Edit / Preview toggle */}
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
          {/* Change content button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowChangeOverlay(true)}
          >
            <Replace className="mr-1 h-3.5 w-3.5" />
            {p('changeContent')}
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
