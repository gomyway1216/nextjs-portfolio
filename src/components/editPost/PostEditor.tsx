'use client';
import React, { useEffect, useState, useRef, ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import DeleteItemDialog from '../dialog/DeleteItemDialog';
import InstantMessage from '../popUp/Alert';
import styles from './rich-text-editor.module.scss';
import { getPostCategories } from '@/services/postsService';
import ImageUpload from '../image/ImageUpload';
import TiptapEditor from '../editor/TiptapEditor';
import * as imageApi from '@/services/imageService';

interface PostEditorProps {
  postId?: string;
  category?: string;
  getPost: (id: string, category: string) => Promise<any>;
  createPost: (post: any) => Promise<any>;
  updatePost: (post: any) => Promise<any>;
  deletePost: (id: string, category: string) => Promise<boolean>;
}

const UPDATE_INTERVAL = 10000;

const languageList = [
  { id: 'en', name: 'English' },
  { id: 'ja', name: 'Japanese' },
];

const PostEditor = (props: PostEditorProps) => {
  const [original, setOriginal] = useState<any>();
  const [title, setTitle] = useState<string>('');
  const [body, setBody] = useState<string>('');
  const [category, setCategory] = useState<string>(props.category || '');
  const [isPublic, setPublic] = useState<boolean>(false);
  const [autoSave, setAutoSave] = useState<boolean>(false);
  const [autoSaveBody, setAutoSaveBody] = useState<string>('');
  const [autoSaveTitle, setAutoSaveTitle] = useState<string>('');
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState<boolean>(false);
  const [intervalId, setIntervalId] = useState<any>(null);
  const [categoryList, setCategoryList] = useState<any[]>([]);
  const [imageUrl, setImageUrl] = useState<string>('');
  const [language, setLanguage] = useState<any>({'id': 'en', 'name': 'English'});

  const titleRef = useRef(title);
  const bodyRef = useRef(body);
  const isPublicRef = useRef(isPublic);
  const categoryRef = useRef(category);

  // useState<'idle' | 'updating' | 'deleting'>('idle');
  const [status, setStatus] = useState<string>('idle');

  useEffect(() => {
    titleRef.current = title;
  }, [title]);

  useEffect(() => {
    bodyRef.current = body;
  }, [body]);

  useEffect(() => {
    isPublicRef.current = isPublic;
  }, [isPublic]);

  useEffect(() => {
    categoryRef.current = category;
  }, [category]);

  const fetchPost = async () => {
    // if id is defined, the rich text editor is expected to load 
    // the data from the server, if not, create a new post
    if (props.postId && props.category) {
      const doc = await props.getPost(props.postId, props.category);
      if (doc) {
        setTitle(doc.title);
        setBody(doc.body);
        setPublic(doc.isPublic);
        setOriginal(doc);
        setImageUrl(doc.image);
        setLanguage(doc.language);
      } else {
        const msg = 'Post not found!';
        setErrorMessage(msg);
      }
    } else {
      const doc = {
        id: '',
        title: '',
        body: '',
        isPublic: false,
        created: new Date(),
        lastUpdated: new Date(),
        category: '',
        image: imageUrl,
        language: language
      };
      setOriginal(doc);
    }
  };

  const fetchCategoryList = async () => {
    const categoryList = await getPostCategories();
    setCategoryList(categoryList);
  };

  useEffect(() => {
    fetchPost();
  }, []);

  useEffect(() => {
    fetchCategoryList();
  }, []);


  const deepCompareBodyAndTitle = (body: string, title: string) => {
    if (autoSaveBody !== body || autoSaveTitle !== title) {
      setAutoSaveBody(body);
      setAutoSaveTitle(title);
      return true;
    }
    return false;
  };

  useEffect(() => {
    if (status === 'idle' && autoSave) {
      const interval = window.setInterval(() => {
        const item = {
          id: props.postId,
          title: titleRef.current,
          body: bodyRef.current,
          isPublic: isPublicRef.current,
          created: original?.created || new Date(), // update the timestamp
          lastUpdated: new Date(), // update the timestamp
          category: categoryRef.current,
          image: imageUrl,
          language: language
        };
        try {
          if (deepCompareBodyAndTitle(bodyRef.current, titleRef.current)) {
            setStatus('updating');
            props.updatePost(item);
            setStatus('idle');
          }
        } catch (err) {
          if (err instanceof Error) {
            setErrorMessage(err.message);
          } else {
            setErrorMessage('An error occurred');
          }
          setStatus('idle');
        }

      }, UPDATE_INTERVAL);
      setIntervalId(interval);

      return () => {
        if (intervalId !== null) {
          clearInterval(intervalId);
        }
      };
    } else {
      if (intervalId !== null) {
        clearInterval(intervalId);
      }
    }
  }, [status, autoSave]);


  const handleTitleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setTitle(e.target.value);
  };

  const handleSave = async () => {
    setStatus('updating');
    const handleFunction = props.postId ? props.updatePost : props.createPost;

    const item = {
      id: props.postId || '',
      title,
      body,
      isPublic,
      created: props.postId && original ? original.created : new Date(),
      lastUpdated: new Date(), // always update the timestamp
      category,
      image: imageUrl,
      language
    };

    try {
      await handleFunction(item);
      router.push(`/blog/${category}/${props.postId || item.id}`);
    } catch (err) {
      if (err instanceof Error) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('An error occurred');
      }
    }
    setStatus('idle');
  };


  const handleClose = async () => {
    setStatus('updating');
    try {
      await props.updatePost(original);
      if (props.postId) {
        router.push(`/blog/${category}/${props.postId}`);
      } else {
        router.push('/blog/all');
      }
    } catch (err) {
      if (err instanceof Error) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('An error occurred');
      }
    }
    setStatus('idle');
  };

  const handleDelete = async () => {
    if (!props.postId || !props.category) return;
    setStatus('deleting');
    const updateStatus = await props.deletePost(props.postId, props.category);
    if (updateStatus) {
      router.push(`/blog/${props.category}/${props.postId}`);
    } else {
      const msg = 'deletion of the post is failing!';
      setErrorMessage(msg);
    }
    setStatus('idle');
  };

  const handleDeleteDialogClose = () => {
    setDeleteDialogOpen(false);
  };

  const handleAlertClose = () => {
    setErrorMessage('');
  };

  const handleImageUrl = (url: string) => {
    setImageUrl(url);
  };

  return (
    <div className={styles.root}>
      <div className={styles.subSection}>
        <div className={styles.titleWrapper}>
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            value={title}
            onChange={handleTitleChange}
            className={styles.title}
          />
        </div>
        <div className="w-full">
          <Label htmlFor="category-select">Category</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger id="category-select">
              <SelectValue placeholder="Select a category" />
            </SelectTrigger>
            <SelectContent>
              {categoryList.map((cat) => (
                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-full">
          <Label htmlFor="language-select">Language</Label>
          <Select value={language} onValueChange={setLanguage}>
            <SelectTrigger id="language-select">
              <SelectValue placeholder="Select a language" />
            </SelectTrigger>
            <SelectContent>
              {languageList.map((lang) => (
                <SelectItem key={lang.id} value={lang.id}>{lang.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className={styles.switchWrapper}>
          {props.postId &&
            <div className="flex items-center space-x-2">
              <Switch
                id="auto-save"
                checked={autoSave}
                onCheckedChange={setAutoSave}
              />
              <Label htmlFor="auto-save" className={styles.switch}>Auto Save</Label>
            </div>
          }
          <div className="flex items-center space-x-2">
            <Switch
              id="is-public"
              checked={isPublic}
              onCheckedChange={setPublic}
            />
            <Label htmlFor="is-public" className={styles.switch}>Publishing?</Label>
          </div>
        </div>
      </div>
      <ImageUpload
        id={props.postId || ''}
        type="blog"
        handleImageUrl={handleImageUrl}
        originalImageUrl={imageUrl}
      />
      <TiptapEditor
        value={body}
        onChange={setBody}
        onImageUpload={imageApi.getMenuImageRef}
      />
      <div className={styles.buttons}>
        <Button
          variant="outline"
          onClick={handleSave}
          className={styles.button}>
          Save and Close
        </Button>
        <Button
          variant="outline"
          onClick={handleClose}
          className={styles.button}>
          Close without Saving
        </Button>
        {props.postId && <Button
          variant="destructive"
          onClick={() => setDeleteDialogOpen(true)}
          className={styles.button}
        >
          Delete
        </Button>
        }
      </div>
      <DeleteItemDialog open={deleteDialogOpen}
        onClose={handleDeleteDialogClose} callback={handleDelete}
        errorMessage={errorMessage} />
      {errorMessage && <InstantMessage message={errorMessage}
        onClose={handleAlertClose} />
      }
    </div>
  );
};

export default PostEditor;
