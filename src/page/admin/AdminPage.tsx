'use client';

import { usePostMutations,usePostTaxonomy,usePosts } from '@/hooks/usePosts';
import { updateProfile,useProfile,useResumeLink } from '@/hooks/useProfile';
import { useProjectCategories,useProjectMutations,useProjects,useUrlTypes } from '@/hooks/useProjects';
import RichContentRenderer from '@/components/common/RichContentRenderer';
import { ThemeToggle } from '@/components/ThemeToggle';
import { normalizePostCategory, normalizePostTag, normalizePostTags } from '@/lib/blog/postMetadata';
import type { PostLanguage,PostTranslations } from '@/lib/blog/postTranslations';
import { useAuth } from '@/providers/AuthProvider';
import * as imageApi from '@/services/imageService';
import type { ListingPost } from '@/services/postsService';
import type { PostTaxonomyItem,PostTaxonomyType } from '@/services/postsService';
import * as postApi from '@/services/postsService';
import { uploadProfilePhoto, uploadResume } from '@/services/profileService';
import type { Project } from '@/services/projectsService';
import type { Technology } from '@/services/technologiesService';
import * as technologyApi from '@/services/technologiesService';
import * as Select from '@radix-ui/react-select';
import {
AlertCircle,
ArrowLeft,
BookOpen,
Briefcase,
Check,
CheckCircle,
ChevronDown,
ExternalLink,
Eye,
EyeOff,
FileText,
FolderKanban,
Heart,
Image as ImageIcon,
LayoutDashboard,
Loader2,
LogOut,
Newspaper,
Pencil,
Plus,
Save,
ScrollText,
Shield,
Tags,
Trash2,
Upload,
User,
X,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CSSProperties,memo,useCallback,useEffect,useRef,useState } from 'react';

type AdminSection = 'dashboard' | 'profile' | 'projects' | 'posts' | 'taxonomy' | 'jobs' | 'study' | 'hobbies' | 'writing' | 'activity-logs';

interface Job {
  id: string;
  companyName: string;
  companyNameJa?: string;
  jobPosition: string;
  jobPositionJa?: string;
  jobDuration: string;
  jobType?: string;
  jobTypeJa?: string;
  jobDescription?: string;
  jobDescriptionJa?: string;
  order?: number;
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

const adminColors = {
  page: 'var(--admin-page)',
  pageSoft: 'var(--admin-page-soft)',
  sidebar: 'var(--admin-sidebar)',
  surface: 'var(--admin-surface)',
  surfaceRaised: 'var(--admin-surface-raised)',
  surfaceMuted: 'var(--admin-surface-muted)',
  border: 'var(--admin-border)',
  borderStrong: 'var(--admin-border-strong)',
  text: 'var(--admin-text)',
  textSoft: 'var(--admin-text-soft)',
  textMuted: 'var(--admin-text-muted)',
  textSubtle: 'var(--admin-text-subtle)',
  accent: 'var(--admin-accent)',
  accentSoft: 'var(--admin-accent-soft)',
  accentBorder: 'var(--admin-accent-border)',
  accentSecondary: 'var(--admin-accent-secondary)',
  accentSecondarySoft: 'var(--admin-accent-secondary-soft)',
  accentSecondaryBorder: 'var(--admin-accent-secondary-border)',
  primaryText: 'var(--admin-primary-text)',
  success: 'var(--admin-success)',
  successSoft: 'var(--admin-success-soft)',
  successBorder: 'var(--admin-success-border)',
  danger: 'var(--admin-danger)',
  dangerStrong: 'var(--admin-danger-strong)',
  dangerSoft: 'var(--admin-danger-soft)',
  dangerBorder: 'var(--admin-danger-border)',
  dangerText: 'var(--admin-danger-text)',
  dangerTextStrong: 'var(--admin-danger-text-strong)',
  dangerButtonText: 'var(--admin-danger-button-text)',
  warning: 'var(--admin-warning)',
  warningSoft: 'var(--admin-warning-soft)',
  codeBg: 'var(--admin-code-bg)',
} as const;

const adminShadows = {
  surface: 'var(--admin-shadow-surface)',
  sidebar: 'var(--admin-shadow-sidebar)',
  modal: 'var(--admin-shadow-modal)',
} as const;

const adminTransition = 'background-color 160ms ease, border-color 160ms ease, color 160ms ease, transform 160ms ease, box-shadow 160ms ease';

const AdminSectionLoader = ({ label = 'Loading section...' }: { label?: string }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', padding: '48px', color: adminColors.textMuted }}>
    <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />
    <span>{label}</span>
  </div>
);

const ActivityLogPanel = dynamic(() => import('@/components/admin/ActivityLogPanel'), {
  ssr: false,
  loading: () => <AdminSectionLoader label="Loading activity logs..." />,
});

const HobbiesAdminPanel = dynamic(() => import('@/components/hobby/HobbiesAdminPanel'), {
  ssr: false,
  loading: () => <AdminSectionLoader label="Loading hobbies..." />,
});

const WritingAdminPanel = dynamic(() => import('@/components/writing/WritingAdminPanel'), {
  ssr: false,
  loading: () => <AdminSectionLoader label="Loading writing..." />,
});

const StudyAdminPanel = dynamic(() => import('@/components/study/StudyAdminPanel'), {
  ssr: false,
  loading: () => <AdminSectionLoader label="Loading study tools..." />,
});

const TiptapEditor = dynamic(() => import('@/components/editor/TiptapEditor'), {
  ssr: false,
  loading: () => <AdminSectionLoader label="Loading editor..." />,
});

// Styles
const styles: Record<string, CSSProperties> = {
  container: {
    minHeight: '100vh',
    background: `linear-gradient(180deg, ${adminColors.page} 0%, ${adminColors.pageSoft} 100%)`,
    color: adminColors.text,
  },
  sidebar: {
    width: '268px',
    backgroundColor: adminColors.sidebar,
    borderRight: `1px solid ${adminColors.border}`,
    minHeight: '100vh',
    position: 'fixed' as const,
    left: 0,
    top: 0,
    boxShadow: adminShadows.sidebar,
  },
  sidebarHeader: {
    padding: '20px 18px 18px',
    borderBottom: `1px solid ${adminColors.border}`,
  },
  sidebarTitle: {
    fontSize: '18px',
    fontWeight: 650,
    color: adminColors.text,
    letterSpacing: 0,
    margin: 0,
  },
  sidebarEmail: {
    fontSize: '13px',
    color: adminColors.textMuted,
    marginTop: '6px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  navButton: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '9px 10px',
    borderRadius: '8px',
    border: '0',
    cursor: 'pointer',
    transition: adminTransition,
    marginBottom: '2px',
    fontSize: '14px',
    fontWeight: '500',
    lineHeight: 1.2,
  },
  navButtonActive: {
    backgroundColor: adminColors.accentSoft,
    color: adminColors.text,
    boxShadow: `inset 3px 0 0 ${adminColors.accent}`,
  },
  navButtonInactive: {
    backgroundColor: 'transparent',
    color: adminColors.textMuted,
  },
  main: {
    marginLeft: '268px',
    flex: 1,
    padding: '28px 32px 40px',
  },
  pageTitle: {
    fontSize: '30px',
    fontWeight: 650,
    color: adminColors.text,
    lineHeight: 1.15,
    letterSpacing: 0,
    marginBottom: '6px',
  },
  pageSubtitle: {
    color: adminColors.textMuted,
    marginBottom: '28px',
  },
  card: {
    backgroundColor: adminColors.surface,
    borderRadius: '8px',
    border: `1px solid ${adminColors.border}`,
    overflow: 'hidden',
    boxShadow: adminShadows.surface,
  },
  statCard: {
    padding: '20px',
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
  },
  statIconWrapper: {
    padding: '10px',
    borderRadius: '8px',
  },
  statNumber: {
    fontSize: '28px',
    fontWeight: 650,
    color: adminColors.text,
    lineHeight: 1,
  },
  button: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    minHeight: '38px',
    padding: '8px 14px',
    borderRadius: '8px',
    border: '1px solid transparent',
    cursor: 'pointer',
    fontWeight: '500',
    fontSize: '14px',
    lineHeight: 1.2,
    transition: adminTransition,
  },
  primaryButton: {
    backgroundColor: adminColors.accent,
    borderColor: adminColors.accent,
    color: adminColors.primaryText,
  },
  outlineButton: {
    backgroundColor: adminColors.surfaceRaised,
    borderColor: adminColors.borderStrong,
    color: adminColors.text,
  },
  dangerButton: {
    backgroundColor: adminColors.dangerStrong,
    borderColor: adminColors.dangerStrong,
    color: adminColors.dangerButtonText,
  },
  ghostButton: {
    backgroundColor: 'transparent',
    border: '1px solid transparent',
    color: adminColors.textMuted,
    padding: '8px',
  },
  table: {
    width: '100%',
    borderCollapse: 'separate' as const,
    borderSpacing: 0,
  },
  th: {
    textAlign: 'left' as const,
    padding: '12px 18px',
    fontWeight: 600,
    color: adminColors.textSubtle,
    borderBottom: `1px solid ${adminColors.border}`,
    backgroundColor: adminColors.surfaceMuted,
    fontSize: '12px',
    lineHeight: 1.35,
    letterSpacing: 0,
  },
  td: {
    padding: '14px 18px',
    borderBottom: `1px solid ${adminColors.border}`,
    color: adminColors.textSoft,
  },
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '3px 8px',
    borderRadius: '9999px',
    fontSize: '12px',
    fontWeight: '500',
    lineHeight: 1.35,
  },
  techBadge: {
    backgroundColor: adminColors.accentSecondarySoft,
    color: adminColors.accentSecondary,
    border: `1px solid ${adminColors.accentSecondaryBorder}`,
  },
  input: {
    width: '100%',
    padding: '9px 11px',
    borderRadius: '8px',
    border: `1px solid ${adminColors.borderStrong}`,
    backgroundColor: adminColors.surfaceRaised,
    color: adminColors.text,
    fontSize: '14px',
    outline: 'none',
    lineHeight: 1.45,
    accentColor: adminColors.accent,
  },
  textarea: {
    width: '100%',
    padding: '9px 11px',
    borderRadius: '8px',
    border: `1px solid ${adminColors.borderStrong}`,
    backgroundColor: adminColors.surfaceRaised,
    color: adminColors.text,
    fontSize: '14px',
    outline: 'none',
    resize: 'vertical' as const,
    minHeight: '100px',
    lineHeight: 1.5,
    accentColor: adminColors.accent,
  },
  select: {
    width: '100%',
    padding: '9px 11px',
    borderRadius: '8px',
    border: `1px solid ${adminColors.borderStrong}`,
    backgroundColor: adminColors.surfaceRaised,
    color: adminColors.text,
    fontSize: '14px',
    outline: 'none',
    cursor: 'pointer',
    minHeight: '38px',
    accentColor: adminColors.accent,
  },
  radixSelectTrigger: {
    width: '100%',
    minHeight: '42px',
    padding: '9px 11px',
    borderRadius: '8px',
    border: `1px solid ${adminColors.borderStrong}`,
    backgroundColor: adminColors.surfaceRaised,
    color: adminColors.text,
    fontSize: '14px',
    cursor: 'pointer',
    lineHeight: 1.45,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
    textAlign: 'left' as const,
  },
  radixSelectValue: {
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  radixSelectContent: {
    zIndex: 120,
    width: 'var(--radix-select-trigger-width)',
    maxHeight: '280px',
    overflow: 'hidden',
    borderRadius: '8px',
    border: `1px solid ${adminColors.borderStrong}`,
    backgroundColor: adminColors.surfaceRaised,
    color: adminColors.text,
    boxShadow: adminShadows.modal,
  },
  radixSelectViewport: {
    padding: '4px',
  },
  radixSelectItem: {
    position: 'relative' as const,
    minHeight: '36px',
    display: 'flex',
    alignItems: 'center',
    padding: '8px 34px 8px 11px',
    borderRadius: '6px',
    color: adminColors.text,
    fontSize: '14px',
    lineHeight: 1.35,
    outline: 'none',
    cursor: 'pointer',
    userSelect: 'none' as const,
  },
  radixSelectItemIndicator: {
    position: 'absolute' as const,
    right: '10px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: adminColors.accent,
  },
  label: {
    display: 'block',
    color: adminColors.textMuted,
    fontSize: '13px',
    fontWeight: '500',
    marginBottom: '6px',
  },
  modal: {
    position: 'fixed' as const,
    inset: 0,
    backgroundColor: 'var(--admin-modal-backdrop)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
    padding: '28px',
  },
  modalContent: {
    backgroundColor: adminColors.surface,
    borderRadius: '8px',
    border: `1px solid ${adminColors.borderStrong}`,
    maxWidth: '640px',
    width: '100%',
    maxHeight: '90vh',
    overflow: 'auto',
    boxShadow: adminShadows.modal,
  },
  modalHeader: {
    padding: '18px 20px',
    borderBottom: `1px solid ${adminColors.border}`,
  },
  modalTitle: {
    fontSize: '20px',
    fontWeight: '600',
    color: adminColors.text,
    letterSpacing: 0,
  },
  modalBody: {
    padding: '20px',
  },
  modalFooter: {
    padding: '16px 20px',
    borderTop: `1px solid ${adminColors.border}`,
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
  },
  toast: {
    position: 'fixed' as const,
    top: '16px',
    right: '16px',
    zIndex: 100,
    padding: '12px 16px',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    boxShadow: adminShadows.modal,
  },
  toastSuccess: {
    backgroundColor: 'var(--admin-toast-success-bg)',
    border: `1px solid ${adminColors.success}`,
    color: adminColors.text,
  },
  toastError: {
    backgroundColor: 'var(--admin-toast-error-bg)',
    border: `1px solid ${adminColors.danger}`,
    color: adminColors.text,
  },
};

// Helper to get section from URL hash
const getSectionFromHash = (): AdminSection => {
  if (typeof window === 'undefined') return 'dashboard';
  const hash = window.location.hash.replace('#', '');
  const validSections: AdminSection[] = ['dashboard', 'profile', 'projects', 'posts', 'taxonomy', 'jobs', 'study', 'hobbies', 'writing', 'activity-logs'];
  return validSections.includes(hash as AdminSection) ? (hash as AdminSection) : 'dashboard';
};

// The big row lists are memoized so that the keystroke-level state updates
// of AdminPage (every controlled form field lives there) don't re-render
// up to a hundred table rows per keypress. Their handler props must stay
// referentially stable (useCallback in AdminPage) for the memo to hold.
const ProjectsTable = memo(function ProjectsTable({
  projects,
  onEdit,
  onDelete,
}: {
  projects: Project[];
  onEdit: (project: Project) => void;
  onDelete: (project: Project) => void;
}) {
  return (
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
            <tr key={project.id}>
              <td style={styles.td}>
                <div style={{ fontWeight: '500', color: adminColors.text }}>{project.title}</div>
                <div style={{ fontSize: '14px', color: adminColors.textSubtle, maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{project.description}</div>
              </td>
              <td style={{ ...styles.td, color: adminColors.textMuted }}>{project.date}</td>
              <td style={styles.td}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                  {project.technologies?.slice(0, 3).map((tech, i) => (
                    <span key={i} style={{ ...styles.badge, ...styles.techBadge }}>{getTechName(tech)}</span>
                  ))}
                  {(project.technologies?.length || 0) > 3 && (
                    <span style={{ ...styles.badge, backgroundColor: 'transparent', border: `1px solid ${adminColors.borderStrong}`, color: adminColors.textMuted }}>
                      +{(project.technologies?.length || 0) - 3}
                    </span>
                  )}
                </div>
              </td>
              <td style={{ ...styles.td, textAlign: 'right' }}>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  <button onClick={() => onEdit(project)} aria-label={`Edit ${project.title}`} style={{ ...styles.ghostButton, borderRadius: '8px' }}>
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => onDelete(project)}
                    aria-label={`Delete ${project.title}`}
                    style={{ ...styles.ghostButton, borderRadius: '8px', color: adminColors.danger }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
          {projects.length === 0 && (
            <tr>
              <td colSpan={4} style={{ ...styles.td, textAlign: 'center', color: adminColors.textSubtle, padding: '48px' }}>
                No projects yet. Click &quot;Add Project&quot; to create one.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
});

const PostsTable = memo(function PostsTable({
  posts,
  onEdit,
  onDelete,
}: {
  posts: ListingPost[];
  onEdit: (post: ListingPost) => void;
  onDelete: (post: ListingPost) => void;
}) {
  return (
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
            <tr key={post.id}>
              <td style={styles.td}>
                <div style={{ fontWeight: '500', color: adminColors.text }}>{post.title}</div>
                {(post.tags || []).length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '8px' }}>
                    {(post.tags || []).slice(0, 4).map((tag) => (
                      <span
                        key={tag}
                        style={{
                          ...styles.badge,
                          backgroundColor: 'transparent',
                          border: `1px solid ${adminColors.border}`,
                          color: adminColors.textMuted,
                        }}
                      >
                        {tag}
                      </span>
                    ))}
                    {(post.tags || []).length > 4 && (
                      <span style={{ ...styles.badge, backgroundColor: 'transparent', color: adminColors.textMuted }}>
                        +{(post.tags || []).length - 4}
                      </span>
                    )}
                  </div>
                )}
              </td>
              <td style={styles.td}>
                <span style={{ ...styles.badge, backgroundColor: 'transparent', border: `1px solid ${adminColors.borderStrong}`, color: adminColors.textSoft }}>
                  {post.category}
                </span>
              </td>
              <td style={styles.td}>
                {post.isPublic ? (
                  <span style={{ ...styles.badge, backgroundColor: adminColors.successSoft, color: adminColors.success, border: `1px solid ${adminColors.successBorder}` }}>
                    <Eye size={12} /> Public
                  </span>
                ) : (
                  <span style={{ ...styles.badge, backgroundColor: 'transparent', border: `1px solid ${adminColors.borderStrong}`, color: adminColors.textMuted }}>
                    <EyeOff size={12} /> Private
                  </span>
                )}
              </td>
              <td style={{ ...styles.td, color: adminColors.textMuted, fontSize: '14px' }} suppressHydrationWarning>
                {post.lastUpdated ? new Date(post.lastUpdated).toLocaleDateString() : '-'}
              </td>
              <td style={{ ...styles.td, textAlign: 'right' }}>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  <Link
                    href={`/blog/${post.category}/${post.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Preview ${post.title}`}
                    style={{ ...styles.ghostButton, borderRadius: '8px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <ExternalLink size={16} />
                  </Link>
                  <button onClick={() => onEdit(post)} aria-label={`Edit ${post.title}`} style={{ ...styles.ghostButton, borderRadius: '8px' }}>
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => onDelete(post)}
                    aria-label={`Delete ${post.title}`}
                    style={{ ...styles.ghostButton, borderRadius: '8px', color: adminColors.danger }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
          {posts.length === 0 && (
            <tr>
              <td colSpan={5} style={{ ...styles.td, textAlign: 'center', color: adminColors.textSubtle, padding: '48px' }}>
                No posts yet. Click &quot;Add Post&quot; to create one.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
});

const BlogTaxonomyPanel = memo(function BlogTaxonomyPanel({
  taxonomy,
  posts,
  loading,
  mutating,
  onAdd,
  onRequestDelete,
  onEditPost,
}: {
  taxonomy: postApi.PostTaxonomyResponse | null;
  posts: ListingPost[];
  loading: boolean;
  mutating: boolean;
  onAdd: (type: PostTaxonomyType, value: string) => Promise<void>;
  onRequestDelete: (type: PostTaxonomyType, item: PostTaxonomyItem) => void;
  onEditPost: (post: ListingPost) => void;
}) {
  const [categoryInput, setCategoryInput] = useState('');
  const [tagInput, setTagInput] = useState('');

  const categories = taxonomy?.categories || [];
  const tags = taxonomy?.tags || [];

  const matchingPosts = (type: PostTaxonomyType, slug: string) => posts.filter((post) => (
    type === 'category' ? post.category === slug : (post.tags || []).includes(slug)
  ));

  const handleAdd = async (type: PostTaxonomyType) => {
    const value = type === 'category' ? categoryInput : tagInput;
    try {
      await onAdd(type, value);
    } catch {
      return;
    }
    if (type === 'category') {
      setCategoryInput('');
    } else {
      setTagInput('');
    }
  };

  const renderTable = (type: PostTaxonomyType, items: PostTaxonomyItem[]) => (
    <div style={styles.card}>
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>{type === 'category' ? 'Category' : 'Tag'}</th>
            <th style={styles.th}>Source</th>
            <th style={styles.th}>Posts</th>
            <th style={{ ...styles.th, textAlign: 'right' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const usedPosts = matchingPosts(type, item.slug);
            const canDelete = item.configured && !item.seeded && item.postCount === 0;
            const pluralType = type === 'category' ? 'categories' : 'tags';
            const deleteReason = item.postCount > 0
              ? `${item.postCount} ${item.postCount === 1 ? 'post uses' : 'posts use'} this ${type}`
              : item.seeded
                ? `Seeded ${pluralType} cannot be deleted`
                : !item.configured
                  ? `Only saved ${pluralType} can be deleted here`
                  : '';
            const deleteLabel = mutating
              ? `Cannot delete ${item.slug}: taxonomy update in progress`
              : canDelete
                ? `Delete ${item.slug}`
                : `Cannot delete ${item.slug}: ${deleteReason}`;
            const deleteTitle = mutating
              ? 'Taxonomy update in progress'
              : canDelete
                ? `Delete ${item.slug}`
                : deleteReason;

            return (
              <tr key={`${type}-${item.slug}`}>
                <td style={styles.td}>
                  <span style={{ fontWeight: 600, color: adminColors.text }}>{item.slug}</span>
                </td>
                <td style={styles.td}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {item.seeded && (
                      <span style={{ ...styles.badge, backgroundColor: adminColors.accentSoft, color: adminColors.accent, border: `1px solid ${adminColors.accentBorder}` }}>
                        Seeded
                      </span>
                    )}
                    {item.configured && (
                      <span style={{ ...styles.badge, backgroundColor: adminColors.successSoft, color: adminColors.success, border: `1px solid ${adminColors.successBorder}` }}>
                        Saved
                      </span>
                    )}
                    {item.postCount > 0 && (
                      <span style={{ ...styles.badge, backgroundColor: 'transparent', color: adminColors.textMuted, border: `1px solid ${adminColors.borderStrong}` }}>
                        In use
                      </span>
                    )}
                  </div>
                </td>
                <td style={styles.td}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <span style={{ color: adminColors.textMuted, fontSize: '13px' }}>
                      {item.postCount} {item.postCount === 1 ? 'post' : 'posts'}
                    </span>
                    {usedPosts.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {usedPosts.slice(0, 3).map((post) => (
                          <button
                            key={post.id}
                            type="button"
                            onClick={() => onEditPost(post)}
                            style={{
                              ...styles.ghostButton,
                              border: `1px solid ${adminColors.border}`,
                              borderRadius: '8px',
                              padding: '4px 8px',
                              maxWidth: '220px',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {post.title}
                          </button>
                        ))}
                        {usedPosts.length > 3 && (
                          <span style={{ ...styles.badge, backgroundColor: 'transparent', color: adminColors.textMuted }}>
                            +{usedPosts.length - 3}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </td>
                <td style={{ ...styles.td, textAlign: 'right' }}>
                  <button
                    type="button"
                    onClick={() => onRequestDelete(type, item)}
                    disabled={!canDelete || mutating}
                    aria-label={deleteLabel}
                    title={deleteTitle}
                    style={{
                      ...styles.ghostButton,
                      borderRadius: '8px',
                      color: canDelete ? adminColors.danger : adminColors.textSubtle,
                      cursor: canDelete && !mutating ? 'pointer' : 'not-allowed',
                      opacity: canDelete ? 1 : 0.45,
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            );
          })}
          {items.length === 0 && (
            <tr>
              <td colSpan={4} style={{ ...styles.td, textAlign: 'center', color: adminColors.textSubtle, padding: '32px' }}>
                No {type === 'category' ? 'categories' : 'tags'} yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '48px' }}>
        <Loader2 size={32} color={adminColors.accent} style={{ animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        gap: '16px',
      }}>
        <div style={styles.card}>
          <div style={{ padding: '20px' }}>
            <h2 style={{ color: adminColors.text, fontSize: '17px', fontWeight: 600, marginBottom: '6px' }}>Add category</h2>
            <p style={{ color: adminColors.textMuted, fontSize: '13px', marginBottom: '14px' }}>
              Saved categories appear as choices when creating or editing posts.
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                value={categoryInput}
                onChange={(e) => setCategoryInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleAdd('category');
                }}
                placeholder="system-design"
                style={styles.input}
              />
              <button
                type="button"
                onClick={() => void handleAdd('category')}
                disabled={mutating}
                style={{ ...styles.button, ...styles.primaryButton, flexShrink: 0 }}
              >
                {mutating ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={16} />}
                Add
              </button>
            </div>
          </div>
        </div>

        <div style={styles.card}>
          <div style={{ padding: '20px' }}>
            <h2 style={{ color: adminColors.text, fontSize: '17px', fontWeight: 600, marginBottom: '6px' }}>Add tag</h2>
            <p style={{ color: adminColors.textMuted, fontSize: '13px', marginBottom: '14px' }}>
              Saved tags are suggested in the post editor and can exist before any post uses them.
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleAdd('tag');
                }}
                placeholder="hashing"
                style={styles.input}
              />
              <button
                type="button"
                onClick={() => void handleAdd('tag')}
                disabled={mutating}
                style={{ ...styles.button, ...styles.primaryButton, flexShrink: 0 }}
              >
                {mutating ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={16} />}
                Add
              </button>
            </div>
          </div>
        </div>
      </div>

      <section>
        <h2 style={{ color: adminColors.text, fontSize: '18px', fontWeight: 600, marginBottom: '12px' }}>Categories</h2>
        {renderTable('category', categories)}
      </section>

      <section>
        <h2 style={{ color: adminColors.text, fontSize: '18px', fontWeight: 600, marginBottom: '12px' }}>Tags</h2>
        {renderTable('tag', tags)}
      </section>
    </div>
  );
});

const AdminPage = () => {
  const { currentUser, loading: authLoading, isAdmin, signOut } = useAuth();
  const router = useRouter();
  const { profile, loading: profileLoading, refetch: refetchProfile } = useProfile();
  const { resumeLink: fetchedResumeLink } = useResumeLink();
  const { projects, loading: projectsLoading, refetch: refetchProjects } = useProjects();
  // Admin sees every post including drafts, so pass `isPublic: null` to
  // skip the public-only filter. The tables only render metadata and the
  // edit modal fetches the full document, so skip the HTML bodies — they
  // dominated the payload of this initial load.
  const { posts, loading: postsLoading, refetch: refetchPosts } = usePosts({ limit: 100, isPublic: null, excludeBody: true });
  const { categories: projectCategories } = useProjectCategories();
  const { urlTypes } = useUrlTypes();
  const {
    taxonomy: postTaxonomy,
    loading: postTaxonomyLoading,
    mutating: postTaxonomyMutating,
    refetch: refetchPostTaxonomy,
    addItem: addPostTaxonomyItem,
    deleteItem: deletePostTaxonomyItem,
  } = usePostTaxonomy();
  const projectMutations = useProjectMutations();
  const postMutations = usePostMutations();
  const postCategoryOptions = postTaxonomy?.categories.map((item) => item.slug) || [];
  const postTagOptions = postTaxonomy?.tags.map((item) => item.slug) || [];
  const defaultPostCategory = postCategoryOptions[0] || '';

  const [activeSection, setActiveSection] = useState<AdminSection>(() => getSectionFromHash());
  const [signingOut, setSigningOut] = useState(false);

  // Sync activeSection with URL hash
  useEffect(() => {
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

  const handleSignOut = useCallback(async () => {
    setSigningOut(true);
    try {
      await signOut();
      router.push('/');
    } catch (error) {
      console.error('Admin sign-out error:', error);
      setSigningOut(false);
    }
  }, [router, signOut]);

  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal states
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [showPostModal, setShowPostModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<{ type: 'project' | 'post' | 'job'; id: string; name: string; category?: string } | null>(null);
  const [showTaxonomyDeleteConfirm, setShowTaxonomyDeleteConfirm] = useState<{ type: PostTaxonomyType; item: PostTaxonomyItem } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Edit states
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [editingPost, setEditingPost] = useState<ListingPost | null>(null);
  const [techInput, setTechInput] = useState('');

  // Full-job edit / create form. `null` = no form open; `'new'` = create
  // mode (POST), any other id = edit mode (PUT by id).
  // `order` is kept as a string so the controlled <input type="number">
  // accepts intermediate values like "" or "-" without being eagerly
  // parsed into NaN/0. We coerce to a Number at submit.
  const [jobFormMode, setJobFormMode] = useState<null | 'new' | string>(null);
  const [jobForm, setJobForm] = useState({
    companyName: '',
    companyNameJa: '',
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
    profileImageUrl: '',
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
  const [uploadingProfilePhoto, setUploadingProfilePhoto] = useState(false);
  const [profilePhotoProgress, setProfilePhotoProgress] = useState(0);
  const [dragOverProfilePhoto, setDragOverProfilePhoto] = useState(false);

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
  const [postTagsInput, setPostTagsInput] = useState('');

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
    if (authLoading || signingOut) return;
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
  }, [authLoading, currentUser, isAdmin, router, signingOut]);

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
        profileImageUrl: profile.profileImageUrl || '',
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

  // Single dismissal timer: clearing the previous one keeps an older
  // toast's timeout from hiding a newer message, and the unmount cleanup
  // stops it firing after navigation away.
  const messageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [adminPortalContainer, setAdminPortalContainer] = useState<HTMLDivElement | null>(null);
  const setAdminConsoleNode = useCallback((node: HTMLDivElement | null) => {
    setAdminPortalContainer(node);
  }, []);

  const showMessage = useCallback((type: 'success' | 'error', text: string) => {
    if (messageTimerRef.current) clearTimeout(messageTimerRef.current);
    setMessage({ type, text });
    messageTimerRef.current = setTimeout(() => setMessage(null), 5000);
  }, []);

  useEffect(() => {
    return () => {
      if (messageTimerRef.current) clearTimeout(messageTimerRef.current);
    };
  }, []);

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
        profileImageUrl: profileForm.profileImageUrl.trim(),
      });
      await refetchProfile();
      showMessage('success', 'Profile updated successfully!');
      setEditingProfile(false);
    } catch (error) {
      showMessage('error', `Failed to update profile: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Project handlers. useCallback so the memoized ProjectsTable doesn't
  // re-render on every keystroke elsewhere on the page.
  const handleOpenProjectModal = useCallback((project?: Project) => {
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
  }, []);

  const requestDeleteProject = useCallback((project: Project) => {
    setShowDeleteConfirm({ type: 'project', id: project.id, name: project.title });
  }, []);

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

  // Post handlers. useCallback so the memoized PostsTable doesn't
  // re-render on every keystroke elsewhere on the page.
  const handleOpenPostModal = useCallback(async (post?: ListingPost) => {
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
        setPostTagsInput((detail.tags || []).join(', '));
      } catch (error) {
        showMessage('error', `Failed to load post: ${error instanceof Error ? error.message : 'Unknown error'}`);
        return;
      }
    } else {
      setEditingPost(null);
      setPostForm({
        category: defaultPostCategory,
        isPublic: true,
        image: '',
        translations: {},
      });
      setPostTagsInput('');
    }
    setShowPostModal(true);
  }, [defaultPostCategory, showMessage]);

  const requestDeletePost = useCallback((post: ListingPost) => {
    setShowDeleteConfirm({ type: 'post', id: post.id, name: post.title, category: post.category });
  }, []);

  const handleAddPostTaxonomyItem = useCallback(async (type: PostTaxonomyType, value: string) => {
    const normalized = type === 'category' ? normalizePostCategory(value) : normalizePostTag(value);
    if (!normalized) {
      showMessage('error', `Please enter a valid ${type}.`);
      throw new Error('Invalid taxonomy value');
    }

    try {
      await addPostTaxonomyItem(type, normalized);
      showMessage('success', `${type === 'category' ? 'Category' : 'Tag'} added.`);
    } catch (error) {
      showMessage('error', `Failed to add ${type}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }, [addPostTaxonomyItem, showMessage]);

  const requestDeletePostTaxonomyItem = useCallback((type: PostTaxonomyType, item: PostTaxonomyItem) => {
    if (item.postCount > 0) {
      showMessage('error', `Cannot delete ${item.slug}: ${item.postCount} ${item.postCount === 1 ? 'post uses' : 'posts use'} this ${type}.`);
      return;
    }
    if (item.seeded || !item.configured) {
      showMessage('error', `Cannot delete ${item.slug} from taxonomy.`);
      return;
    }

    setShowTaxonomyDeleteConfirm({ type, item });
  }, [showMessage]);

  const handleDeletePostTaxonomyItem = useCallback(async () => {
    if (!showTaxonomyDeleteConfirm || isDeleting) return;

    const { type, item } = showTaxonomyDeleteConfirm;
    if (item.postCount > 0) {
      showMessage('error', `Cannot delete ${item.slug}: ${item.postCount} ${item.postCount === 1 ? 'post uses' : 'posts use'} this ${type}.`);
      setShowTaxonomyDeleteConfirm(null);
      return;
    }

    setIsDeleting(true);
    try {
      await deletePostTaxonomyItem(type, item.slug);
      showMessage('success', `${type === 'category' ? 'Category' : 'Tag'} deleted.`);
      setShowTaxonomyDeleteConfirm(null);
    } catch (error) {
      showMessage('error', `Failed to delete ${type}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsDeleting(false);
    }
  }, [deletePostTaxonomyItem, isDeleting, showMessage, showTaxonomyDeleteConfirm]);

  const appendPostTag = (tag: string) => {
    const next = normalizePostTags([...normalizePostTags(postTagsInput), tag]);
    setPostTagsInput(next.join(', '));
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
    const category = normalizePostCategory(postForm.category);
    if (!category) {
      showMessage('error', 'Please select a category.');
      return;
    }

    const tags = normalizePostTags(postTagsInput);

    try {
      if (editingPost) {
        await postMutations.updatePost(editingPost.id, {
          category,
          tags,
          translations: cleanedTranslations,
          isPublic: postForm.isPublic,
          image: postForm.image,
        });
        showMessage('success', 'Post updated successfully!');
      } else {
        await postMutations.createPost({
          category,
          tags,
          translations: cleanedTranslations,
          isPublic: postForm.isPublic,
          image: postForm.image,
        });
        showMessage('success', 'Post created successfully!');
      }
      setShowPostModal(false);
      refetchPosts();
      void refetchPostTaxonomy();
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

  const handleProfilePhotoUpload = async (file: File) => {
    const allowedProfilePhotoTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedProfilePhotoTypes.includes(file.type)) {
      showMessage('error', 'Profile photo must be a JPG, PNG, WebP, or GIF image');
      return;
    }

    setUploadingProfilePhoto(true);
    setProfilePhotoProgress(0);

    const progressInterval = setInterval(() => {
      setProfilePhotoProgress((prev) => {
        if (prev >= 90) {
          clearInterval(progressInterval);
          return 90;
        }
        return prev + 10;
      });
    }, 100);

    try {
      const downloadURL = await uploadProfilePhoto(file);
      setProfileForm((prev) => ({ ...prev, profileImageUrl: downloadURL }));
      await refetchProfile();
      setProfilePhotoProgress(100);
      showMessage('success', 'Profile photo uploaded successfully');
    } catch (error) {
      console.error('Error uploading profile photo:', error);
      showMessage('error', `Failed to upload profile photo: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      clearInterval(progressInterval);
      setUploadingProfilePhoto(false);
      setTimeout(() => setProfilePhotoProgress(0), 1000);
    }
  };

  const handleDropProfilePhoto = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverProfilePhoto(false);

    const files = e.dataTransfer.files;
    if (files && files[0]) {
      handleProfilePhotoUpload(files[0]);
    }
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
      void refetchPostTaxonomy();
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

  const handleToggleJobHidden = async (id: string, companyName: string, currentHidden: boolean) => {
    const nextHidden = !currentHidden;
    try {
      const authHeaders = await getAuthHeaders();
      const response = await fetch('/api/job', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ id, hidden: nextHidden }),
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
        body: JSON.stringify({ id: jobId, technologies: techArray }),
      });

      if (response.ok) {
        showMessage('success', `Updated technologies for ${companyName}`);
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
    const j = job as unknown as Record<string, unknown>;
    setJobForm({
      companyName: typeof j.companyName === 'string' ? j.companyName : '',
      companyNameJa: typeof j.companyNameJa === 'string' ? j.companyNameJa : '',
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
    setJobForm({
      companyName: '',
      companyNameJa: '',
      jobPosition: '',
      jobPositionJa: '',
      jobType: 'Full-time',
      jobTypeJa: '',
      jobDuration: '',
      jobDescription: '',
      jobDescriptionJa: '',
      order: jobs.length > 0 ? String(Math.max(...jobs.map(j => j.order || 0)) + 1) : '0',
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
      companyNameJa: jobForm.companyNameJa.trim(),
      jobPosition: jobForm.jobPosition.trim(),
      jobPositionJa: jobForm.jobPositionJa.trim(),
      jobType: jobForm.jobType,
      jobTypeJa: jobForm.jobTypeJa.trim(),
      jobDuration: jobForm.jobDuration,
      jobDescription: jobForm.jobDescription,
      jobDescriptionJa: jobForm.jobDescriptionJa.trim(),
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

      <div style={{ borderTop: `1px solid ${adminColors.border}`, paddingTop: '14px', marginTop: '6px' }}>
        <p style={{ fontSize: '12px', color: adminColors.textMuted, textTransform: 'uppercase', letterSpacing: 0, marginBottom: '12px' }}>
          Japanese (optional)
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div>
            <label style={styles.label}>Company (Japanese)</label>
            <input
              value={jobForm.companyNameJa}
              onChange={(e) => setJobForm({ ...jobForm, companyNameJa: e.target.value })}
              placeholder="Atlas"
              style={styles.input}
            />
          </div>
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

  if (authLoading || !currentUser || !isAdmin) {
    return (
      <div style={{ ...styles.container, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: adminColors.text }}>
          <Loader2 style={{ width: '24px', height: '24px', animation: 'spin 1s linear infinite' }} />
          <span style={{ fontSize: '18px' }}>Loading...</span>
        </div>
      </div>
    );
  }

  const profilePhotoUrl = profileForm.profileImageUrl || profile?.profileImageUrl || '';

  const sidebarItems = [
    { id: 'dashboard' as AdminSection, label: 'Dashboard', icon: LayoutDashboard },
    { id: 'profile' as AdminSection, label: 'Profile', icon: User },
    { id: 'projects' as AdminSection, label: 'Projects', icon: FolderKanban },
    { id: 'posts' as AdminSection, label: 'Blog Posts', icon: FileText },
    { id: 'taxonomy' as AdminSection, label: 'Blog Taxonomy', icon: Tags },
    { id: 'writing' as AdminSection, label: 'Writing', icon: Newspaper },
    { id: 'jobs' as AdminSection, label: 'Jobs', icon: Briefcase },
    { id: 'study' as AdminSection, label: 'Study Tool', icon: BookOpen },
    { id: 'hobbies' as AdminSection, label: 'Hobbies', icon: Heart },
    { id: 'activity-logs' as AdminSection, label: 'Activity Log', icon: ScrollText },
  ];
  const selectedPostTags = normalizePostTags(postTagsInput);
  const isPostCategorySelectDisabled = postTaxonomyLoading || postCategoryOptions.length === 0;
  const postCategoryPlaceholder = postTaxonomyLoading
    ? 'Loading categories...'
    : postCategoryOptions.length === 0
      ? 'No categories available'
      : 'Select category';

  return (
    <div ref={setAdminConsoleNode} className="admin-console" style={styles.container}>
      {/* Toast Message */}
      {message && (
        <div style={{ ...styles.toast, ...(message.type === 'success' ? styles.toastSuccess : styles.toastError) }}>
          {message.type === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
          <span style={{ fontWeight: '500' }}>{message.text}</span>
          <button
            onClick={() => setMessage(null)}
            style={{ background: 'none', border: 'none', color: adminColors.textMuted, cursor: 'pointer', padding: '4px' }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      <div className="admin-console__layout" style={{ display: 'flex' }}>
        {/* Sidebar */}
        <aside style={styles.sidebar}>
          <div style={styles.sidebarHeader}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '12px' }}>
              <Link
                href="/"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '13px',
                  color: adminColors.textMuted,
                  textDecoration: 'none',
                }}
              >
                <ArrowLeft size={14} />
                meetyudai.com
              </Link>
              <ThemeToggle />
            </div>
            <h2 style={styles.sidebarTitle}>Admin Panel</h2>
            <p style={styles.sidebarEmail}>{currentUser?.email}</p>
          </div>
          <nav style={{ padding: '14px' }}>
            {sidebarItems.map((item) => (
              <button
                type="button"
                key={item.id}
                onClick={() => handleSectionChange(item.id)}
                className="admin-console__nav-button"
                data-active={activeSection === item.id}
                style={{
                  ...styles.navButton,
                  ...(activeSection === item.id ? styles.navButtonActive : styles.navButtonInactive),
                }}
              >
                <item.icon size={18} style={{ color: activeSection === item.id ? adminColors.accent : 'inherit' }} />
                {item.label}
              </button>
            ))}

            {/* Security Settings Link */}
            <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: `1px solid ${adminColors.border}` }}>
              <Link
                href="/admin/security"
                style={{
                  ...styles.navButton,
                  ...styles.navButtonInactive,
                  textDecoration: 'none',
                }}
              >
                <Shield size={18} />
                Security Settings
              </Link>
              <button
                type="button"
                onClick={handleSignOut}
                disabled={signingOut}
                className="admin-console__logout-button"
                style={{
                  ...styles.navButton,
                  backgroundColor: 'transparent',
                  color: adminColors.dangerText,
                  cursor: signingOut ? 'not-allowed' : 'pointer',
                  opacity: signingOut ? 0.7 : 1,
                }}
              >
                {signingOut ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> : <LogOut size={18} />}
                {signingOut ? 'Signing out...' : 'Log out'}
              </button>
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
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
                <div style={{ ...styles.card, borderColor: adminColors.accentBorder }}>
                  <div style={styles.statCard}>
                    <div style={{ ...styles.statIconWrapper, backgroundColor: adminColors.accentSoft }}>
                      <FolderKanban size={22} color={adminColors.accent} />
                    </div>
                    <div>
                      <p style={styles.statNumber}>{projectsLoading ? '...' : projects.length}</p>
                      <p style={{ color: adminColors.textMuted, fontSize: '13px' }}>Projects</p>
                    </div>
                  </div>
                </div>

                <div style={{ ...styles.card, borderColor: adminColors.successBorder }}>
                  <div style={styles.statCard}>
                    <div style={{ ...styles.statIconWrapper, backgroundColor: adminColors.successSoft }}>
                      <FileText size={22} color={adminColors.success} />
                    </div>
                    <div>
                      <p style={styles.statNumber}>{postsLoading ? '...' : posts.length}</p>
                      <p style={{ color: adminColors.textMuted, fontSize: '13px' }}>Blog Posts</p>
                    </div>
                  </div>
                </div>

                <div style={{ ...styles.card, borderColor: adminColors.accentSecondaryBorder }}>
                  <div style={styles.statCard}>
                    <div style={{ ...styles.statIconWrapper, backgroundColor: adminColors.accentSecondarySoft }}>
                      <Briefcase size={22} color={adminColors.accentSecondary} />
                    </div>
                    <div>
                      <p style={styles.statNumber}>{loading ? '...' : jobs.length}</p>
                      <p style={{ color: adminColors.textMuted, fontSize: '13px' }}>Jobs</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Quick Actions */}
              <div style={{ ...styles.card, marginBottom: '24px' }}>
                <div style={{ padding: '20px' }}>
                  <h3 style={{ fontSize: '17px', fontWeight: '600', color: adminColors.text, marginBottom: '6px' }}>Quick Actions</h3>
                  <p style={{ color: adminColors.textMuted, marginBottom: '14px', fontSize: '14px' }}>Create new content quickly</p>
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
                    <button
                      onClick={() => handleSectionChange('taxonomy')}
                      style={{ ...styles.button, ...styles.outlineButton }}
                    >
                      <Tags size={16} /> Blog Taxonomy
                    </button>
                  </div>
                </div>
              </div>

              {/* Recent Items */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
                <div style={styles.card}>
                  <div style={{ padding: '20px' }}>
                    <h3 style={{ fontSize: '17px', fontWeight: '600', color: adminColors.text, marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <FolderKanban size={18} color={adminColors.accent} /> Recent Projects
                    </h3>
                    {projectsLoading ? (
                      <p style={{ color: adminColors.textSubtle, fontSize: '14px' }}>Loading projects...</p>
                    ) : (
                      <>
                        {projects.slice(0, 5).map((project) => (
                          <div key={project.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: `1px solid ${adminColors.border}` }}>
                            <span style={{ color: adminColors.textSoft, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{project.title}</span>
                            <button
                              onClick={() => { handleSectionChange('projects'); handleOpenProjectModal(project); }}
                              style={{ ...styles.ghostButton, borderRadius: '8px' }}
                            >
                              <Pencil size={16} />
                            </button>
                          </div>
                        ))}
                        {projects.length === 0 && <p style={{ color: adminColors.textSubtle, fontSize: '14px' }}>No projects yet</p>}
                      </>
                    )}
                  </div>
                </div>

                <div style={styles.card}>
                  <div style={{ padding: '20px' }}>
                    <h3 style={{ fontSize: '17px', fontWeight: '600', color: adminColors.text, marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <FileText size={18} color={adminColors.success} /> Recent Posts
                    </h3>
                    {postsLoading ? (
                      <p style={{ color: adminColors.textSubtle, fontSize: '14px' }}>Loading posts...</p>
                    ) : (
                      <>
                        {posts.slice(0, 5).map((post) => (
                          <div key={post.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: `1px solid ${adminColors.border}` }}>
                            <span style={{ color: adminColors.textSoft, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{post.title}</span>
                            <button
                              onClick={() => { handleSectionChange('posts'); handleOpenPostModal(post); }}
                              style={{ ...styles.ghostButton, borderRadius: '8px' }}
                            >
                              <Pencil size={16} />
                            </button>
                          </div>
                        ))}
                        {posts.length === 0 && <p style={{ color: adminColors.textSubtle, fontSize: '14px' }}>No posts yet</p>}
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Profile Section */}
          {activeSection === 'profile' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px' }}>
                <div>
                  <h1 style={styles.pageTitle}>Profile</h1>
                  <p style={{ color: adminColors.textMuted }}>Manage your personal information</p>
                </div>
                <button
                  onClick={() => setEditingProfile(!editingProfile)}
                  style={{ ...styles.button, ...styles.outlineButton }}
                >
                  {editingProfile ? 'Cancel' : 'Edit Profile'}
                </button>
              </div>

              <div style={{ ...styles.card, maxWidth: '640px', marginBottom: '24px' }}>
                <div style={{ padding: '20px' }}>
                  <h2 style={{ color: adminColors.text, fontSize: '17px', fontWeight: 600, marginBottom: '4px' }}>Profile Photo</h2>
                  <p style={{ color: adminColors.textMuted, fontSize: '13px', marginBottom: '16px' }}>
                    Upload the photo used on the home page hero and about section.
                  </p>
                  <div style={{ display: 'flex', gap: '20px', alignItems: 'stretch', flexWrap: 'wrap' }}>
                    <div
                      style={{
                        width: '112px',
                        height: '112px',
                        borderRadius: '8px',
                        overflow: 'hidden',
                        backgroundColor: adminColors.surfaceRaised,
                        border: `1px solid ${adminColors.borderStrong}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {profileLoading ? (
                        <Loader2 size={32} color={adminColors.textSubtle} style={{ animation: 'spin 1s linear infinite' }} />
                      ) : profilePhotoUrl ? (
                        <Image
                          src={profilePhotoUrl}
                          alt="Current profile"
                          width={112}
                          height={112}
                          unoptimized
                          style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center' }}
                        />
                      ) : (
                        <User size={40} color={adminColors.textSubtle} />
                      )}
                    </div>

                    <div style={{ flex: '1 1 280px' }}>
                      <div
                        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOverProfilePhoto(true); }}
                        onDragLeave={() => setDragOverProfilePhoto(false)}
                        onDrop={handleDropProfilePhoto}
                        style={{
                          border: `1px dashed ${dragOverProfilePhoto ? adminColors.accent : adminColors.borderStrong}`,
                          borderRadius: '8px',
                          padding: '20px',
                          textAlign: 'center',
                          backgroundColor: dragOverProfilePhoto ? adminColors.accentSoft : adminColors.surfaceMuted,
                          transition: adminTransition,
                          cursor: 'pointer',
                        }}
                      >
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/gif"
                          id="profile-photo-upload"
                          style={{ display: 'none' }}
                          onChange={(e) => {
                            if (e.target.files && e.target.files[0]) {
                              handleProfilePhotoUpload(e.target.files[0]);
                              e.target.value = '';
                            }
                          }}
                        />
                        <label htmlFor="profile-photo-upload" style={{ cursor: 'pointer', display: 'block' }}>
                          <ImageIcon size={34} color={adminColors.textSubtle} style={{ marginBottom: '8px' }} />
                          <p style={{ color: adminColors.textMuted, fontSize: '14px', margin: 0 }}>
                            Drag &amp; drop an image or click to upload
                          </p>
                          <p style={{ color: adminColors.textSubtle, fontSize: '12px', margin: '6px 0 0' }}>
                            JPG, PNG, WebP, or GIF under 8MB
                          </p>
                        </label>
                        {uploadingProfilePhoto && (
                          <div style={{ marginTop: '12px' }}>
                            <div style={{
                              height: '4px',
                              backgroundColor: adminColors.surfaceRaised,
                              borderRadius: '2px',
                              overflow: 'hidden',
                            }}>
                              <div style={{
                                height: '100%',
                                width: `${profilePhotoProgress}%`,
                                backgroundColor: adminColors.accent,
                                transition: 'width 0.2s',
                              }} />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ ...styles.card, maxWidth: '640px' }}>
                <div style={{ padding: '20px' }}>
                  {profileLoading ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: adminColors.textMuted }}>
                      <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
                      <span>Loading profile...</span>
                    </div>
                  ) : !editingProfile ? (
                    <div>
                      {[
                        { label: 'Birthdate', value: profile?.birthdate },
                        { label: 'Location', value: profile?.location },
                        { label: 'Email', value: profile?.email },
                        { label: 'Languages', value: profile?.languages?.join(', ') },
                        { label: 'Photo', value: profilePhotoUrl ? 'Set' : '' },
                      ].map((item, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 0', borderBottom: `1px solid ${adminColors.border}` }}>
                          <span style={{ color: adminColors.textMuted }}>{item.label}</span>
                          <span style={{ color: adminColors.text, fontWeight: '500' }}>{item.value || 'Not set'}</span>
                        </div>
                      ))}
                      {[
                        { label: 'Bio (English)', value: profile?.bioEn },
                        { label: 'Bio (Japanese)', value: profile?.bioJa },
                      ].map((item, i) => (
                        <div key={item.label} style={{ padding: '14px 0', borderBottom: i === 0 ? `1px solid ${adminColors.border}` : 'none' }}>
                          <div style={{ color: adminColors.textMuted, marginBottom: '6px' }}>{item.label}</div>
                          <div style={{ color: adminColors.text, fontSize: '13px', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                            {item.value || <span style={{ color: adminColors.textSubtle }}>Falls back to bundled translation</span>}
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
                        <label style={styles.label}>Profile photo URL</label>
                        <input
                          value={profileForm.profileImageUrl}
                          onChange={(e) => setProfileForm({ ...profileForm, profileImageUrl: e.target.value })}
                          placeholder="Upload a photo above or paste an image URL"
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
                <div style={{ padding: '20px' }}>
                  <h2 style={{ color: adminColors.text, fontSize: '17px', fontWeight: 600, marginBottom: '4px' }}>Resume</h2>
                  <p style={{ color: adminColors.textMuted, fontSize: '13px', marginBottom: '16px' }}>
                    Drop a PDF to replace the resume linked from the site.
                  </p>

                  {currentResumeLink && (
                    <div style={{ marginBottom: '16px', fontSize: '13px' }}>
                      <span style={{ color: adminColors.textMuted, marginRight: '8px' }}>Current:</span>
                      <a
                        href={currentResumeLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: adminColors.accent, display: 'inline-flex', alignItems: 'center', gap: '4px' }}
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
                      border: `1px dashed ${dragOverResume ? adminColors.accent : adminColors.borderStrong}`,
                      borderRadius: '8px',
                      padding: '24px',
                      textAlign: 'center',
                      backgroundColor: dragOverResume ? adminColors.accentSoft : adminColors.surfaceMuted,
                      transition: adminTransition,
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
                      <ScrollText size={40} color={adminColors.textSubtle} style={{ marginBottom: '8px' }} />
                      <p style={{ color: adminColors.textMuted, fontSize: '14px', margin: 0 }}>
                        Drag &amp; drop a PDF or click to upload
                      </p>
                    </label>
                    {uploadingResume && (
                      <div style={{ marginTop: '12px' }}>
                        <div style={{
                          height: '4px',
                          backgroundColor: adminColors.surfaceRaised,
                          borderRadius: '2px',
                          overflow: 'hidden',
                        }}>
                          <div style={{
                            height: '100%',
                            width: `${resumeProgress}%`,
                            backgroundColor: adminColors.accent,
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px' }}>
                <div>
                  <h1 style={styles.pageTitle}>Projects</h1>
                  <p style={{ color: adminColors.textMuted }}>Manage your portfolio projects</p>
                </div>
                <button onClick={() => handleOpenProjectModal()} style={{ ...styles.button, ...styles.primaryButton }}>
                  <Plus size={16} /> Add Project
                </button>
              </div>

              {projectsLoading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '48px' }}>
                  <Loader2 size={32} color={adminColors.accent} style={{ animation: 'spin 1s linear infinite' }} />
                </div>
              ) : (
                <ProjectsTable
                  projects={projects}
                  onEdit={handleOpenProjectModal}
                  onDelete={requestDeleteProject}
                />
              )}
            </div>
          )}

          {/* Posts Section */}
          {activeSection === 'posts' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px' }}>
                <div>
                  <h1 style={styles.pageTitle}>Blog Posts</h1>
                  <p style={{ color: adminColors.textMuted }}>Manage your blog content</p>
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
                  <Loader2 size={32} color={adminColors.accent} style={{ animation: 'spin 1s linear infinite' }} />
                </div>
              ) : (
                <PostsTable
                  posts={posts}
                  onEdit={handleOpenPostModal}
                  onDelete={requestDeletePost}
                />
              )}
            </div>
          )}

          {/* Blog Taxonomy Section */}
          {activeSection === 'taxonomy' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px' }}>
                <div>
                  <h1 style={styles.pageTitle}>Blog Taxonomy</h1>
                  <p style={{ color: adminColors.textMuted }}>Manage blog categories, tag suggestions, and where they are used</p>
                </div>
                <button
                  type="button"
                  onClick={() => void Promise.all([refetchPostTaxonomy(), refetchPosts()])}
                  style={{ ...styles.button, ...styles.outlineButton }}
                >
                  {postTaxonomyLoading ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Tags size={16} />}
                  Refresh
                </button>
              </div>

              <BlogTaxonomyPanel
                taxonomy={postTaxonomy}
                posts={posts}
                loading={postTaxonomyLoading || postsLoading}
                mutating={postTaxonomyMutating}
                onAdd={handleAddPostTaxonomyItem}
                onRequestDelete={requestDeletePostTaxonomyItem}
                onEditPost={handleOpenPostModal}
              />
            </div>
          )}

          {/* Jobs Section */}
          {activeSection === 'jobs' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px' }}>
                <div>
                  <h1 style={styles.pageTitle}>Jobs & Experience</h1>
                  <p style={{ color: adminColors.textMuted }}>Manage your work experience, descriptions, and technologies</p>
                </div>
                <button onClick={openJobCreateForm} style={{ ...styles.button, ...styles.primaryButton }}>
                  <Plus size={16} /> Add Job
                </button>
              </div>

              {jobFormMode === 'new' && (
                <div style={{ ...styles.card, marginBottom: '24px' }}>
                  <div style={{ padding: '20px' }}>
                    <h3 style={{ fontSize: '17px', fontWeight: 600, color: adminColors.text, marginBottom: '16px' }}>New Job</h3>
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

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {jobs.map((job) => (
                  <div key={job.id} style={{ ...styles.card, opacity: job.hidden ? 0.55 : 1 }}>
                    <div style={{ padding: '20px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <h3 style={{ fontSize: '19px', fontWeight: '600', color: adminColors.text }}>{job.jobPosition}</h3>
                            {job.hidden && (
                              <span style={{ ...styles.badge, backgroundColor: adminColors.surfaceMuted, color: adminColors.textMuted, border: `1px solid ${adminColors.borderStrong}` }}>
                                Hidden
                              </span>
                            )}
                          </div>
                          <p style={{ color: adminColors.accent }}>{job.companyName}</p>
                          <p style={{ fontSize: '14px', color: adminColors.textSubtle }}>{job.jobDuration}</p>
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            onClick={() => handleToggleJobHidden(job.id, job.companyName, !!job.hidden)}
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

                      <div style={{ borderTop: `1px solid ${adminColors.border}`, paddingTop: '16px' }}>
                        <p style={{ fontSize: '14px', fontWeight: '500', color: adminColors.textMuted, marginBottom: '12px' }}>Technologies</p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                          {job.technologies?.length ? (
                            job.technologies.map((tech, i) => (
                              <span key={i} style={{ ...styles.badge, ...styles.techBadge }}>{getTechName(tech)}</span>
                            ))
                          ) : (
                            <span style={{ color: adminColors.textSubtle, fontSize: '14px' }}>No technologies set</span>
                          )}
                        </div>
                      </div>

                      {jobFormMode === job.id && (
                        <div style={{ marginTop: '20px', padding: '16px', backgroundColor: adminColors.surfaceMuted, borderRadius: '8px', border: `1px solid ${adminColors.border}` }}>
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
                    <Briefcase size={48} color={adminColors.textSubtle} style={{ marginBottom: '16px' }} />
                    <p style={{ color: adminColors.textSubtle }}>No jobs found</p>
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

          {/* Published Writing Section */}
          {activeSection === 'writing' && (
            <WritingAdminPanel />
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
              <p style={{ color: adminColors.textMuted, fontSize: '14px', marginTop: '4px' }}>
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
                  <label style={styles.label}>Description (Markdown) *</label>
                  <textarea
                    value={projectForm.description}
                    onChange={(e) => setProjectForm({ ...projectForm, description: e.target.value })}
                    placeholder={'## Overview\n\n- What you built\n- Why it matters\n- How it works\n\n```mermaid\nflowchart LR\n  A[Input] --> B[System] --> C[Output]\n```'}
                    style={{
                      ...styles.textarea,
                      minHeight: '260px',
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                    }}
                  />
                  {projectForm.description.trim() && (
                    <div style={{
                      marginTop: '12px',
                      border: `1px solid ${adminColors.borderStrong}`,
                      borderRadius: '8px',
                      overflow: 'hidden',
                      backgroundColor: adminColors.surfaceMuted,
                    }}>
                      <div style={{
                        borderBottom: `1px solid ${adminColors.border}`,
                        color: adminColors.textMuted,
                        fontSize: '12px',
                        fontWeight: 600,
                        padding: '8px 12px',
                        textTransform: 'uppercase',
                      }}>
                        Preview
                      </div>
                      <div style={{
                        color: adminColors.textSoft,
                        maxHeight: '360px',
                        overflowY: 'auto',
                        padding: '16px',
                      }}>
                        <RichContentRenderer content={projectForm.description} />
                      </div>
                    </div>
                  )}
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
                      border: `1px dashed ${dragOverThumb ? adminColors.accent : adminColors.borderStrong}`,
                      borderRadius: '8px',
                      padding: '20px',
                      textAlign: 'center',
                      backgroundColor: dragOverThumb ? adminColors.accentSoft : adminColors.surfaceMuted,
                      transition: adminTransition,
                      cursor: 'pointer',
                    }}
                  >
                    {projectForm.thumbImage ? (
                      <div style={{ position: 'relative', display: 'inline-block' }}>
                        <Image
                          src={projectForm.thumbImage}
                          alt="Thumbnail"
                          width={200}
                          height={150}
                          unoptimized
                          style={{ maxWidth: '200px', maxHeight: '150px', width: 'auto', height: 'auto', borderRadius: '8px' }}
                        />
                        <button
                          type="button"
                          onClick={handleRemoveThumbImage}
                          style={{
                            position: 'absolute',
                            top: '-8px',
                            right: '-8px',
                            background: adminColors.dangerStrong,
                            border: 'none',
                            borderRadius: '50%',
                            padding: '4px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <X size={14} color={adminColors.dangerButtonText} />
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
                          <ImageIcon size={40} color={adminColors.textSubtle} style={{ marginBottom: '8px' }} />
                          <p style={{ color: adminColors.textMuted, fontSize: '14px', margin: 0 }}>
                            Drag & drop or click to upload thumbnail
                          </p>
                        </label>
                      </div>
                    )}
                    {uploadingThumb && (
                      <div style={{ marginTop: '12px' }}>
                        <div style={{
                          height: '4px',
                          backgroundColor: adminColors.surfaceRaised,
                          borderRadius: '2px',
                          overflow: 'hidden',
                        }}>
                          <div style={{
                            height: '100%',
                            width: `${thumbProgress}%`,
                            backgroundColor: adminColors.accent,
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
                      border: `1px dashed ${dragOverImages ? adminColors.accent : adminColors.borderStrong}`,
                      borderRadius: '8px',
                      padding: '20px',
                      textAlign: 'center',
                      backgroundColor: dragOverImages ? adminColors.accentSoft : adminColors.surfaceMuted,
                      transition: adminTransition,
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
                      <Upload size={32} color={adminColors.textSubtle} style={{ marginBottom: '8px' }} />
                      <p style={{ color: adminColors.textMuted, fontSize: '14px', margin: 0 }}>
                        Drag & drop or click to upload gallery images
                      </p>
                    </label>
                    {uploadingImages && (
                      <div style={{ marginTop: '12px' }}>
                        <div style={{
                          height: '4px',
                          backgroundColor: adminColors.surfaceRaised,
                          borderRadius: '2px',
                          overflow: 'hidden',
                        }}>
                          <div style={{
                            height: '100%',
                            width: `${imagesProgress}%`,
                            backgroundColor: adminColors.accent,
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
                          <Image
                            src={url}
                            alt={`Gallery ${index + 1}`}
                            width={100}
                            height={80}
                            unoptimized
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
                              background: adminColors.dangerStrong,
                              border: 'none',
                              borderRadius: '50%',
                              padding: '3px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <X size={12} color={adminColors.dangerButtonText} />
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
                    <p style={{ color: adminColors.textSubtle, fontSize: '14px' }}>No URLs added yet. Click &quot;Add URL&quot; to add project links.</p>
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
                            backgroundColor: adminColors.surfaceMuted,
                            borderRadius: '8px',
                            border: `1px solid ${adminColors.border}`,
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
                              color: adminColors.danger,
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
                    <p style={{ fontSize: '12px', color: adminColors.textSubtle, marginTop: '8px' }}>
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
                    <p style={{ fontSize: '12px', color: adminColors.textSubtle, marginTop: '4px' }}>Existing: {projectCategories.join(', ')}</p>
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
              <p style={{ color: adminColors.textMuted, fontSize: '14px', marginTop: '4px' }}>
                {editingPost ? 'Update your blog post' : 'Create a new blog post'}
              </p>
            </div>
            <div style={styles.modalBody}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <p style={{ color: adminColors.textMuted, fontSize: '13px', margin: 0 }}>
                  Fill in either language, both, or one and skip the other — empty languages are not saved. Readers see the language matching their locale; if it doesn&apos;t exist, the other language is shown as a fallback.
                </p>
                <div>
                  <label style={styles.label}>Category *</label>
                  <Select.Root
                    value={postForm.category || undefined}
                    onValueChange={(category) => setPostForm((prev) => ({ ...prev, category }))}
                    disabled={isPostCategorySelectDisabled}
                  >
                    <Select.Trigger
                      aria-label="Category"
                      style={{
                        ...styles.radixSelectTrigger,
                        cursor: isPostCategorySelectDisabled ? 'not-allowed' : 'pointer',
                        opacity: isPostCategorySelectDisabled ? 0.7 : 1,
                      }}
                    >
                      <span style={styles.radixSelectValue}>
                        <Select.Value placeholder={postCategoryPlaceholder} />
                      </span>
                      {postTaxonomyLoading ? (
                        <Loader2 size={16} style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} />
                      ) : (
                        <Select.Icon asChild>
                          <ChevronDown size={16} style={{ flexShrink: 0, color: adminColors.textMuted }} />
                        </Select.Icon>
                      )}
                    </Select.Trigger>
                    <Select.Portal container={adminPortalContainer ?? undefined}>
                      <Select.Content
                        position="popper"
                        sideOffset={4}
                        style={styles.radixSelectContent}
                      >
                        <Select.Viewport style={styles.radixSelectViewport}>
                          {postCategoryOptions.map((cat) => (
                            <Select.Item
                              key={cat}
                              value={cat}
                              className="admin-radix-select-item"
                              style={styles.radixSelectItem}
                            >
                              <Select.ItemText>{cat}</Select.ItemText>
                              <Select.ItemIndicator style={styles.radixSelectItemIndicator}>
                                <Check size={14} />
                              </Select.ItemIndicator>
                            </Select.Item>
                          ))}
                        </Select.Viewport>
                      </Select.Content>
                    </Select.Portal>
                  </Select.Root>
                  <p style={{ color: adminColors.textMuted, fontSize: '12px', margin: '8px 0 0' }}>
                    Category choices come from Blog Taxonomy.
                  </p>
                </div>
                <div>
                  <label style={styles.label}>Tags</label>
                  <input
                    value={postTagsInput}
                    onChange={(e) => setPostTagsInput(e.target.value)}
                    onBlur={() => setPostTagsInput(normalizePostTags(postTagsInput).join(', '))}
                    placeholder="hashing, feature-flags, sampling"
                    style={styles.input}
                  />
                  <p style={{ color: adminColors.textMuted, fontSize: '12px', margin: '8px 0 0' }}>
                    Comma-separated. Tags are normalized to lowercase kebab-case.
                  </p>
                  {postTagOptions.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px' }}>
                      {postTagOptions.map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => appendPostTag(tag)}
                          style={{
                            ...styles.ghostButton,
                            border: `1px solid ${adminColors.border}`,
                            borderRadius: '9999px',
                            padding: '4px 9px',
                            color: selectedPostTags.includes(tag) ? adminColors.accent : adminColors.textMuted,
                            backgroundColor: selectedPostTags.includes(tag) ? adminColors.accentSoft : 'transparent',
                          }}
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  )}
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
                  <label htmlFor="post-public" style={{ color: adminColors.textSoft, cursor: 'pointer' }}>Public</label>
                </div>
                <div>
                  <label style={styles.label}>Cover image</label>
                  <div
                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOverPostImage(true); }}
                    onDragLeave={() => setDragOverPostImage(false)}
                    onDrop={handleDropPostImage}
                    style={{
                      border: `1px dashed ${dragOverPostImage ? adminColors.accent : adminColors.borderStrong}`,
                      borderRadius: '8px',
                      padding: '20px',
                      textAlign: 'center',
                      backgroundColor: dragOverPostImage ? adminColors.accentSoft : adminColors.surfaceMuted,
                      transition: adminTransition,
                      cursor: 'pointer',
                    }}
                  >
                    {postForm.image ? (
                      <div style={{ position: 'relative', display: 'inline-block' }}>
                        <Image
                          src={postForm.image}
                          alt="Cover"
                          width={320}
                          height={200}
                          unoptimized
                          style={{ maxWidth: '320px', maxHeight: '200px', width: 'auto', height: 'auto', borderRadius: '8px' }}
                        />
                        <button
                          type="button"
                          onClick={handleRemovePostImage}
                          style={{
                            position: 'absolute',
                            top: '-8px',
                            right: '-8px',
                            background: adminColors.dangerStrong,
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
                          <X size={14} color={adminColors.dangerButtonText} />
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
                          <ImageIcon size={40} color={adminColors.textSubtle} style={{ marginBottom: '8px' }} />
                          <p style={{ color: adminColors.textMuted, fontSize: '14px', margin: 0 }}>
                            Drag &amp; drop or click to upload cover image
                          </p>
                        </label>
                      </div>
                    )}
                    {uploadingPostImage && (
                      <div style={{ marginTop: '12px' }}>
                        <div style={{
                          height: '4px',
                          backgroundColor: adminColors.surfaceRaised,
                          borderRadius: '2px',
                          overflow: 'hidden',
                        }}>
                          <div style={{
                            height: '100%',
                            width: `${postImageProgress}%`,
                            backgroundColor: adminColors.accent,
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
              <h2 style={{ ...styles.modalTitle, color: adminColors.danger }}>Confirm Delete</h2>
            </div>
            <div style={styles.modalBody}>
              <p style={{ color: adminColors.textMuted }}>
                Are you sure you want to delete <strong style={{ color: adminColors.text }}>{showDeleteConfirm.name}</strong>? This action cannot be undone.
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

      {/* Taxonomy Delete Confirmation Modal */}
      {showTaxonomyDeleteConfirm && (
        <div style={styles.modal}>
          <div style={{ ...styles.modalContent, maxWidth: '440px' }}>
            <div style={styles.modalHeader}>
              <h2 style={{ ...styles.modalTitle, color: adminColors.danger }}>
                Delete {showTaxonomyDeleteConfirm.type}
              </h2>
            </div>
            <div style={styles.modalBody}>
              <p style={{ color: adminColors.textMuted, marginBottom: '12px' }}>
                Delete <strong style={{ color: adminColors.text }}>{showTaxonomyDeleteConfirm.item.slug}</strong> from blog taxonomy?
              </p>
              <p style={{ color: adminColors.textMuted, fontSize: '13px', lineHeight: 1.5, margin: 0 }}>
                This only removes it from saved suggestions. Existing posts are not changed. Values already used by posts cannot be deleted here.
              </p>
            </div>
            <div style={styles.modalFooter}>
              <button onClick={() => setShowTaxonomyDeleteConfirm(null)} disabled={isDeleting} style={{ ...styles.button, ...styles.outlineButton, opacity: isDeleting ? 0.5 : 1 }}>
                Cancel
              </button>
              <button
                onClick={() => void handleDeletePostTaxonomyItem()}
                disabled={isDeleting || showTaxonomyDeleteConfirm.item.postCount > 0}
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

        .admin-radix-select-item[data-highlighted] {
          background: var(--admin-accent-soft);
          color: var(--admin-text);
        }

        .admin-radix-select-item[data-state="checked"] {
          color: var(--admin-accent);
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
        border: `1px solid ${adminColors.border}`,
        borderRadius: '8px',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        backgroundColor: adminColors.surfaceMuted,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <h3 style={{ margin: 0, color: adminColors.text, fontSize: '15px', fontWeight: 600 }}>
          {TRANSLATION_LABELS[lang]}
        </h3>
        <span
          aria-hidden
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: hasContent ? adminColors.success : adminColors.borderStrong,
          }}
        />
        <span style={{ color: adminColors.textSubtle, fontSize: '12px' }}>
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
        border: `1px solid ${adminColors.borderStrong}`,
        borderRadius: '8px',
        background: 'transparent',
        color: adminColors.textSoft,
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
            border: `1px solid ${adminColors.borderStrong}`,
            borderRadius: '8px',
            background: 'transparent',
            color: adminColors.textSoft,
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
            border: `1px solid ${adminColors.accentBorder}`,
            borderRadius: '8px',
            background: adminColors.accentSoft,
            color: adminColors.text,
            cursor: running ? 'not-allowed' : 'pointer',
            fontSize: '13px',
          }}
        >
          {running ? '…' : 'Run migration'}
        </button>
      </div>
      {lastResult && (
        <div style={{ color: adminColors.textMuted, fontSize: '11px' }}>
          last: scanned {lastResult.scanned} · migrated {lastResult.migrated.length} · skipped {lastResult.skipped.length} · failed {lastResult.failed.length}
          {lastResult.dryRun && ' (dry-run)'}
        </div>
      )}
    </div>
  );
};

export default AdminPage;
