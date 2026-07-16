<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import katex from 'katex'

const props = defineProps<{ latex: string }>()

const showPreview = ref(false)
const rendered = ref('')

onMounted(() => {
  try {
    rendered.value = katex.renderToString(props.latex, {
      throwOnError: false,
      displayMode: true,
      trust: true,
    })
  } catch {
    rendered.value = `<span class="katex-error">Error rendering LaTeX</span>`
  }
})

const hasError = computed(() => rendered.value.includes('katex-error'))
</script>

<template>
  <div class="katex-preview-wrapper">
    <button
      class="katex-toggle-btn"
      @click="showPreview = !showPreview"
    >
      {{ showPreview ? 'Hide Preview' : 'Show Preview' }}
    </button>
    <Transition name="katex-fade">
      <div v-if="showPreview && rendered" class="katex-preview-output">
        <div v-html="rendered" />
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.katex-preview-wrapper {
  margin: 0.5rem 0;
}

.katex-toggle-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.4em;
  padding: 0.35em 0.8em;
  border: 1px solid var(--katex-border, #ccc);
  border-radius: 6px;
  background: var(--katex-btn-bg, #f5f5f5);
  color: var(--katex-btn-text, #333);
  font-size: 0.85em;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}

.katex-toggle-btn:hover {
  background: var(--katex-btn-hover, #e8e8e8);
  border-color: var(--katex-btn-hover-border, #999);
}

.katex-preview-output {
  margin-top: 0.5rem;
  padding: 1rem;
  border: 1px solid var(--katex-border, #e0e0e0);
  border-radius: 8px;
  background: var(--katex-preview-bg, #fafafa);
  overflow-x: auto;
}

/* Dark mode support */
:root[data-theme='dark'] .katex-toggle-btn,
:root.dark .katex-toggle-btn,
.dark .katex-toggle-btn {
  --katex-border: #3a3a3a;
  --katex-btn-bg: #1e1e1e;
  --katex-btn-text: #e0e0e0;
  --katex-btn-hover: #2a2a2a;
  --katex-btn-hover-border: #555;
  --katex-preview-bg: #161616;
}

/* Fade transition */
.katex-fade-enter-active,
.katex-fade-leave-active {
  transition: opacity 0.2s ease;
}
.katex-fade-enter-from,
.katex-fade-leave-to {
  opacity: 0;
}
</style>
