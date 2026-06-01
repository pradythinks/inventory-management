<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="isOpen && backlogItem" class="modal-overlay" @click="close">
        <div class="modal-container" @click.stop>
          <div class="modal-header">
            <h3 class="modal-title">
              {{ mode === 'create' ? 'Create Purchase Order' : 'Purchase Order Details' }}
            </h3>
            <button class="close-button" @click="close">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M15 5L5 15M5 5L15 15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              </svg>
            </button>
          </div>

          <div class="modal-body">
            <!-- Item info banner (both modes) -->
            <div class="item-banner">
              <div class="item-banner-main">
                <div class="item-banner-name">{{ backlogItem.item_name }}</div>
                <div class="item-banner-sku">SKU: {{ backlogItem.item_sku }}</div>
              </div>
              <div v-if="mode === 'create'" class="item-banner-shortage">
                <div class="shortage-label">Shortage</div>
                <div class="shortage-value">{{ shortage }} units</div>
              </div>
            </div>

            <!-- CREATE MODE: Form -->
            <form v-if="mode === 'create'" class="po-form" @submit.prevent="submitForm">
              <div class="form-group">
                <label class="form-label" for="supplier-name">Supplier Name</label>
                <input
                  id="supplier-name"
                  v-model="form.supplierName"
                  type="text"
                  class="form-input"
                  placeholder="Enter supplier name"
                  required
                />
              </div>

              <div class="form-row">
                <div class="form-group">
                  <label class="form-label" for="quantity">Quantity</label>
                  <input
                    id="quantity"
                    v-model.number="form.quantity"
                    type="number"
                    class="form-input"
                    min="1"
                    required
                  />
                </div>

                <div class="form-group">
                  <label class="form-label" for="unit-cost">Unit Cost (USD)</label>
                  <input
                    id="unit-cost"
                    v-model.number="form.unitCost"
                    type="number"
                    class="form-input"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    required
                  />
                </div>
              </div>

              <div class="form-group">
                <label class="form-label" for="delivery-date">Expected Delivery Date</label>
                <input
                  id="delivery-date"
                  v-model="form.expectedDeliveryDate"
                  type="date"
                  class="form-input"
                  required
                />
              </div>

              <div class="form-group">
                <label class="form-label" for="notes">Notes (optional)</label>
                <textarea
                  id="notes"
                  v-model="form.notes"
                  class="form-textarea"
                  placeholder="Add any notes or special instructions..."
                  rows="3"
                ></textarea>
              </div>

              <!-- Total cost computed display -->
              <div class="total-cost-row">
                <span class="total-cost-label">Total Cost</span>
                <span class="total-cost-value">{{ formattedTotalCost }}</span>
              </div>
            </form>

            <!-- VIEW MODE: PO details -->
            <div v-else-if="mode === 'view' && po" class="po-details">
              <div class="po-id-row">
                <span class="po-id">{{ po.id }}</span>
                <span class="status-badge" :class="statusClass(po.status)">{{ po.status }}</span>
              </div>

              <div class="details-grid">
                <div class="detail-item">
                  <div class="detail-label">Supplier</div>
                  <div class="detail-value">{{ po.supplier_name }}</div>
                </div>

                <div class="detail-item">
                  <div class="detail-label">Quantity</div>
                  <div class="detail-value">{{ po.quantity }} units</div>
                </div>

                <div class="detail-item">
                  <div class="detail-label">Unit Cost</div>
                  <div class="detail-value">{{ formatCurrency(po.unit_cost) }}</div>
                </div>

                <div class="detail-item">
                  <div class="detail-label">Total Cost</div>
                  <div class="detail-value highlight">{{ formatCurrency(po.quantity * po.unit_cost) }}</div>
                </div>

                <div class="detail-item">
                  <div class="detail-label">Expected Delivery</div>
                  <div class="detail-value">{{ formatDate(po.expected_delivery_date) }}</div>
                </div>

                <div class="detail-item">
                  <div class="detail-label">Created</div>
                  <div class="detail-value">{{ formatDate(po.created_date) }}</div>
                </div>

                <div v-if="po.notes" class="detail-item detail-item--full">
                  <div class="detail-label">Notes</div>
                  <div class="detail-value">{{ po.notes }}</div>
                </div>
              </div>
            </div>
          </div>

          <div class="modal-footer">
            <template v-if="mode === 'create'">
              <button class="btn-secondary" type="button" @click="close">Cancel</button>
              <button
                class="btn-primary"
                type="button"
                :disabled="submitting"
                @click="submitForm"
              >
                <span v-if="submitting" class="spinner"></span>
                <span>{{ submitting ? 'Creating...' : 'Create Purchase Order' }}</span>
              </button>
            </template>
            <template v-else>
              <button class="btn-secondary" type="button" @click="close">Close</button>
            </template>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { api } from '../api'

const props = defineProps({
  isOpen: {
    type: Boolean,
    default: false
  },
  backlogItem: {
    type: Object,
    default: null
  },
  mode: {
    type: String,
    default: 'create'
  }
})

const emit = defineEmits(['close', 'po-created'])

const submitting = ref(false)
const error = ref(null)

const form = ref({
  supplierName: '',
  quantity: 0,
  unitCost: null,
  expectedDeliveryDate: '',
  notes: ''
})

// Pre-fill quantity with shortage amount whenever modal opens in create mode
watch(
  () => [props.isOpen, props.backlogItem],
  ([isOpen, item]) => {
    if (isOpen && item && props.mode === 'create') {
      form.value = {
        supplierName: '',
        quantity: Math.max(0, (item.quantity_needed || 0) - (item.quantity_available || 0)),
        unitCost: null,
        expectedDeliveryDate: '',
        notes: ''
      }
      error.value = null
    }
  },
  { immediate: true }
)

const shortage = computed(() => {
  if (!props.backlogItem) return 0
  return Math.max(0, props.backlogItem.quantity_needed - props.backlogItem.quantity_available)
})

// PO object in view mode (from backlogItem.purchase_order)
const po = computed(() => {
  if (props.mode === 'view' && props.backlogItem) {
    return props.backlogItem.purchase_order || null
  }
  return null
})

const totalCost = computed(() => {
  const qty = Number(form.value.quantity) || 0
  const cost = Number(form.value.unitCost) || 0
  return qty * cost
})

const formattedTotalCost = computed(() => formatCurrency(totalCost.value))

const close = () => {
  emit('close')
}

const submitForm = async () => {
  if (submitting.value) return
  submitting.value = true
  error.value = null

  try {
    const payload = {
      backlog_item_id: props.backlogItem.id,
      supplier_name: form.value.supplierName,
      quantity: form.value.quantity,
      unit_cost: form.value.unitCost,
      expected_delivery_date: form.value.expectedDeliveryDate,
      notes: form.value.notes || null
    }
    const response = await api.createPurchaseOrder(payload)
    emit('po-created', response)
  } catch (err) {
    error.value = 'Failed to create purchase order. Please try again.'
    console.error('PO creation error:', err)
  } finally {
    submitting.value = false
  }
}

// Helpers
const formatDate = (dateString) => {
  if (!dateString) return 'N/A'
  const date = new Date(dateString)
  if (isNaN(date.getTime())) return 'N/A'
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

const formatCurrency = (value) => {
  if (value == null || isNaN(value)) return '$0.00'
  return Number(value).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

const statusClass = (status) => {
  if (!status) return ''
  const s = status.toLowerCase()
  if (s === 'pending') return 'status-pending'
  if (s === 'approved') return 'status-approved'
  if (s === 'completed') return 'status-completed'
  return ''
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  padding: 1rem;
}

.modal-container {
  background: white;
  border-radius: 12px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.15);
  max-width: 600px;
  width: 100%;
  max-height: 90vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.5rem;
  border-bottom: 1px solid #e2e8f0;
}

.modal-title {
  font-size: 1.25rem;
  font-weight: 700;
  color: #0f172a;
  letter-spacing: -0.025em;
}

.close-button {
  background: none;
  border: none;
  color: #64748b;
  cursor: pointer;
  padding: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  transition: all 0.15s ease;
}

.close-button:hover {
  background: #f1f5f9;
  color: #0f172a;
}

.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 2rem;
}

.modal-footer {
  padding: 1.5rem;
  border-top: 1px solid #e2e8f0;
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
}

/* Item banner */
.item-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  margin-bottom: 1.75rem;
}

.item-banner-name {
  font-size: 1rem;
  font-weight: 600;
  color: #0f172a;
  margin-bottom: 0.25rem;
}

.item-banner-sku {
  font-size: 0.813rem;
  color: #64748b;
  font-family: 'Monaco', 'Courier New', monospace;
}

.item-banner-shortage {
  text-align: right;
  flex-shrink: 0;
}

.shortage-label {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #64748b;
  margin-bottom: 0.25rem;
}

.shortage-value {
  font-size: 1.25rem;
  font-weight: 700;
  color: #dc2626;
}

/* Form */
.po-form {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.form-label {
  font-size: 0.813rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #64748b;
}

.form-input,
.form-textarea {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 0.625rem 0.875rem;
  font-size: 0.938rem;
  color: #0f172a;
  background: white;
  font-family: inherit;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
  width: 100%;
  box-sizing: border-box;
}

.form-input:focus,
.form-textarea:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.form-textarea {
  resize: vertical;
  min-height: 80px;
}

.total-cost-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 10px;
}

.total-cost-label {
  font-size: 0.875rem;
  font-weight: 600;
  color: #1e40af;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.total-cost-value {
  font-size: 1.375rem;
  font-weight: 700;
  color: #1d4ed8;
}

/* View mode: PO details */
.po-id-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1.5rem;
}

.po-id {
  font-family: 'Monaco', 'Courier New', monospace;
  font-size: 0.938rem;
  color: #2563eb;
  font-weight: 600;
}

.status-badge {
  padding: 0.375rem 0.875rem;
  border-radius: 6px;
  font-size: 0.813rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.025em;
}

.status-pending {
  background: #fef9c3;
  color: #854d0e;
}

.status-approved {
  background: #dcfce7;
  color: #166534;
}

.status-completed {
  background: #f1f5f9;
  color: #475569;
}

.details-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 1.25rem;
}

.detail-item {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

/* Allow notes to span full width */
.detail-item--full {
  grid-column: 1 / -1;
}

.detail-label {
  font-size: 0.813rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #64748b;
}

.detail-value {
  font-size: 0.938rem;
  color: #0f172a;
  font-weight: 500;
}

.detail-value.highlight {
  font-size: 1.125rem;
  font-weight: 700;
  color: #1d4ed8;
}

/* Buttons */
.btn-primary {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 1.25rem;
  background: #3b82f6;
  border: none;
  border-radius: 8px;
  font-weight: 600;
  font-size: 0.875rem;
  color: white;
  cursor: pointer;
  transition: all 0.15s ease;
  font-family: inherit;
}

.btn-primary:hover:not(:disabled) {
  background: #2563eb;
}

.btn-primary:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.btn-secondary {
  padding: 0.625rem 1.25rem;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-weight: 500;
  font-size: 0.875rem;
  color: #334155;
  cursor: pointer;
  transition: all 0.15s ease;
  font-family: inherit;
}

.btn-secondary:hover {
  background: #e2e8f0;
  border-color: #cbd5e1;
}

/* Loading spinner */
.spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.4);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
  flex-shrink: 0;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Modal transition */
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-active .modal-container,
.modal-leave-active .modal-container {
  transition: transform 0.2s ease;
}

.modal-enter-from .modal-container,
.modal-leave-to .modal-container {
  transform: scale(0.95);
}
</style>
