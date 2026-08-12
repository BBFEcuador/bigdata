import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import Companias from './pages/Companias'
import Catalogo from './pages/Catalogo'
import Ciiu from './pages/Ciiu'
import Balances from './pages/Balances'
import ImportarCompanias from './pages/ImportarCompanias'
import ImportarBalances from './pages/ImportarBalances'
import ImportarCatalogo from './pages/ImportarCatalogo'
import ImportarCiiu from './pages/ImportarCiiu'
import Importaciones from './pages/Importaciones'
import { RUTA_INICIAL } from './routes'
import './App.css'

function App() {
  return (
    <Router>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Navigate to={RUTA_INICIAL} replace />} />
          <Route path="/companias" element={<Companias />} />
          <Route path="/catalogo" element={<Catalogo />} />
          <Route path="/ciiu" element={<Ciiu />} />
          <Route path="/balances" element={<Balances />} />
          <Route path="/importar/companias" element={<ImportarCompanias />} />
          <Route path="/importar/balances" element={<ImportarBalances />} />
          <Route path="/importar/catalogo" element={<ImportarCatalogo />} />
          <Route path="/importar/ciiu" element={<ImportarCiiu />} />
          <Route path="/importaciones" element={<Importaciones />} />
          {/* Redirección de la ruta antigua, que estaba en el menú anterior. */}
          <Route path="/importar" element={<Navigate to="/importar/companias" replace />} />
          <Route path="*" element={<Navigate to={RUTA_INICIAL} replace />} />
        </Route>
      </Routes>
    </Router>
  )
}

export default App
