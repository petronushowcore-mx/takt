import { Navigate, Route, Routes } from 'react-router'
import { AppShell } from '@/components/AppShell'
import ThemeBackdrop from '@/components/ThemeBackdrop'
import { useAppState } from '@/hooks/useAppState'
import Home from '@/pages/Home'
import Lessons from '@/pages/Lessons'
import Practice from '@/pages/Practice'
import Arcade from '@/pages/Arcade'
import Stats from '@/pages/Stats'
import TrainingLab from '@/pages/TrainingLab'
import Achievements from '@/pages/Achievements'
import Settings from '@/pages/Settings'
import OrbitGame from '@/game/OrbitGame'
import SprintGame from '@/game/SprintGame'
import './App.css'

export default function App() {
  const { state } = useAppState()
  const theme = state.settings.theme

  return (
    <div className="theme-frame" data-theme={theme}>
      {theme === 'waves' && <ThemeBackdrop />}
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<Home />} />
          <Route path="/lessons" element={<Lessons />} />
          <Route path="/arcade" element={<Arcade />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/training-lab" element={<TrainingLab />} />
          <Route path="/achievements" element={<Achievements />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
        <Route path="/practice/:lessonId" element={<Practice />} />
        <Route path="/arcade/orbit" element={<OrbitGame />} />
        <Route path="/arcade/sprint" element={<SprintGame />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  )
}
