<template>
  <div class="restocking">
    <div class="page-header">
      <h2>Restocking</h2>
      <p>Select items to restock based on demand forecasts</p>
    </div>

    <!-- Success confirmation state -->
    <div v-if="confirmedOrder" class="card success-card">
      <div class="success-header">
        <div class="success-icon-wrap">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </div>
        <div>
          <h3 class="success-title">Order Placed</h3>
          <p class="success-subtitle">Your restocking order has been submitted successfully.</p>
        </div>
      </div>
      <div class="confirmed-details">
        <div class="confirmed-row">
          <span class="confirmed-label">Order Number</span>
          <span class="confirmed-value">{{ confirmedOrder.order_number }}</span>
        </div>
        <div class="confirmed-row">
          <span class="confirmed-label">Expected Delivery</span>
          <span class="confirmed-value">{{ formatDate(confirmedOrder.expected_delivery) }}</span>
        </div>
        <div class="confirmed-row">
          <span class="confirmed-label">Total Value</span>
          <span class="confirmed-value total-value">{{ formatCurrency(confirmedOrder.total_value) }}</span>
        </div>
      </div>
      <button class="btn-secondary" @click="resetForm">Place Another Order</button>
    </div>

    <!-- Main ordering UI -->
    <template v-else>
      <div v-if="loading" class="loading">Loading demand forecasts...</div>
      <div v-else-if="error" class="error">{{ error }}</div>
      <template v-else>

        <!-- Budget card -->
        <div class="card budget-card">
          <div class="budget-header">
            <div class="budget-label-row">
              <span class="budget-label">Budget</span>
              <span class="budget-amount">{{ formatCurrency(budget) }}</span>
            </div>
            <input
              type="range"
              class="budget-slider"
              min="0"
              max="500000"
              step="5000"
              v-model.number="budget"
            />
          </div>
          <div class="budget-bar-wrap">
            <div
              class="budget-bar-fill"
              :class="totalCost > budget ? 'over' : 'under'"
              :style="{ width: Math.min(usagePercent, 100) + '%' }"
            ></div>
          </div>
          <div class="budget-status" :class="totalCost > budget ? 'status-over' : 'status-under'">
            <template v-if="totalCost > budget">
              Over budget by {{ formatCurrency(totalCost - budget) }}
            </template>
            <template v-else>
              Remaining: {{ formatCurrency(budget - totalCost) }}
            </template>
          </div>
        </div>

        <!-- Forecast checklist table -->
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Demand Forecasts</h3>
            <span class="selected-count" v-if="selectedIds.size > 0">
              {{ selectedIds.size }} item{{ selectedIds.size === 1 ? '' : 's' }} selected
            </span>
          </div>
          <div class="table-container">
            <table>
              <thead>
                <tr>
                  <th class="col-check"></th>
                  <th>Item Name</th>
                  <th>SKU</th>
                  <th>Trend</th>
                  <th class="col-num">Current Demand</th>
                  <th class="col-num">Forecasted Demand</th>
                  <th class="col-num">Qty to Order</th>
                  <th class="col-num">Unit Cost</th>
                  <th class="col-num">Line Total</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="forecast in forecasts"
                  :key="forecast.id"
                  :class="{ dimmed: isRowDimmed(forecast), selected: selectedIds.has(forecast.id) }"
                  @click="toggleItem(forecast)"
                >
                  <td class="col-check" @click.stop>
                    <input
                      type="checkbox"
                      :checked="selectedIds.has(forecast.id)"
                      :disabled="isRowDimmed(forecast)"
                      @change="toggleItem(forecast)"
                    />
                  </td>
                  <td class="item-name-cell">{{ forecast.item_name }}</td>
                  <td><code class="sku">{{ forecast.item_sku }}</code></td>
                  <td>
                    <span :class="['badge', forecast.trend]">{{ forecast.trend }}</span>
                  </td>
                  <td class="col-num">{{ forecast.current_demand }}</td>
                  <td class="col-num"><strong>{{ forecast.forecasted_demand }}</strong></td>
                  <td class="col-num" @click.stop>
                    <input
                      type="number"
                      class="qty-input"
                      :value="quantities[forecast.id]"
                      min="1"
                      :disabled="!selectedIds.has(forecast.id)"
                      @input="updateQuantity(forecast.id, $event.target.value)"
                    />
                  </td>
                  <td class="col-num">{{ formatCurrency(forecast.unit_cost) }}</td>
                  <td class="col-num line-total">
                    {{ formatCurrency((quantities[forecast.id] ?? 1) * forecast.unit_cost) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Footer action bar -->
          <div class="action-bar">
            <div class="action-summary">
              <template v-if="selectedIds.size > 0">
                <span class="action-count">{{ selectedIds.size }} item{{ selectedIds.size === 1 ? '' : 's' }} selected</span>
                <span class="action-dot">·</span>
                <span class="action-total" :class="totalCost > budget ? 'over-budget' : ''">
                  Total: {{ formatCurrency(totalCost) }}
                </span>
              </template>
              <span v-else class="action-empty">No items selected</span>
            </div>
            <button
              class="btn-primary"
              :disabled="selectedIds.size === 0 || totalCost > budget || submitting"
              @click="placeOrder"
            >
              <span v-if="submitting">Placing Order...</span>
              <span v-else>Place Order</span>
            </button>
          </div>
        </div>

      </template>
    </template>
  </div>
</template>

<script>
import { ref, computed, onMounted } from 'vue'
import { api } from '../api'

export default {
  name: 'Restocking',
  setup() {
    const budget = ref(100000)
    const forecasts = ref([])
    const selectedIds = ref(new Set())
    const quantities = ref({})
    const loading = ref(true)
    const submitting = ref(false)
    const error = ref(null)
    const confirmedOrder = ref(null)

    const formatCurrency = (val) =>
      Number(val).toLocaleString('en-US', { style: 'currency', currency: 'USD' })

    const formatDate = (str) =>
      str ? new Date(str).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : ''

    const totalCost = computed(() => {
      let sum = 0
      for (const id of selectedIds.value) {
        const f = forecasts.value.find(x => x.id === id)
        if (f) sum += (quantities.value[id] ?? 1) * f.unit_cost
      }
      return sum
    })

    const usagePercent = computed(() => {
      if (budget.value === 0) return totalCost.value > 0 ? 100 : 0
      return (totalCost.value / budget.value) * 100
    })

    const isRowDimmed = (forecast) => {
      if (selectedIds.value.has(forecast.id)) return false
      const lineTotal = (quantities.value[forecast.id] ?? 1) * forecast.unit_cost
      return totalCost.value + lineTotal > budget.value
    }

    const toggleItem = (forecast) => {
      const next = new Set(selectedIds.value)
      if (next.has(forecast.id)) {
        next.delete(forecast.id)
      } else {
        if (!isRowDimmed(forecast)) {
          next.add(forecast.id)
          if (quantities.value[forecast.id] == null) {
            quantities.value[forecast.id] = Math.max(
              forecast.forecasted_demand - forecast.current_demand,
              1
            )
          }
        }
      }
      selectedIds.value = next
    }

    const updateQuantity = (id, val) => {
      const n = parseInt(val, 10)
      quantities.value = { ...quantities.value, [id]: isNaN(n) || n < 1 ? 1 : n }
    }

    const loadForecasts = async () => {
      loading.value = true
      error.value = null
      try {
        const data = await api.getDemandForecasts()
        forecasts.value = data
        const qs = {}
        for (const f of data) {
          qs[f.id] = Math.max(f.forecasted_demand - f.current_demand, 1)
        }
        quantities.value = qs
      } catch (err) {
        error.value = 'Failed to load demand forecasts'
        console.error(err)
      } finally {
        loading.value = false
      }
    }

    const placeOrder = async () => {
      if (selectedIds.value.size === 0 || totalCost.value > budget.value || submitting.value) return
      submitting.value = true
      error.value = null
      try {
        const items = [...selectedIds.value].map(id => {
          const f = forecasts.value.find(x => x.id === id)
          return {
            item_sku: f.item_sku,
            item_name: f.item_name,
            quantity: quantities.value[id],
            unit_cost: f.unit_cost,
            trend: f.trend
          }
        })
        const result = await api.submitRestockingOrder(items)
        confirmedOrder.value = result
        selectedIds.value = new Set()
      } catch (err) {
        error.value = 'Failed to place order. Please try again.'
        console.error(err)
      } finally {
        submitting.value = false
      }
    }

    const resetForm = () => {
      confirmedOrder.value = null
      selectedIds.value = new Set()
      budget.value = 100000
      loadForecasts()
    }

    onMounted(loadForecasts)

    return {
      budget,
      forecasts,
      selectedIds,
      quantities,
      loading,
      submitting,
      error,
      confirmedOrder,
      totalCost,
      usagePercent,
      formatCurrency,
      formatDate,
      isRowDimmed,
      toggleItem,
      updateQuantity,
      placeOrder,
      resetForm
    }
  }
}
</script>

<style scoped>
.restocking {
  padding-bottom: 2rem;
}

/* Budget card */
.budget-card {
  margin-bottom: 1.25rem;
}

.budget-header {
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
}

.budget-label-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.budget-label {
  font-size: 0.875rem;
  font-weight: 600;
  color: #475569;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.budget-amount {
  font-size: 1.5rem;
  font-weight: 700;
  color: #0f172a;
  letter-spacing: -0.025em;
}

.budget-slider {
  width: 100%;
  accent-color: #2563eb;
  cursor: pointer;
  height: 6px;
}

.budget-bar-wrap {
  height: 6px;
  background: #e2e8f0;
  border-radius: 3px;
  margin-top: 0.625rem;
  overflow: hidden;
}

.budget-bar-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.2s ease, background-color 0.2s ease;
}

.budget-bar-fill.under {
  background: #10b981;
}

.budget-bar-fill.over {
  background: #ef4444;
}

.budget-status {
  margin-top: 0.375rem;
  font-size: 0.813rem;
  font-weight: 500;
}

.status-under {
  color: #059669;
}

.status-over {
  color: #dc2626;
}

/* Table row states */
.selected-count {
  font-size: 0.813rem;
  font-weight: 600;
  color: #2563eb;
  background: #eff6ff;
  padding: 0.25rem 0.625rem;
  border-radius: 6px;
}

tbody tr {
  cursor: pointer;
}

tbody tr.dimmed {
  opacity: 0.4;
  pointer-events: none;
}

tbody tr.dimmed input[type="checkbox"] {
  pointer-events: none;
}

tbody tr.selected {
  background: #f0f9ff;
}

tbody tr.selected:hover {
  background: #e0f2fe;
}

.col-check {
  width: 40px;
  text-align: center;
}

.col-num {
  text-align: right;
}

.item-name-cell {
  font-weight: 500;
  color: #0f172a;
}

.sku {
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 0.8rem;
  color: #475569;
  background: #f1f5f9;
  padding: 0.125rem 0.375rem;
  border-radius: 4px;
}

.qty-input {
  width: 72px;
  padding: 0.25rem 0.375rem;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  font-size: 0.875rem;
  text-align: right;
  color: #0f172a;
  background: white;
  transition: border-color 0.15s;
}

.qty-input:focus {
  outline: none;
  border-color: #2563eb;
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.1);
}

.qty-input:disabled {
  background: #f8fafc;
  color: #94a3b8;
  cursor: not-allowed;
}

.line-total {
  font-weight: 600;
  color: #0f172a;
}

/* Action bar */
.action-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 0.75rem 0;
  margin-top: 0.75rem;
  border-top: 1px solid #e2e8f0;
}

.action-summary {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
}

.action-count {
  font-weight: 600;
  color: #0f172a;
}

.action-dot {
  color: #94a3b8;
}

.action-total {
  font-weight: 600;
  color: #059669;
}

.action-total.over-budget {
  color: #dc2626;
}

.action-empty {
  color: #94a3b8;
}

/* Buttons */
.btn-primary {
  padding: 0.625rem 1.5rem;
  background: #2563eb;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, opacity 0.15s;
  white-space: nowrap;
}

.btn-primary:hover:not(:disabled) {
  background: #1d4ed8;
}

.btn-primary:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.btn-secondary {
  margin-top: 1.5rem;
  padding: 0.625rem 1.5rem;
  background: white;
  color: #0f172a;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}

.btn-secondary:hover {
  background: #f8fafc;
  border-color: #cbd5e1;
}

/* Success card */
.success-card {
  max-width: 560px;
}

.success-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1.5rem;
  padding-bottom: 1.25rem;
  border-bottom: 1px solid #e2e8f0;
}

.success-icon-wrap {
  width: 56px;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: #d1fae5;
  color: #059669;
  flex-shrink: 0;
}

.success-title {
  font-size: 1.25rem;
  font-weight: 700;
  color: #0f172a;
  margin-bottom: 0.25rem;
}

.success-subtitle {
  font-size: 0.875rem;
  color: #64748b;
}

.confirmed-details {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-bottom: 0.5rem;
}

.confirmed-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.625rem 0.875rem;
  background: #f8fafc;
  border-radius: 8px;
}

.confirmed-label {
  font-size: 0.813rem;
  font-weight: 600;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.confirmed-value {
  font-size: 0.938rem;
  font-weight: 600;
  color: #0f172a;
}

.confirmed-value.total-value {
  color: #059669;
  font-size: 1.125rem;
}
</style>
