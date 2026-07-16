-- SQL DDL schema for jvai_management in Supabase

-- Disable row-level security (RLS) check for demo ease, or enable and allow all authenticated
-- We will enable tables and default permission grants.

-- 1. Admins Table
CREATE TABLE IF NOT EXISTS admins (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    designation TEXT,
    uid TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Leaders Table
CREATE TABLE IF NOT EXISTS leaders (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    designation TEXT,
    creator_id TEXT,
    uid TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Developers Table
CREATE TABLE IF NOT EXISTS developers (
    id TEXT PRIMARY KEY,
    employee_id TEXT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    role TEXT,
    designation TEXT,
    owner_id TEXT,
    shift TEXT,
    maintenance_projects JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Projects Table
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    project_id TEXT,
    client_name TEXT NOT NULL,
    owner_id TEXT,
    amount NUMERIC DEFAULT 0,
    net_amount NUMERIC DEFAULT 0,
    start_date TEXT,
    status TEXT,
    shift TEXT,
    delivery_date TEXT,
    phases JSONB DEFAULT '[]'::jsonb, -- Array of PhaseNames
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Phases (Milestones) Table
CREATE TABLE IF NOT EXISTS phases (
    id TEXT PRIMARY KEY,
    project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
    order_id TEXT,
    phase_name TEXT NOT NULL,
    start_date TEXT,
    start_time TEXT,
    expected_delivery_date TEXT,
    expected_delivery_time TEXT,
    actual_delivery_date TEXT,
    original_delivery_date TEXT,
    end_date TEXT,
    status TEXT,
    developer_ids JSONB DEFAULT '[]'::jsonb, -- Array of Developer IDs
    progress NUMERIC DEFAULT 0,
    backend_progress NUMERIC,
    integration_progress NUMERIC,
    developer_progress JSONB DEFAULT '{}'::jsonb,
    developer_weights JSONB DEFAULT '{}'::jsonb,
    value NUMERIC DEFAULT 0,
    month TEXT,
    kpi_allocations JSONB DEFAULT '[]'::jsonb,
    extensions JSONB DEFAULT '[]'::jsonb,
    total_extension_days NUMERIC DEFAULT 0,
    resource_links JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Issues Table
CREATE TABLE IF NOT EXISTS issues (
    id TEXT PRIMARY KEY,
    project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
    phase_id TEXT,
    project_name TEXT,
    phase_name TEXT,
    title TEXT,
    description TEXT,
    type TEXT,
    priority TEXT,
    status TEXT,
    developer_id TEXT,
    developer_name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Daily Progress Logs Table
CREATE TABLE IF NOT EXISTS daily_progress (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    project_id TEXT NOT NULL,
    owner_id TEXT,
    phase_id TEXT,
    phase_name TEXT,
    developer_id TEXT NOT NULL,
    description TEXT,
    daily_target TEXT,
    actual_done TEXT,
    progress_percentage NUMERIC DEFAULT 0,
    shift TEXT,
    reason_if_no_work TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create performance indexes for database filters
CREATE INDEX IF NOT EXISTS idx_projects_owner_id ON projects(owner_id);
CREATE INDEX IF NOT EXISTS idx_phases_project_id ON phases(project_id);
CREATE INDEX IF NOT EXISTS idx_issues_project_id ON issues(project_id);
CREATE INDEX IF NOT EXISTS idx_daily_progress_dev_id ON daily_progress(developer_id);
CREATE INDEX IF NOT EXISTS idx_daily_progress_date ON daily_progress(date);
CREATE INDEX IF NOT EXISTS idx_leaders_creator_id ON leaders(creator_id);

-- Enable RLS and setup default allow policies
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaders ENABLE ROW LEVEL SECURITY;
ALTER TABLE developers ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE phases ENABLE ROW LEVEL SECURITY;
ALTER TABLE issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_progress ENABLE ROW LEVEL SECURITY;

-- Allow anonymous read and authenticated insert/update/delete for demo ease
CREATE POLICY "Allow all select" ON admins FOR SELECT USING (true);
CREATE POLICY "Allow all insert" ON admins FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all update" ON admins FOR UPDATE USING (true);
CREATE POLICY "Allow all delete" ON admins FOR DELETE USING (true);

CREATE POLICY "Allow all select" ON leaders FOR SELECT USING (true);
CREATE POLICY "Allow all insert" ON leaders FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all update" ON leaders FOR UPDATE USING (true);
CREATE POLICY "Allow all delete" ON leaders FOR DELETE USING (true);

CREATE POLICY "Allow all select" ON developers FOR SELECT USING (true);
CREATE POLICY "Allow all insert" ON developers FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all update" ON developers FOR UPDATE USING (true);
CREATE POLICY "Allow all delete" ON developers FOR DELETE USING (true);

CREATE POLICY "Allow all select" ON projects FOR SELECT USING (true);
CREATE POLICY "Allow all insert" ON projects FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all update" ON projects FOR UPDATE USING (true);
CREATE POLICY "Allow all delete" ON projects FOR DELETE USING (true);

CREATE POLICY "Allow all select" ON phases FOR SELECT USING (true);
CREATE POLICY "Allow all insert" ON phases FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all update" ON phases FOR UPDATE USING (true);
CREATE POLICY "Allow all delete" ON phases FOR DELETE USING (true);

CREATE POLICY "Allow all select" ON issues FOR SELECT USING (true);
CREATE POLICY "Allow all insert" ON issues FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all update" ON issues FOR UPDATE USING (true);
CREATE POLICY "Allow all delete" ON issues FOR DELETE USING (true);

CREATE POLICY "Allow all select" ON daily_progress FOR SELECT USING (true);
CREATE POLICY "Allow all insert" ON daily_progress FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all update" ON daily_progress FOR UPDATE USING (true);
CREATE POLICY "Allow all delete" ON daily_progress FOR DELETE USING (true);
