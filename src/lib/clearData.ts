import { saveState } from '@/lib/storage'
import type { AppState } from '@/types'

export async function clearStoredData(state: AppState): Promise<void> {
  if (window.klavish) await window.klavish.clearData(state)
  else await saveState(state)
}
