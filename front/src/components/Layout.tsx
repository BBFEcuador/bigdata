import { useEffect, useState } from 'react'
import { Menu, Moon, Sun, X } from 'lucide-react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'

import { NAVEGACION } from '../routes'
import { useTheme } from '../theme/theme-provider'
import { Button } from './ui/button'
import { Separator } from './ui/separator'
import '../styles/Layout.css'

export default function Layout() {
  const { theme, toggleTheme } = useTheme()
  const [navigationOpen, setNavigationOpen] = useState(false)
  const location = useLocation()

  useEffect(() => setNavigationOpen(false), [location.pathname])

  useEffect(() => {
    document.body.style.overflow = navigationOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [navigationOpen])

  return (
    <div className="app-shell">
      <header className="app-mobile-header">
        <Button
          aria-controls="app-navigation"
          aria-expanded={navigationOpen}
          aria-label="Abrir navegación"
          onClick={() => setNavigationOpen(true)}
          size="icon"
          variant="ghost"
        >
          <Menu />
        </Button>
        <div className="app-mobile-brand">
          <span className="app-brand-mark" aria-hidden="true">F</span>
          <span>FRIDAY</span>
        </div>
        <Button
          aria-label={theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
          onClick={toggleTheme}
          size="icon"
          variant="ghost"
        >
          {theme === 'dark' ? <Sun /> : <Moon />}
        </Button>
      </header>

      {navigationOpen && (
        <button
          aria-label="Cerrar navegación"
          className="app-sidebar-backdrop"
          onClick={() => setNavigationOpen(false)}
          type="button"
        />
      )}

      <aside className={`app-sidebar${navigationOpen ? ' open' : ''}`} id="app-navigation">
        <div className="app-brand">
          <span className="app-brand-mark" aria-hidden="true">F</span>
          <div className="app-brand-copy">
            <span className="app-brand-name">FRIDAY</span>
            <span className="app-brand-caption">Inteligencia comercial</span>
          </div>
          <Button
            aria-label="Cerrar navegación"
            className="app-sidebar-close"
            onClick={() => setNavigationOpen(false)}
            size="icon"
            variant="ghost"
          >
            <X />
          </Button>
        </div>

        <nav className="app-nav" aria-label="Navegación principal">
          {NAVEGACION.map(group => (
            <div className="app-nav-group" key={group.titulo}>
              <p className="app-nav-heading">{group.titulo}</p>
              {group.items.map(item => (
                <NavLink
                  className={({ isActive }) => `app-nav-link${isActive ? ' active' : ''}`}
                  key={item.ruta}
                  title={item.etiqueta}
                  to={item.ruta}
                >
                  <span className="app-nav-icon" aria-hidden="true">{item.icono}</span>
                  <span className="app-nav-label">{item.etiqueta}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="app-sidebar-footer">
          <Separator className="app-sidebar-separator" />
          <Button
            aria-label={theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
            className="app-theme-toggle"
            onClick={toggleTheme}
            size="sm"
            variant="ghost"
          >
            {theme === 'dark' ? <Sun /> : <Moon />}
            <span className="app-nav-label">{theme === 'dark' ? 'Tema claro' : 'Tema oscuro'}</span>
          </Button>
        </div>
      </aside>

      <main className="app-content">
        <Outlet />
      </main>
    </div>
  )
}
