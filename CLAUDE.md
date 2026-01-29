# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Structure

This is a full-stack education management system with:

- **Backend** (`/backend`): Node.js/Express API with TypeScript
- **Frontend** (`/frontend`): React + Vite + TypeScript
- **Database**: MemFire (Supabase-compatible) for authentication and data storage
- **Auth**: MemFire Auth for user authentication with JWT tokens

## Development Commands

### Backend
```bash
cd backend
npm run dev          # Start development server with tsx watch (port 3000)
npm run build        # Compile TypeScript
npm run start        # Run compiled server
npm run lint         # Run ESLint
npm run format       # Format code with Prettier
```

### Frontend
```bash
cd frontend
npm run dev          # Start Vite dev server (port 5173)
npm run build        # Build for production
npm run preview      # Preview production build
npm run lint         # Run ESLint
npm run format       # Format code with Prettier
```

### Start Both Services
From project root:
- Windows: `start.bat`
- Stop: `stop.bat`

## Architecture Overview

### Authentication Flow

**IMPORTANT**: MemFire Auth users and the `users` table must have matching IDs.

1. User logs in via MemFire Auth (email/password)
2. Frontend receives Auth token and user ID
3. Frontend queries `users` table by ID to get role, organizationId, campusId
4. If IDs don't match, user gets default `role: 'user'` with limited access

When creating new users through the backend API (`/auth/create-manager`, `/auth/create-staff`):
- Backend uses MemFire Admin API (service_role key) to bypass email verification
- User is created in Auth with `email_confirm: true`
- Corresponding record is inserted into `users` table with same ID
- Default password is `123456` if not provided

### Role-Based Access Control (RBAC)

**Roles**: `admin`, `manager`, `coach`, `sales`, `staff`, `parent`, `teacher` (legacy, maps to `coach`)

**Data Scoping** (`frontend/src/utils/dataFilter.ts`):
- `getDataScopeFilter(pageType)` automatically adds filters based on user role
- `admin`: All data (may be filtered by campusId if assigned)
- `manager`: All data (may be filtered by campusId if assigned)
- `coach`:
  - Classes: View all (can see, not edit)
  - Students/Schedules/Attendances: Only own data (`teacherId: user.id`)
  - Sales/Leads/Experiences: Only own data (`salesId/assigneeId: user.id`)
- `sales`:
  - Classes/Students: View all, no edit
  - Sales/Leads/Experiences: Only own data (`campusId: user.campusId`)

**Menu Permissions** (`getUserMenuPermissions()`):
- `admin`: Full access
- `manager`: No org/user management, otherwise full access
- `coach`: Classes, Students, Sales Data, Teachers (own stats only)
- `sales`: Classes/Students (read-only), Sales Data, Reports

### Backend API Structure

**Controllers** (`src/controllers/`):
- `authController.ts`: Auth endpoints including `createManager`, `createStaff`

**Middleware** (`src/middleware/`):
- `auth.ts`:
  - `authenticate`: JWT auth for legacy routes
  - `authenticateMemFire`: Validates MemFire tokens, sets `req.memfireUser`
  - `requireMemFireAdmin`: Requires admin role
  - `requireMemFireAdminOrManager`: Requires admin or manager role

**MemFire Admin Client** (`src/config/memfire.ts`):
- Lazy-loaded using Proxy to avoid env var issues during module loading
- Use service_role key for admin operations (bypasses RLS, email verification)

### Frontend Architecture

**State Management**:
- Zustand store (`src/store/authStore.ts`): User auth state, token, organization

**Data Layer** (`src/services/`):
- `memfireDB.ts`: Direct database queries to MemFire
- `memfireAuth.ts`: Auth operations, now calls backend APIs for user creation

**Utilities** (`src/utils/`):
- `dataFilter.ts`: RBAC logic, data scoping, menu permissions

### Key Implementation Details

**Creating Users**:
- Use backend APIs: `/auth/create-manager` (admin only), `/auth/create-staff` (admin/manager)
- Frontend `memfireDB.users.create()` now calls backend instead of direct DB insert
- This ensures Auth and users table IDs match, and email is auto-confirmed

**Testing User Creation**:
1. Create via backend API
2. Check response for `defaultPassword` field
3. Login with email + password

**Troubleshooting Login Issues**:
If user gets `role: user` instead of actual role:
1. Get Auth ID from browser console: `JSON.parse(localStorage.getItem('auth-storage'))`
2. Check users table: `SELECT id, email, role FROM users WHERE email = '...'`
3. Update if needed: `UPDATE users SET id = 'auth_id' WHERE email = '...'`

### Environment Variables

**Backend** (`backend/.env`):
```
MEMFIRE_URL=https://xxx.baseapi.memfiredb.com
MEMFIRE_SERVICE_ROLE_KEY=eyJhbGci... (service_role key)
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=7d
PORT=3000
```

### API Documentation

- Swagger UI: http://localhost:3000/api-docs (when backend is running)
