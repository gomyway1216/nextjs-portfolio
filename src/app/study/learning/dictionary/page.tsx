'use client';

import { useDictionary,useStudyCategories } from '@/hooks/useStudy';
import { useAuth } from '@/providers/AuthProvider';
import { DictionaryTerm,QuizDifficulty,ReviewStatus } from '@/types/study';
import {
ArrowLeft,
BookMarked,
ChevronDown,
ChevronRight,
Edit2,
Loader2,
Plus,
Save,
Search,
Trash2,
X,
} from 'lucide-react';
import Link from 'next/link';
import { useMemo,useState } from 'react';
import { toast } from 'sonner';

export default function DictionaryPage() {
  const { currentUser } = useAuth();
  const { terms, loading, createTerm, updateTerm, deleteTerm, fetchTerms: _fetchTerms } = useDictionary();
  const { categories: _categories } = useStudyCategories();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [expandedTermId, setExpandedTermId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingTermId, setEditingTermId] = useState<string | null>(null);

  // Group terms by first letter
  const groupedTerms = useMemo(() => {
    const filtered = terms.filter((term) => {
      const matchesSearch =
        !searchQuery ||
        term.term.toLowerCase().includes(searchQuery.toLowerCase()) ||
        term.definition.toLowerCase().includes(searchQuery.toLowerCase()) ||
        term.aliases?.some((a) => a.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesCategory = !selectedCategory || term.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });

    const grouped: Record<string, DictionaryTerm[]> = {};
    filtered.forEach((term) => {
      const letter = term.term[0].toUpperCase();
      if (!grouped[letter]) grouped[letter] = [];
      grouped[letter].push(term);
    });

    return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b));
  }, [terms, searchQuery, selectedCategory]);

  // Get unique categories from terms
  const termCategories = useMemo(() => {
    const cats = new Set(terms.map((t) => t.category).filter(Boolean));
    return Array.from(cats).sort();
  }, [terms]);

  const handleDeleteTerm = async (termId: string) => {
    if (!confirm('Are you sure you want to delete this term?')) return;
    try {
      await deleteTerm(termId);
      toast.success('Term deleted');
    } catch (_err) {
      toast.error('Failed to delete term');
    }
  };

  if (!currentUser || currentUser.isAnonymous) {
    return (
      <div style={{ minHeight: '100vh', padding: '48px 16px', textAlign: 'center' }}>
        <p>Please sign in to access your dictionary.</p>
        <Link href="/login">Sign In</Link>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#ffffff', paddingTop: '8px' }}>
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '24px 16px' }}>
        {/* Header */}
        <div style={{ marginBottom: '24px' }}>
          <Link
            href="/study/learning"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              color: '#6b7280',
              textDecoration: 'none',
              fontSize: '14px',
              marginBottom: '16px',
            }}
          >
            <ArrowLeft size={16} />
            Back to Learning Hub
          </Link>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h1 style={{ fontSize: '24px', fontWeight: '600', color: '#111827', marginBottom: '4px' }}>
                Dictionary
              </h1>
              <p style={{ color: '#6b7280', fontSize: '14px' }}>
                {terms.length} terms in your personal glossary
              </p>
            </div>
            <button
              onClick={() => setShowAddForm(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 16px',
                backgroundColor: '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: '500',
                fontSize: '14px',
              }}
            >
              <Plus size={18} />
              Add Term
            </button>
          </div>
        </div>

        {/* Search and Filter */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '200px', position: 'relative' }}>
            <Search
              size={18}
              style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }}
            />
            <input
              type="text"
              placeholder="Search terms..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px 10px 40px',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                fontSize: '14px',
                outline: 'none',
              }}
            />
          </div>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            style={{
              padding: '10px 12px',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              fontSize: '14px',
              outline: 'none',
              backgroundColor: 'white',
              minWidth: '150px',
            }}
          >
            <option value="">All Categories</option>
            {termCategories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>

        {/* Add Term Form */}
        {showAddForm && (
          <AddTermForm
            onClose={() => setShowAddForm(false)}
            onSubmit={async (term) => {
              await createTerm(term);
              setShowAddForm(false);
              toast.success('Term added');
            }}
          />
        )}

        {/* Terms List */}
        {loading ? (
          <div style={{ padding: '48px', textAlign: 'center', color: '#6b7280' }}>
            <Loader2 size={32} className="animate-spin" style={{ margin: '0 auto 16px' }} />
            Loading dictionary...
          </div>
        ) : groupedTerms.length === 0 ? (
          <div
            style={{
              padding: '48px',
              textAlign: 'center',
              backgroundColor: '#f8fafc',
              borderRadius: '12px',
              border: '1px dashed #e2e8f0',
            }}
          >
            <BookMarked size={48} style={{ color: '#cbd5e1', marginBottom: '16px' }} />
            <p style={{ color: '#6b7280', marginBottom: '16px' }}>
              {searchQuery ? 'No terms match your search' : 'Your dictionary is empty'}
            </p>
            {!searchQuery && (
              <button
                onClick={() => setShowAddForm(true)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 16px',
                  backgroundColor: '#10b981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: '500',
                  fontSize: '14px',
                }}
              >
                <Plus size={18} />
                Add Your First Term
              </button>
            )}
          </div>
        ) : (
          <div>
            {groupedTerms.map(([letter, letterTerms]) => (
              <div key={letter} style={{ marginBottom: '24px' }}>
                <div
                  style={{
                    fontSize: '18px',
                    fontWeight: '700',
                    color: '#6366f1',
                    padding: '8px 0',
                    borderBottom: '2px solid #6366f1',
                    marginBottom: '12px',
                  }}
                >
                  {letter}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {letterTerms.map((term) => (
                    <TermCard
                      key={term.id}
                      term={term}
                      isExpanded={expandedTermId === term.id}
                      isEditing={editingTermId === term.id}
                      onToggle={() => setExpandedTermId(expandedTermId === term.id ? null : term.id)}
                      onEdit={() => setEditingTermId(term.id)}
                      onCancelEdit={() => setEditingTermId(null)}
                      onSaveEdit={async (updates) => {
                        await updateTerm(term.id, updates);
                        setEditingTermId(null);
                        toast.success('Term updated');
                      }}
                      onDelete={() => handleDeleteTerm(term.id)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TermCard({
  term,
  isExpanded,
  isEditing,
  onToggle,
  onEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
}: {
  term: DictionaryTerm;
  isExpanded: boolean;
  isEditing: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: (updates: Partial<DictionaryTerm>) => Promise<void>;
  onDelete: () => void;
}) {
  const [editedDefinition, setEditedDefinition] = useState(term.definition);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSaveEdit({ definition: editedDefinition });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        border: '1px solid #e2e8f0',
        overflow: 'hidden',
      }}
    >
      <div
        onClick={onToggle}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          cursor: 'pointer',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {isExpanded ? <ChevronDown size={18} style={{ color: '#6b7280' }} /> : <ChevronRight size={18} style={{ color: '#6b7280' }} />}
          <div>
            <span style={{ fontWeight: '600', color: '#111827' }}>{term.term}</span>
            {term.aliases && term.aliases.length > 0 && (
              <span style={{ fontSize: '13px', color: '#9ca3af', marginLeft: '8px' }}>
                ({term.aliases.join(', ')})
              </span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {term.category && (
            <span
              style={{
                fontSize: '11px',
                padding: '2px 8px',
                backgroundColor: '#f1f5f9',
                borderRadius: '4px',
                color: '#64748b',
              }}
            >
              {term.category}
            </span>
          )}
        </div>
      </div>

      {isExpanded && (
        <div style={{ padding: '0 16px 16px 46px', borderTop: '1px solid #f1f5f9' }}>
          {isEditing ? (
            <div style={{ paddingTop: '12px' }}>
              <textarea
                value={editedDefinition}
                onChange={(e) => setEditedDefinition(e.target.value)}
                rows={4}
                style={{
                  width: '100%',
                  padding: '10px',
                  border: '1px solid #e2e8f0',
                  borderRadius: '6px',
                  fontSize: '14px',
                  outline: 'none',
                  resize: 'vertical',
                }}
              />
              <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '6px 12px',
                    backgroundColor: '#10b981',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '13px',
                  }}
                >
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  Save
                </button>
                <button
                  onClick={onCancelEdit}
                  style={{
                    padding: '6px 12px',
                    backgroundColor: 'white',
                    color: '#374151',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '13px',
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div style={{ paddingTop: '12px' }}>
              <p style={{ fontSize: '14px', color: '#374151', lineHeight: 1.6, margin: 0 }}>
                {term.definition}
              </p>

              {term.examples && term.examples.length > 0 && (
                <div style={{ marginTop: '12px' }}>
                  <p style={{ fontSize: '12px', fontWeight: '600', color: '#6b7280', marginBottom: '8px' }}>
                    Examples:
                  </p>
                  {term.examples.map((example, i) => (
                    <div
                      key={i}
                      style={{
                        fontSize: '13px',
                        color: '#4b5563',
                        backgroundColor: '#f8fafc',
                        padding: '8px 12px',
                        borderRadius: '6px',
                        marginBottom: '6px',
                      }}
                    >
                      {example.context}
                      {example.codeExample && (
                        <pre
                          style={{
                            backgroundColor: '#1e1e1e',
                            color: '#d4d4d4',
                            padding: '8px',
                            borderRadius: '4px',
                            marginTop: '6px',
                            fontSize: '12px',
                            overflow: 'auto',
                          }}
                        >
                          {example.codeExample}
                        </pre>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit();
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '4px 10px',
                    backgroundColor: 'white',
                    color: '#6b7280',
                    border: '1px solid #e2e8f0',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '12px',
                  }}
                >
                  <Edit2 size={12} />
                  Edit
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete();
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '4px 10px',
                    backgroundColor: 'white',
                    color: '#ef4444',
                    border: '1px solid #fecaca',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '12px',
                  }}
                >
                  <Trash2 size={12} />
                  Delete
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AddTermForm({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (term: Omit<DictionaryTerm, 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'reviewCount' | 'lastReviewedAt'>) => Promise<void>;
}) {
  const [term, setTerm] = useState('');
  const [definition, setDefinition] = useState('');
  const [category, setCategory] = useState('');
  const [aliases, setAliases] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!term.trim() || !definition.trim()) return;

    setSaving(true);
    try {
      await onSubmit({
        term: term.trim(),
        definition: definition.trim(),
        category: category.trim() || undefined,
        tags: [],
        examples: [],
        relatedTermIds: [],
        aliases: aliases.split(',').map((a) => a.trim()).filter(Boolean),
        difficulty: QuizDifficulty.INTERMEDIATE,
        reviewStatus: ReviewStatus.NEW,
        confidenceLevel: 0,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        padding: '20px',
        marginBottom: '24px',
        border: '2px solid #10b981',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: '600', margin: 0 }}>Add New Term</h3>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}
        >
          <X size={20} />
        </button>
      </div>

      <form onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', color: '#6b7280', marginBottom: '4px' }}>
              Term *
            </label>
            <input
              type="text"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="e.g., API"
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
                fontSize: '14px',
                outline: 'none',
              }}
              required
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '13px', color: '#6b7280', marginBottom: '4px' }}>
              Category
            </label>
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g., Programming"
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
                fontSize: '14px',
                outline: 'none',
              }}
            />
          </div>
        </div>

        <div style={{ marginBottom: '12px' }}>
          <label style={{ display: 'block', fontSize: '13px', color: '#6b7280', marginBottom: '4px' }}>
            Definition *
          </label>
          <textarea
            value={definition}
            onChange={(e) => setDefinition(e.target.value)}
            placeholder="Clear, concise definition..."
            rows={3}
            style={{
              width: '100%',
              padding: '10px 12px',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              fontSize: '14px',
              outline: 'none',
              resize: 'vertical',
            }}
            required
          />
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '13px', color: '#6b7280', marginBottom: '4px' }}>
            Aliases (comma-separated)
          </label>
          <input
            type="text"
            value={aliases}
            onChange={(e) => setAliases(e.target.value)}
            placeholder="e.g., Application Programming Interface, REST API"
            style={{
              width: '100%',
              padding: '10px 12px',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              fontSize: '14px',
              outline: 'none',
            }}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 16px',
              backgroundColor: 'white',
              color: '#374151',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !term.trim() || !definition.trim()}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              backgroundColor: saving ? '#9ca3af' : '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: saving ? 'not-allowed' : 'pointer',
              fontSize: '14px',
            }}
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Add Term
          </button>
        </div>
      </form>
    </div>
  );
}
