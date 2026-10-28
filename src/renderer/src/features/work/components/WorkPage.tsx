import { Route, Routes } from 'react-router'
import { TeamGate } from '@renderer/components/TeamGate'
import { useTeam } from '@renderer/stores/team'
import { useTeamRealtime } from '../api'
import { ProjectDetail } from './ProjectDetail'
import { ProjectsPage } from './ProjectsPage'

function WorkRoutes() {
  const teamId = useTeam((s) => s.currentTeamId)
  useTeamRealtime(teamId)
  return (
    <Routes>
      <Route index element={<ProjectsPage />} />
      <Route path=":projectId" element={<ProjectDetail />} />
    </Routes>
  )
}

export function WorkPage() {
  return (
    <TeamGate>
      <WorkRoutes />
    </TeamGate>
  )
}
