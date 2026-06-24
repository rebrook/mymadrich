import { useState, useEffect, useCallback } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import Modal from '../ui/Modal';

export default function ServiceElementsSection({
  elements,
  onCreateElement,
  onDeleteElement,
  onReorderElements,
  onApplyDefaults,
}) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [applying, setApplying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const [form, setForm] = useState({
    category: '',
    customCategory: '',
    label: '',
  });

  // Derive category order from element sort_orders.
  // Category with the lowest min(sort_order) comes first.
  const deriveOrder = useCallback(() => {
    const catMin = {};
    elements.forEach((el) => {
      if (!(el.category in catMin) || el.sort_order < catMin[el.category]) {
        catMin[el.category] = el.sort_order;
      }
    });
    return Object.keys(catMin).sort((a, b) => catMin[a] - catMin[b]);
  }, [elements]);

  const [categoryOrder, setCategoryOrder] = useState([]);

  useEffect(() => {
    setCategoryOrder(deriveOrder());
  }, [deriveOrder]);

  // Group elements by category, sorted within each group
  const grouped = {};
  elements.forEach((el) => {
    if (!grouped[el.category]) grouped[el.category] = [];
    grouped[el.category].push(el);
  });
  Object.values(grouped).forEach((arr) => arr.sort((a, b) => a.sort_order - b.sort_order));

  // Known categories for the add form dropdown
  const knownCategories = ['blessings', 'service_parts', 'prayers'];
  const allCategories = [...new Set([...knownCategories, ...categoryOrder])].sort();

  // Sensors for drag-and-drop
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Recalculate all sort_orders based on current category order and element positions
  function computeGlobalSortOrders(catOrder, groups) {
    const updates = [];
    let globalIndex = 1;
    catOrder.forEach((cat) => {
      const items = groups[cat] || [];
      items.forEach((el) => {
        updates.push({ id: el.id, sort_order: globalIndex });
        globalIndex++;
      });
    });
    return updates;
  }

  async function handleCategoryDragEnd(event) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = categoryOrder.indexOf(active.id);
    const newIndex = categoryOrder.indexOf(over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const newOrder = arrayMove(categoryOrder, oldIndex, newIndex);
    setCategoryOrder(newOrder);

    // Recalculate all sort_orders and save
    const updates = computeGlobalSortOrders(newOrder, grouped);
    try {
      await onReorderElements(updates);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleElementDragEnd(category, event) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const items = grouped[category];
    const oldIndex = items.findIndex((el) => el.id === active.id);
    const newIndex = items.findIndex((el) => el.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    // Reorder within the category
    const reorderedGroup = arrayMove(items, oldIndex, newIndex);
    const updatedGroups = { ...grouped, [category]: reorderedGroup };

    // Recalculate all sort_orders
    const updates = computeGlobalSortOrders(categoryOrder, updatedGroups);
    try {
      await onReorderElements(updates);
    } catch (err) {
      setError(err.message);
    }
  }

  function resetForm() {
    setForm({ category: '', customCategory: '', label: '' });
    setShowAddForm(false);
    setError(null);
  }

  async function handleAdd() {
    const category = form.category === '__custom__'
      ? form.customCategory.trim()
      : form.category;

    if (!category) {
      setError('Category is required.');
      return;
    }
    if (!form.label.trim()) {
      setError('Label is required.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const maxSort = elements.reduce((max, e) => Math.max(max, e.sort_order), 0);
      await onCreateElement({
        category,
        label: form.label.trim(),
        sort_order: maxSort + 1,
      });
      resetForm();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    setError(null);
    try {
      await onDeleteElement(id);
      setDeletingId(null);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleApplyDefaults() {
    setApplying(true);
    setError(null);
    try {
      await onApplyDefaults();
    } catch (err) {
      setError(err.message);
    } finally {
      setApplying(false);
    }
  }

  function formatCategory(cat) {
    return cat.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
  }

  const addFooter = (
    <>
      <button className="btn btn-outline" onClick={resetForm}>Cancel</button>
      <button className="btn btn-primary" onClick={handleAdd} disabled={saving}>
        {saving ? 'Saving...' : 'Add Element'}
      </button>
    </>
  );

  return (
    <div className="card">
      <div className="section-header">
        <h3>Service Elements</h3>
        <div className="action-buttons">
          {elements.length === 0 && (
            <button
              className="btn btn-outline btn-small"
              onClick={handleApplyDefaults}
              disabled={applying}
            >
              {applying ? 'Applying...' : 'Apply Default Template'}
            </button>
          )}
          <button className="btn btn-primary btn-small" onClick={() => setShowAddForm(true)}>
            Add Element
          </button>
        </div>
      </div>

      {error && <div className="alert alert-error" style={{ marginTop: 'var(--space-3)' }}>{error}</div>}

      {elements.length === 0 ? (
        <div className="empty-state">
          <p>No service elements assigned. Use "Apply Default Template" to add the standard blessings and D'var Torah, or add elements individually.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', marginTop: 'var(--space-4)' }}>

          {/* Category order (drag to reorder groups) */}
          {categoryOrder.length > 1 && (
            <div className="category-order-section">
              <span className="form-label">Category Order</span>
              <span className="form-hint" style={{ marginLeft: 'var(--space-2)' }}>
                Drag to reorder groups
              </span>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleCategoryDragEnd}
              >
                <SortableContext
                  items={categoryOrder}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="category-order-list">
                    {categoryOrder.map((cat) => (
                      <SortableCategory
                        key={cat}
                        id={cat}
                        label={formatCategory(cat)}
                        count={grouped[cat]?.length || 0}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </div>
          )}

          {/* Element list grouped by category (drag to reorder within) */}
          {categoryOrder.map((cat) => (
            <div key={cat}>
              <h4 style={{ marginBottom: 'var(--space-2)', color: 'var(--color-text-secondary)' }}>
                {formatCategory(cat)}
              </h4>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={(event) => handleElementDragEnd(cat, event)}
              >
                <SortableContext
                  items={(grouped[cat] || []).map((el) => el.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="element-list">
                    {(grouped[cat] || []).map((el) => (
                      <SortableElement
                        key={el.id}
                        element={el}
                        onDelete={() => setDeletingId(el.id)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </div>
          ))}
        </div>
      )}

      {/* Delete confirmation */}
      {deletingId && (
        <Modal
          title="Remove Element"
          onClose={() => setDeletingId(null)}
          footer={
            <>
              <button className="btn btn-outline" onClick={() => setDeletingId(null)}>Cancel</button>
              <button className="btn btn-primary" style={{ backgroundColor: 'var(--color-error)' }} onClick={() => handleDelete(deletingId)}>
                Remove Element
              </button>
            </>
          }
        >
          <p>This will remove the service element and any associated progress data. This cannot be undone.</p>
        </Modal>
      )}

      {/* Add element form */}
      {showAddForm && (
        <Modal title="Add Service Element" onClose={resetForm} footer={addFooter}>
          {error && <div className="alert alert-error">{error}</div>}
          <div className="form-group">
            <label className="form-label">Category *</label>
            <select
              className="input"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            >
              <option value="">Select a category...</option>
              {allCategories.map((c) => (
                <option key={c} value={c}>{formatCategory(c)}</option>
              ))}
              <option value="__custom__">Other (enter custom)...</option>
            </select>
          </div>
          {form.category === '__custom__' && (
            <div className="form-group">
              <label className="form-label">Custom Category *</label>
              <input
                className="input"
                value={form.customCategory}
                onChange={(e) => setForm({ ...form, customCategory: e.target.value })}
                placeholder="e.g., prayers, songs"
              />
            </div>
          )}
          <div className="form-group">
            <label className="form-label">Label *</label>
            <input
              className="input"
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              placeholder="e.g., Torah blessing (before)"
            />
          </div>
        </Modal>
      )}
    </div>
  );
}

/**
 * A draggable category chip in the category order list.
 */
function SortableCategory({ id, label, count }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : 'auto',
  };

  return (
    <div ref={setNodeRef} style={style} className="category-order-item" {...attributes} {...listeners}>
      <span className="drag-handle">&#x2630;</span>
      <span className="category-order-label">{label}</span>
      <span className="form-hint">({count})</span>
    </div>
  );
}

/**
 * A draggable service element row within a category.
 */
function SortableElement({ element, onDelete }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: element.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : 'auto',
  };

  return (
    <div ref={setNodeRef} style={style} className="element-item">
      <div className="element-item-left">
        <span className="drag-handle" {...attributes} {...listeners}>
          &#x2630;
        </span>
        <span>{element.label}</span>
      </div>
      <button
        className="btn btn-small btn-danger-outline"
        onClick={onDelete}
      >
        Remove
      </button>
    </div>
  );
}
