import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Edit3, Archive, X, ShieldAlert } from 'lucide-react';
import { apiRequest } from '../api';
import { Category } from '../types';
import { useAuth } from '../context/AuthContext';
import { IconBadge, AVAILABLE_ICONS } from '../components/IconBadge';

const COLOR_SWATCHES = [
  '#2563eb',
  '#ef4444',
  '#10b981',
  '#f97316',
  '#8b5cf6',
  '#ec4899',
  '#eab308',
  '#14b8a6',
  '#6366f1',
  '#06b6d4',
];

export const CategoriesPage: React.FC = () => {
  const { showToast } = useAuth();

  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'expense' | 'income'>('expense');

  // Create Modal
  const [showCreate, setShowCreate] = useState<boolean>(false);
  const [newName, setNewName] = useState<string>('');
  const [newType, setNewType] = useState<'expense' | 'income'>('expense');
  const [newIcon, setNewIcon] = useState<string>('Tag');
  const [newColor, setNewColor] = useState<string>('#2563eb');
  const [creating, setCreating] = useState<boolean>(false);

  // Edit Modal
  const [editCat, setEditCat] = useState<Category | null>(null);
  const [editName, setEditName] = useState<string>('');
  const [editIcon, setEditIcon] = useState<string>('Tag');
  const [editColor, setEditColor] = useState<string>('#2563eb');

  // Safe Delete / Reassign Modal
  const [deleteCat, setDeleteCat] = useState<Category | null>(null);
  const [reassignId, setReassignId] = useState<number>(0);

  const loadCategories = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiRequest<Category[]>('/api/categories?include_archived=true');
      setCategories(data);
    } catch (err: unknown) {
      showToast(
        err instanceof Error ? err.message : 'Failed to load categories',
        'error'
      );
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await apiRequest<Category>('/api/categories', {
        method: 'POST',
        body: JSON.stringify({
          name: newName.trim(),
          category_type: newType,
          icon: newIcon,
          color: newColor,
        }),
      });
      showToast(`Category '${newName.trim()}' created!`, 'success');
      setNewName('');
      setShowCreate(false);
      loadCategories();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Create failed', 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editCat || !editName.trim()) return;
    try {
      await apiRequest(`/api/categories/${editCat.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: editName.trim(),
          icon: editIcon,
          color: editColor,
        }),
      });
      showToast('Category updated!', 'success');
      setEditCat(null);
      loadCategories();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Update failed', 'error');
    }
  };

  const openDeleteModal = (cat: Category) => {
    setDeleteCat(cat);
    const sameTypeAlternatives = categories.filter(
      (c) =>
        c.category_type === cat.category_type &&
        c.id !== cat.id &&
        !c.is_archived
    );
    if (sameTypeAlternatives.length > 0) {
      setReassignId(sameTypeAlternatives[0].id);
    } else {
      setReassignId(0);
    }
  };

  const handleSafeDelete = async (archiveOnly: boolean) => {
    if (!deleteCat) return;
    try {
      let url = `/api/categories/${deleteCat.id}`;
      if (archiveOnly) {
        url += `?archive_instead=true`;
      } else if (deleteCat.transaction_count > 0 && reassignId) {
        url += `?reassign_to_category_id=${reassignId}`;
      }
      await apiRequest(url, { method: 'DELETE' });
      showToast(
        archiveOnly
          ? `Category '${deleteCat.name}' archived safely.`
          : `Category '${deleteCat.name}' deleted.`,
        'info'
      );
      setDeleteCat(null);
      loadCategories();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Delete failed', 'error');
    }
  };

  const filtered = categories.filter((c) => c.category_type === activeTab);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-navy-950">Category Management</h2>
          <p className="text-xs text-slate-500">
            Organize default and custom categories with custom icons, colors, and safe transaction reassignment protection.
          </p>
        </div>

        <button
          onClick={() => {
            setNewType(activeTab);
            setShowCreate(true);
          }}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Add Custom Category</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
        <button
          onClick={() => setActiveTab('expense')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
            activeTab === 'expense'
              ? 'bg-navy-950 text-white'
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          Expense Categories ({categories.filter((c) => c.category_type === 'expense').length})
        </button>
        <button
          onClick={() => setActiveTab('income')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
            activeTab === 'income'
              ? 'bg-navy-950 text-white'
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          Income Categories ({categories.filter((c) => c.category_type === 'income').length})
        </button>
      </div>

      {loading ? (
        <div className="p-12 text-center text-xs text-slate-400">
          Loading categories...
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtered.map((cat) => (
            <div
              key={cat.id}
              className={`bg-white rounded-2xl border p-4 shadow-2xs flex flex-col justify-between ${
                cat.is_archived ? 'border-slate-200 opacity-60' : 'border-slate-200'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <IconBadge icon={cat.icon} color={cat.color} size="md" />
                  <div>
                    <div className="font-bold text-sm text-navy-950">{cat.name}</div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[11px] text-slate-400">
                        {cat.transaction_count} transaction(s)
                      </span>
                      {cat.is_default && (
                        <span className="px-1.5 py-0.2 rounded bg-slate-100 text-slate-500 text-[10px] font-medium">
                          Default
                        </span>
                      )}
                      {cat.is_archived && (
                        <span className="px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 text-[10px] font-medium">
                          Archived
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-end gap-1">
                <button
                  onClick={() => {
                    setEditCat(cat);
                    setEditName(cat.name);
                    setEditIcon(cat.icon);
                    setEditColor(cat.color);
                  }}
                  className="p-1.5 rounded-lg text-slate-500 hover:bg-blue-50 hover:text-blue-600 cursor-pointer"
                  title="Edit Category"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => openDeleteModal(cat)}
                  className="p-1.5 rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-600 cursor-pointer"
                  title="Delete or Archive Category"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Category Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="text-base font-bold text-navy-950">Create Custom Category</h3>
              <button
                onClick={() => setShowCreate(false)}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Category Name *
                </label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g., Pet Care, Books, Side Hustle"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Category Type *
                </label>
                <select
                  value={newType}
                  onChange={(e) => setNewType(e.target.value as 'expense' | 'income')}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white"
                >
                  <option value="expense">Expense</option>
                  <option value="income">Income</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">
                  Select Icon
                </label>
                <div className="grid grid-cols-6 gap-2 max-h-36 overflow-y-auto p-1">
                  {AVAILABLE_ICONS.map((iconName) => (
                    <button
                      type="button"
                      key={iconName}
                      onClick={() => setNewIcon(iconName)}
                      className={`p-1.5 rounded-xl border flex items-center justify-center cursor-pointer ${
                        newIcon === iconName
                          ? 'border-blue-600 bg-blue-50'
                          : 'border-slate-200'
                      }`}
                    >
                      <IconBadge icon={iconName} color={newColor} size="sm" />
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">
                  Accent Color
                </label>
                <div className="flex flex-wrap gap-2">
                  {COLOR_SWATCHES.map((hex) => (
                    <button
                      type="button"
                      key={hex}
                      onClick={() => setNewColor(hex)}
                      className={`w-6 h-6 rounded-full cursor-pointer ${
                        newColor === hex ? 'ring-2 ring-offset-2 ring-navy-950' : ''
                      }`}
                      style={{ backgroundColor: hex }}
                    />
                  ))}
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold cursor-pointer"
                >
                  {creating ? 'Creating...' : 'Create Category'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Category Modal */}
      {editCat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="text-base font-bold text-navy-950">Edit Category</h3>
              <button
                onClick={() => setEditCat(null)}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleUpdate} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Category Name *
                </label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">
                  Select Icon
                </label>
                <div className="grid grid-cols-6 gap-2 max-h-36 overflow-y-auto p-1">
                  {AVAILABLE_ICONS.map((iconName) => (
                    <button
                      type="button"
                      key={iconName}
                      onClick={() => setEditIcon(iconName)}
                      className={`p-1.5 rounded-xl border flex items-center justify-center cursor-pointer ${
                        editIcon === iconName
                          ? 'border-blue-600 bg-blue-50'
                          : 'border-slate-200'
                      }`}
                    >
                      <IconBadge icon={iconName} color={editColor} size="sm" />
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">
                  Accent Color
                </label>
                <div className="flex flex-wrap gap-2">
                  {COLOR_SWATCHES.map((hex) => (
                    <button
                      type="button"
                      key={hex}
                      onClick={() => setEditColor(hex)}
                      className={`w-6 h-6 rounded-full cursor-pointer ${
                        editColor === hex ? 'ring-2 ring-offset-2 ring-navy-950' : ''
                      }`}
                      style={{ backgroundColor: hex }}
                    />
                  ))}
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditCat(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold cursor-pointer"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Safe Deletion / Reassignment Protection Modal */}
      {deleteCat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-2.5 text-navy-950 font-bold text-base">
              <ShieldAlert className="w-5 h-5 text-amber-600" />
              <span>Delete or Archive "{deleteCat.name}"</span>
            </div>

            {deleteCat.transaction_count > 0 ? (
              <div className="space-y-3 text-xs text-slate-600 leading-relaxed">
                <p className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900">
                  <strong>Data Integrity Protection:</strong> "{deleteCat.name}" currently has{' '}
                  <strong>{deleteCat.transaction_count} recorded transaction(s)</strong>. To prevent orphaned financial records, please choose a category below to reassign existing transactions to, or archive this category instead.
                </p>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Reassign Existing Transactions To:
                  </label>
                  <select
                    value={reassignId}
                    onChange={(e) => setReassignId(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white"
                  >
                    {categories
                      .filter(
                        (c) =>
                          c.category_type === deleteCat.category_type &&
                          c.id !== deleteCat.id &&
                          !c.is_archived
                      )
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-600">
                "{deleteCat.name}" has 0 linked transactions and can be deleted safely.
              </p>
            )}

            <div className="pt-2 flex flex-wrap justify-end gap-2">
              <button
                onClick={() => setDeleteCat(null)}
                className="px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => handleSafeDelete(true)}
                className="inline-flex items-center gap-1 px-3.5 py-2 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-900 text-xs font-semibold cursor-pointer"
              >
                <Archive className="w-3.5 h-3.5" />
                <span>Archive Instead</span>
              </button>
              <button
                onClick={() => handleSafeDelete(false)}
                className="px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold cursor-pointer"
              >
                {deleteCat.transaction_count > 0
                  ? 'Reassign & Delete'
                  : 'Delete Category'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
