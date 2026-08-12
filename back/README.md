# Backend - FRIDAY

API REST construida con **Nest.js** y **TypeORM**.

## 📁 Estructura

```
src/
├── modules/        # Módulos de funcionalidad
│   ├── users/
│   ├── auth/
│   └── ...
├── common/         # Guards, interceptors, decorators
├── app.module.ts   # Módulo raíz
├── app.controller.ts
├── app.service.ts
└── main.ts         # Punto de entrada
```

## 🚀 Desarrollo

```bash
npm run start:dev
```

Accede en `http://localhost:3001`

## 🛠️ Herramientas

- **Nest.js** - Framework Node.js
- **TypeORM** - ORM para PostgreSQL
- **Passport.js** - Autenticación
- **Class Validator** - Validación de DTOs
- **TypeScript** - Lenguaje tipado

## 📦 Build

```bash
npm run build
npm run start:prod
```

## 🗄️ Base de Datos

Configurada automáticamente en `app.module.ts`:
- Host: `localhost` (o variable `DB_HOST`)
- Puerto: `5432` (o variable `DB_PORT`)
- Usuario: `postgres` (o variable `DB_USER`)
- Contraseña: `postgres` (o variable `DB_PASSWORD`)
- Base de datos: `app_db` (o variable `DB_NAME`)

## 📝 Crear Nuevo Módulo

```bash
# Nest CLI
nest g module modules/users
nest g controller modules/users
nest g service modules/users
```

Estructura típica:
```
modules/users/
├── dto/
│   ├── create-user.dto.ts
│   └── update-user.dto.ts
├── entities/
│   └── user.entity.ts
├── users.controller.ts
├── users.service.ts
└── users.module.ts
```

## 🔒 Autenticación

Implementar en módulo `auth`:
- JWT tokens
- Refresh tokens
- Guards para proteger rutas

## 🧪 Testing

```bash
npm run test        # Unit tests
npm run test:e2e    # E2E tests
```

## 📚 Documentación API

Considera agregar Swagger para documentación automática:

```bash
npm install @nestjs/swagger swagger-ui-express
```

Luego en `main.ts`:
```typescript
const config = new DocumentBuilder()
  .setTitle('FRIDAY API')
  .setVersion('1.0')
  .build()
const document = SwaggerModule.createDocument(app, config)
SwaggerModule.setup('api', app, document)
```

Accede en: `http://localhost:3001/api`
