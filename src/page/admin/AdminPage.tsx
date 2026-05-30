'use client';

import ActivityLogPanel from '@/components/admin/ActivityLogPanel';
import TiptapEditor from '@/components/editor/TiptapEditor';
import HobbiesAdminPanel from '@/components/hobby/HobbiesAdminPanel';
import StudyAdminPanel from '@/components/study/StudyAdminPanel';
import { usePostCategories,usePostMutations,usePosts } from '@/hooks/usePosts';
import { updateProfile,useProfile,useResumeLink } from '@/hooks/useProfile';
import { useProjectCategories,useProjectMutations,useProjects,useUrlTypes } from '@/hooks/useProjects';
import type { PostLanguage,PostTranslations } from '@/lib/blog/postTranslations';
import { useAuth } from '@/providers/AuthProvider';
import * as imageApi from '@/services/imageService';
import type { ListingPost } from '@/services/postsService';
import * as postApi from '@/services/postsService';
import { uploadResume } from '@/services/profileService';
import type { Project } from '@/services/projectsService';
import type { Technology } from '@/services/technologiesService';
import * as technologyApi from '@/services/technologiesService';
import {
AlertCircle,
ArrowLeft,
BookOpen,
Briefcase,
CheckCircle,
ExternalLink,
Eye,
EyeOff,
FileText,
FolderKanban,
Heart,
Image as ImageIcon,
LayoutDashboard,
Loader2,
Pencil,
Plus,
Save,
ScrollText,
Shield,
Trash2,
Upload,
User,
X,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CSSProperties,useEffect,useState } from 'react';

type AdminSection = 'dashboard' | 'profile' | 'projects' | 'posts' | 'jobs' | 'study' | 'hobbies' | 'activity-logs';

interface Job {
  id: string;
  companyName: string;
  jobPosition: string;
  jobDuration: string;
  technologies?: (string | { name: string; id?: string; type?: string })[];
  hidden?: boolean;
}

interface UrlData {
  name: string;
  link: string;
  type: string;
}

// Helper function to get technology name (handles both string and object formats)
const getTechName = (tech: string | { name: string; id?: string; type?: string }): string => {
  if (typeof tech === 'string') return tech;
  if (tech && typeof tech === 'object' && 'name' in tech) return tech.name;
  return '';
};

// Styles
const styles: Record<string, CSSProperties> = {
  container: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #0f172a 0%, #581c87 50%, #0f172a 100%)',
  },
  sidebar: {
    width: '280px',
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    backdropFilter: 'blur(12px)',
    borderRight: '1px solid rgba(255, 255, 255, 0.1)',
    minHeight: '100vh',
    position: 'fixed' as const,
    left: 0,
    top: 0,
  },
  sidebarHeader: {
    padding: '24px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
  },
  sidebarTitle: {
    fontSize: '24px',
    fontWeight: 'bold',
    background: 'linear-gradient(to right, #a855f7, #ec4899)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
  },
  sidebarEmail: {
    fontSize: '14px',
    color: '#94a3b8',
    marginTop: '4px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  navButton: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 16px',
    borderRadius: '12px',
    border: 'none',
    cursor: 'pointer',
    transition: 'all 0.2s',
    marginBottom: '4px',
    fontSize: '15px',
    fontWeight: '500',
  },
  navButtonActive: {
    background: 'linear-gradient(to right, rgba(168, 85, 247, 0.2), rgba(236, 72, 153, 0.2))',
    color: '#ffffff',
    border: '1px solid rgba(168, 85, 247, 0.3)',
  },
  navButtonInactive: {
    backgroundColor: 'transparent',
    color: '#94a3b8',
  },
  main: {
    marginLeft: '280px',
    flex: 1,
    padding: '32px',
  },
  pageTitle: {
    fontSize: '36px',
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: '8px',
  },
  pageSubtitle: {
    color: '#94a3b8',
    marginBottom: '32px',
  },
  card: {
    backgroundColor: 'rgba(30, 41, 59, 0.5)',
    backdropFilter: 'blur(8px)',
    borderRadius: '16px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    overflow: 'hidden',
  },
  statCard: {
    padding: '24px',
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  statIconWrapper: {
    padding: '12px',
    borderRadius: '12px',
  },
  statNumber: {
    fontSize: '32px',
    fontWeight: 'bold',
    color: '#ffffff',
  },
  button: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 20px',
    borderRadius: '8px',
    border: 'none',
    cursor: 'pointer',
    fontWeight: '500',
    fontSize: '14px',
    transition: 'all 0.2s',
  },
  primaryButton: {
    background: 'linear-gradient(to right, #a855f7, #ec4899)',
    color: '#ffffff',
  },
  outlineButton: {
    backgroundColor: 'transparent',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    color: '#ffffff',
  },
  dangerButton: {
    backgroundColor: '#ef4444',
    color: '#ffffff',
  },
  ghostButton: {
    backgroundColor: 'transparent',
    color: '#94a3b8',
    padding: '8px',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
  },
  th: {
    textAlign: 'left' as const,
    padding: '16px 24px',
    fontWeight: '500',
    color: '#94a3b8',
    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
  },
  td: {
    padding: '16px 24px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
  },
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '4px 12px',
    borderRadius: '9999px',
    fontSize: '12px',
    fontWeight: '500',
  },
  techBadge: {
    backgroundColor: 'rgba(168, 85, 247, 0.2)',
    color: '#c084fc',
    border: '1px solid rgba(168, 85, 247, 0.3)',
  },
  input: {
    width: '100%',
    padding: '10px 14px',
    borderRadius: '8px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    color: '#ffffff',
    fontSize: '14px',
    outline: 'none',
  },
  textarea: {
    width: '100%',
    padding: '10px 14px',
    borderRadius: '8px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    color: '#ffffff',
    fontSize: '14px',
    outline: 'none',
    resize: 'vertical' as const,
    minHeight: '100px',
  },
  select: {
    width: '100%',
    padding: '10px 14px',
    borderRadius: '8px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    color: '#ffffff',
    fontSize: '14px',
    outline: 'none',
    cursor: 'pointer',
  },
  label: {
    display: 'block',
    color: '#cbd5e1',
    fontSize: '14px',
    fontWeight: '500',
    marginBottom: '8px',
  },
  modal: {
    position: 'fixed' as const,
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
    padding: '16px',
  },
  modalContent: {
    backgroundColor: '#0f172a',
    borderRadius: '16px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    maxWidth: '640px',
    width: '100%',
    maxHeight: '90vh',
    overflow: 'auto',
  },
  modalHeader: {
    padding: '24px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
  },
  modalTitle: {
    fontSize: '20px',
    fontWeight: '600',
    color: '#ffffff',
  },
  modalBody: {
    padding: '24px',
  },
  modalFooter: {
    padding: '24px',
    borderTop: '1px solid rgba(255, 255, 255, 0.1)',
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
  },
  toast: {
    position: 'fixed' as const,
    top: '16px',
    right: '16px',
    zIndex: 100,
    padding: '16px 24px',
    borderRadius: '12px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
  },
  toastSuccess: {
    backgroundColor: 'rgba(16, 185, 129, 0.9)',
    border: '1px solid #34d399',
    color: '#ffffff',
  },
  toastError: {
    backgroundColor: 'rgba(239, 68, 68, 0.9)',
    border: '1px solid #f87171',
    color: '#ffffff',
  },
};

// Helper to get section from URL hash
const getSectionFromHash = (): AdminSection => {
  if (typeof window === 'undefined') return 'dashboard';
  const hash = window.location.hash.replace('#', '');
  const validSections: AdminSection[] = ['dashboard', 'profile', 'projects', 'posts', 'jobs', 'study', 'hobbies', 'activity-logs'];
  return validSections.includes(hash as AdminSection) ? (hash as AdminSection) : 'dashboard';
};

const AdminPage = () => {
  const { currentUser, loading: authLoading, isAdmin } = useAuth();
  const router = useRouter();
  const { profile, loading: profileLoading } = useProfile();
  const { resumeLink: fetchedResumeLink } = useResumeLink();
  const { projects, loading: projectsLoading, refetch: refetchProjects } = useProjects();
  // Admin sees every post including drafts, so pass `isPublic: null` to
  // skip the public-only filter.
  const { posts, loading: postsLoading, refetch: refetchPosts } = usePosts({ limit: 100, isPublic: null });
  const { categories: projectCategories } = useProjectCategories();
  const { urlTypes } = useUrlTypes();
  const { categories: postCategories } = usePostCategories();
  const projectMutations = useProjectMutations();
  const postMutations = usePostMutations();

  const [activeSection, setActiveSection] = useState<AdminSection>('dashboard');

  // Sync activeSection with URL hash
  useEffect(() => {
    // Set initial section from hash on mount
    setActiveSection(getSectionFromHash());

    // Listen for hash changes (back/forward navigation)
    const handleHashChange = () => {
      setActiveSection(getSectionFromHash());
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Update URL hash when section changes
  const handleSectionChange = (section: AdminSection) => {
    setActiveSection(section);
    window.location.hash = section;
  };
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal states
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [showPostModal, setShowPostModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<{ type: 'project' | 'post' | 'job'; id: string; name: string; category?: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Edit states
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [editingPost, setEditingPost] = useState<ListingPost | null>(null);
  const [_editingJob, setEditingJob] = useState<string | null>(null);
  const [techInput, setTechInput] = useState('');

  // Full-job edit / create form. `null` = no form open; `'new'` = create
  // mode (POST), any other id = edit mode (PUT by id).
  // `order` is kept as a string so the controlled <input type="number">
  // accepts intermediate values like "" or "-" without being eagerly
  // parsed into NaN/0. We coerce to a Number at submit.
  const [jobFormMode, setJobFormMode] = useState<null | 'new' | string>(null);
  const [jobForm, setJobForm] = useState({
    companyName: '',
    jobPosition: '',
    jobPositionJa: '',
    jobType: '',
    jobTypeJa: '',
    jobDuration: '',
    jobDescription: '',
    jobDescriptionJa: '',
    order: '0',
    technologies: '',
  });

  // Available technologies from API
  const [availableTechnologies, setAvailableTechnologies] = useState<Technology[]>([]);

  // Profile edit states
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({
    birthdate: '',
    location: '',
    email: '',
    languages: '',
    bioEn: '',
    bioJa: '',
  });

  // Project form states
  const [projectForm, setProjectForm] = useState({
    title: '',
    description: '',
    date: '',
    client: '',
    industry: '',
    thumbImage: '',
    images: [] as string[],
    urls: [] as UrlData[],
    technologies: '',
    categories: '',
  });

  // Image upload states
  const [uploadingThumb, setUploadingThumb] = useState(false);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [thumbProgress, setThumbProgress] = useState(0);
  const [imagesProgress, setImagesProgress] = useState(0);
  const [dragOverThumb, setDragOverThumb] = useState(false);
  const [dragOverImages, setDragOverImages] = useState(false);
  const [uploadingPostImage, setUploadingPostImage] = useState(false);
  const [postImageProgress, setPostImageProgress] = useState(0);
  const [dragOverPostImage, setDragOverPostImage] = useState(false);
  const [uploadingResume, setUploadingResume] = useState(false);
  const [resumeProgress, setResumeProgress] = useState(0);
  const [dragOverResume, setDragOverResume] = useState(false);
  const [currentResumeLink, setCurrentResumeLink] = useState<string>('');

  // Post form states
  const [postForm, setPostForm] = useState<{
    category: string;
    isPublic: boolean;
    image: string;
    translations: PostTranslations;
  }>({
    category: '',
    isPublic: true,
    image: '',
    translations: {},
  });

  const setTranslationField = (lang: PostLanguage, field: 'title' | 'body', value: string) => {
    setPostForm((prev) => ({
      ...prev,
      translations: {
        ...prev.translations,
        [lang]: {
          title: prev.translations[lang]?.title || '',
          body: prev.translations[lang]?.body || '',
          [field]: value,
        },
      },
    }));
  };

  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!currentUser) {
      router.push('/signin');
      return;
    }
    // Redirect non-admin users to home page
    if (!isAdmin) {
      router.push('/');
      return;
    }
    fetchJobs();
    fetchTechnologies();
  }, [authLoading, currentUser, isAdmin, router]);

  const fetchTechnologies = async () => {
    try {
      const technologies = await technologyApi.getTechnologies();
      setAvailableTechnologies(technologies);
    } catch (error) {
      console.error('Error fetching technologies:', error);
    }
  };

  useEffect(() => {
    if (profile) {
      setProfileForm({
        birthdate: profile.birthdate || '',
        location: profile.location || '',
        email: profile.email || '',
        languages: profile.languages?.join(', ') || '',
        bioEn: profile.bioEn || '',
        bioJa: profile.bioJa || '',
      });
    }
  }, [profile]);

  useEffect(() => {
    if (fetchedResumeLink) {
      setCurrentResumeLink(fetchedResumeLink);
    }
  }, [fetchedResumeLink]);

  const fetchJobs = async () => {
    try {
      const response = await fetch('/api/job');
      const data = await response.json();
      setJobs(data.jobs || []);
    } catch (error) {
      console.error('Error fetching jobs:', error);
    } finally {
      setLoading(false);
    }
  };

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  // Profile handlers
  const handleUpdateProfile = async () => {
    try {
      const languagesArray = profileForm.languages.split(',').map(l => l.trim()).filter(l => l);
      await updateProfile({
        birthdate: profileForm.birthdate,
        location: profileForm.location,
        email: profileForm.email,
        languages: languagesArray,
        bioEn: profileForm.bioEn,
        bioJa: profileForm.bioJa,
      });
      showMessage('success', 'Profile updated successfully!');
      setEditingProfile(false);
    } catch (error) {
      showMessage('error', `Failed to update profile: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Project handlers
  const handleOpenProjectModal = (project?: Project) => {
    if (project) {
      setEditingProject(project);
      const techNames = project.technologies?.map((t) => getTechName(t)).filter(Boolean) || [];
      setProjectForm({
        title: project.title || '',
        description: project.description || '',
        date: project.date || '',
        client: project.client || '',
        industry: project.industry || '',
        thumbImage: project.thumbImage || '',
        images: project.images || [],
        urls: project.urls || [],
        technologies: techNames.join(', '),
        categories: project.categories?.join(', ') || '',
      });
    } else {
      setEditingProject(null);
      setProjectForm({
        title: '',
        description: '',
        date: new Date().toISOString().split('T')[0],
        client: '',
        industry: '',
        thumbImage: '',
        images: [],
        urls: [],
        technologies: '',
        categories: '',
      });
    }
    setShowProjectModal(true);
  };

  // Image upload handlers
  // Use 'undefined' to match existing storage pattern when no project ID exists
  const getProjectIdForUpload = () => editingProject?.id || 'undefined';

  const handleThumbImageUpload = async (file: File) => {
    setUploadingThumb(true);
    setThumbProgress(0);

    const progressInterval = setInterval(() => {
      setThumbProgress((prev) => {
        if (prev >= 90) {
          clearInterval(progressInterval);
          return 90;
        }
        return prev + 10;
      });
    }, 100);

    try {
      const downloadURL = await imageApi.getImageRef(file, 'project', getProjectIdForUpload());
      setProjectForm(prev => ({ ...prev, thumbImage: downloadURL }));
      setThumbProgress(100);
    } catch (error) {
      console.error('Error uploading thumbnail:', error);
      showMessage('error', 'Failed to upload thumbnail image');
    } finally {
      clearInterval(progressInterval);
      setUploadingThumb(false);
      setTimeout(() => setThumbProgress(0), 1000);
    }
  };

  const handleGalleryImageUpload = async (files: FileList) => {
    setUploadingImages(true);
    setImagesProgress(0);

    const progressInterval = setInterval(() => {
      setImagesProgress((prev) => {
        if (prev >= 90) {
          clearInterval(progressInterval);
          return 90;
        }
        return prev + 10;
      });
    }, 100);

    try {
      const projectId = getProjectIdForUpload();
      const uploadPromises = Array.from(files).map(file =>
        imageApi.getImageRef(file, 'project', projectId)
      );
      const downloadURLs = await Promise.all(uploadPromises);
      setProjectForm(prev => ({ ...prev, images: [...prev.images, ...downloadURLs] }));
      setImagesProgress(100);
    } catch (error) {
      console.error('Error uploading images:', error);
      showMessage('error', 'Failed to upload gallery images');
    } finally {
      clearInterval(progressInterval);
      setUploadingImages(false);
      setTimeout(() => setImagesProgress(0), 1000);
    }
  };

  const handleRemoveThumbImage = () => {
    setProjectForm(prev => ({ ...prev, thumbImage: '' }));
  };

  const handleRemoveGalleryImage = (index: number) => {
    setProjectForm(prev => ({
      ...prev,
      images: prev.images.filter((_, i) => i !== index)
    }));
  };

  // URL management handlers
  const handleAddUrl = () => {
    setProjectForm(prev => ({
      ...prev,
      urls: [...prev.urls, { name: '', link: '', type: urlTypes[0] || '' }]
    }));
  };

  const handleUpdateUrl = (index: number, field: keyof UrlData, value: string) => {
    setProjectForm(prev => ({
      ...prev,
      urls: prev.urls.map((url, i) =>
        i === index ? { ...url, [field]: value } : url
      )
    }));
  };

  const handleRemoveUrl = (index: number) => {
    setProjectForm(prev => ({
      ...prev,
      urls: prev.urls.filter((_, i) => i !== index)
    }));
  };

  const handleDragThumb = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDropThumb = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverThumb(false);

    const files = e.dataTransfer.files;
    if (files && files[0] && files[0].type.startsWith('image/')) {
      handleThumbImageUpload(files[0]);
    }
  };

  const handleDropImages = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverImages(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
      if (imageFiles.length > 0) {
        const dt = new DataTransfer();
        imageFiles.forEach(f => dt.items.add(f));
        handleGalleryImageUpload(dt.files);
      }
    }
  };

  const handleSaveProject = async () => {
    try {
      // Convert technology names to technology objects
      const techNames = projectForm.technologies.split(',').map(t => t.trim().toLowerCase()).filter(t => t);
      const technologiesData = techNames.map(name => {
        // Find matching technology from available technologies
        const matchedTech = availableTechnologies.find(
          t => t.name.toLowerCase() === name
        );
        if (matchedTech) {
          return { id: matchedTech.id, name: matchedTech.name, type: matchedTech.type };
        }
        // If not found, return as string (will be stored as-is, but ideally should be in DB)
        return { id: '', name, type: '' };
      });

      const projectData = {
        title: projectForm.title,
        description: projectForm.description,
        date: projectForm.date,
        client: projectForm.client,
        industry: projectForm.industry,
        thumbImage: projectForm.thumbImage,
        images: projectForm.images,
        urls: projectForm.urls,
        technologies: technologiesData,
        categories: projectForm.categories.split(',').map(c => c.trim()).filter(c => c),
      };

      if (editingProject) {
        await projectMutations.updateProject(editingProject.id, projectData);
        showMessage('success', 'Project updated successfully!');
      } else {
        await projectMutations.createProject(projectData);
        showMessage('success', 'Project created successfully!');
      }
      setShowProjectModal(false);
      refetchProjects();
    } catch (error) {
      showMessage('error', `Failed to save project: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleDeleteProject = async (id: string) => {
    if (isDeleting) return;
    setIsDeleting(true);
    try {
      await projectMutations.deleteProject(id);
      showMessage('success', 'Project deleted successfully!');
      refetchProjects();
      setShowDeleteConfirm(null);
    } catch (error) {
      showMessage('error', `Failed to delete project: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsDeleting(false);
    }
  };

  // Post handlers
  const handleOpenPostModal = async (post?: ListingPost) => {
    if (post) {
      setEditingPost(post);
      try {
        // The list endpoint returns the flattened version; load the full
        // post so we can edit every available translation.
        const detail = await postApi.getPostById(post.id);
        setPostForm({
          category: detail.category,
          isPublic: detail.isPublic,
          image: detail.image || '',
          translations: detail.translations,
        });
      } catch (error) {
        showMessage('error', `Failed to load post: ${error instanceof Error ? error.message : 'Unknown error'}`);
        return;
      }
    } else {
      setEditingPost(null);
      setPostForm({
        category: postCategories[0] || '',
        isPublic: true,
        image: '',
        translations: {},
      });
    }
    setShowPostModal(true);
  };

  const handleSavePost = async () => {
    // Strip out translations where both title and body are empty so we
    // never persist a useless { title: '', body: '' } record.
    const cleanedTranslations: PostTranslations = {};
    (['en', 'ja'] as PostLanguage[]).forEach((lang) => {
      const t = postForm.translations[lang];
      if (t && ((t.title || '').trim() || (t.body || '').trim())) {
        cleanedTranslations[lang] = { title: t.title || '', body: t.body || '' };
      }
    });

    if (Object.keys(cleanedTranslations).length === 0) {
      showMessage('error', 'Please fill in at least one language (Title or Content).');
      return;
    }
    if (!postForm.category) {
      showMessage('error', 'Please select a category.');
      return;
    }

    try {
      if (editingPost) {
        await postMutations.updatePost(editingPost.id, {
          category: postForm.category,
          translations: cleanedTranslations,
          isPublic: postForm.isPublic,
          image: postForm.image,
        });
        showMessage('success', 'Post updated successfully!');
      } else {
        await postMutations.createPost({
          category: postForm.category,
          translations: cleanedTranslations,
          isPublic: postForm.isPublic,
          image: postForm.image,
        });
        showMessage('success', 'Post created successfully!');
      }
      setShowPostModal(false);
      refetchPosts();
    } catch (error) {
      showMessage('error', `Failed to save post: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Post image upload mirrors the project thumbnail flow.
  const handlePostImageUpload = async (file: File) => {
    setUploadingPostImage(true);
    setPostImageProgress(0);

    const progressInterval = setInterval(() => {
      setPostImageProgress((prev) => {
        if (prev >= 90) {
          clearInterval(progressInterval);
          return 90;
        }
        return prev + 10;
      });
    }, 100);

    try {
      const downloadURL = await imageApi.getImageRef(
        file,
        'blog',
        editingPost?.id || 'undefined',
      );
      setPostForm((prev) => ({ ...prev, image: downloadURL }));
      setPostImageProgress(100);
    } catch (error) {
      console.error('Error uploading post image:', error);
      showMessage('error', `Failed to upload image: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      clearInterval(progressInterval);
      setUploadingPostImage(false);
      setTimeout(() => setPostImageProgress(0), 1000);
    }
  };

  const handleDropPostImage = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverPostImage(false);

    const files = e.dataTransfer.files;
    if (files && files[0] && files[0].type.startsWith('image/')) {
      handlePostImageUpload(files[0]);
    }
  };

  const handleRemovePostImage = () => {
    setPostForm((prev) => ({ ...prev, image: '' }));
  };

  const handleResumeUpload = async (file: File) => {
    if (file.type !== 'application/pdf') {
      showMessage('error', 'Resume must be a PDF file');
      return;
    }

    setUploadingResume(true);
    setResumeProgress(0);

    const progressInterval = setInterval(() => {
      setResumeProgress((prev) => {
        if (prev >= 90) {
          clearInterval(progressInterval);
          return 90;
        }
        return prev + 10;
      });
    }, 100);

    try {
      const downloadURL = await uploadResume(file);
      setCurrentResumeLink(downloadURL);
      setResumeProgress(100);
      showMessage('success', 'Resume uploaded successfully');
    } catch (error) {
      console.error('Error uploading resume:', error);
      showMessage('error', `Failed to upload resume: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      clearInterval(progressInterval);
      setUploadingResume(false);
      setTimeout(() => setResumeProgress(0), 1000);
    }
  };

  const handleDropResume = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverResume(false);

    const files = e.dataTransfer.files;
    if (files && files[0]) {
      handleResumeUpload(files[0]);
    }
  };

  const handleDeletePost = async (id: string) => {
    if (isDeleting) return;
    setIsDeleting(true);
    try {
      await postMutations.deletePost(id);
      showMessage('success', 'Post deleted successfully!');
      refetchPosts();
      setShowDeleteConfirm(null);
    } catch (error) {
      showMessage('error', `Failed to delete post: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsDeleting(false);
    }
  };

  // Job handlers
  // Every Job mutation needs the admin's Firebase ID token attached, or
  // the API rejects with "No authorization token provided" (the bug
  // that surfaced when the auth check landed in #22 but the admin
  // handlers were never updated).
  const getAuthHeaders = async (): Promise<Record<string, string>> => {
    if (!currentUser) return {};
    const token = await currentUser.getIdToken();
    return { Authorization: `Bearer ${token}` };
  };

  const handleToggleJobHidden = async (companyName: string, currentHidden: boolean) => {
    const nextHidden = !currentHidden;
    try {
      const authHeaders = await getAuthHeaders();
      const response = await fetch('/api/job', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ companyName, hidden: nextHidden }),
      });

      if (response.ok) {
        showMessage('success', `${companyName} is now ${nextHidden ? 'hidden' : 'visible'}`);
        fetchJobs();
      } else {
        const error = await response.json();
        showMessage('error', `Failed: ${error.error}`);
      }
    } catch (error) {
      showMessage('error', `Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const _handleUpdateJobTechnologies = async (jobId: string, companyName: string) => {
    const techArray = techInput.split(',').map(t => t.trim()).filter(t => t);
    try {
      const authHeaders = await getAuthHeaders();
      const response = await fetch('/api/job', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ companyName, technologies: techArray }),
      });

      if (response.ok) {
        showMessage('success', `Updated technologies for ${companyName}`);
        setEditingJob(null);
        setTechInput('');
        fetchJobs();
      } else {
        const error = await response.json();
        showMessage('error', `Failed: ${error.error}`);
      }
    } catch (error) {
      showMessage('error', `Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const openJobEditForm = (job: Job) => {
    const techNames = job.technologies?.map(t => getTechName(t)).filter(Boolean) || [];
    setJobFormMode(job.id);
    setEditingJob(null); // close the legacy tech-only inline editor if open
    const j = job as unknown as Record<string, unknown>;
    setJobForm({
      companyName: typeof j.companyName === 'string' ? j.companyName : '',
      jobPosition: typeof j.jobPosition === 'string' ? j.jobPosition : '',
      jobPositionJa: typeof j.jobPositionJa === 'string' ? j.jobPositionJa : '',
      jobType: typeof j.jobType === 'string' ? j.jobType : '',
      jobTypeJa: typeof j.jobTypeJa === 'string' ? j.jobTypeJa : '',
      jobDuration: typeof j.jobDuration === 'string' ? j.jobDuration : '',
      jobDescription: typeof j.jobDescription === 'string' ? j.jobDescription : '',
      jobDescriptionJa: typeof j.jobDescriptionJa === 'string' ? j.jobDescriptionJa : '',
      order: typeof j.order === 'number' ? String(j.order) : '0',
      technologies: techNames.join(', '),
    });
  };

  const openJobCreateForm = () => {
    setJobFormMode('new');
    setEditingJob(null);
    setJobForm({
      companyName: '',
      jobPosition: '',
      jobPositionJa: '',
      jobType: 'Full-time',
      jobTypeJa: '',
      jobDuration: '',
      jobDescription: '',
      jobDescriptionJa: '',
      order: jobs.length > 0 ? String(Math.max(...jobs.map(j => (j as unknown as { order?: number }).order || 0)) + 1) : '0',
      technologies: '',
    });
  };

  const closeJobForm = () => setJobFormMode(null);

  const handleSaveJobForm = async () => {
    if (!jobFormMode) return;
    const isCreate = jobFormMode === 'new';

    if (!jobForm.companyName.trim() || !jobForm.jobPosition.trim()) {
      showMessage('error', 'Company name and job position are required');
      return;
    }

    const inputNames = jobForm.technologies
      .split(',')
      .map(t => t.trim())
      .filter(Boolean);

    // Preserve technology objects ({name, id, type}) when the user
    // didn't rename them — otherwise every edit silently downgrades
    // them to plain strings and loses the id/type metadata.
    const originalTechs = (isCreate
      ? []
      : jobs.find(j => j.id === jobFormMode)?.technologies) || [];
    const techArray = inputNames.map(name => {
      const match = originalTechs.find(t => getTechName(t) === name);
      return match ?? name;
    });

    const payload: Record<string, unknown> = {
      companyName: jobForm.companyName.trim(),
      jobPosition: jobForm.jobPosition.trim(),
      jobPositionJa: jobForm.jobPositionJa,
      jobType: jobForm.jobType,
      jobTypeJa: jobForm.jobTypeJa,
      jobDuration: jobForm.jobDuration,
      jobDescription: jobForm.jobDescription,
      jobDescriptionJa: jobForm.jobDescriptionJa,
      order: Number(jobForm.order) || 0,
      technologies: techArray,
    };

    if (!isCreate) {
      payload.id = jobFormMode;
    }

    try {
      const authHeaders = await getAuthHeaders();
      const response = await fetch('/api/job', {
        method: isCreate ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        showMessage('success', isCreate ? `Created ${jobForm.companyName}` : `Updated ${jobForm.companyName}`);
        closeJobForm();
        fetchJobs();
      } else {
        const error = await response.json().catch(() => ({}));
        showMessage('error', `Failed: ${error.error || response.status}`);
      }
    } catch (error) {
      showMessage('error', `Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Shared form body for both Create and Edit job. Reads from / writes
  // to the single `jobForm` state object.
  const renderJobFormFields = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <div>
          <label style={styles.label}>Company *</label>
          <input
            value={jobForm.companyName}
            onChange={(e) => setJobForm({ ...jobForm, companyName: e.target.value })}
            placeholder="Atlas"
            style={styles.input}
          />
        </div>
        <div>
          <label style={styles.label}>Position (English) *</label>
          <input
            value={jobForm.jobPosition}
            onChange={(e) => setJobForm({ ...jobForm, jobPosition: e.target.value })}
            placeholder="Senior Software Engineer"
            style={styles.input}
          />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
        <div>
          <label style={styles.label}>Duration</label>
          <input
            value={jobForm.jobDuration}
            onChange={(e) => setJobForm({ ...jobForm, jobDuration: e.target.value })}
            placeholder="Jan 2025 - Present"
            style={styles.input}
          />
        </div>
        <div>
          <label style={styles.label}>Type (English)</label>
          <input
            value={jobForm.jobType}
            onChange={(e) => setJobForm({ ...jobForm, jobType: e.target.value })}
            placeholder="Full-time"
            style={styles.input}
          />
        </div>
        <div>
          <label style={styles.label}>Order (lower = first)</label>
          <input
            type="number"
            value={jobForm.order}
            onChange={(e) => setJobForm({ ...jobForm, order: e.target.value })}
            style={styles.input}
          />
        </div>
      </div>
      <div>
        <label style={styles.label}>Description (English)</label>
        <textarea
          value={jobForm.jobDescription}
          onChange={(e) => setJobForm({ ...jobForm, jobDescription: e.target.value })}
          rows={6}
          placeholder="Lead engineer on the Infrastructure team, ..."
          style={{ ...styles.input, fontFamily: 'inherit', resize: 'vertical' }}
        />
      </div>

      <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '14px', marginTop: '6px' }}>
        <p style={{ fontSize: '12px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>
          Japanese (optional)
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div>
            <label style={styles.label}>Position (Japanese)</label>
            <input
              value={jobForm.jobPositionJa}
              onChange={(e) => setJobForm({ ...jobForm, jobPositionJa: e.target.value })}
              placeholder="シニアソフトウェアエンジニア"
              style={styles.input}
            />
          </div>
          <div>
            <label style={styles.label}>Type (Japanese)</label>
            <input
              value={jobForm.jobTypeJa}
              onChange={(e) => setJobForm({ ...jobForm, jobTypeJa: e.target.value })}
              placeholder="正社員"
              style={styles.input}
            />
          </div>
        </div>
        <div style={{ marginTop: '12px' }}>
          <label style={styles.label}>Description (Japanese)</label>
          <textarea
            value={jobForm.jobDescriptionJa}
            onChange={(e) => setJobForm({ ...jobForm, jobDescriptionJa: e.target.value })}
            rows={6}
            placeholder="Atlas のインフラチームのリードエンジニアとして..."
            style={{ ...styles.input, fontFamily: 'inherit', resize: 'vertical' }}
          />
        </div>
      </div>

      <div>
        <label style={styles.label}>Technologies (comma-separated)</label>
        <input
          value={jobForm.technologies}
          onChange={(e) => setJobForm({ ...jobForm, technologies: e.target.value })}
          placeholder="TypeScript, Next.js, Firebase"
          style={styles.input}
        />
      </div>
    </div>
  );

  const handleDeleteJob = async (id: string, companyName: string) => {
    if (isDeleting) return;
    setIsDeleting(true);
    try {
      const authHeaders = await getAuthHeaders();
      const response = await fetch(`/api/job?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { ...authHeaders },
      });

      if (response.ok) {
        showMessage('success', `Deleted ${companyName}`);
        setShowDeleteConfirm(null);
        fetchJobs();
      } else {
        const error = await response.json().catch(() => ({}));
        showMessage('error', `Failed: ${error.error || response.status}`);
      }
    } catch (error) {
      showMessage('error', `Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsDeleting(false);
    }
  };

  if (!currentUser || !isAdmin || loading || profileLoading) {
    return (
      <div style={{ ...styles.container, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: '#ffffff' }}>
          <Loader2 style={{ width: '24px', height: '24px', animation: 'spin 1s linear infinite' }} />
          <span style={{ fontSize: '18px' }}>Loading...</span>
        </div>
      </div>
    );
  }

  const sidebarItems = [
    { id: 'dashboard' as AdminSection, label: 'Dashboard', icon: LayoutDashboard },
    { id: 'profile' as AdminSection, label: 'Profile', icon: User },
    { id: 'projects' as AdminSection, label: 'Projects', icon: FolderKanban },
    { id: 'posts' as AdminSection, label: 'Blog Posts', icon: FileText },
    { id: 'jobs' as AdminSection, label: 'Jobs', icon: Briefcase },
    { id: 'study' as AdminSection, label: 'Study Tool', icon: BookOpen },
    { id: 'hobbies' as AdminSection, label: 'Hobbies', icon: Heart },
    { id: 'activity-logs' as AdminSection, label: 'Activity Log', icon: ScrollText },
  ];

  return (
    <div style={styles.container}>
      {/* Toast Message */}
      {message && (
        <div style={{ ...styles.toast, ...(message.type === 'success' ? styles.toastSuccess : styles.toastError) }}>
          {message.type === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
          <span style={{ fontWeight: '500' }}>{message.text}</span>
          <button
            onClick={() => setMessage(null)}
            style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: '4px' }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      <div style={{ display: 'flex' }}>
        {/* Sidebar */}
        <aside style={styles.sidebar}>
          <div style={styles.sidebarHeader}>
            <Link
              href="/"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '13px',
                color: '#94a3b8',
                textDecoration: 'none',
                marginBottom: '12px',
              }}
            >
              <ArrowLeft size={14} />
              meetyudai.com
            </Link>
            <h2 style={styles.sidebarTitle}>Admin Panel</h2>
            <p style={styles.sidebarEmail}>{currentUser?.email}</p>
          </div>
          <nav style={{ padding: '16px' }}>
            {sidebarItems.map((item) => (
              <button
                key={item.id}
                onClick={() => handleSectionChange(item.id)}
                style={{
                  ...styles.navButton,
                  ...(activeSection === item.id ? styles.navButtonActive : styles.navButtonInactive),
                }}
                onMouseEnter={(e) => {
                  if (activeSection !== item.id) {
                    e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                    e.currentTarget.style.color = '#ffffff';
                  }
                }}
                onMouseLeave={(e) => {
                  if (activeSection !== item.id) {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.color = '#94a3b8';
                  }
                }}
              >
                <item.icon size={20} style={{ color: activeSection === item.id ? '#a855f7' : 'inherit' }} />
                {item.label}
              </button>
            ))}

            {/* Security Settings Link */}
            <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}>
              <Link
                href="/admin/security"
                style={{
                  ...styles.navButton,
                  ...styles.navButtonInactive,
                  textDecoration: 'none',
                }}
              >
                <Shield size={20} />
                Security Settings
              </Link>
            </div>
          </nav>
        </aside>

        {/* Main Content */}
        <main style={styles.main}>
          {/* Dashboard Section */}
          {activeSection === 'dashboard' && (
            <div>
              <h1 style={styles.pageTitle}>Dashboard</h1>
              <p style={styles.pageSubtitle}>Overview of your portfolio content</p>

              {/* Stats Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px', marginBottom: '32px' }}>
                <div style={{ ...styles.card, background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(6, 182, 212, 0.1))', borderColor: 'rgba(59, 130, 246, 0.2)' }}>
                  <div style={styles.statCard}>
                    <div style={{ ...styles.statIconWrapper, backgroundColor: 'rgba(59, 130, 246, 0.2)' }}>
                      <FolderKanban size={24} color="#60a5fa" />
                    </div>
                    <div>
                      <p style={styles.statNumber}>{projects.length}</p>
                      <p style={{ color: '#93c5fd' }}>Projects</p>
                    </div>
                  </div>
                </div>

                <div style={{ ...styles.card, background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(34, 197, 94, 0.1))', borderColor: 'rgba(16, 185, 129, 0.2)' }}>
                  <div style={styles.statCard}>
                    <div style={{ ...styles.statIconWrapper, backgroundColor: 'rgba(16, 185, 129, 0.2)' }}>
                      <FileText size={24} color="#34d399" />
                    </div>
                    <div>
                      <p style={styles.statNumber}>{posts.length}</p>
                      <p style={{ color: '#6ee7b7' }}>Blog Posts</p>
                    </div>
                  </div>
                </div>

                <div style={{ ...styles.card, background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.1), rgba(236, 72, 153, 0.1))', borderColor: 'rgba(168, 85, 247, 0.2)' }}>
                  <div style={styles.statCard}>
                    <div style={{ ...styles.statIconWrapper, backgroundColor: 'rgba(168, 85, 247, 0.2)' }}>
                      <Briefcase size={24} color="#c084fc" />
                    </div>
                    <div>
                      <p style={styles.statNumber}>{jobs.length}</p>
                      <p style={{ color: '#d8b4fe' }}>Jobs</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Quick Actions */}
              <div style={{ ...styles.card, marginBottom: '32px' }}>
                <div style={{ padding: '24px' }}>
                  <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#ffffff', marginBottom: '8px' }}>Quick Actions</h3>
                  <p style={{ color: '#94a3b8', marginBottom: '16px' }}>Create new content quickly</p>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <button
                      onClick={() => { handleSectionChange('projects'); handleOpenProjectModal(); }}
                      style={{ ...styles.button, ...styles.primaryButton }}
                    >
                      <Plus size={16} /> New Project
                    </button>
                    <button
                      onClick={() => { handleSectionChange('posts'); handleOpenPostModal(); }}
                      style={{ ...styles.button, ...styles.outlineButton }}
                    >
                      <Plus size={16} /> New Post
                    </button>
                  </div>
                </div>
              </div>

              {/* Recent Items */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '24px' }}>
                <div style={styles.card}>
                  <div style={{ padding: '24px' }}>
                    <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#ffffff', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <FolderKanban size={20} color="#a855f7" /> Recent Projects
                    </h3>
                    {projects.slice(0, 5).map((project) => (
                      <div key={project.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                        <span style={{ color: '#cbd5e1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{project.title}</span>
                        <button
                          onClick={() => { handleSectionChange('projects'); handleOpenProjectModal(project); }}
                          style={{ ...styles.ghostButton, borderRadius: '8px' }}
                        >
                          <Pencil size={16} />
                        </button>
                      </div>
                    ))}
                    {projects.length === 0 && <p style={{ color: '#64748b', fontSize: '14px' }}>No projects yet</p>}
                  </div>
                </div>

                <div style={styles.card}>
                  <div style={{ padding: '24px' }}>
                    <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#ffffff', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <FileText size={20} color="#34d399" /> Recent Posts
                    </h3>
                    {posts.slice(0, 5).map((post) => (
                      <div key={post.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                        <span style={{ color: '#cbd5e1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{post.title}</span>
                        <button
                          onClick={() => { handleSectionChange('posts'); handleOpenPostModal(post); }}
                          style={{ ...styles.ghostButton, borderRadius: '8px' }}
                        >
                          <Pencil size={16} />
                        </button>
                      </div>
                    ))}
                    {posts.length === 0 && <p style={{ color: '#64748b', fontSize: '14px' }}>No posts yet</p>}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Profile Section */}
          {activeSection === 'profile' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
                <div>
                  <h1 style={styles.pageTitle}>Profile</h1>
                  <p style={{ color: '#94a3b8' }}>Manage your personal information</p>
                </div>
                <button
                  onClick={() => setEditingProfile(!editingProfile)}
                  style={{ ...styles.button, ...styles.outlineButton }}
                >
                  {editingProfile ? 'Cancel' : 'Edit Profile'}
                </button>
              </div>

              <div style={{ ...styles.card, maxWidth: '640px' }}>
                <div style={{ padding: '24px' }}>
                  {!editingProfile ? (
                    <div>
                      {[
                        { label: 'Birthdate', value: profile?.birthdate },
                        { label: 'Location', value: profile?.location },
                        { label: 'Email', value: profile?.email },
                        { label: 'Languages', value: profile?.languages?.join(', ') },
                      ].map((item, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '16px 0', borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
                          <span style={{ color: '#94a3b8' }}>{item.label}</span>
                          <span style={{ color: '#ffffff', fontWeight: '500' }}>{item.value || 'Not set'}</span>
                        </div>
                      ))}
                      {[
                        { label: 'Bio (English)', value: profile?.bioEn },
                        { label: 'Bio (Japanese)', value: profile?.bioJa },
                      ].map((item, i) => (
                        <div key={item.label} style={{ padding: '16px 0', borderBottom: i === 0 ? '1px solid rgba(255, 255, 255, 0.1)' : 'none' }}>
                          <div style={{ color: '#94a3b8', marginBottom: '6px' }}>{item.label}</div>
                          <div style={{ color: '#ffffff', fontSize: '13px', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                            {item.value || <span style={{ color: '#64748b' }}>Falls back to bundled translation</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                      <div>
                        <label style={styles.label}>Birthdate</label>
                        <input
                          type="date"
                          value={profileForm.birthdate}
                          onChange={(e) => setProfileForm({ ...profileForm, birthdate: e.target.value })}
                          style={styles.input}
                        />
                      </div>
                      <div>
                        <label style={styles.label}>Location</label>
                        <input
                          value={profileForm.location}
                          onChange={(e) => setProfileForm({ ...profileForm, location: e.target.value })}
                          placeholder="e.g., San Francisco, CA"
                          style={styles.input}
                        />
                      </div>
                      <div>
                        <label style={styles.label}>Email</label>
                        <input
                          type="email"
                          value={profileForm.email}
                          onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
                          placeholder="your@email.com"
                          style={styles.input}
                        />
                      </div>
                      <div>
                        <label style={styles.label}>Languages (comma-separated)</label>
                        <input
                          value={profileForm.languages}
                          onChange={(e) => setProfileForm({ ...profileForm, languages: e.target.value })}
                          placeholder="English, Japanese"
                          style={styles.input}
                        />
                      </div>
                      <div>
                        <label style={styles.label}>Bio (English)</label>
                        <textarea
                          value={profileForm.bioEn}
                          onChange={(e) => setProfileForm({ ...profileForm, bioEn: e.target.value })}
                          placeholder="Shown on the home page hero. Leave empty to fall back to the bundled translation."
                          rows={5}
                          style={{ ...styles.input, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
                        />
                      </div>
                      <div>
                        <label style={styles.label}>Bio (Japanese)</label>
                        <textarea
                          value={profileForm.bioJa}
                          onChange={(e) => setProfileForm({ ...profileForm, bioJa: e.target.value })}
                          placeholder="ホーム画面の自己紹介文。空欄なら i18n のデフォルトが使われます。"
                          rows={5}
                          style={{ ...styles.input, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
                        />
                      </div>
                      <button onClick={handleUpdateProfile} style={{ ...styles.button, ...styles.primaryButton }}>
                        <Save size={16} /> Save Profile
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div style={{ ...styles.card, maxWidth: '640px', marginTop: '24px' }}>
                <div style={{ padding: '24px' }}>
                  <h2 style={{ color: '#ffffff', fontSize: '18px', fontWeight: 600, marginBottom: '4px' }}>Resume</h2>
                  <p style={{ color: '#94a3b8', fontSize: '13px', marginBottom: '16px' }}>
                    Drop a PDF to replace the resume linked from the site.
                  </p>

                  {currentResumeLink && (
                    <div style={{ marginBottom: '16px', fontSize: '13px' }}>
                      <span style={{ color: '#94a3b8', marginRight: '8px' }}>Current:</span>
                      <a
                        href={currentResumeLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: '#a855f7', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                      >
                        View resume <ExternalLink size={12} />
                      </a>
                    </div>
                  )}

                  <div
                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOverResume(true); }}
                    onDragLeave={() => setDragOverResume(false)}
                    onDrop={handleDropResume}
                    style={{
                      border: `2px dashed ${dragOverResume ? '#a855f7' : 'rgba(255, 255, 255, 0.2)'}`,
                      borderRadius: '12px',
                      padding: '24px',
                      textAlign: 'center',
                      backgroundColor: dragOverResume ? 'rgba(168, 85, 247, 0.1)' : 'rgba(15, 23, 42, 0.3)',
                      transition: 'all 0.2s',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="file"
                      accept="application/pdf"
                      id="resume-upload"
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          handleResumeUpload(e.target.files[0]);
                          e.target.value = '';
                        }
                      }}
                    />
                    <label htmlFor="resume-upload" style={{ cursor: 'pointer' }}>
                      <ScrollText size={40} color="#64748b" style={{ marginBottom: '8px' }} />
                      <p style={{ color: '#94a3b8', fontSize: '14px', margin: 0 }}>
                        Drag &amp; drop a PDF or click to upload
                      </p>
                    </label>
                    {uploadingResume && (
                      <div style={{ marginTop: '12px' }}>
                        <div style={{
                          height: '4px',
                          backgroundColor: 'rgba(255, 255, 255, 0.1)',
                          borderRadius: '2px',
                          overflow: 'hidden',
                        }}>
                          <div style={{
                            height: '100%',
                            width: `${resumeProgress}%`,
                            background: 'linear-gradient(to right, #a855f7, #ec4899)',
                            transition: 'width 0.2s',
                          }} />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Projects Section */}
          {activeSection === 'projects' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
                <div>
                  <h1 style={styles.pageTitle}>Projects</h1>
                  <p style={{ color: '#94a3b8' }}>Manage your portfolio projects</p>
                </div>
                <button onClick={() => handleOpenProjectModal()} style={{ ...styles.button, ...styles.primaryButton }}>
                  <Plus size={16} /> Add Project
                </button>
              </div>

              {projectsLoading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '48px' }}>
                  <Loader2 size={32} color="#a855f7" style={{ animation: 'spin 1s linear infinite' }} />
                </div>
              ) : (
                <div style={styles.card}>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>Title</th>
                        <th style={styles.th}>Date</th>
                        <th style={styles.th}>Technologies</th>
                        <th style={{ ...styles.th, textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {projects.map((project) => (
                        <tr key={project.id} style={{ transition: 'background 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'} onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                          <td style={styles.td}>
                            <div style={{ fontWeight: '500', color: '#ffffff' }}>{project.title}</div>
                            <div style={{ fontSize: '14px', color: '#64748b', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{project.description}</div>
                          </td>
                          <td style={{ ...styles.td, color: '#94a3b8' }}>{project.date}</td>
                          <td style={styles.td}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                              {project.technologies?.slice(0, 3).map((tech, i) => (
                                <span key={i} style={{ ...styles.badge, ...styles.techBadge }}>{getTechName(tech)}</span>
                              ))}
                              {(project.technologies?.length || 0) > 3 && (
                                <span style={{ ...styles.badge, backgroundColor: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: '#94a3b8' }}>
                                  +{(project.technologies?.length || 0) - 3}
                                </span>
                              )}
                            </div>
                          </td>
                          <td style={{ ...styles.td, textAlign: 'right' }}>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                              <button onClick={() => handleOpenProjectModal(project)} style={{ ...styles.ghostButton, borderRadius: '8px' }}>
                                <Pencil size={16} />
                              </button>
                              <button
                                onClick={() => setShowDeleteConfirm({ type: 'project', id: project.id, name: project.title })}
                                style={{ ...styles.ghostButton, borderRadius: '8px', color: '#f87171' }}
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {projects.length === 0 && (
                        <tr>
                          <td colSpan={4} style={{ ...styles.td, textAlign: 'center', color: '#64748b', padding: '48px' }}>
                            No projects yet. Click &quot;Add Project&quot; to create one.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Posts Section */}
          {activeSection === 'posts' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
                <div>
                  <h1 style={styles.pageTitle}>Blog Posts</h1>
                  <p style={{ color: '#94a3b8' }}>Manage your blog content</p>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <InspectPostsButton onMessage={showMessage} />
                  <MigratePostsFlatButton onMessage={showMessage} onAfterMigrate={refetchPosts} />
                  <button onClick={() => handleOpenPostModal()} style={{ ...styles.button, ...styles.primaryButton }}>
                    <Plus size={16} /> Add Post
                  </button>
                </div>
              </div>

              {postsLoading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '48px' }}>
                  <Loader2 size={32} color="#a855f7" style={{ animation: 'spin 1s linear infinite' }} />
                </div>
              ) : (
                <div style={styles.card}>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>Title</th>
                        <th style={styles.th}>Category</th>
                        <th style={styles.th}>Status</th>
                        <th style={styles.th}>Updated</th>
                        <th style={{ ...styles.th, textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {posts.map((post) => (
                        <tr key={post.id} style={{ transition: 'background 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'} onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                          <td style={styles.td}>
                            <div style={{ fontWeight: '500', color: '#ffffff' }}>{post.title}</div>
                          </td>
                          <td style={styles.td}>
                            <span style={{ ...styles.badge, backgroundColor: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: '#cbd5e1' }}>
                              {post.category}
                            </span>
                          </td>
                          <td style={styles.td}>
                            {post.isPublic ? (
                              <span style={{ ...styles.badge, backgroundColor: 'rgba(16, 185, 129, 0.2)', color: '#6ee7b7', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                                <Eye size={12} /> Public
                              </span>
                            ) : (
                              <span style={{ ...styles.badge, backgroundColor: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: '#94a3b8' }}>
                                <EyeOff size={12} /> Private
                              </span>
                            )}
                          </td>
                          <td style={{ ...styles.td, color: '#94a3b8', fontSize: '14px' }}>
                            {post.lastUpdated ? new Date(post.lastUpdated).toLocaleDateString() : '-'}
                          </td>
                          <td style={{ ...styles.td, textAlign: 'right' }}>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                              <button onClick={() => window.open(`/blog/${post.category}/${post.id}`, '_blank')} style={{ ...styles.ghostButton, borderRadius: '8px' }}>
                                <ExternalLink size={16} />
                              </button>
                              <button onClick={() => handleOpenPostModal(post)} style={{ ...styles.ghostButton, borderRadius: '8px' }}>
                                <Pencil size={16} />
                              </button>
                              <button
                                onClick={() => setShowDeleteConfirm({ type: 'post', id: post.id, name: post.title, category: post.category })}
                                style={{ ...styles.ghostButton, borderRadius: '8px', color: '#f87171' }}
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {posts.length === 0 && (
                        <tr>
                          <td colSpan={5} style={{ ...styles.td, textAlign: 'center', color: '#64748b', padding: '48px' }}>
                            No posts yet. Click &quot;Add Post&quot; to create one.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Jobs Section */}
          {activeSection === 'jobs' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
                <div>
                  <h1 style={styles.pageTitle}>Jobs & Experience</h1>
                  <p style={{ color: '#94a3b8' }}>Manage your work experience, descriptions, and technologies</p>
                </div>
                <button onClick={openJobCreateForm} style={{ ...styles.button, ...styles.primaryButton }}>
                  <Plus size={16} /> Add Job
                </button>
              </div>

              {jobFormMode === 'new' && (
                <div style={{ ...styles.card, marginBottom: '24px' }}>
                  <div style={{ padding: '24px' }}>
                    <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#ffffff', marginBottom: '16px' }}>New Job</h3>
                    {renderJobFormFields()}
                    <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
                      <button onClick={handleSaveJobForm} style={{ ...styles.button, ...styles.primaryButton }}>
                        <Save size={16} /> Create
                      </button>
                      <button onClick={closeJobForm} style={{ ...styles.button, ...styles.outlineButton }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                {jobs.map((job) => (
                  <div key={job.id} style={{ ...styles.card, opacity: job.hidden ? 0.55 : 1 }}>
                    <div style={{ padding: '24px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <h3 style={{ fontSize: '20px', fontWeight: '600', color: '#ffffff' }}>{job.jobPosition}</h3>
                            {job.hidden && (
                              <span style={{ ...styles.badge, backgroundColor: 'rgba(148, 163, 184, 0.2)', color: '#94a3b8', border: '1px solid rgba(148, 163, 184, 0.3)' }}>
                                Hidden
                              </span>
                            )}
                          </div>
                          <p style={{ color: '#a855f7' }}>{job.companyName}</p>
                          <p style={{ fontSize: '14px', color: '#64748b' }}>{job.jobDuration}</p>
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            onClick={() => handleToggleJobHidden(job.companyName, !!job.hidden)}
                            style={{ ...styles.button, ...styles.outlineButton }}
                            title={job.hidden ? 'Show on public resume' : 'Hide from public resume'}
                          >
                            {job.hidden ? <EyeOff size={16} /> : <Eye size={16} />}
                            {job.hidden ? 'Show' : 'Hide'}
                          </button>
                          <button
                            onClick={() => openJobEditForm(job)}
                            style={{ ...styles.button, ...styles.outlineButton }}
                          >
                            <Pencil size={16} /> Edit
                          </button>
                          <button
                            onClick={() => setShowDeleteConfirm({ type: 'job', id: job.id, name: job.companyName })}
                            style={{ ...styles.button, ...styles.dangerButton }}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>

                      <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '16px' }}>
                        <p style={{ fontSize: '14px', fontWeight: '500', color: '#94a3b8', marginBottom: '12px' }}>Technologies</p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                          {job.technologies?.length ? (
                            job.technologies.map((tech, i) => (
                              <span key={i} style={{ ...styles.badge, ...styles.techBadge }}>{getTechName(tech)}</span>
                            ))
                          ) : (
                            <span style={{ color: '#64748b', fontSize: '14px' }}>No technologies set</span>
                          )}
                        </div>
                      </div>

                      {jobFormMode === job.id && (
                        <div style={{ marginTop: '24px', padding: '16px', backgroundColor: 'rgba(15, 23, 42, 0.5)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}>
                          {renderJobFormFields()}
                          <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
                            <button onClick={handleSaveJobForm} style={{ ...styles.button, ...styles.primaryButton }}>
                              <Save size={16} /> Save
                            </button>
                            <button onClick={closeJobForm} style={{ ...styles.button, ...styles.outlineButton }}>
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {jobs.length === 0 && (
                  <div style={{ ...styles.card, textAlign: 'center', padding: '48px' }}>
                    <Briefcase size={48} color="#64748b" style={{ marginBottom: '16px' }} />
                    <p style={{ color: '#64748b' }}>No jobs found</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Study Tool Section */}
          {activeSection === 'study' && (
            <StudyAdminPanel />
          )}

          {/* Hobbies Section */}
          {activeSection === 'hobbies' && (
            <HobbiesAdminPanel />
          )}

          {/* Activity Log Section */}
          {activeSection === 'activity-logs' && (
            <ActivityLogPanel />
          )}
        </main>
      </div>

      {/* Project Modal */}
      {showProjectModal && (
        <div style={styles.modal}>
          <div style={styles.modalContent}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>{editingProject ? 'Edit Project' : 'New Project'}</h2>
              <p style={{ color: '#94a3b8', fontSize: '14px', marginTop: '4px' }}>
                {editingProject ? 'Update your project details' : 'Add a new project to your portfolio'}
              </p>
            </div>
            <div style={styles.modalBody}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div>
                  <label style={styles.label}>Title *</label>
                  <input
                    value={projectForm.title}
                    onChange={(e) => setProjectForm({ ...projectForm, title: e.target.value })}
                    style={styles.input}
                  />
                </div>
                <div>
                  <label style={styles.label}>Description *</label>
                  <textarea
                    value={projectForm.description}
                    onChange={(e) => setProjectForm({ ...projectForm, description: e.target.value })}
                    style={styles.textarea}
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={styles.label}>Date</label>
                    <input
                      type="date"
                      value={projectForm.date}
                      onChange={(e) => setProjectForm({ ...projectForm, date: e.target.value })}
                      style={styles.input}
                    />
                  </div>
                  <div>
                    <label style={styles.label}>Client</label>
                    <input
                      value={projectForm.client}
                      onChange={(e) => setProjectForm({ ...projectForm, client: e.target.value })}
                      style={styles.input}
                    />
                  </div>
                </div>
                <div>
                  <label style={styles.label}>Industry</label>
                  <input
                    value={projectForm.industry}
                    onChange={(e) => setProjectForm({ ...projectForm, industry: e.target.value })}
                    style={styles.input}
                  />
                </div>
                {/* Thumbnail Image Upload */}
                <div>
                  <label style={styles.label}>Thumbnail Image</label>
                  <div
                    onDragOver={(e) => { handleDragThumb(e); setDragOverThumb(true); }}
                    onDragLeave={() => setDragOverThumb(false)}
                    onDrop={handleDropThumb}
                    style={{
                      border: `2px dashed ${dragOverThumb ? '#a855f7' : 'rgba(255, 255, 255, 0.2)'}`,
                      borderRadius: '12px',
                      padding: '20px',
                      textAlign: 'center',
                      backgroundColor: dragOverThumb ? 'rgba(168, 85, 247, 0.1)' : 'rgba(15, 23, 42, 0.3)',
                      transition: 'all 0.2s',
                      cursor: 'pointer',
                    }}
                  >
                    {projectForm.thumbImage ? (
                      <div style={{ position: 'relative', display: 'inline-block' }}>
                        <img
                          src={projectForm.thumbImage}
                          alt="Thumbnail"
                          style={{ maxWidth: '200px', maxHeight: '150px', borderRadius: '8px' }}
                        />
                        <button
                          type="button"
                          onClick={handleRemoveThumbImage}
                          style={{
                            position: 'absolute',
                            top: '-8px',
                            right: '-8px',
                            background: '#ef4444',
                            border: 'none',
                            borderRadius: '50%',
                            padding: '4px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <X size={14} color="#fff" />
                        </button>
                      </div>
                    ) : (
                      <div>
                        <input
                          type="file"
                          accept="image/*"
                          id="thumb-upload"
                          style={{ display: 'none' }}
                          onChange={(e) => {
                            if (e.target.files && e.target.files[0]) {
                              handleThumbImageUpload(e.target.files[0]);
                              e.target.value = '';
                            }
                          }}
                        />
                        <label htmlFor="thumb-upload" style={{ cursor: 'pointer' }}>
                          <ImageIcon size={40} color="#64748b" style={{ marginBottom: '8px' }} />
                          <p style={{ color: '#94a3b8', fontSize: '14px', margin: 0 }}>
                            Drag & drop or click to upload thumbnail
                          </p>
                        </label>
                      </div>
                    )}
                    {uploadingThumb && (
                      <div style={{ marginTop: '12px' }}>
                        <div style={{
                          height: '4px',
                          backgroundColor: 'rgba(255, 255, 255, 0.1)',
                          borderRadius: '2px',
                          overflow: 'hidden',
                        }}>
                          <div style={{
                            height: '100%',
                            width: `${thumbProgress}%`,
                            background: 'linear-gradient(to right, #a855f7, #ec4899)',
                            transition: 'width 0.2s',
                          }} />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Gallery Images Upload */}
                <div>
                  <label style={styles.label}>Gallery Images</label>
                  <div
                    onDragOver={(e) => { e.preventDefault(); setDragOverImages(true); }}
                    onDragLeave={() => setDragOverImages(false)}
                    onDrop={handleDropImages}
                    style={{
                      border: `2px dashed ${dragOverImages ? '#a855f7' : 'rgba(255, 255, 255, 0.2)'}`,
                      borderRadius: '12px',
                      padding: '20px',
                      textAlign: 'center',
                      backgroundColor: dragOverImages ? 'rgba(168, 85, 247, 0.1)' : 'rgba(15, 23, 42, 0.3)',
                      transition: 'all 0.2s',
                    }}
                  >
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      id="gallery-upload"
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        if (e.target.files && e.target.files.length > 0) {
                          handleGalleryImageUpload(e.target.files);
                          e.target.value = '';
                        }
                      }}
                    />
                    <label htmlFor="gallery-upload" style={{ cursor: 'pointer' }}>
                      <Upload size={32} color="#64748b" style={{ marginBottom: '8px' }} />
                      <p style={{ color: '#94a3b8', fontSize: '14px', margin: 0 }}>
                        Drag & drop or click to upload gallery images
                      </p>
                    </label>
                    {uploadingImages && (
                      <div style={{ marginTop: '12px' }}>
                        <div style={{
                          height: '4px',
                          backgroundColor: 'rgba(255, 255, 255, 0.1)',
                          borderRadius: '2px',
                          overflow: 'hidden',
                        }}>
                          <div style={{
                            height: '100%',
                            width: `${imagesProgress}%`,
                            background: 'linear-gradient(to right, #a855f7, #ec4899)',
                            transition: 'width 0.2s',
                          }} />
                        </div>
                      </div>
                    )}
                  </div>
                  {/* Gallery Image Previews */}
                  {projectForm.images.length > 0 && (
                    <div style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '12px',
                      marginTop: '16px',
                    }}>
                      {projectForm.images.map((url, index) => (
                        <div
                          key={url}
                          style={{
                            position: 'relative',
                            width: '100px',
                            height: '80px',
                          }}
                        >
                          <img
                            src={url}
                            alt={`Gallery ${index + 1}`}
                            style={{
                              width: '100%',
                              height: '100%',
                              objectFit: 'cover',
                              borderRadius: '8px',
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveGalleryImage(index)}
                            style={{
                              position: 'absolute',
                              top: '-6px',
                              right: '-6px',
                              background: '#ef4444',
                              border: 'none',
                              borderRadius: '50%',
                              padding: '3px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <X size={12} color="#fff" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* URLs Section */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <label style={{ ...styles.label, marginBottom: 0 }}>Project URLs</label>
                    <button
                      type="button"
                      onClick={handleAddUrl}
                      style={{ ...styles.button, ...styles.outlineButton, padding: '6px 12px', fontSize: '13px' }}
                    >
                      <Plus size={14} /> Add URL
                    </button>
                  </div>
                  {projectForm.urls.length === 0 ? (
                    <p style={{ color: '#64748b', fontSize: '14px' }}>No URLs added yet. Click &quot;Add URL&quot; to add project links.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {projectForm.urls.map((url, index) => (
                        <div
                          key={index}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr 2fr 1fr auto',
                            gap: '8px',
                            alignItems: 'center',
                            padding: '12px',
                            backgroundColor: 'rgba(15, 23, 42, 0.3)',
                            borderRadius: '8px',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                          }}
                        >
                          <input
                            value={url.name}
                            onChange={(e) => handleUpdateUrl(index, 'name', e.target.value)}
                            placeholder="Name (e.g., Live Demo)"
                            style={{ ...styles.input, padding: '8px 10px' }}
                          />
                          <input
                            value={url.link}
                            onChange={(e) => handleUpdateUrl(index, 'link', e.target.value)}
                            placeholder="URL (e.g., https://...)"
                            style={{ ...styles.input, padding: '8px 10px' }}
                          />
                          <select
                            value={url.type}
                            onChange={(e) => handleUpdateUrl(index, 'type', e.target.value)}
                            style={{ ...styles.select, padding: '8px 10px' }}
                          >
                            <option value="">Select type</option>
                            {urlTypes.map((type) => (
                              <option key={type} value={type}>{type}</option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => handleRemoveUrl(index)}
                            style={{
                              ...styles.ghostButton,
                              borderRadius: '8px',
                              color: '#f87171',
                              padding: '8px',
                            }}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {urlTypes.length > 0 && (
                    <p style={{ fontSize: '12px', color: '#64748b', marginTop: '8px' }}>
                      Available types: {urlTypes.join(', ')}
                    </p>
                  )}
                </div>

                <div>
                  <label style={styles.label}>Technologies (comma-separated)</label>
                  <input
                    value={projectForm.technologies}
                    onChange={(e) => setProjectForm({ ...projectForm, technologies: e.target.value })}
                    placeholder="React, TypeScript, Firebase"
                    style={styles.input}
                  />
                </div>
                <div>
                  <label style={styles.label}>Categories (comma-separated)</label>
                  <input
                    value={projectForm.categories}
                    onChange={(e) => setProjectForm({ ...projectForm, categories: e.target.value })}
                    placeholder="Web, Mobile, Game"
                    style={styles.input}
                  />
                  {projectCategories.length > 0 && (
                    <p style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>Existing: {projectCategories.join(', ')}</p>
                  )}
                </div>
              </div>
            </div>
            <div style={styles.modalFooter}>
              <button onClick={() => setShowProjectModal(false)} style={{ ...styles.button, ...styles.outlineButton }}>
                Cancel
              </button>
              <button onClick={handleSaveProject} disabled={projectMutations.loading} style={{ ...styles.button, ...styles.primaryButton }}>
                {projectMutations.loading ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={16} />}
                {editingProject ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Post Modal */}
      {showPostModal && (
        <div style={styles.modal}>
          <div style={{ ...styles.modalContent, maxWidth: 'none' }}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>{editingPost ? 'Edit Post' : 'New Post'}</h2>
              <p style={{ color: '#94a3b8', fontSize: '14px', marginTop: '4px' }}>
                {editingPost ? 'Update your blog post' : 'Create a new blog post'}
              </p>
            </div>
            <div style={styles.modalBody}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <p style={{ color: '#94a3b8', fontSize: '13px', margin: 0 }}>
                  Fill in either language, both, or one and skip the other — empty languages are not saved. Readers see the language matching their locale; if it doesn&apos;t exist, the other language is shown as a fallback.
                </p>
                <div>
                  <label style={styles.label}>Category *</label>
                  <select
                    value={postForm.category}
                    onChange={(e) => setPostForm({ ...postForm, category: e.target.value })}
                    style={styles.select}
                  >
                    <option value="">Select category</option>
                    {postCategories.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))',
                    gap: '24px',
                  }}
                >
                  {(['en', 'ja'] as PostLanguage[]).map((lang) => (
                    <TranslationFields
                      key={lang}
                      lang={lang}
                      title={postForm.translations[lang]?.title || ''}
                      body={postForm.translations[lang]?.body || ''}
                      onTitleChange={(value) => setTranslationField(lang, 'title', value)}
                      onBodyChange={(value) => setTranslationField(lang, 'body', value)}
                      labelStyle={styles.label}
                      inputStyle={styles.input}
                      onImageUpload={imageApi.getMenuImageRef}
                    />
                  ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <input
                    type="checkbox"
                    id="post-public"
                    checked={postForm.isPublic}
                    onChange={(e) => setPostForm({ ...postForm, isPublic: e.target.checked })}
                    style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                  />
                  <label htmlFor="post-public" style={{ color: '#cbd5e1', cursor: 'pointer' }}>Public</label>
                </div>
                <div>
                  <label style={styles.label}>Cover image</label>
                  <div
                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOverPostImage(true); }}
                    onDragLeave={() => setDragOverPostImage(false)}
                    onDrop={handleDropPostImage}
                    style={{
                      border: `2px dashed ${dragOverPostImage ? '#a855f7' : 'rgba(255, 255, 255, 0.2)'}`,
                      borderRadius: '12px',
                      padding: '20px',
                      textAlign: 'center',
                      backgroundColor: dragOverPostImage ? 'rgba(168, 85, 247, 0.1)' : 'rgba(15, 23, 42, 0.3)',
                      transition: 'all 0.2s',
                      cursor: 'pointer',
                    }}
                  >
                    {postForm.image ? (
                      <div style={{ position: 'relative', display: 'inline-block' }}>
                        <img
                          src={postForm.image}
                          alt="Cover"
                          style={{ maxWidth: '320px', maxHeight: '200px', borderRadius: '8px' }}
                        />
                        <button
                          type="button"
                          onClick={handleRemovePostImage}
                          style={{
                            position: 'absolute',
                            top: '-8px',
                            right: '-8px',
                            background: '#ef4444',
                            border: 'none',
                            borderRadius: '50%',
                            padding: '4px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                          aria-label="Remove cover image"
                        >
                          <X size={14} color="#fff" />
                        </button>
                      </div>
                    ) : (
                      <div>
                        <input
                          type="file"
                          accept="image/*"
                          id="post-image-upload"
                          style={{ display: 'none' }}
                          onChange={(e) => {
                            if (e.target.files && e.target.files[0]) {
                              handlePostImageUpload(e.target.files[0]);
                              e.target.value = '';
                            }
                          }}
                        />
                        <label htmlFor="post-image-upload" style={{ cursor: 'pointer' }}>
                          <ImageIcon size={40} color="#64748b" style={{ marginBottom: '8px' }} />
                          <p style={{ color: '#94a3b8', fontSize: '14px', margin: 0 }}>
                            Drag &amp; drop or click to upload cover image
                          </p>
                        </label>
                      </div>
                    )}
                    {uploadingPostImage && (
                      <div style={{ marginTop: '12px' }}>
                        <div style={{
                          height: '4px',
                          backgroundColor: 'rgba(255, 255, 255, 0.1)',
                          borderRadius: '2px',
                          overflow: 'hidden',
                        }}>
                          <div style={{
                            height: '100%',
                            width: `${postImageProgress}%`,
                            background: 'linear-gradient(to right, #a855f7, #ec4899)',
                            transition: 'width 0.2s',
                          }} />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <div style={styles.modalFooter}>
              <button onClick={() => setShowPostModal(false)} style={{ ...styles.button, ...styles.outlineButton }}>
                Cancel
              </button>
              <button onClick={handleSavePost} disabled={postMutations.loading} style={{ ...styles.button, ...styles.primaryButton }}>
                {postMutations.loading ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={16} />}
                {editingPost ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div style={styles.modal}>
          <div style={{ ...styles.modalContent, maxWidth: '400px' }}>
            <div style={styles.modalHeader}>
              <h2 style={{ ...styles.modalTitle, color: '#f87171' }}>Confirm Delete</h2>
            </div>
            <div style={styles.modalBody}>
              <p style={{ color: '#94a3b8' }}>
                Are you sure you want to delete <strong style={{ color: '#ffffff' }}>{showDeleteConfirm.name}</strong>? This action cannot be undone.
              </p>
            </div>
            <div style={styles.modalFooter}>
              <button onClick={() => setShowDeleteConfirm(null)} disabled={isDeleting} style={{ ...styles.button, ...styles.outlineButton, opacity: isDeleting ? 0.5 : 1 }}>
                Cancel
              </button>
              <button
                onClick={() => {
                  if (showDeleteConfirm.type === 'project') {
                    handleDeleteProject(showDeleteConfirm.id);
                  } else if (showDeleteConfirm.type === 'post') {
                    handleDeletePost(showDeleteConfirm.id);
                  } else if (showDeleteConfirm.type === 'job') {
                    handleDeleteJob(showDeleteConfirm.id, showDeleteConfirm.name);
                  }
                }}
                disabled={isDeleting}
                style={{ ...styles.button, ...styles.dangerButton, opacity: isDeleting ? 0.7 : 1, cursor: isDeleting ? 'not-allowed' : 'pointer' }}
              >
                {isDeleting ? (
                  <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                ) : (
                  <Trash2 size={16} />
                )}
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CSS for animations */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

const TRANSLATION_LABELS: Record<PostLanguage, string> = {
  en: 'English',
  ja: '日本語',
};

interface TranslationFieldsProps {
  lang: PostLanguage;
  title: string;
  body: string;
  onTitleChange: (value: string) => void;
  onBodyChange: (value: string) => void;
  labelStyle: CSSProperties;
  inputStyle: CSSProperties;
  onImageUpload: (file: File) => Promise<string>;
}

const TranslationFields = ({
  lang,
  title,
  body,
  onTitleChange,
  onBodyChange,
  labelStyle,
  inputStyle,
  onImageUpload,
}: TranslationFieldsProps) => {
  const hasContent = !!(title.trim() || body.trim());
  return (
    <div
      style={{
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '12px',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        backgroundColor: 'rgba(255, 255, 255, 0.02)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <h3 style={{ margin: 0, color: '#ffffff', fontSize: '15px', fontWeight: 600 }}>
          {TRANSLATION_LABELS[lang]}
        </h3>
        <span
          aria-hidden
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: hasContent ? '#10b981' : 'rgba(255, 255, 255, 0.15)',
          }}
        />
        <span style={{ color: '#64748b', fontSize: '12px' }}>
          {hasContent ? 'will be saved' : 'optional — leave empty to skip'}
        </span>
      </div>
      <div>
        <label style={labelStyle}>Title</label>
        <input
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          style={inputStyle}
        />
      </div>
      <div>
        <label style={labelStyle}>Content</label>
        <TiptapEditor
          value={body}
          onChange={onBodyChange}
          onImageUpload={onImageUpload}
        />
      </div>
    </div>
  );
};

interface InspectPostsButtonProps {
  onMessage: (type: 'success' | 'error', text: string) => void;
}

const InspectPostsButton = ({ onMessage }: InspectPostsButtonProps) => {
  const { currentUser } = useAuth();
  const [running, setRunning] = useState(false);

  const handleClick = async () => {
    if (!currentUser) return;
    setRunning(true);
    try {
      const token = await currentUser.getIdToken();
      const res = await fetch('/api/admin/inspect-posts', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      // Dump the structured result to the console so it's easy to copy.
      console.log('[inspect-posts]', data);
      const summary = `flat=${data.flatCount} legacy=${data.legacyCount} — see browser console for details`;
      onMessage('success', summary);
    } catch (err) {
      onMessage('error', `Inspect failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setRunning(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={running}
      style={{
        padding: '8px 14px',
        border: '1px solid rgba(255,255,255,0.18)',
        borderRadius: '8px',
        background: 'transparent',
        color: '#cbd5e1',
        cursor: running ? 'not-allowed' : 'pointer',
        fontSize: '13px',
      }}
      title="Counts docs at flat post/{id} and legacy post/{cat}/posts/{id} paths"
    >
      {running ? '…' : 'Inspect Firestore'}
    </button>
  );
};

interface MigratePostsFlatButtonProps {
  onMessage: (type: 'success' | 'error', text: string) => void;
  onAfterMigrate?: () => void;
}

interface MigratePostsFlatResult {
  dryRun: boolean;
  keepOld: boolean;
  scanned: number;
  migrated: { from: string; to: string; id: string }[];
  skipped: { path: string; reason: string }[];
  failed: { path: string; error: string }[];
}

const MigratePostsFlatButton = ({ onMessage, onAfterMigrate }: MigratePostsFlatButtonProps) => {
  const { currentUser } = useAuth();
  const [running, setRunning] = useState(false);
  const [lastResult, setLastResult] = useState<MigratePostsFlatResult | null>(null);

  const callMigration = async (dryRun: boolean) => {
    if (!currentUser) return;
    setRunning(true);
    try {
      const token = await currentUser.getIdToken();
      const url = `/api/admin/migrate-posts-flat${dryRun ? '?dryRun=true' : ''}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      const result = data as MigratePostsFlatResult;
      setLastResult(result);

      const summary = `scanned=${result.scanned} migrated=${result.migrated.length} skipped=${result.skipped.length} failed=${result.failed.length}`;
      if (dryRun) {
        onMessage('success', `Dry run: ${summary}`);
      } else if (result.failed.length > 0) {
        onMessage('error', `Migration finished with failures: ${summary}`);
      } else {
        onMessage('success', `Migration complete: ${summary}`);
        onAfterMigrate?.();
      }
    } catch (err) {
      onMessage('error', `Migration failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          onClick={() => callMigration(true)}
          disabled={running}
          style={{
            padding: '8px 14px',
            border: '1px solid rgba(255,255,255,0.18)',
            borderRadius: '8px',
            background: 'transparent',
            color: '#cbd5e1',
            cursor: running ? 'not-allowed' : 'pointer',
            fontSize: '13px',
          }}
          title="Read-only scan; reports what would be migrated without writing"
        >
          {running ? '…' : 'Migrate legacy posts (dry-run)'}
        </button>
        <button
          onClick={() => {
            if (!confirm('Move all legacy post/{cat}/posts/{id} docs into the flat post/{id} collection? This will delete the legacy docs.')) return;
            callMigration(false);
          }}
          disabled={running}
          style={{
            padding: '8px 14px',
            border: '1px solid rgba(168,85,247,0.4)',
            borderRadius: '8px',
            background: 'rgba(168,85,247,0.12)',
            color: '#e9d5ff',
            cursor: running ? 'not-allowed' : 'pointer',
            fontSize: '13px',
          }}
        >
          {running ? '…' : 'Run migration'}
        </button>
      </div>
      {lastResult && (
        <div style={{ color: '#94a3b8', fontSize: '11px' }}>
          last: scanned {lastResult.scanned} · migrated {lastResult.migrated.length} · skipped {lastResult.skipped.length} · failed {lastResult.failed.length}
          {lastResult.dryRun && ' (dry-run)'}
        </div>
      )}
    </div>
  );
};

export default AdminPage;
