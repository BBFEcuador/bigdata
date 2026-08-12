# Frontend - FRIDAY

Frontend construido con **React.js** y **Vite**.

## 📁 Estructura

```
src/
├── components/     # Componentes reutilizables
├── pages/          # Páginas principales
├── services/       # Servicios API y lógica
├── hooks/          # Custom React hooks
├── utils/          # Funciones utilitarias
├── styles/         # Estilos CSS globales
├── App.jsx         # Componente raíz
└── main.jsx        # Punto de entrada
```

## 🚀 Desarrollo

```bash
npm run dev
```

Accede en `http://localhost:3000`

## 🛠️ Herramientas

- **Vite** - Bundler ultrarrápido
- **React 18** - Librería UI
- **React Router** - Enrutamiento
- **Axios** - Cliente HTTP
- **ESLint** - Linter

## 📦 Build

```bash
npm run build
npm run preview
```

## 🔗 Conectar con Backend

El proxy está configurado en `vite.config.js`:
- Llamadas a `/api/*` se redirigen a `http://localhost:3001/*`

Ejemplo:
```javascript
// Frontend
const response = await api.get('/users')
// Se envía a: http://localhost:3001/users
```

## 📝 Crear Nuevo Componente

```bash
# En src/components
├── MyComponent.jsx
└── MyComponent.css
```

```jsx
export default function MyComponent() {
  return <div>Componente</div>
}
```
