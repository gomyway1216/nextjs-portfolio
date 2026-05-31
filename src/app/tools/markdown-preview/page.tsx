'use client';

import { Button } from '@/components/ui/button';
import { useFeatureLifecycle } from '@/hooks/useActivityTracker';
import { cn } from '@/lib/utils/util';
import { Clipboard,Eye,FileText,Pencil,Replace,Upload,X } from 'lucide-react';
import { useCallback,useEffect,useRef,useState,type ChangeEvent,type DragEvent } from 'react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { toast } from 'sonner';

// Fallback translations so keys never show as raw text
const FALLBACKS: Record<string, Record<string, string>> = {
  en: {
    dropOrPaste: 'Drop a file or paste from clipboard',
    selectFile: 'Select File',
    paste: 'Paste',
    dropFile: 'Drop file',
    fromClipboard: 'From clipboard',
    readerAndEditor: 'Reader and editor',
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
    readerAndEditor: '閲覧と編集',
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
  const _lifecycle = useFeatureLifecycle('tool.markdown-preview');
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
  }, [p, pushPreviewState, hasContent]);

  const _handleClear = useCallback(() => {
    setMarkdown('');
    setFileName(null);
    setEditMode(false);
    setShowChangeOverlay(false);
  }, []);

  // Drop zone content (reused in both initial screen and change overlay)
  const dropZoneContent = (
    <div
      className={cn(
        'flex w-full max-w-3xl flex-col items-center gap-7 rounded-lg border border-dashed bg-card/85 p-8 text-center shadow-[0_24px_70px_hsl(var(--foreground)/0.08)] backdrop-blur transition-colors sm:p-12',
        isDragging
          ? 'border-primary bg-primary/5'
          : 'border-muted-foreground/25'
      )}
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <FileText className="h-8 w-8" />
      </div>
      <div className="text-center">
        <p className="mb-2 text-sm font-semibold text-primary">{p('readerAndEditor')}</p>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Markdown Preview</h1>
        <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-muted-foreground sm:text-base">
          {p('dropOrPaste')}
        </p>
      </div>
      <div className="flex w-full flex-col justify-center gap-3 sm:w-auto sm:flex-row">
        <Button
          variant="outline"
          size="lg"
          onClick={() => fileInputRef.current?.click()}
          className="w-full sm:w-auto"
        >
          <Upload className="mr-2 h-4 w-4" />
          {p('selectFile')}
        </Button>
        <Button
          variant="outline"
          size="lg"
          onClick={handlePaste}
          className="w-full sm:w-auto"
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
        className="min-h-[calc(100vh-3rem)] bg-[linear-gradient(180deg,hsl(var(--background))_0%,hsl(var(--muted)/0.52)_48%,hsl(var(--background))_100%)] px-4 py-10 text-foreground"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="mx-auto flex min-h-[calc(100vh-8rem)] max-w-5xl items-center justify-center">
          {dropZoneContent}
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
      className="relative flex h-[calc(100vh-3rem)] flex-col bg-[linear-gradient(180deg,hsl(var(--background))_0%,hsl(var(--muted)/0.38)_100%)] text-foreground"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {isDragging && !showChangeOverlay && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4 rounded-lg border-2 border-dashed border-primary bg-card/90 p-10 shadow-xl sm:p-16">
            <Upload className="h-12 w-12 text-primary" />
            <p className="text-lg font-medium text-primary">{p('dropFile')}</p>
          </div>
        </div>
      )}

      {/* Change content overlay */}
      {showChangeOverlay && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-background/90 backdrop-blur-sm">
          <div className="relative w-full max-w-3xl px-4">
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2 top-2 z-50 bg-background/80"
              onClick={() => setShowChangeOverlay(false)}
            >
              <X className="h-5 w-5" />
            </Button>
            {dropZoneContent}
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-col gap-3 border-b bg-background/85 px-4 py-3 shadow-sm backdrop-blur sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
          <FileText className="h-4 w-4" />
          {fileName ? (
            <span className="truncate">{fileName}</span>
          ) : (
            <span>{p('fromClipboard')}</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
            className="h-full w-full resize-none border-none bg-background/80 p-6 font-mono text-sm leading-6 outline-none sm:p-8"
            autoFocus
          />
        ) : (
          <article className="prose prose-neutral dark:prose-invert mx-auto max-w-4xl p-6 sm:p-8">
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
