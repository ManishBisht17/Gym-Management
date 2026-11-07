# GymFlow

GymFlow is a multi-tenant gym membership management SaaS MVP built as a TypeScript monorepo. This delivery implements **Phase 1**: project foundation, owner authentication, gym profile, and the first database models. Member and payment workflows are intentionally not represented as live features yet.

## Architecture and implementation plan

### Architecture

- `client/`: React + TypeScript + Vite SPA. Axios sends credentialed requests to the API; session tokens remain in HTTP-only cookies.
- `server/`: Express REST API, Zod request parsing, Mongoose persistence, bcrypt password hashes, signed JWT session cookie.
- `server/src/models/`: persistence boundary. Gym-owned records will carry `gymId` and compound indexes. Middleware derives the active `userId` and `gymId` from a verified cookie; handlers must scope every query by that context, never by a client-supplied gym ID.
- MongoDB is the source of truth. Registration creates the gym and owner as one logical operation with rollback if owner creation fails. A replica set and transaction can replace this when registration needs additional dependent writes.
- Staff support is prepared by the `User.role` enum, while registration only creates owners. Authorization remains role-aware for future expansion.

### Development phases

1. **Foundation (implemented):** Vite/React client, Express API, owner registration/login/logout/current-session, gym profile read/update, `User` and `Gym` models, environment validation, security middleware.
2. **Members and memberships:** add `Member`, `MembershipPlan`, and `Membership` models and gym-scoped CRUD/history/renewal APIs.
3. **Payments and dashboard:** payment ledger, receipts, dashboard aggregates, reports and CSV exports.
4. **Email and notifications:** Brevo service, notification records, idempotent queue jobs, reminder/expiry jobs, settings.
5. **Hardening and release:** integration coverage, security review, operational logging, production deployment configuration.

### Phase 1 database schemas

| Model | Fields / constraints | Isolation |
| --- | --- | --- |
| `Gym` | name, ownerId, email, phone, address, logoUrl, timezone; timestamps | `ownerId` indexed; owner queries bind `_id` and `ownerId` |
| `User` | name, unique normalized email, passwordHash (excluded by default), role (`owner`/`staff`), gymId; timestamps | `gymId` indexed; email unique across accounts |

Future gym-owned collections must use `gymId` as a required ObjectId and add indexes matching access patterns, typically `{ gymId: 1, createdAt: -1 }` or `{ gymId: 1, status: 1, endDate: 1 }`. IDs received from clients are always combined with `gymId` in database predicates.

### Phase 1 API contracts

All routes are under `/api`. JSON errors use `{ "error": "..." }`. Authenticated routes require the `gymflow_session` HTTP-only cookie; clients cannot choose a gym context.

| Method / route | Auth | Request | Success |
| --- | --- | --- | --- |
| `POST /auth/register` | No | `{ name, email, password, gymName }` | `201 { user, gym }` and sets session cookie |
| `POST /auth/login` | No | `{ email, password }` | `200 { user, gym }` and sets session cookie |
| `POST /auth/logout` | No | — | `204`, clears cookie |
| `GET /auth/me` | Yes | — | `200 { user, gym }` |
| `GET /gym/profile` | Yes | — | `200 { gym }` |
| `PATCH /gym/profile` | Yes | `{ name, email?, phone?, address?, logoUrl?, timezone? }` | `200 { gym }` |
| `GET /health` | No | — | `200 { status: "ok" }` |

Registration password policy is at least 10 characters. Duplicate email returns 409; invalid input returns 400; absent/invalid session returns 401. The server validates `JWT_SECRET` at startup and refuses secrets shorter than 32 characters.

## Local setup

Requirements: Node.js 20+ and MongoDB 7+ (local or hosted).

```sh
cp server/.env.example server/.env
# Set a unique JWT_SECRET and a reachable MONGODB_URI in server/.env
npm install
npm run dev
```

The API runs at `http://localhost:4000`; Vite runs at `http://localhost:5173`. Set `CLIENT_ORIGIN` to the exact frontend origin. Optional client override: `VITE_API_URL` (defaults to `http://localhost:4000/api`). For production, serve the client over HTTPS, set `NODE_ENV=production`, use a strong random JWT secret, and configure a managed MongoDB URI. The session cookie is secure in production.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `NODE_ENV` | No | `development`, `test`, or `production` |
| `PORT` | No | API port; defaults to 4000 |
| `MONGODB_URI` | Yes | MongoDB connection string |
| `JWT_SECRET` | Yes | At least 32 characters; signs session tokens |
| `CLIENT_ORIGIN` | No | Allowed credentialed browser origin |
| `VITE_API_URL` | No | Browser API base URL |

Brevo variables are added with the email phase. No secrets belong in client-side variables.

## Deployment notes

Build with `npm run build`. Run the API with `npm run start --workspace server` after setting production environment variables; publish `client/dist` to a static host and configure SPA fallback to `index.html`. Keep the API and frontend on HTTPS and configure the exact CORS origin. Add a managed MongoDB backup policy before onboarding real gyms. Health check: `GET /api/health`.

## Current limitations

Phase 1 includes a real registration/sign-in session and profile API. The successful sign-in screen is currently a Phase 1 placeholder pending the dashboard phase. No member, plan, membership, payment, or email routes are exposed yet. Password reset, MFA, audit logging, and production observability are future hardening work.
