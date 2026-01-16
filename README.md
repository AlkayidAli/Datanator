# Datanator - Data Visualization Platform

A full-stack data visualization platform built with Svelte 5, SvelteKit, PostgreSQL, and D3.js. Upload CSV files, transform data, and create sophisticated visualizations with an intuitive interface.

## Tech Stack

- **Frontend:** Svelte 5, SvelteKit v2.16, TypeScript, Vite, D3.js v7.9, SCSS
- **Backend:** Node.js, PostgreSQL
- **Data Processing:** PapaParse v5.5 (CSV parsing)
- **Tools:** ESLint, Prettier, Svelte Check

## Prerequisites

Before running the application, ensure you have installed:

- **Node.js** v18+ ([download](https://nodejs.org/))
- **npm** v9+ (comes with Node.js)
- **PostgreSQL** v12+ ([download](https://www.postgresql.org/download/))

## Installation & Setup

### 1. Clone the Repository

```bash
git clone <your-repo-url>
cd datanator
```

### 2. Install Dependencies

```bash
npm install
```

This will install all required packages including:

- `svelte@5` - UI framework with runes
- `@sveltejs/kit@2.16` - Full-stack framework
- `typescript@5.0` - Type safety
- `d3@7.9` - Data visualization
- `papaparse@5.5` - CSV parsing
- `pg@8.16` - PostgreSQL driver
- `svelte-check` - Type checking
- `eslint` & `prettier` - Code quality tools

### 3. Configure Environment Variables

Create a `.env.local` file in the root directory with your PostgreSQL credentials:

```env
SECRET_PGUSER=your_postgres_user
SECRET_PGPASSWORD=your_postgres_password
SECRET_PGHOST=localhost
SECRET_PGPORT=5432
SECRET_PGDATABASE=datanator
```

**Note:** These variables are required for the application to connect to PostgreSQL.

### 4. Setup PostgreSQL Database

#### Option A: Using psql (Command Line)

1. Open PostgreSQL command line:

```bash
psql -U postgres
```

2. Create the database:

```sql
CREATE DATABASE datanator;
```

3. Connect to the new database:

```sql
\c datanator
```

4. Enable required PostgreSQL extensions:

```sql
CREATE EXTENSION IF NOT EXISTS ltree;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```

5. Run the schema migration scripts (located in your `/database` or `/migrations` folder):

```bash
psql -U your_postgres_user -d datanator -f ./database/schema.sql
```

#### Option B: Using a Database GUI

- Use **pgAdmin** or **DBeaver** to:
  1. Create a new database named `datanator`
  2. Run the schema SQL file from `/database/schema.sql`
  3. Enable extensions (ltree, pgcrypto, uuid-ossp)

## Running the Application

### Development Mode

Start the development server with hot module replacement (HMR):

```bash
npm run dev
```

The application will be available at:

- **Local:** `http://localhost:5173`
- **Network:** Check terminal output for your local IP

To open automatically in browser:

```bash
npm run dev -- --open
```

### Production Build

Create an optimized production build:

```bash
npm run build
```

### Preview Production Build

Test the production build locally:

```bash
npm run preview
```

## Available Commands

| Command                 | Description                           |
| ----------------------- | ------------------------------------- |
| `npm run dev`           | Start development server with HMR     |
| `npm run dev -- --open` | Start dev server and open in browser  |
| `npm run build`         | Create production build               |
| `npm run preview`       | Preview production build              |
| `npm run check`         | Run TypeScript & Svelte type checking |
| `npm run lint`          | Run ESLint code quality checks        |
| `npm run format`        | Auto-format code with Prettier        |

## Project Structure

```
datanator/
├── src/
│   ├── routes/                    # SvelteKit pages & API endpoints
│   │   ├── api/                   # REST API endpoints
│   │   ├── +layout.svelte        # Root layout
│   │   ├── +page.svelte          # Home page
│   │   └── login/                # Authentication pages
│   ├── lib/
│   │   ├── components/           # Reusable Svelte components
│   │   ├── stores/               # Svelte reactive stores
│   │   ├── api/                  # Client API wrappers
│   │   ├── types/                # TypeScript interfaces
│   │   ├── utils/                # Utility functions
│   │   ├── common/               # Database connection
│   │   └── visualize/            # D3 visualization logic
│   ├── styles/                   # Global SCSS styles
│   └── hooks.server.ts           # Auth middleware
├── database/                      # Database schema & migrations
├── .env.local                     # Environment variables (not committed)
├── svelte.config.js              # SvelteKit config
├── vite.config.ts                # Vite build config
└── tsconfig.json                 # TypeScript config
```

## Database Schema Overview

Key tables created during setup:

- **`data.users`** - User accounts
- **`data.sessions`** - Auth sessions
- **`data.projects`** - User projects
- **`data.project_members`** - Collaboration & access control
- **`data.project_files`** - CSV files within projects
- **`data.file_ops`** - Operation log (audit trail)
- **`data.file_snapshots`** - Dataset snapshots
- **`data.visualizations`** - Saved charts
- **`data.visualization_revisions`** - Version history

## Key Features

✨ **Multi-Project Workspace** - Create and manage multiple data projects  
📊 **9 Chart Types** - Line, bar, scatter, pie, area, histogram, boxplot, arc, alluvial  
🔄 **CSV Processing** - Upload, parse, and transform CSV data  
🎨 **Advanced Visualization** - Layered charts, conditional styling, custom tooltips  
👥 **Collaboration** - Role-based access control (owner/editor/viewer)  
💾 **Data Snapshots** - Save states at specific points in your workflow  
🔐 **Authentication** - Secure password hashing and session management

## Troubleshooting

### Database Connection Error

```
Error: connect ECONNREFUSED 127.0.0.1:5432
```

**Solution:**

- Verify PostgreSQL is running: `sudo service postgresql status` (Linux/Mac) or check Windows Services
- Check `.env.local` credentials match your PostgreSQL setup
- Ensure database `datanator` exists

### Port Already in Use

```
Error: EADDRINUSE: address already in use :::5173
```

**Solution:**

```bash
npm run dev -- --port 5174
```

### Module Not Found Errors

**Solution:**

```bash
rm -rf node_modules package-lock.json
npm install
npm run check
```

### Environment Variables Not Loading

**Solution:**

- Ensure `.env.local` file is in the root directory
- Restart the dev server after updating `.env.local`
- Variables must start with `SECRET_` to be accessible server-side

## Deployment

The application uses `@sveltejs/adapter-auto` for flexible deployment:

- **Vercel:** Deploy directly from GitHub
- **Netlify:** Connect repo, set build command to `npm run build`
- **Traditional Node.js:** Set environment variables and run `npm run preview`

See [SvelteKit Adapters](https://svelte.dev/docs/kit/adapters) for platform-specific setup.

## Contributing

1. Run `npm run format` before committing
2. Ensure `npm run check` passes (no type errors)
3. Follow the architectural patterns in `.github/copilot-instructions.md`

## Security Notes

✅ Passwords hashed with PostgreSQL pgcrypto  
✅ SQL parameterization prevents injection  
✅ Session expiry enforcement  
✅ Role-based access control  
✅ Safe expression evaluator (no `eval()`)



## Support

For issues or questions, please open an issue.
