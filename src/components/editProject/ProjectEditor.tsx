'use client';
import React, { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import DeleteItemDialog from '../dialog/DeleteItemDialog';
import InstantMessage from '../popUp/Alert';
import styles from './rich-text-editor.module.scss';
import { getProjectCategories } from '@/services/projectsService';
import ImageUpload from '../image/ImageUpload';
import TiptapEditor from '../editor/TiptapEditor';
import * as imageApi from '@/services/imageService';
import dayjs from 'dayjs';
import ImageMultipleUpload from '../image/ImapgeMultipleUpload';
import UrlListEditor from '../url/UrlListEditor';
import CategorySelector from '../category/CategorySelector';
import DateSelector from '../date/DateSelector';
import TechnologiesSelector from '../technology/TechnologiesSelector';

interface ProjectEditorProps {
  projectId?: string;
  getProject: (id: string) => Promise<any>;
  createProject: (project: any) => Promise<any>;
  updateProject: (project: any) => Promise<any>;
  deleteProject: (id: string) => Promise<boolean>;
}

const UPDATE_INTERVAL = 10000;

const ProjectEditor = (props: ProjectEditorProps) => {
  const router = useRouter();

  // store the original record
  const [original, setOriginal] = useState<any>();

  // project related states
  const [title, setTitle] = useState<string>('');
  // we need to make sure we only inlcude year, month and day.
  // probaly we should use some type of date picker
  const [date, setDate] = useState<any>(dayjs());
  const [description, setDescription] = useState<string>('');
  const [client, setClient] = useState<string>('');
  const [industry, setIndustry] = useState<string>('');
  const [urls, setUrls] = useState<any[]>([{ name: '', link: '', type: '' }]); // Array of URLs
  const [technologies, setTechnologies] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [thumbImage, setThumbImage] = useState<string>('');
  const [images, setImages] = useState<any[]>([]);

  // editor related states
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState<boolean>(false);
  const [intervalId, setIntervalId] = useState<any>(null);

  // auto save related states
  const [autoSave, setAutoSave] = useState<boolean>(false);
  const [autoSaveTitle, setAutoSaveTitle] = useState<string>('');
  const [autoSaveDate, setAutoSaveDate] = useState<any>(null);
  const [autoSaveDescription, setAutoSaveDescription] = useState<string>('');
  const [autoSaveClient, setAutoSaveClient] = useState<string>('');
  const [autoSaveIndustry, setAutoSaveIndustry] = useState<string>('');
  const [autoSaveUrls, setAutoSaveUrls] = useState<any[]>([]);
  const [autoSaveTechnologies, setAutoSaveTechnologies] = useState<any[]>([]);
  const [autoSaveCategories, setAutoSaveCategories] = useState<any[]>([]);
  const [autoSaveThumbImage, setAutoSaveThumbImage] = useState<string>('');
  const [autoSaveImages, setAutoSaveImages] = useState<any[]>([]);

  // values to be used in the editor
  const [categoryList, setCategoryList] = useState<any[]>([]);

  // create refs to keep track of the changes
  const titleRef = useRef(title);
  const dateRef = useRef(date);
  const descriptionRef = useRef(description);
  const clientRef = useRef(client);
  const industryRef = useRef(industry);
  const urlsRef = useRef(urls);
  const technologiesRef = useRef(technologies);
  const categogiesRef = useRef(categories);

  // keep track of update status
  // const [status, setStatus] = useState<'idle' | 'updating' | 'deleting'>('idle');
  const [status, setStatus] = useState<string>('idle');

  // update the ref when the state changes
  useEffect(() => {
    titleRef.current = title;
  }, [title]);

  useEffect(() => {
    dateRef.current = date;
  }, [date]);

  useEffect(() => {
    descriptionRef.current = description;
  }, [description]);

  useEffect(() => {
    clientRef.current = client;
  }, [client]);

  useEffect(() => {
    industryRef.current = industry;
  }, [industry]);

  useEffect(() => {
    urlsRef.current = urls;
  }, [urls]);

  useEffect(() => {
    technologiesRef.current = technologies;
  }, [technologies]);

  useEffect(() => {
    categogiesRef.current = categories;
  }, [categories]);

  const handleImageUrl = (url: string) => {
    setThumbImage(url); // Update the state with the new array of image URLs
  };

  const handleImageUrls = (urls: any[]) => {
    setImages(urls); // Update the state with the new array of image URLs
  };

  const fetchProject = async () => {
    // if id is defined, the rich text editor is expected to load 
    // the data from the server, if not, create a new project
    if (props.projectId) {
      const doc = await props.getProject(props.projectId);
      if (doc) {
        setOriginal({
          ...doc,
          date: dayjs(doc.date) // Convert the date to a Day.js object
        });
        // set the state with the data from the server
        setTitle(doc.title);
        setDate(dayjs(doc.date));
        setDescription(doc.description);
        setClient(doc.client);
        setIndustry(doc.industry);
        setUrls(doc.urls);
        setTechnologies(doc.technologies);
        setCategories(doc.categories);
        setThumbImage(doc.thumbImage);
        setImages(doc.images);
      } else {
        const msg = 'Project not found!';
        setErrorMessage(msg);
      }
    } else {
      const doc = {
        id: '',
        title: '',
        description: '',
        client: '',
        industry: '',
        urls: [],
        technologies: [],
        categories: [],
        thumbImage: '',
        images: [],
      };
      setOriginal(doc);
    }
  };

  const fetchCategoryList = async () => {
    const categoryList = await getProjectCategories();
    setCategoryList(categoryList);
  };

  useEffect(() => {
    fetchProject();
  }, []);

  useEffect(() => {
    fetchCategoryList();
  }, []);


  const deepCompare = () => {
    let changeRequries = false;

    if (autoSaveTitle !== title) {
      setAutoSaveTitle(title);
      changeRequries = true;
    }

    if (autoSaveDate !== date) {
      setAutoSaveDate(date);
      changeRequries = true;
    }

    if (autoSaveDescription !== description) {
      setAutoSaveDescription(description);
      changeRequries = true;
    }

    if (autoSaveClient !== client) {
      setAutoSaveClient(client);
      changeRequries = true;
    }

    if (autoSaveIndustry !== industry) {
      setAutoSaveIndustry(industry);
      changeRequries = true;
    }

    if (autoSaveUrls !== urls) {
      setAutoSaveUrls(urls);
      changeRequries = true;
    }

    if (autoSaveTechnologies !== technologies) {
      setAutoSaveTechnologies(technologies);
      changeRequries = true;
    }

    if (autoSaveCategories !== categories) {
      setAutoSaveCategories(categories);
      changeRequries = true;
    }

    if (autoSaveThumbImage !== thumbImage) {
      setAutoSaveThumbImage(thumbImage);
      changeRequries = true;
    }

    if (autoSaveImages !== images) {
      setAutoSaveImages(images);
      changeRequries = true;
    }
    
    return changeRequries;
  };

  useEffect(() => {
    if (status === 'idle' && autoSave) {
      const interval = window.setInterval(() => {
        const item = {
          id: props.projectId,
          title: titleRef.current,
          date: dateRef.current,
          description: descriptionRef.current,
          client: clientRef.current,
          industry: industryRef.current,
          thumbImage: thumbImage,
          images: images,
          urls: urlsRef.current,
          technologies: technologiesRef.current,
          categories: categogiesRef.current
        };
        try {
          if (deepCompare()) {
            setStatus('updating');
            props.updateProject(item);
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

  const handleSave = async () => {
    setStatus('updating');
    const handleFunction = props.projectId ? props.updateProject : props.createProject;

    const item = {
      id: props.projectId || '',
      title,
      date,
      description,
      client,
      industry,
      thumbImage,
      images,
      urls,
      technologies,
      categories
    };

    try {
      await handleFunction(item);
      router.push('/#work');
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
      await props.updateProject(original);
      router.push('/#work');
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
    if (!props.projectId) return;
    setStatus('deleting');
    const updateStatus = await props.deleteProject(props.projectId);
    if (updateStatus) {
      router.push('/#work');
    } else {
      const msg = 'deletion of the project is failing!';
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

  const handleCategoriesChange = (event: any) => {
    const value = event.target.value;
    setCategories(typeof value === 'string' ? value.split(',') : value);
  };

  return (
    <div className={styles.root}>
      <div className={styles.subSection}>
        <div className={styles.row}>
          <div className={styles.title}>
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className={styles.switchWrapper}>
            {props.projectId &&
            <div className="flex items-center space-x-2">
              <Switch
                id="auto-save"
                checked={autoSave}
                onCheckedChange={(checked) => setAutoSave(checked)}
              />
              <Label htmlFor="auto-save" className={styles.switch}>Auto Save</Label>
            </div>
            }
          </div>
        </div>
        <div className={styles.row}>
          <CategorySelector
            categoryList={categoryList}
            selectedCategories={categories}
            onCategoryChange={handleCategoriesChange}
          />
          <DateSelector
            date={date}
            setDate={setDate}
          />
        </div>
        <div className={styles.row}>
          <div>
            <Label htmlFor="client">Client</Label>
            <Input
              id="client"
              value={client}
              onChange={(e) => setClient(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="industry">Industry</Label>
            <Input
              id="industry"
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
            />
          </div>
        </div>
        <UrlListEditor urls={urls} setUrls={setUrls} />
      </div>
      <TechnologiesSelector
        selectedTechnologies={technologies}
        setSelectedTechnologies={setTechnologies}
      />
      <ImageUpload
        id={props.projectId || ''}
        type="project"
        handleImageUrl={handleImageUrl}
        originalImageUrl={thumbImage}
      />
      <ImageMultipleUpload
        id={props.projectId || ''}
        type="project"
        handleImageUrls={handleImageUrls}
        originalImageUrls={images} // Pass the current array of image URLs for display
      />
      <TiptapEditor value={description} onChange={setDescription}
        onImageUpload={imageApi.getMenuImageRef} />
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
        {props.projectId && <Button
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

export default ProjectEditor;
