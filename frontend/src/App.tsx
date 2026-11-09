import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './lib/auth'
import { RealtimeProvider } from './lib/realtime'
import Layout from './components/Layout'
import { Spinner } from './components/ui'
import Login from './pages/Login'
import DashboardMedico from './pages/DashboardMedico'
import DashboardEnfermeria from './pages/DashboardEnfermeria'
import Pacientes from './pages/Pacientes'
import RegistrarPaciente from './pages/RegistrarPaciente'
import FichaPaciente from './pages/FichaPaciente'
import Habitaciones from './pages/Habitaciones'
import Prescripciones from './pages/Prescripciones'
import Alertas from './pages/Alertas'
import Historial from './pages/Historial'
import Perfil from './pages/Perfil'
import Enfermeria from './pages/Enfermeria'
import Asistente from './pages/Asistente'
import Verificacion from './pages/Verificacion'

export default function App() {
  const { user, loading } = useAuth()
  if (loading) return <Spinner label="Iniciando MediAlert…" />
  if (!user) return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
  const medico = user.rol === 'medico'
  return (
    <RealtimeProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={medico ? <DashboardMedico /> : <DashboardEnfermeria />} />
          <Route path="pacientes" element={<Pacientes />} />
          <Route path="pacientes/:id" element={<FichaPaciente />} />
          <Route path="habitaciones" element={<Habitaciones />} />
          <Route path="alertas" element={<Alertas />} />
          <Route path="historial" element={<Historial />} />
          <Route path="asistente" element={<Asistente />} />
          <Route path="perfil" element={<Perfil />} />
          {medico ? (
            <>
              <Route path="pacientes/nuevo" element={<RegistrarPaciente />} />
              <Route path="prescripciones" element={<Prescripciones />} />
            </>
          ) : (
            <>
              <Route path="enfermeria" element={<Enfermeria />} />
              <Route path="enfermeria/:id" element={<Verificacion />} />
            </>
          )}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </RealtimeProvider>
  )
}
