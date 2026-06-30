'use client';

import {
useHobbyCategories,
useHobbyItemMutations,
useHobbyItems,
useHobbyMutations,
} from '@/hooks/useHobbies';
import * as imageApi from '@/services/imageService';
import type {
CreateHobbyCategoryInput,
CreateHobbyItemInput,
CustomField,
HobbyCategory,
HobbyItem,
} from '@/types/hobby';
import {
ANIME_CATALOG_FIELDS,
ANIME_CHARACTER_FIELDS,
CustomFieldType,
FISH_CATALOG_FIELDS,
generateSlug,
HobbyTemplateType,
SKI_RESORT_FIELDS,
TRAIN_CATALOG_FIELDS,
VOICE_ACTOR_FIELDS
} from '@/types/hobby';
import {
ChevronDown,
ChevronUp,
Eye,
EyeOff,
Fish,
Image as ImageIcon,
Loader2,
Mic,
Mountain,
Pencil,
Plus,
Save,
Train,
Trash2,
Tv,
Upload,
User,
X,
} from 'lucide-react';
import Image from 'next/image';
import { CSSProperties,useMemo,useState } from 'react';
import { v4 as uuidv4 } from 'uuid';

// Styles (following AdminPage patterns)
const styles: Record<string, CSSProperties> = {
  panel: {
    padding: '0',
  },
  pageHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '24px',
    marginBottom: '24px',
  },
  pageTitle: {
    fontSize: '30px',
    fontWeight: 650,
    color: 'var(--admin-text)',
    lineHeight: 1.15,
    letterSpacing: 0,
    margin: '0 0 6px',
  },
  pageSubtitle: {
    color: 'var(--admin-text-muted)',
    margin: 0,
    fontSize: '14px',
  },
  statGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: '12px',
    marginBottom: '20px',
  },
  statCard: {
    backgroundColor: 'var(--admin-surface)',
    borderRadius: '8px',
    border: '1px solid var(--admin-border)',
    padding: '14px 16px',
    boxShadow: 'var(--admin-shadow-surface)',
  },
  statLabel: {
    color: 'var(--admin-text-subtle)',
    fontSize: '12px',
    fontWeight: 600,
    letterSpacing: 0,
    margin: '0 0 6px',
    textTransform: 'uppercase',
  },
  statValue: {
    color: 'var(--admin-text)',
    fontSize: '24px',
    fontWeight: 650,
    lineHeight: 1,
    margin: 0,
  },
  layoutGrid: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr)',
    gap: '18px',
  },
  card: {
    backgroundColor: 'var(--admin-surface)',
    borderRadius: '8px',
    border: '1px solid var(--admin-border)',
    overflow: 'hidden',
    boxShadow: 'var(--admin-shadow-surface)',
  },
  cardHeader: {
    padding: '18px 20px',
    borderBottom: '1px solid var(--admin-border)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '16px',
    backgroundColor: 'var(--admin-surface)',
  },
  cardTitle: {
    fontSize: '17px',
    fontWeight: '600',
    color: 'var(--admin-text)',
    margin: 0,
  },
  cardSubtitle: {
    color: 'var(--admin-text-muted)',
    fontSize: '13px',
    margin: '4px 0 0',
  },
  cardBody: {
    padding: '18px 20px',
  },
  tableWrap: {
    overflowX: 'auto',
  },
  loadingState: {
    display: 'flex',
    justifyContent: 'center',
    padding: '36px 16px',
    color: 'var(--admin-text-muted)',
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
    transition: 'background-color 160ms ease, border-color 160ms ease, color 160ms ease, box-shadow 160ms ease',
  },
  primaryButton: {
    backgroundColor: 'var(--admin-accent)',
    borderColor: 'var(--admin-accent)',
    color: 'var(--admin-primary-text)',
  },
  outlineButton: {
    backgroundColor: 'var(--admin-surface-raised)',
    borderColor: 'var(--admin-border-strong)',
    color: 'var(--admin-text)',
  },
  dangerButton: {
    backgroundColor: 'var(--admin-danger-strong)',
    borderColor: 'var(--admin-danger-strong)',
    color: 'var(--admin-danger-button-text)',
  },
  ghostButton: {
    backgroundColor: 'transparent',
    border: '1px solid transparent',
    color: 'var(--admin-text-muted)',
    padding: '8px',
  },
  actionButton: {
    width: '34px',
    height: '34px',
    justifyContent: 'center',
  },
  disabledButton: {
    opacity: 0.55,
    cursor: 'not-allowed',
  },
  input: {
    width: '100%',
    padding: '9px 11px',
    borderRadius: '8px',
    border: '1px solid var(--admin-border-strong)',
    backgroundColor: 'var(--admin-surface-raised)',
    color: 'var(--admin-text)',
    fontSize: '14px',
    outline: 'none',
    lineHeight: 1.45,
    accentColor: 'var(--admin-accent)',
  },
  textarea: {
    width: '100%',
    padding: '9px 11px',
    borderRadius: '8px',
    border: '1px solid var(--admin-border-strong)',
    backgroundColor: 'var(--admin-surface-raised)',
    color: 'var(--admin-text)',
    fontSize: '14px',
    outline: 'none',
    resize: 'vertical' as const,
    minHeight: '100px',
    lineHeight: 1.5,
  },
  select: {
    width: '100%',
    padding: '9px 11px',
    borderRadius: '8px',
    border: '1px solid var(--admin-border-strong)',
    backgroundColor: 'var(--admin-surface-raised)',
    color: 'var(--admin-text)',
    fontSize: '14px',
    outline: 'none',
    cursor: 'pointer',
    lineHeight: 1.45,
  },
  label: {
    display: 'block',
    color: 'var(--admin-text-soft)',
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
    padding: '16px',
  },
  modalContent: {
    backgroundColor: 'var(--admin-surface)',
    borderRadius: '8px',
    border: '1px solid var(--admin-border)',
    maxWidth: '800px',
    width: '100%',
    maxHeight: '90vh',
    overflow: 'auto',
    boxShadow: 'var(--admin-shadow-modal)',
  },
  modalHeader: {
    padding: '20px 22px',
    borderBottom: '1px solid var(--admin-border)',
  },
  modalTitle: {
    fontSize: '19px',
    fontWeight: '600',
    color: 'var(--admin-text)',
    margin: 0,
  },
  modalBody: {
    padding: '22px',
  },
  modalFooter: {
    padding: '18px 22px',
    borderTop: '1px solid var(--admin-border)',
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
    backgroundColor: 'var(--admin-surface-raised)',
  },
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '3px 9px',
    borderRadius: '9999px',
    fontSize: '12px',
    fontWeight: '500',
    lineHeight: 1.35,
  },
  table: {
    width: '100%',
    borderCollapse: 'separate' as const,
    borderSpacing: 0,
  },
  th: {
    textAlign: 'left' as const,
    padding: '12px 14px',
    fontWeight: 600,
    color: 'var(--admin-text-subtle)',
    borderBottom: '1px solid var(--admin-border)',
    backgroundColor: 'var(--admin-surface-muted)',
    fontSize: '12px',
    lineHeight: 1.35,
    letterSpacing: 0,
  },
  td: {
    padding: '14px',
    borderBottom: '1px solid var(--admin-border)',
    color: 'var(--admin-text-soft)',
    fontSize: '14px',
  },
  rowSelected: {
    backgroundColor: 'var(--admin-accent-soft)',
    boxShadow: 'inset 3px 0 0 var(--admin-accent)',
  },
  rowTitle: {
    color: 'var(--admin-text)',
    fontWeight: 500,
  },
  helperText: {
    color: 'var(--admin-text-subtle)',
    fontSize: '12px',
    marginTop: '4px',
  },
  checkbox: {
    width: '18px',
    height: '18px',
    cursor: 'pointer',
    accentColor: 'var(--admin-accent)',
  },
  checkboxLabel: {
    color: 'var(--admin-text-soft)',
    cursor: 'pointer',
    fontSize: '14px',
  },
  fieldCard: {
    padding: '14px',
    backgroundColor: 'var(--admin-surface-raised)',
    borderRadius: '8px',
    border: '1px solid var(--admin-border)',
  },
  emptyState: {
    color: 'var(--admin-text-subtle)',
    textAlign: 'center' as const,
    padding: '36px 16px',
    border: '1px dashed var(--admin-border-strong)',
    borderRadius: '8px',
    backgroundColor: 'var(--admin-surface-muted)',
  },
  dropzone: {
    border: '1px dashed var(--admin-border-strong)',
    borderRadius: '8px',
    padding: '20px',
    textAlign: 'center' as const,
    backgroundColor: 'var(--admin-surface-muted)',
  },
  imageRemoveButton: {
    position: 'absolute',
    top: '-8px',
    right: '-8px',
    background: 'var(--admin-danger-strong)',
    border: '1px solid var(--admin-danger-border)',
    borderRadius: '999px',
    padding: '4px',
    cursor: 'pointer',
    color: 'var(--admin-danger-button-text)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  galleryUpload: {
    width: '80px',
    height: '60px',
    border: '1px dashed var(--admin-border-strong)',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    color: 'var(--admin-text-muted)',
    backgroundColor: 'var(--admin-surface-muted)',
  },
};

export default function HobbiesAdminPanel() {
  const { categories, loading: categoriesLoading, refetch: refetchCategories } = useHobbyCategories({ includePrivate: true });
  const categoryMutations = useHobbyMutations();
  const itemMutations = useHobbyItemMutations();

  // State for selected hobby
  const [selectedHobbyId, setSelectedHobbyId] = useState<string | null>(null);
  const { items, loading: itemsLoading, refetch: refetchItems } = useHobbyItems({
    hobbyId: selectedHobbyId || '',
    includePrivate: true,
  });

  // Modal states
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showItemModal, setShowItemModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<{ type: 'category' | 'item'; id: string; name: string } | null>(null);
  const [editingCategory, setEditingCategory] = useState<HobbyCategory | null>(null);
  const [editingItem, setEditingItem] = useState<HobbyItem | null>(null);

  // Category form
  const [categoryForm, setCategoryForm] = useState({
    name: '',
    slug: '',
    description: '',
    icon: 'star',
    coverImage: '',
    templateType: HobbyTemplateType.CATALOG,
    isPublic: false,
    fields: [] as CustomField[],
  });

  // Item form
  const [itemForm, setItemForm] = useState({
    title: '',
    description: '',
    thumbImage: '',
    images: [] as string[],
    isPublic: false,
    tags: '',
    customFields: {} as Record<string, unknown>,
  });

  // Image upload states
  const [uploadingImage, setUploadingImage] = useState(false);

  // Field editing
  const [expandedFields, setExpandedFields] = useState(false);

  // Get selected hobby
  const selectedHobby = categories.find((c) => c.id === selectedHobbyId);
  const publicCategoryCount = useMemo(() => categories.filter((category) => category.isPublic).length, [categories]);
  const totalFieldCount = useMemo(() => categories.reduce((total, category) => total + category.fields.length, 0), [categories]);
  const isCategorySaveDisabled = categoryMutations.loading || !categoryForm.name.trim() || !categoryForm.description.trim();
  const isItemSaveDisabled = itemMutations.loading || !itemForm.title.trim();

  const handleSelectHobby = (hobbyId: string) => {
    setSelectedHobbyId(hobbyId);
    setItemForm((prev) => ({
      ...prev,
      customFields: {},
    }));
  };

  const handleCategoryRowKeyDown = (event: React.KeyboardEvent<HTMLTableRowElement>, hobbyId: string) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleSelectHobby(hobbyId);
    }
  };

  // Handlers
  const handleOpenCategoryModal = (category?: HobbyCategory) => {
    if (category) {
      setEditingCategory(category);
      setCategoryForm({
        name: category.name,
        slug: category.slug,
        description: category.description,
        icon: category.icon || 'star',
        coverImage: category.coverImage || '',
        templateType: category.templateType,
        isPublic: category.isPublic,
        fields: category.fields,
      });
    } else {
      setEditingCategory(null);
      setCategoryForm({
        name: '',
        slug: '',
        description: '',
        icon: 'star',
        coverImage: '',
        templateType: HobbyTemplateType.CATALOG,
        isPublic: false,
        fields: [],
      });
    }
    setShowCategoryModal(true);
  };

  const handleSaveCategory = async () => {
    try {
      if (editingCategory) {
        await categoryMutations.updateCategory(editingCategory.id, {
          name: categoryForm.name,
          slug: categoryForm.slug,
          description: categoryForm.description,
          icon: categoryForm.icon,
          coverImage: categoryForm.coverImage,
          templateType: categoryForm.templateType,
          isPublic: categoryForm.isPublic,
          fields: categoryForm.fields,
        });
      } else {
        const input: CreateHobbyCategoryInput = {
          name: categoryForm.name,
          slug: categoryForm.slug || generateSlug(categoryForm.name),
          description: categoryForm.description,
          icon: categoryForm.icon,
          coverImage: categoryForm.coverImage,
          templateType: categoryForm.templateType,
          isPublic: categoryForm.isPublic,
          fields: categoryForm.fields.map(({ id: _id, ...rest }) => rest),
        };
        await categoryMutations.createCategory(input);
      }
      setShowCategoryModal(false);
      refetchCategories();
    } catch (error) {
      console.error('Error saving category:', error);
    }
  };

  const handleDeleteCategory = async (id: string) => {
    try {
      await categoryMutations.deleteCategory(id);
      if (selectedHobbyId === id) {
        setSelectedHobbyId(null);
      }
      refetchCategories();
    } catch (error) {
      console.error('Error deleting category:', error);
    }
    setShowDeleteConfirm(null);
  };

  const handleOpenItemModal = (item?: HobbyItem) => {
    if (item) {
      setEditingItem(item);
      setItemForm({
        title: item.title,
        description: item.description,
        thumbImage: item.thumbImage,
        images: item.images,
        isPublic: item.isPublic,
        tags: item.tags.join(', '),
        customFields: item.customFields,
      });
    } else {
      setEditingItem(null);
      setItemForm({
        title: '',
        description: '',
        thumbImage: '',
        images: [],
        isPublic: false,
        tags: '',
        customFields: {},
      });
    }
    setShowItemModal(true);
  };

  const handleSaveItem = async () => {
    if (!selectedHobbyId) return;

    try {
      const tagsArray = itemForm.tags.split(',').map((t) => t.trim()).filter((t) => t);

      if (editingItem) {
        await itemMutations.updateItem(editingItem.id, {
          title: itemForm.title,
          description: itemForm.description,
          thumbImage: itemForm.thumbImage,
          images: itemForm.images,
          isPublic: itemForm.isPublic,
          tags: tagsArray,
          customFields: itemForm.customFields,
        });
      } else {
        const input: CreateHobbyItemInput = {
          hobbyId: selectedHobbyId,
          title: itemForm.title,
          description: itemForm.description,
          thumbImage: itemForm.thumbImage,
          images: itemForm.images,
          isPublic: itemForm.isPublic,
          tags: tagsArray,
          customFields: itemForm.customFields,
        };
        await itemMutations.createItem(input);
      }
      setShowItemModal(false);
      refetchItems();
    } catch (error) {
      console.error('Error saving item:', error);
    }
  };

  const handleDeleteItem = async (id: string) => {
    try {
      await itemMutations.deleteItem(id);
      refetchItems();
    } catch (error) {
      console.error('Error deleting item:', error);
    }
    setShowDeleteConfirm(null);
  };

  const handleImageUpload = async (file: File, type: 'category' | 'item-thumb' | 'item-gallery') => {
    setUploadingImage(true);
    try {
      const downloadURL = await imageApi.getImageRef(file, 'hobby', type);

      if (type === 'category') {
        setCategoryForm((prev) => ({ ...prev, coverImage: downloadURL }));
      } else if (type === 'item-thumb') {
        setItemForm((prev) => ({ ...prev, thumbImage: downloadURL }));
      } else {
        setItemForm((prev) => ({ ...prev, images: [...prev.images, downloadURL] }));
      }
    } catch (error) {
      console.error('Error uploading image:', error);
    } finally {
      setUploadingImage(false);
    }
  };

  const handleAddField = () => {
    const newField: CustomField = {
      id: uuidv4(),
      name: '',
      label: '',
      type: CustomFieldType.TEXT,
      required: false,
      order: categoryForm.fields.length + 1,
    };
    setCategoryForm((prev) => ({ ...prev, fields: [...prev.fields, newField] }));
  };

  const handleUpdateField = (fieldId: string, updates: Partial<CustomField>) => {
    setCategoryForm((prev) => ({
      ...prev,
      fields: prev.fields.map((f) => (f.id === fieldId ? { ...f, ...updates } : f)),
    }));
  };

  const handleRemoveField = (fieldId: string) => {
    setCategoryForm((prev) => ({
      ...prev,
      fields: prev.fields.filter((f) => f.id !== fieldId),
    }));
  };

  const handleApplyTemplate = (template: 'fish' | 'ski' | 'train' | 'anime' | 'voice-actor' | 'anime-character') => {
    let templateFields;
    let name, slug, description, icon;

    switch (template) {
      case 'fish':
        templateFields = FISH_CATALOG_FIELDS;
        name = '魚図鑑';
        slug = 'fish';
        description = '食べた魚のコレクション - 日本語名と英語名付き';
        icon = 'fish';
        break;
      case 'ski':
        templateFields = SKI_RESORT_FIELDS;
        name = 'スキー';
        slug = 'ski';
        description = 'スキー場の記録';
        icon = 'mountain';
        break;
      case 'train':
        templateFields = TRAIN_CATALOG_FIELDS;
        name = '日本の鉄道';
        slug = 'trains';
        description = '乗った日本の列車のコレクション';
        icon = 'train';
        break;
      case 'anime':
        templateFields = ANIME_CATALOG_FIELDS;
        name = 'アニメ';
        slug = 'anime';
        description = 'アニメ・漫画のランキング';
        icon = 'tv';
        break;
      case 'voice-actor':
        templateFields = VOICE_ACTOR_FIELDS;
        name = '声優';
        slug = 'voice-actors';
        description = '声優一覧';
        icon = 'mic';
        break;
      case 'anime-character':
        templateFields = ANIME_CHARACTER_FIELDS;
        name = 'アニメキャラクター';
        slug = 'anime-characters';
        description = 'アニメキャラクター一覧';
        icon = 'user';
        break;
    }

    const fieldsWithIds: CustomField[] = templateFields.map((f, i) => ({
      ...f,
      id: uuidv4(),
      order: i + 1,
    }));
    setCategoryForm((prev) => ({
      ...prev,
      fields: fieldsWithIds,
      name,
      slug,
      description,
      icon,
    }));
  };

  const renderCustomFieldInput = (field: CustomField) => {
    const value = itemForm.customFields[field.name];

    switch (field.type) {
      case CustomFieldType.TEXTAREA:
        return (
          <textarea
            value={(value as string) || ''}
            onChange={(e) =>
              setItemForm((prev) => ({
                ...prev,
                customFields: { ...prev.customFields, [field.name]: e.target.value },
              }))
            }
            placeholder={field.placeholder}
            style={styles.textarea}
          />
        );

      case CustomFieldType.NUMBER:
        return (
          <input
            type="number"
            value={(value as number) || ''}
            onChange={(e) =>
              setItemForm((prev) => ({
                ...prev,
                customFields: { ...prev.customFields, [field.name]: e.target.value ? Number(e.target.value) : '' },
              }))
            }
            placeholder={field.placeholder}
            style={styles.input}
          />
        );

      case CustomFieldType.DATE:
        return (
          <input
            type="date"
            value={(value as string) || ''}
            onChange={(e) =>
              setItemForm((prev) => ({
                ...prev,
                customFields: { ...prev.customFields, [field.name]: e.target.value },
              }))
            }
            style={styles.input}
          />
        );

      case CustomFieldType.SELECT:
        return (
          <select
            value={(value as string) || ''}
            onChange={(e) =>
              setItemForm((prev) => ({
                ...prev,
                customFields: { ...prev.customFields, [field.name]: e.target.value },
              }))
            }
            style={styles.select}
          >
            <option value="">Select...</option>
            {field.options?.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        );

      case CustomFieldType.RATING:
        return (
          <select
            value={(value as number) || ''}
            onChange={(e) =>
              setItemForm((prev) => ({
                ...prev,
                customFields: { ...prev.customFields, [field.name]: e.target.value ? Number(e.target.value) : '' },
              }))
            }
            style={styles.select}
          >
            <option value="">Select rating...</option>
            {[1, 2, 3, 4, 5].map((r) => (
              <option key={r} value={r}>
                {r} Star{r > 1 ? 's' : ''}
              </option>
            ))}
          </select>
        );

      case CustomFieldType.BOOLEAN:
        return (
          <input
            type="checkbox"
            checked={(value as boolean) || false}
            onChange={(e) =>
              setItemForm((prev) => ({
                ...prev,
                customFields: { ...prev.customFields, [field.name]: e.target.checked },
              }))
            }
            style={styles.checkbox}
          />
        );

      case CustomFieldType.RELATION:
        // Find items from the related hobby category
        const relationConfig = field.relationConfig;
        if (!relationConfig) return null;

        const relatedCategory = categories.find(c => c.slug === relationConfig.hobbySlug);
        if (!relatedCategory) {
          return (
            <div style={{ color: 'var(--admin-text-muted)', fontSize: '14px' }}>
              カテゴリ &quot;{relationConfig.hobbySlug}&quot; が見つかりません
            </div>
          );
        }

        // For now, show a text input for item ID (we'll add a selector later when data exists)
        return (
          <div>
            <input
              type="text"
              value={(value as string) || ''}
              onChange={(e) =>
                setItemForm((prev) => ({
                  ...prev,
                  customFields: { ...prev.customFields, [field.name]: e.target.value },
                }))
              }
              placeholder={`${relatedCategory.name}のアイテムIDを入力`}
              style={styles.input}
            />
            <p style={styles.helperText}>
              {relatedCategory.name}から選択
            </p>
          </div>
        );

      default:
        return (
          <input
            type="text"
            value={(value as string) || ''}
            onChange={(e) =>
              setItemForm((prev) => ({
                ...prev,
                customFields: { ...prev.customFields, [field.name]: e.target.value },
              }))
            }
            placeholder={field.placeholder}
            style={styles.input}
          />
        );
    }
  };

  const renderStatusBadge = (isPublic: boolean) => (
    <span
      style={{
        ...styles.badge,
        backgroundColor: isPublic ? 'var(--admin-success-soft)' : 'var(--admin-surface-muted)',
        border: `1px solid ${isPublic ? 'var(--admin-success-border)' : 'var(--admin-border-strong)'}`,
        color: isPublic ? 'var(--admin-success)' : 'var(--admin-text-muted)',
      }}
    >
      {isPublic ? <Eye size={12} /> : <EyeOff size={12} />}
      {isPublic ? 'Public' : 'Private'}
    </span>
  );

  return (
    <div style={styles.panel}>
      <div style={styles.pageHeader}>
        <div>
          <h1 style={styles.pageTitle}>Hobbies Management</h1>
          <p style={styles.pageSubtitle}>Manage hobby categories, custom fields, and public catalog items.</p>
        </div>
        <button
          type="button"
          onClick={() => handleOpenCategoryModal()}
          style={{ ...styles.button, ...styles.primaryButton }}
        >
          <Plus size={16} /> Add Category
        </button>
      </div>

      <div style={styles.statGrid}>
        <div style={styles.statCard}>
          <p style={styles.statLabel}>Categories</p>
          <p style={styles.statValue}>{categories.length}</p>
        </div>
        <div style={styles.statCard}>
          <p style={styles.statLabel}>Public</p>
          <p style={styles.statValue}>{publicCategoryCount}</p>
        </div>
        <div style={styles.statCard}>
          <p style={styles.statLabel}>Custom Fields</p>
          <p style={styles.statValue}>{totalFieldCount}</p>
        </div>
        <div style={styles.statCard}>
          <p style={styles.statLabel}>Selected Items</p>
          <p style={styles.statValue}>{selectedHobby ? items.length : '-'}</p>
        </div>
      </div>

      <div style={styles.layoutGrid}>

      {/* Categories Section */}
      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <div>
            <h3 style={styles.cardTitle}>Hobby Categories</h3>
            <p style={styles.cardSubtitle}>Choose a category to manage its items.</p>
          </div>
        </div>
        <div style={styles.cardBody}>
          {categoriesLoading ? (
            <div style={styles.loadingState}>
              <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />
            </div>
          ) : categories.length === 0 ? (
            <div style={styles.emptyState}>No hobby categories yet.</div>
          ) : (
            <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Name</th>
                  <th style={styles.th}>Slug</th>
                  <th style={styles.th}>Status</th>
                  <th style={styles.th}>Fields</th>
                  <th style={{ ...styles.th, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((category) => (
                  <tr
                    key={category.id}
                    role="button"
                    tabIndex={0}
                    aria-pressed={selectedHobbyId === category.id}
                    style={{
                      ...(selectedHobbyId === category.id ? styles.rowSelected : {}),
                      cursor: 'pointer',
                    }}
                    onClick={() => handleSelectHobby(category.id)}
                    onKeyDown={(event) => handleCategoryRowKeyDown(event, category.id)}
                  >
                    <td style={styles.td}>
                      <span style={styles.rowTitle}>{category.name}</span>
                    </td>
                    <td style={{ ...styles.td, color: 'var(--admin-text-muted)' }}>{category.slug}</td>
                    <td style={styles.td}>{renderStatusBadge(category.isPublic)}</td>
                    <td style={{ ...styles.td, color: 'var(--admin-text-muted)' }}>{category.fields.length} fields</td>
                    <td style={{ ...styles.td, textAlign: 'right' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenCategoryModal(category);
                          }}
                          aria-label={`Edit ${category.name}`}
                          style={{ ...styles.button, ...styles.ghostButton, ...styles.actionButton }}
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowDeleteConfirm({ type: 'category', id: category.id, name: category.name });
                          }}
                          aria-label={`Delete ${category.name}`}
                          style={{ ...styles.button, ...styles.ghostButton, ...styles.actionButton, color: 'var(--admin-danger-text)' }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </div>
      </div>

      {/* Items Section */}
      {selectedHobby && (
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <div>
              <h3 style={styles.cardTitle}>{selectedHobby.name} Items</h3>
              <p style={styles.cardSubtitle}>{items.length} items in this category.</p>
            </div>
            <button
              type="button"
              onClick={() => handleOpenItemModal()}
              style={{ ...styles.button, ...styles.primaryButton }}
            >
              <Plus size={16} /> Add Item
            </button>
          </div>
          <div style={styles.cardBody}>
            {itemsLoading ? (
              <div style={styles.loadingState}>
                <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />
              </div>
            ) : items.length === 0 ? (
              <div style={styles.emptyState}>No items yet. Add the first item for this category.</div>
            ) : (
              <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Title</th>
                    <th style={styles.th}>Status</th>
                    <th style={styles.th}>Tags</th>
                    <th style={{ ...styles.th, textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td style={styles.td}>
                        <span style={styles.rowTitle}>{item.title}</span>
                      </td>
                      <td style={styles.td}>{renderStatusBadge(item.isPublic)}</td>
                      <td style={{ ...styles.td, color: 'var(--admin-text-muted)' }}>{item.tags.join(', ') || '-'}</td>
                      <td style={{ ...styles.td, textAlign: 'right' }}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                          <button
                            type="button"
                            onClick={() => handleOpenItemModal(item)}
                            aria-label={`Edit ${item.title}`}
                            style={{ ...styles.button, ...styles.ghostButton, ...styles.actionButton }}
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowDeleteConfirm({ type: 'item', id: item.id, name: item.title })}
                            aria-label={`Delete ${item.title}`}
                            style={{ ...styles.button, ...styles.ghostButton, ...styles.actionButton, color: 'var(--admin-danger-text)' }}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </div>
        </div>
      )}
      {!selectedHobby && (
        <div style={styles.emptyState}>Select a category to manage its items.</div>
      )}
      </div>

      {/* Category Modal */}
      {showCategoryModal && (
        <div style={styles.modal}>
          <div style={styles.modalContent}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>
                {editingCategory ? 'Edit Hobby Category' : 'New Hobby Category'}
              </h2>
            </div>
            <div style={styles.modalBody}>
              {/* Template Buttons */}
              {!editingCategory && (
                <div style={{ marginBottom: '24px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => handleApplyTemplate('fish')}
                    style={{ ...styles.button, ...styles.outlineButton }}
                  >
                    <Fish size={16} /> 魚図鑑
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApplyTemplate('ski')}
                    style={{ ...styles.button, ...styles.outlineButton }}
                  >
                    <Mountain size={16} /> スキー
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApplyTemplate('train')}
                    style={{ ...styles.button, ...styles.outlineButton }}
                  >
                    <Train size={16} /> 鉄道
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApplyTemplate('anime')}
                    style={{ ...styles.button, ...styles.outlineButton }}
                  >
                    <Tv size={16} /> アニメ
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApplyTemplate('voice-actor')}
                    style={{ ...styles.button, ...styles.outlineButton }}
                  >
                    <Mic size={16} /> 声優
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApplyTemplate('anime-character')}
                    style={{ ...styles.button, ...styles.outlineButton }}
                  >
                    <User size={16} /> キャラクター
                  </button>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={styles.label}>Name *</label>
                    <input
                      value={categoryForm.name}
                      onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                      style={styles.input}
                    />
                  </div>
                  <div>
                    <label style={styles.label}>Slug *</label>
                    <input
                      value={categoryForm.slug}
                      onChange={(e) => setCategoryForm({ ...categoryForm, slug: e.target.value })}
                      placeholder="auto-generated if empty"
                      style={styles.input}
                    />
                  </div>
                </div>

                <div>
                  <label style={styles.label}>Description *</label>
                  <textarea
                    value={categoryForm.description}
                    onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })}
                    style={styles.textarea}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={styles.label}>Icon</label>
                    <select
                      value={categoryForm.icon}
                      onChange={(e) => setCategoryForm({ ...categoryForm, icon: e.target.value })}
                      style={styles.select}
                    >
                      <option value="star">Star</option>
                      <option value="fish">Fish</option>
                      <option value="mountain">Mountain</option>
                      <option value="train">Train</option>
                      <option value="camera">Camera</option>
                      <option value="music">Music</option>
                      <option value="gamepad">Gamepad</option>
                      <option value="book">Book</option>
                      <option value="palette">Palette</option>
                      <option value="dumbbell">Dumbbell</option>
                      <option value="utensils">Utensils</option>
                      <option value="plane">Plane</option>
                    </select>
                  </div>
                  <div>
                    <label style={styles.label}>Template Type</label>
                    <select
                      value={categoryForm.templateType}
                      onChange={(e) => setCategoryForm({ ...categoryForm, templateType: e.target.value as HobbyTemplateType })}
                      style={styles.select}
                    >
                      <option value={HobbyTemplateType.CATALOG}>Catalog</option>
                      <option value={HobbyTemplateType.GALLERY}>Gallery</option>
                      <option value={HobbyTemplateType.LOG}>Log</option>
                      <option value={HobbyTemplateType.CUSTOM}>Custom</option>
                    </select>
                  </div>
                </div>

                {/* Cover Image */}
                <div>
                  <label style={styles.label}>Cover Image</label>
                  <div
                    style={styles.dropzone}
                  >
                    {categoryForm.coverImage ? (
                      <div style={{ position: 'relative', display: 'inline-block' }}>
                        <Image
                          src={categoryForm.coverImage}
                          alt="Cover"
                          width={200}
                          height={150}
                          unoptimized
                          style={{ maxWidth: '200px', maxHeight: '150px', width: 'auto', height: 'auto', borderRadius: '8px' }}
                        />
                        <button
                          type="button"
                          onClick={() => setCategoryForm({ ...categoryForm, coverImage: '' })}
                          style={styles.imageRemoveButton}
                          aria-label="Remove cover image"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <div>
                        <input
                          type="file"
                          accept="image/*"
                          id="cover-upload"
                          style={{ display: 'none' }}
                          onChange={(e) => {
                            if (e.target.files?.[0]) {
                              handleImageUpload(e.target.files[0], 'category');
                              e.target.value = '';
                            }
                          }}
                        />
                        <label htmlFor="cover-upload" style={{ cursor: 'pointer' }}>
                          {uploadingImage ? (
                            <Loader2 size={32} style={{ animation: 'spin 1s linear infinite', color: 'var(--admin-text-muted)' }} />
                          ) : (
                            <>
                              <ImageIcon size={32} color="var(--admin-text-muted)" />
                              <p style={{ color: 'var(--admin-text-muted)', fontSize: '14px', margin: '8px 0 0' }}>
                                Click to upload cover image
                              </p>
                            </>
                          )}
                        </label>
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <input
                    type="checkbox"
                    id="category-public"
                    checked={categoryForm.isPublic}
                    onChange={(e) => setCategoryForm({ ...categoryForm, isPublic: e.target.checked })}
                    style={styles.checkbox}
                  />
                  <label htmlFor="category-public" style={styles.checkboxLabel}>
                    Public
                  </label>
                </div>

                {/* Custom Fields */}
                <div>
                  <button
                    type="button"
                    onClick={() => setExpandedFields(!expandedFields)}
                    style={{
                      ...styles.button,
                      ...styles.outlineButton,
                      width: '100%',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span>Custom Fields ({categoryForm.fields.length})</span>
                    {expandedFields ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>

                  {expandedFields && (
                    <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {categoryForm.fields.map((field, _index) => (
                        <div
                          key={field.id}
                          style={styles.fieldCard}
                        >
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '12px', alignItems: 'end' }}>
                            <div>
                              <label style={{ ...styles.label, fontSize: '12px' }}>Field Name</label>
                              <input
                                value={field.name}
                                onChange={(e) => handleUpdateField(field.id, { name: e.target.value })}
                                placeholder="fieldName"
                                style={{ ...styles.input, fontSize: '13px', padding: '8px 12px' }}
                              />
                            </div>
                            <div>
                              <label style={{ ...styles.label, fontSize: '12px' }}>Label</label>
                              <input
                                value={field.label}
                                onChange={(e) => handleUpdateField(field.id, { label: e.target.value })}
                                placeholder="Display Label"
                                style={{ ...styles.input, fontSize: '13px', padding: '8px 12px' }}
                              />
                            </div>
                            <div>
                              <label style={{ ...styles.label, fontSize: '12px' }}>Type</label>
                              <select
                                value={field.type}
                                onChange={(e) => handleUpdateField(field.id, { type: e.target.value as CustomFieldType })}
                                style={{ ...styles.select, fontSize: '13px', padding: '8px 12px' }}
                              >
                                <option value={CustomFieldType.TEXT}>Text</option>
                                <option value={CustomFieldType.TEXTAREA}>Textarea</option>
                                <option value={CustomFieldType.NUMBER}>Number</option>
                                <option value={CustomFieldType.DATE}>Date</option>
                                <option value={CustomFieldType.SELECT}>Select</option>
                                <option value={CustomFieldType.RATING}>Rating</option>
                                <option value={CustomFieldType.URL}>URL</option>
                                <option value={CustomFieldType.LOCATION}>Location</option>
                                <option value={CustomFieldType.BOOLEAN}>Boolean</option>
                                <option value={CustomFieldType.RELATION}>Relation</option>
                              </select>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveField(field.id)}
                              style={{ ...styles.button, ...styles.ghostButton, ...styles.actionButton, color: 'var(--admin-danger-text)' }}
                              aria-label={`Remove ${field.label || field.name || 'field'}`}
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                          {field.type === CustomFieldType.SELECT && (
                            <div style={{ marginTop: '12px' }}>
                              <label style={{ ...styles.label, fontSize: '12px' }}>Options (comma-separated)</label>
                              <input
                                value={field.options?.join(', ') || ''}
                                onChange={(e) =>
                                  handleUpdateField(field.id, {
                                    options: e.target.value.split(',').map((o) => o.trim()).filter((o) => o),
                                  })
                                }
                                placeholder="Option 1, Option 2, Option 3"
                                style={{ ...styles.input, fontSize: '13px', padding: '8px 12px' }}
                              />
                            </div>
                          )}
                          {field.type === CustomFieldType.RELATION && (
                            <div style={{ marginTop: '12px' }}>
                              <label style={{ ...styles.label, fontSize: '12px' }}>参照先カテゴリ (slug)</label>
                              <select
                                value={field.relationConfig?.hobbySlug || ''}
                                onChange={(e) =>
                                  handleUpdateField(field.id, {
                                    relationConfig: {
                                      hobbySlug: e.target.value,
                                      multiple: field.relationConfig?.multiple || false,
                                    },
                                  })
                                }
                                style={{ ...styles.select, fontSize: '13px', padding: '8px 12px' }}
                              >
                                <option value="">カテゴリを選択...</option>
                                {categories.map((cat) => (
                                  <option key={cat.id} value={cat.slug}>
                                    {cat.name} ({cat.slug})
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={handleAddField}
                        style={{ ...styles.button, ...styles.outlineButton, justifyContent: 'center' }}
                      >
                        <Plus size={16} /> Add Field
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div style={styles.modalFooter}>
              <button type="button" onClick={() => setShowCategoryModal(false)} style={{ ...styles.button, ...styles.outlineButton }}>
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveCategory}
                disabled={isCategorySaveDisabled}
                style={{ ...styles.button, ...styles.primaryButton, ...(isCategorySaveDisabled ? styles.disabledButton : {}) }}
              >
                {categoryMutations.loading ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={16} />}
                {editingCategory ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Item Modal */}
      {showItemModal && selectedHobby && (
        <div style={styles.modal}>
          <div style={styles.modalContent}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>
                {editingItem ? 'Edit Item' : 'New Item'} - {selectedHobby.name}
              </h2>
            </div>
            <div style={styles.modalBody}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div>
                  <label style={styles.label}>Title *</label>
                  <input
                    value={itemForm.title}
                    onChange={(e) => setItemForm({ ...itemForm, title: e.target.value })}
                    style={styles.input}
                  />
                </div>

                <div>
                  <label style={styles.label}>Description</label>
                  <textarea
                    value={itemForm.description}
                    onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })}
                    style={styles.textarea}
                  />
                </div>

                {/* Thumbnail */}
                <div>
                  <label style={styles.label}>Thumbnail Image</label>
                  <div
                    style={styles.dropzone}
                  >
                    {itemForm.thumbImage ? (
                      <div style={{ position: 'relative', display: 'inline-block' }}>
                        <Image
                          src={itemForm.thumbImage}
                          alt="Thumbnail"
                          width={150}
                          height={100}
                          unoptimized
                          style={{ maxWidth: '150px', maxHeight: '100px', width: 'auto', height: 'auto', borderRadius: '8px' }}
                        />
                        <button
                          type="button"
                          onClick={() => setItemForm({ ...itemForm, thumbImage: '' })}
                          style={styles.imageRemoveButton}
                          aria-label="Remove thumbnail image"
                        >
                          <X size={12} />
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
                            if (e.target.files?.[0]) {
                              handleImageUpload(e.target.files[0], 'item-thumb');
                              e.target.value = '';
                            }
                          }}
                        />
                        <label htmlFor="thumb-upload" style={{ cursor: 'pointer' }}>
                          {uploadingImage ? (
                            <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', color: 'var(--admin-text-muted)' }} />
                          ) : (
                            <>
                              <Upload size={24} color="var(--admin-text-muted)" />
                              <p style={{ color: 'var(--admin-text-muted)', fontSize: '12px', margin: '4px 0 0' }}>Upload thumbnail</p>
                            </>
                          )}
                        </label>
                      </div>
                    )}
                  </div>
                </div>

                {/* Gallery Images */}
                <div>
                  <label style={styles.label}>Gallery Images</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '12px' }}>
                    {itemForm.images.map((img, index) => (
                      <div key={img} style={{ position: 'relative' }}>
                        <Image
                          src={img}
                          alt={`Gallery ${index + 1}`}
                          width={80}
                          height={60}
                          unoptimized
                          style={{ width: '80px', height: '60px', objectFit: 'cover', borderRadius: '8px' }}
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setItemForm({ ...itemForm, images: itemForm.images.filter((_, i) => i !== index) })
                          }
                          style={{
                            ...styles.imageRemoveButton,
                            top: '-6px',
                            right: '-6px',
                            padding: '2px',
                          }}
                          aria-label={`Remove gallery image ${index + 1}`}
                        >
                          <X size={10} />
                        </button>
                      </div>
                    ))}
                    <label
                      aria-label="Upload gallery image"
                      style={styles.galleryUpload}
                    >
                      <input
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        onChange={(e) => {
                          if (e.target.files?.[0]) {
                            handleImageUpload(e.target.files[0], 'item-gallery');
                            e.target.value = '';
                          }
                        }}
                      />
                      {uploadingImage ? (
                        <Loader2 size={20} style={{ animation: 'spin 1s linear infinite', color: 'var(--admin-text-muted)' }} />
                      ) : (
                        <Plus size={20} color="var(--admin-text-muted)" />
                      )}
                    </label>
                  </div>
                </div>

                {/* Custom Fields */}
                {selectedHobby.fields.length > 0 && (
                  <div>
                    <h4 style={{ color: 'var(--admin-text)', margin: '0 0 16px' }}>Custom Fields</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      {selectedHobby.fields.map((field) => (
                        <div key={field.id}>
                          <label style={styles.label}>
                            {field.label} {field.required && '*'}
                          </label>
                          {renderCustomFieldInput(field)}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <label style={styles.label}>Tags (comma-separated)</label>
                  <input
                    value={itemForm.tags}
                    onChange={(e) => setItemForm({ ...itemForm, tags: e.target.value })}
                    placeholder="tag1, tag2, tag3"
                    style={styles.input}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <input
                    type="checkbox"
                    id="item-public"
                    checked={itemForm.isPublic}
                    onChange={(e) => setItemForm({ ...itemForm, isPublic: e.target.checked })}
                    style={styles.checkbox}
                  />
                  <label htmlFor="item-public" style={styles.checkboxLabel}>
                    Public
                  </label>
                </div>
              </div>
            </div>
            <div style={styles.modalFooter}>
              <button type="button" onClick={() => setShowItemModal(false)} style={{ ...styles.button, ...styles.outlineButton }}>
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveItem}
                disabled={isItemSaveDisabled}
                style={{ ...styles.button, ...styles.primaryButton, ...(isItemSaveDisabled ? styles.disabledButton : {}) }}
              >
                {itemMutations.loading ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={16} />}
                {editingItem ? 'Update' : 'Create'}
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
              <h2 style={{ ...styles.modalTitle, color: 'var(--admin-danger-text)' }}>Confirm Delete</h2>
            </div>
            <div style={styles.modalBody}>
              <p style={{ color: 'var(--admin-text-muted)', margin: 0, lineHeight: 1.6 }}>
                Are you sure you want to delete <strong style={{ color: 'var(--admin-text)' }}>{showDeleteConfirm.name}</strong>?
                {showDeleteConfirm.type === 'category' && ' This will also delete all items in this category.'}
              </p>
            </div>
            <div style={styles.modalFooter}>
              <button type="button" onClick={() => setShowDeleteConfirm(null)} style={{ ...styles.button, ...styles.outlineButton }}>
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (showDeleteConfirm.type === 'category') {
                    handleDeleteCategory(showDeleteConfirm.id);
                  } else {
                    handleDeleteItem(showDeleteConfirm.id);
                  }
                }}
                style={{ ...styles.button, ...styles.dangerButton }}
              >
                <Trash2 size={16} /> Delete
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
