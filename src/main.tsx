import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

const root = document.getElementById('root')
if (!root) throw new Error('#root missing')

/** Dev helper: `?demo` fills an empty log with sample entries, then boots. */
async function prepareDemo(): Promise<void> {
  if (!import.meta.env.DEV || !new URLSearchParams(location.search).has('demo')) return
  const [{ seedDemo }, { createStore }, { MemoryStore }] = await Promise.all([
    import('./dev/demo'),
    import('./storage/idb'),
    import('./storage/types'),
  ])
  try {
    await seedDemo(createStore())
  } catch {
    await seedDemo(new MemoryStore())
  }
}

void prepareDemo().finally(() => {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
