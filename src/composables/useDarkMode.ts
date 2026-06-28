import { ref, watchEffect } from 'vue'

const KEY = 'dark_mode'
const isDark = ref<boolean>(localStorage.getItem(KEY) === 'true')

watchEffect(() => {
  localStorage.setItem(KEY, String(isDark.value))
  document.documentElement.classList.toggle('dark', isDark.value)
})

export function useDarkMode() {
  function toggle() {
    isDark.value = !isDark.value
  }
  return { isDark, toggle }
}
