import { ref, computed, watch } from 'vue'
import type { Provider } from '@/types/domain'

const provider = ref<Provider>((localStorage.getItem('provider') as Provider | null) ?? 'openrouter')
const apiKey = ref<string>(localStorage.getItem('api_key') ?? '')
const model = ref<string>(localStorage.getItem('model') ?? '')

// Group G: OCR for scanned PDFs. Defaults to ON; first scanned-doc import
// will trigger a ~10MB Tesseract model download (cached by Tesseract itself).
const STORAGE_OCR = 'notebook.ocrEnabled'
function readOcrEnabled(): boolean {
  const raw = localStorage.getItem(STORAGE_OCR)
  if (raw == null) return true
  return raw === 'true'
}
const ocrEnabled = ref<boolean>(readOcrEnabled())

watch(provider, (v) => localStorage.setItem('provider', v))
watch(apiKey, (v) => localStorage.setItem('api_key', v))
watch(model, (v) => localStorage.setItem('model', v))
watch(ocrEnabled, (v) => localStorage.setItem(STORAGE_OCR, String(v)))

const modelPlaceholder = computed(() =>
  provider.value === 'gemini' ? 'e.g. gemini-2.5-flash' : 'e.g. google/gemini-2.5-flash',
)

const modelHint = computed(() =>
  provider.value === 'gemini' ? 'Uses Gemini API directly' : 'Any model from openrouter.ai/models',
)

export function useSettings() {
  return { provider, apiKey, model, modelPlaceholder, modelHint, ocrEnabled }
}
