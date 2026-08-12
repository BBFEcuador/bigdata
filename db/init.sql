-- Inicialización de la base de datos
-- Este archivo se ejecuta automáticamente al crear el contenedor de PostgreSQL

CREATE SCHEMA IF NOT EXISTS public;

-- Crear tabla de ejemplo
CREATE TABLE IF NOT EXISTS public.users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Crear tabla de logs
CREATE TABLE IF NOT EXISTS public.logs (
  id SERIAL PRIMARY KEY,
  level VARCHAR(20),
  message TEXT,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Crear índices
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON public.logs(timestamp);

GRANT ALL PRIVILEGES ON SCHEMA public TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO postgres;
