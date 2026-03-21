import { defineConfig, presetWind, presetIcons } from 'unocss'

export default defineConfig({
  presets: [
    presetWind(),
    presetIcons({
      scale: 1.2,
      warn: true
    })
  ],
  shortcuts: {
    'flex-center': 'flex items-center justify-center',
    'flex-between': 'flex items-center justify-between',
    'card': 'rounded-lg bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-700',
    'btn-primary': 'px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors',
    'btn-ghost': 'px-4 py-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors',
  },
  theme: {
    colors: {
      primary: {
        50: '#eff6ff',
        100: '#dbeafe',
        200: '#bfdbfe',
        300: '#93c5fd',
        400: '#60a5fa',
        500: '#3b82f6',
        600: '#2563eb',
        700: '#1d4ed8',
        800: '#1e40af',
        900: '#1e3a8a',
      }
    }
  }
})
