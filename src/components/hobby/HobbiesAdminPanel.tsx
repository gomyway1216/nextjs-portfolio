'use client';

import { useState, useEffect, CSSProperties } from 'react';
import {
  useHobbyCategories,
  useHobbyMutations,
  useHobbyItems,
  useHobbyItemMutations,
} from '@/hooks/useHobbies';
import type {
  HobbyCategory,
  HobbyItem,
  CustomField,
  CreateHobbyCategoryInput,
  CreateHobbyItemInput,
} from '@/types/hobby';
import { HobbyTemplateType, CustomFieldType, FISH_CATALOG_FIELDS, SKI_RESORT_FIELDS, generateSlug } from '@/types/hobby';
import * as imageApi from '@/services/imageService';
import {
  Plus,
  Pencil,
  Trash2,
  X,
  Save,
  Loader2,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp,
  Upload,
  Image as ImageIcon,
  Fish,
  Mountain,
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

// Styles (following AdminPage patterns)
const styles: Record<string, CSSProperties> = {
  panel: {
    padding: '0',
  },
  card: {
    backgroundColor: 'rgba(30, 41, 59, 0.5)',
    backdropFilter: 'blur(8px)',
    borderRadius: '16px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    overflow: 'hidden',
    marginBottom: '24px',
  },
  cardHeader: {
    padding: '20px 24px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#ffffff',
    margin: 0,
  },
  cardBody: {
    padding: '24px',
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
    maxWidth: '800px',
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
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '4px 12px',
    borderRadius: '9999px',
    fontSize: '12px',
    fontWeight: '500',
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

  // Reset item form when hobby changes
  useEffect(() => {
    if (selectedHobby) {
      setItemForm((prev) => ({
        ...prev,
        customFields: {},
      }));
    }
  }, [selectedHobby]);

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
          fields: categoryForm.fields.map(({ id, ...rest }) => rest),
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

  const handleApplyTemplate = (template: 'fish' | 'ski') => {
    const templateFields = template === 'fish' ? FISH_CATALOG_FIELDS : SKI_RESORT_FIELDS;
    const fieldsWithIds: CustomField[] = templateFields.map((f, i) => ({
      ...f,
      id: uuidv4(),
      order: i + 1,
    }));
    setCategoryForm((prev) => ({
      ...prev,
      fields: fieldsWithIds,
      name: template === 'fish' ? '魚図鑑' : 'スキー',
      slug: template === 'fish' ? 'fish' : 'ski',
      description: template === 'fish' ? '捕まえた魚のコレクション' : 'スキー場の記録',
      icon: template === 'fish' ? 'fish' : 'mountain',
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
            style={{ width: '20px', height: '20px', cursor: 'pointer' }}
          />
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

  return (
    <div style={styles.panel}>
      <h1 style={{ fontSize: '36px', fontWeight: 'bold', color: '#ffffff', marginBottom: '8px' }}>
        Hobbies Management
      </h1>
      <p style={{ color: '#94a3b8', marginBottom: '32px' }}>
        Manage your hobby categories and items
      </p>

      {/* Categories Section */}
      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <h3 style={styles.cardTitle}>Hobby Categories</h3>
          <button
            onClick={() => handleOpenCategoryModal()}
            style={{ ...styles.button, ...styles.primaryButton }}
          >
            <Plus size={16} /> Add Category
          </button>
        </div>
        <div style={styles.cardBody}>
          {categoriesLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '24px' }}>
              <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />
            </div>
          ) : categories.length === 0 ? (
            <p style={{ color: '#64748b', textAlign: 'center' }}>No hobby categories yet</p>
          ) : (
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
                    style={{
                      backgroundColor: selectedHobbyId === category.id ? 'rgba(168, 85, 247, 0.1)' : 'transparent',
                      cursor: 'pointer',
                    }}
                    onClick={() => setSelectedHobbyId(category.id)}
                  >
                    <td style={styles.td}>
                      <span style={{ color: '#ffffff', fontWeight: '500' }}>{category.name}</span>
                    </td>
                    <td style={{ ...styles.td, color: '#94a3b8' }}>{category.slug}</td>
                    <td style={styles.td}>
                      {category.isPublic ? (
                        <span style={{ ...styles.badge, backgroundColor: 'rgba(16, 185, 129, 0.2)', color: '#6ee7b7' }}>
                          <Eye size={12} /> Public
                        </span>
                      ) : (
                        <span style={{ ...styles.badge, backgroundColor: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: '#94a3b8' }}>
                          <EyeOff size={12} /> Private
                        </span>
                      )}
                    </td>
                    <td style={{ ...styles.td, color: '#94a3b8' }}>{category.fields.length} fields</td>
                    <td style={{ ...styles.td, textAlign: 'right' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenCategoryModal(category);
                          }}
                          style={{ ...styles.ghostButton, borderRadius: '8px' }}
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowDeleteConfirm({ type: 'category', id: category.id, name: category.name });
                          }}
                          style={{ ...styles.ghostButton, borderRadius: '8px', color: '#f87171' }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Items Section */}
      {selectedHobby && (
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <h3 style={styles.cardTitle}>{selectedHobby.name} Items</h3>
            <button
              onClick={() => handleOpenItemModal()}
              style={{ ...styles.button, ...styles.primaryButton }}
            >
              <Plus size={16} /> Add Item
            </button>
          </div>
          <div style={styles.cardBody}>
            {itemsLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '24px' }}>
                <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />
              </div>
            ) : items.length === 0 ? (
              <p style={{ color: '#64748b', textAlign: 'center' }}>No items yet</p>
            ) : (
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
                        <span style={{ color: '#ffffff', fontWeight: '500' }}>{item.title}</span>
                      </td>
                      <td style={styles.td}>
                        {item.isPublic ? (
                          <span style={{ ...styles.badge, backgroundColor: 'rgba(16, 185, 129, 0.2)', color: '#6ee7b7' }}>
                            <Eye size={12} /> Public
                          </span>
                        ) : (
                          <span style={{ ...styles.badge, backgroundColor: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: '#94a3b8' }}>
                            <EyeOff size={12} /> Private
                          </span>
                        )}
                      </td>
                      <td style={{ ...styles.td, color: '#94a3b8' }}>{item.tags.join(', ') || '-'}</td>
                      <td style={{ ...styles.td, textAlign: 'right' }}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                          <button
                            onClick={() => handleOpenItemModal(item)}
                            style={{ ...styles.ghostButton, borderRadius: '8px' }}
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            onClick={() => setShowDeleteConfirm({ type: 'item', id: item.id, name: item.title })}
                            style={{ ...styles.ghostButton, borderRadius: '8px', color: '#f87171' }}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

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
                <div style={{ marginBottom: '24px', display: 'flex', gap: '12px' }}>
                  <button
                    onClick={() => handleApplyTemplate('fish')}
                    style={{ ...styles.button, ...styles.outlineButton }}
                  >
                    <Fish size={16} /> Apply Fish Template
                  </button>
                  <button
                    onClick={() => handleApplyTemplate('ski')}
                    style={{ ...styles.button, ...styles.outlineButton }}
                  >
                    <Mountain size={16} /> Apply Ski Template
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
                    style={{
                      border: '2px dashed rgba(255, 255, 255, 0.2)',
                      borderRadius: '12px',
                      padding: '20px',
                      textAlign: 'center',
                      backgroundColor: 'rgba(15, 23, 42, 0.3)',
                    }}
                  >
                    {categoryForm.coverImage ? (
                      <div style={{ position: 'relative', display: 'inline-block' }}>
                        <img
                          src={categoryForm.coverImage}
                          alt="Cover"
                          style={{ maxWidth: '200px', maxHeight: '150px', borderRadius: '8px' }}
                        />
                        <button
                          onClick={() => setCategoryForm({ ...categoryForm, coverImage: '' })}
                          style={{
                            position: 'absolute',
                            top: '-8px',
                            right: '-8px',
                            background: '#ef4444',
                            border: 'none',
                            borderRadius: '50%',
                            padding: '4px',
                            cursor: 'pointer',
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
                            <Loader2 size={32} style={{ animation: 'spin 1s linear infinite', color: '#64748b' }} />
                          ) : (
                            <>
                              <ImageIcon size={32} color="#64748b" />
                              <p style={{ color: '#94a3b8', fontSize: '14px', margin: '8px 0 0' }}>
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
                    style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                  />
                  <label htmlFor="category-public" style={{ color: '#cbd5e1', cursor: 'pointer' }}>
                    Public
                  </label>
                </div>

                {/* Custom Fields */}
                <div>
                  <button
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
                      {categoryForm.fields.map((field, index) => (
                        <div
                          key={field.id}
                          style={{
                            padding: '16px',
                            backgroundColor: 'rgba(15, 23, 42, 0.5)',
                            borderRadius: '12px',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                          }}
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
                              </select>
                            </div>
                            <button
                              onClick={() => handleRemoveField(field.id)}
                              style={{ ...styles.ghostButton, color: '#f87171' }}
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
                        </div>
                      ))}
                      <button
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
              <button onClick={() => setShowCategoryModal(false)} style={{ ...styles.button, ...styles.outlineButton }}>
                Cancel
              </button>
              <button
                onClick={handleSaveCategory}
                disabled={categoryMutations.loading}
                style={{ ...styles.button, ...styles.primaryButton }}
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
                    style={{
                      border: '2px dashed rgba(255, 255, 255, 0.2)',
                      borderRadius: '12px',
                      padding: '20px',
                      textAlign: 'center',
                      backgroundColor: 'rgba(15, 23, 42, 0.3)',
                    }}
                  >
                    {itemForm.thumbImage ? (
                      <div style={{ position: 'relative', display: 'inline-block' }}>
                        <img
                          src={itemForm.thumbImage}
                          alt="Thumbnail"
                          style={{ maxWidth: '150px', maxHeight: '100px', borderRadius: '8px' }}
                        />
                        <button
                          onClick={() => setItemForm({ ...itemForm, thumbImage: '' })}
                          style={{
                            position: 'absolute',
                            top: '-8px',
                            right: '-8px',
                            background: '#ef4444',
                            border: 'none',
                            borderRadius: '50%',
                            padding: '4px',
                            cursor: 'pointer',
                          }}
                        >
                          <X size={12} color="#fff" />
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
                            <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', color: '#64748b' }} />
                          ) : (
                            <>
                              <Upload size={24} color="#64748b" />
                              <p style={{ color: '#94a3b8', fontSize: '12px', margin: '4px 0 0' }}>Upload thumbnail</p>
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
                        <img
                          src={img}
                          alt={`Gallery ${index + 1}`}
                          style={{ width: '80px', height: '60px', objectFit: 'cover', borderRadius: '8px' }}
                        />
                        <button
                          onClick={() =>
                            setItemForm({ ...itemForm, images: itemForm.images.filter((_, i) => i !== index) })
                          }
                          style={{
                            position: 'absolute',
                            top: '-6px',
                            right: '-6px',
                            background: '#ef4444',
                            border: 'none',
                            borderRadius: '50%',
                            padding: '2px',
                            cursor: 'pointer',
                          }}
                        >
                          <X size={10} color="#fff" />
                        </button>
                      </div>
                    ))}
                    <label
                      style={{
                        width: '80px',
                        height: '60px',
                        border: '2px dashed rgba(255, 255, 255, 0.2)',
                        borderRadius: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                      }}
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
                        <Loader2 size={20} style={{ animation: 'spin 1s linear infinite', color: '#64748b' }} />
                      ) : (
                        <Plus size={20} color="#64748b" />
                      )}
                    </label>
                  </div>
                </div>

                {/* Custom Fields */}
                {selectedHobby.fields.length > 0 && (
                  <div>
                    <h4 style={{ color: '#ffffff', marginBottom: '16px' }}>Custom Fields</h4>
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
                    style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                  />
                  <label htmlFor="item-public" style={{ color: '#cbd5e1', cursor: 'pointer' }}>
                    Public
                  </label>
                </div>
              </div>
            </div>
            <div style={styles.modalFooter}>
              <button onClick={() => setShowItemModal(false)} style={{ ...styles.button, ...styles.outlineButton }}>
                Cancel
              </button>
              <button
                onClick={handleSaveItem}
                disabled={itemMutations.loading}
                style={{ ...styles.button, ...styles.primaryButton }}
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
              <h2 style={{ ...styles.modalTitle, color: '#f87171' }}>Confirm Delete</h2>
            </div>
            <div style={styles.modalBody}>
              <p style={{ color: '#94a3b8' }}>
                Are you sure you want to delete <strong style={{ color: '#ffffff' }}>{showDeleteConfirm.name}</strong>?
                {showDeleteConfirm.type === 'category' && ' This will also delete all items in this category.'}
              </p>
            </div>
            <div style={styles.modalFooter}>
              <button onClick={() => setShowDeleteConfirm(null)} style={{ ...styles.button, ...styles.outlineButton }}>
                Cancel
              </button>
              <button
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
