<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import ChatMessage from './chat/ChatMessage.vue'
import ChatInput from './chat/ChatInput.vue'
import TypingIndicator from './chat/TypingIndicator.vue'
import AttachedDocsBar from './chat/AttachedDocsBar.vue'
import QuickPrompts from './chat/QuickPrompts.vue'
import EditableLabel from './ui/EditableLabel.vue'
import { useChat } from '@/composables/useChat'
import { useSettings } from '@/composables/useSettings'
import { useThreads } from '@/composables/useThreads'
import { useDocuments } from '@/composables/useDocuments'
import { useToasts } from '@/composables/useToasts'
import { useDrawers } from '@/composables/useDrawers'
import { useResponsive } from '@/composables/useResponsive'
import { buildThreadMarkdown, downloadMarkdown, slugify } from '@/lib/exportThread'

const { messages, isTyping, isStreaming, send, clear, abort } = useChat()
const { provider, apiKey, model, modelPlaceholder, modelHint } = useSettings()
const { activeThread, rename: renameThread } = useThreads()
const { documents } = useDocuments()
const { show: showToast } = useToasts()
const drawers = useDrawers()
const { isPhone } = useResponsive()

const showSettings = ref(false)
const showApiKey = ref(false)
const chatContainer = ref<HTMLElement | null>(null)
const inputRef = ref<InstanceType<typeof ChatInput> | null>(null)
const isReady = computed(() => !!apiKey.value)

function focusInput() {
  inputRef.value?.focus()
}
defineExpose({ focusInput })

// Mobile-aware shell classes. At md+, the panel renders as a static w-96
// column exactly as before. Below md, it becomes a transformed overlay —
// right-slide drawer on tablets, bottom sheet on phones.
const shellClasses = computed(() => {
  const base = [
    'bg-white dark:bg-zinc-900 flex flex-col',
    // Mobile overlay: fixed, transformed off-screen, transitions on open.
    'fixed z-40 transform transition-transform duration-200 will-change-transform',
    // Tablet drawer: right slide.
    'inset-y-0 right-0 w-96 max-w-[85vw] border-l border-zinc-200 dark:border-zinc-800',
    drawers.right.value ? 'translate-x-0' : 'translate-x-full',
    // Phone bottom sheet override: full width, ~85vh tall, rounded top.
    'max-sm:inset-x-0 max-sm:right-0 max-sm:left-0 max-sm:top-auto max-sm:bottom-0',
    'max-sm:w-full max-sm:max-w-none max-sm:h-[85vh] max-sm:rounded-t-2xl max-sm:border-l-0',
    'max-sm:shadow-2xl',
    drawers.right.value
      ? 'max-sm:translate-x-0 max-sm:translate-y-0'
      : 'max-sm:translate-x-0 max-sm:translate-y-full',
    // Desktop reset.
    'md:static md:z-auto md:translate-x-0 md:w-96 md:max-w-none md:h-auto md:rounded-none md:shadow-none md:border-l md:transition-none',
  ]
  return base
})

const headerLabel = computed(() => {
  const t = activeThread.value
  if (!t) return 'Chat'
  if (t.name) return t.name
  const first = t.docIds[0] != null ? documents.value.find((d) => d.id === t.docIds[0]) : null
  return first?.name ?? 'Untitled chat'
})

const emptyStateNudge = computed(() => {
  const t = activeThread.value
  if (!t) return 'Import a PDF or pick a thread to begin'
  const names = t.docIds
    .map((id) => documents.value.find((d) => d.id === id)?.name)
    .filter((x): x is string => !!x)
  if (names.length === 0) return 'No documents attached. Add one with the + button above.'
  if (names.length === 1) return `Ask anything about ${names[0]}`
  return `Ask anything about ${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
})

function scrollToBottom() {
  void nextTick(() => {
    const el = chatContainer.value
    if (el) el.scrollTop = el.scrollHeight
  })
}
watch([messages, isTyping], scrollToBottom, { deep: true })

async function onSend(text: string) {
  await send(text)
}

async function onRenameThread(name: string) {
  if (activeThread.value) await renameThread(activeThread.value.id!, name)
}

function onExport() {
  const t = activeThread.value
  if (!t || messages.value.length === 0) return
  const md = buildThreadMarkdown(t, [...messages.value], documents.value)
  const date = new Date().toISOString().slice(0, 10)
  const name = `notebook-${slugify(headerLabel.value)}-${date}.md`
  downloadMarkdown(name, md)
  showToast('Chat exported', 'success')
}
</script>

<template>
  <section :class="shellClasses">
    <!-- Phone-only sheet grip handle -->
    <div
      v-if="isPhone"
      class="md:hidden flex justify-center py-1.5 cursor-grab"
      @click="drawers.closeAll"
      aria-hidden="true"
    >
      <span class="block w-10 h-1 rounded-full bg-zinc-300 dark:bg-zinc-700"></span>
    </div>
    <div
      class="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50 dark:bg-zinc-900"
    >
      <div class="flex items-center gap-2 min-w-0">
        <i class="fa-solid fa-comments text-indigo-500 flex-shrink-0"></i>
        <EditableLabel
          v-if="activeThread"
          class="font-semibold text-sm truncate flex-1"
          :model-value="headerLabel"
          @commit="onRenameThread"
        />
        <span v-else class="font-semibold text-sm truncate">{{ headerLabel }}</span>
        <span
          v-if="isReady"
          class="flex items-center gap-1 text-[10px] text-emerald-500 font-medium ml-1 flex-shrink-0"
        >
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 pulse-dot inline-block"></span>Ready
        </span>
        <span
          v-else
          class="flex items-center gap-1 text-[10px] text-zinc-400 font-medium ml-1 flex-shrink-0"
        >
          <span class="w-1.5 h-1.5 rounded-full bg-zinc-400 inline-block"></span>No key
        </span>
      </div>
      <div class="flex items-center gap-1 flex-shrink-0">
        <button
          class="p-2 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 transition text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 disabled:opacity-40 disabled:cursor-not-allowed"
          title="Export chat as markdown"
          :disabled="messages.length === 0"
          @click="onExport"
        >
          <i class="fa-solid fa-download text-xs"></i>
        </button>
        <button
          class="p-2 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 transition text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
          title="Clear chat"
          @click="clear"
        >
          <i class="fa-solid fa-trash-can text-xs"></i>
        </button>
        <button
          :class="[
            'p-2 rounded-lg transition',
            showSettings
              ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400'
              : 'hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300',
          ]"
          title="Settings"
          @click="showSettings = !showSettings"
        >
          <i class="fa-solid fa-gear text-xs"></i>
        </button>
        <button
          class="md:hidden p-2 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 transition text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
          aria-label="Close chat"
          @click="drawers.closeAll"
        >
          <i class="fa-solid fa-xmark text-xs"></i>
        </button>
      </div>
    </div>

    <div
      :class="[
        'settings-panel px-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50',
        { open: showSettings },
      ]"
    >
      <div class="space-y-3">
        <div>
          <label
            class="block text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1"
            >Provider</label
          >
          <div class="flex gap-2">
            <button
              :class="[
                'flex-1 py-2 px-3 text-xs font-medium rounded-lg border transition',
                provider === 'openrouter'
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 hover:border-indigo-300 dark:hover:border-indigo-700',
              ]"
              @click="provider = 'openrouter'"
            >
              OpenRouter
            </button>
            <button
              :class="[
                'flex-1 py-2 px-3 text-xs font-medium rounded-lg border transition',
                provider === 'gemini'
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 hover:border-indigo-300 dark:hover:border-indigo-700',
              ]"
              @click="provider = 'gemini'"
            >
              Gemini
            </button>
          </div>
        </div>
        <div>
          <label
            class="block text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1"
            >API Key</label
          >
          <div class="relative">
            <input
              v-model="apiKey"
              :type="showApiKey ? 'text' : 'password'"
              placeholder="Enter your API key…"
              class="w-full p-2.5 pr-9 text-sm rounded-lg bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 outline-none transition"
            />
            <button
              class="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
              @click="showApiKey = !showApiKey"
            >
              <i :class="['fa-solid text-xs', showApiKey ? 'fa-eye-slash' : 'fa-eye']"></i>
            </button>
          </div>
        </div>
        <div>
          <label
            class="block text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1"
            >Model</label
          >
          <input
            v-model="model"
            :placeholder="modelPlaceholder"
            class="w-full p-2.5 text-sm rounded-lg bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 outline-none transition"
          />
          <p class="text-[10px] text-zinc-400 mt-1">{{ modelHint }}</p>
        </div>
      </div>
    </div>

    <AttachedDocsBar />

    <div
      id="chat-container"
      ref="chatContainer"
      class="flex-1 overflow-y-auto p-4 space-y-3"
    >
      <div
        v-if="messages.length === 0"
        class="flex flex-col items-center justify-center h-full text-center px-6"
      >
        <div
          class="w-14 h-14 rounded-2xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center mb-4"
        >
          <i class="fa-solid fa-robot text-indigo-500 text-xl"></i>
        </div>
        <p class="text-sm font-medium text-zinc-600 dark:text-zinc-300 mb-1">Ask me anything</p>
        <p class="text-xs text-zinc-400">{{ emptyStateNudge }}</p>
        <QuickPrompts class="mt-4" />
      </div>
      <ChatMessage v-for="m in messages" :key="m.id" :msg="m" />
      <TypingIndicator v-if="isTyping" />
    </div>

    <ChatInput :disabled="isTyping" :streaming="isStreaming" @send="onSend" @stop="abort" ref="inputRef">
      <template #hint>
        <p
          v-if="!isReady"
          class="text-[10px] text-amber-500 mt-2 flex items-center gap-1 px-1"
        >
          <i class="fa-solid fa-triangle-exclamation"></i>
          Add an API key in settings to enable AI responses
        </p>
      </template>
    </ChatInput>
  </section>
</template>
