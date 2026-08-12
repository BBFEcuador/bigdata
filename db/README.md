# Base de Datos - PostgreSQL

Configuración y scripts para PostgreSQL.

## 🐘 Inicialización

### Con Docker Compose

```bash
# Desde la raíz del proyecto
docker-compose up -d
```

Esto levantará PostgreSQL con:
- Usuario: `postgres`
- Contraseña: `postgres`
- Base de datos: `app_db`
- Puerto: `5432`

### Sin Docker

Instala PostgreSQL 16+ y crea la base de datos:

```sql
CREATE DATABASE app_db;
```

Luego conectate y ejecuta `init.sql`:

```bash
psql -U postgres -d app_db -f db/init.sql
```

## 📋 Scripts SQL

### init.sql
Script de inicialización con:
- Creación de tablas básicas
- Índices para optimización
- Datos de ejemplo

## 🔗 Conexión Local

```bash
# Conectar con psql
psql -U postgres -h localhost -d app_db

# Una vez dentro, listar tablas
\dt

# Ver estructura de una tabla
\d users
```

## 🔧 Configuración de Conexión

Variables de entorno en `.env`:

```env
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=app_db
```

## 📊 Tablas Iniciales

### users
- id (SERIAL PRIMARY KEY)
- email (VARCHAR UNIQUE)
- name (VARCHAR)
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)

### logs
- id (SERIAL PRIMARY KEY)
- level (VARCHAR)
- message (TEXT)
- timestamp (TIMESTAMP)

## 🗄️ Backups

### Crear backup

```bash
pg_dump -U postgres -d app_db > backup.sql
```

### Restaurar backup

```bash
psql -U postgres -d app_db < backup.sql
```

## 📈 Monitoreo

Ver conexiones activas:

```sql
SELECT * FROM pg_stat_activity;
```

Ver tamaño de la base de datos:

```sql
SELECT pg_size_pretty(pg_database_size('app_db'));
```

## 🧹 Limpieza

Borrar contenedor Docker:

```bash
docker-compose down -v
```

Esto borra también los volúmenes de datos.
