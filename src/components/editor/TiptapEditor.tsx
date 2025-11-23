'use client';
import React from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import { Button } from '@/components/ui/button';
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  List,
  ListOrdered,
  Quote,
  Undo,
  Redo,
  ImageIcon,
  Link as LinkIcon,
  Heading1,
  Heading2,
  Heading3,
} from 'lucide-react';
import styles from './tiptap-editor.module.scss';

interface TiptapEditorProps {
  value: string;
  onChange: (value: string) => void;
  onImageUpload?: (file: File) => Promise<string>;
}

const TiptapEditor = ({ value, onChange, onImageUpload }: TiptapEditorProps) => {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Image,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          target: '_blank',
          rel: 'noopener noreferrer',
        },
      }),
    ],
    content: value,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  const addImage = async () => {
    if (!onImageUpload) {
      const url = window.prompt('Enter image URL:');
      if (url && editor) {
        editor.chain().focus().setImage({ src: url }).run();
      }
      return;
    }

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file && editor) {
        try {
          const url = await onImageUpload(file);
          editor.chain().focus().setImage({ src: url }).run();
        } catch (error) {
          console.error('Error uploading image:', error);
        }
      }
    };
    input.click();
  };

  const setLink = () => {
    if (!editor) return;

    const previousUrl = editor.getAttributes('link').href;
    const url = window.prompt('Enter URL:', previousUrl);

    if (url === null) {
      return;
    }

    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }

    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  if (!editor) {
    return null;
  }

  return (
    <div className={styles.tiptapEditor}>
      <div className={styles.toolbar}>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={editor.isActive('bold') ? styles.isActive : ''}
        >
          <Bold className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={editor.isActive('italic') ? styles.isActive : ''}
        >
          <Italic className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => editor.chain().focus().toggleStrike().run()}
          className={editor.isActive('strike') ? styles.isActive : ''}
        >
          <Strikethrough className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => editor.chain().focus().toggleCode().run()}
          className={editor.isActive('code') ? styles.isActive : ''}
        >
          <Code className="h-4 w-4" />
        </Button>

        <div className={styles.divider} />

        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          className={editor.isActive('heading', { level: 1 }) ? styles.isActive : ''}
        >
          <Heading1 className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          className={editor.isActive('heading', { level: 2 }) ? styles.isActive : ''}
        >
          <Heading2 className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          className={editor.isActive('heading', { level: 3 }) ? styles.isActive : ''}
        >
          <Heading3 className="h-4 w-4" />
        </Button>

        <div className={styles.divider} />

        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={editor.isActive('bulletList') ? styles.isActive : ''}
        >
          <List className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={editor.isActive('orderedList') ? styles.isActive : ''}
        >
          <ListOrdered className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          className={editor.isActive('blockquote') ? styles.isActive : ''}
        >
          <Quote className="h-4 w-4" />
        </Button>

        <div className={styles.divider} />

        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={addImage}
        >
          <ImageIcon className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={setLink}
          className={editor.isActive('link') ? styles.isActive : ''}
        >
          <LinkIcon className="h-4 w-4" />
        </Button>

        <div className={styles.divider} />

        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
        >
          <Undo className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
        >
          <Redo className="h-4 w-4" />
        </Button>
      </div>
      <EditorContent editor={editor} className={styles.editorContent} />
    </div>
  );
};

export default TiptapEditor;
