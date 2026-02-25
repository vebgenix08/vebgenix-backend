-- 1. Enquiries Table
-- Stores initial contact from potential students/parents
CREATE TABLE IF NOT EXISTS public.enquiries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT NOT NULL,
  student_dob DATE,
  grade_applied TEXT NOT NULL, -- "1st Std", "1 PUC", etc.
  previous_school TEXT,
  parent_name TEXT,
  status TEXT NOT NULL CHECK (status IN ('NEW', 'CONTACTED', 'CONVERTED', 'CLOSED')) DEFAULT 'NEW',
  assigned_to UUID REFERENCES public.profiles(id), -- Staff handling the enquiry
  notes TEXT,
  campus_scope TEXT NOT NULL CHECK (campus_scope IN ('SCHOOL', 'PU')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Applications Table
-- Formal application for admission
CREATE TABLE IF NOT EXISTS public.applications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  enquiry_id UUID REFERENCES public.enquiries(id), -- Optional link to enquiry
  
  -- Applicant Details
  full_name TEXT NOT NULL,
  dob DATE NOT NULL,
  gender TEXT CHECK (gender IN ('Male', 'Female', 'Other')),
  nationality TEXT,
  blood_group TEXT,
  
  -- Contact Details
  email TEXT,
  phone TEXT NOT NULL,
  address JSONB, -- { street, city, state, zip }
  
  -- Parent/Guardian Details
  father_name TEXT,
  father_phone TEXT,
  mother_name TEXT,
  mother_phone TEXT,
  
  -- Academic Details
  grade_applying_for TEXT NOT NULL,
  academic_year TEXT NOT NULL, -- "2024-2025"
  stream TEXT, -- For PU only (Science, Commerce)
  previous_school TEXT,
  previous_grade_percentage DECIMAL(5,2),
  
  -- Status Tracking
  status TEXT NOT NULL CHECK (status IN ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'INTERVIEW_SCHEDULED', 'APPROVED', 'REJECTED', 'MIGRATED')) DEFAULT 'DRAFT',
  stage_history JSONB DEFAULT '[]', -- Log of status changes with timestamps
  
  campus_scope TEXT NOT NULL CHECK (campus_scope IN ('SCHOOL', 'PU')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Application Documents
-- Uploaded proofs (Marks cards, Aadhar, etc.)
CREATE TABLE IF NOT EXISTS public.application_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id UUID REFERENCES public.applications(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL, -- "AADHAR", "MARKS_CARD", "TC"
  file_url TEXT NOT NULL,
  is_verified BOOLEAN DEFAULT FALSE,
  verified_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Application Reviews
-- Staff comments/scores on applications
CREATE TABLE IF NOT EXISTS public.application_reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id UUID REFERENCES public.applications(id) ON DELETE CASCADE,
  reviewer_id UUID REFERENCES public.profiles(id),
  comments TEXT,
  decision TEXT CHECK (decision IN ('RECOMMEND', 'NOT_RECOMMEND', 'HOLD')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Students Table (The Core Entity)
-- Created only after Application is APPROVED
CREATE TABLE IF NOT EXISTS public.students (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id UUID REFERENCES public.applications(id), -- Link back to source
  portal_auth_user_id UUID UNIQUE REFERENCES auth.users(id), -- Portal auth link
 
  -- Unique Identifiers
  reg_no TEXT UNIQUE NOT NULL, -- REG-2024-0001 (Auto-generated)
  admission_number TEXT UNIQUE, -- Optional separate internal ID
  
  -- Personal Info (Snapshot from Application)
  full_name TEXT NOT NULL,
  student_email TEXT,
  parent_email TEXT,
  parent_phone TEXT,
  dob DATE,
  gender TEXT,
  
  -- Academic Placement
  current_grade TEXT NOT NULL,
  current_section TEXT, -- Assigned later
  stream TEXT,
  campus_type TEXT NOT NULL CHECK (campus_type IN ('SCHOOL', 'PU')),
  
  status TEXT CHECK (status IN ('ACTIVE', 'ALUMNI', 'WITHDRAWN', 'SUSPENDED')) DEFAULT 'ACTIVE',
  enrollment_date DATE DEFAULT CURRENT_DATE,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Registration Number Generator
-- Sequence for the number part
CREATE SEQUENCE IF NOT EXISTS student_reg_seq START 1;

-- Function to generate atomic ID: REG-YYYY-XXXX
CREATE OR REPLACE FUNCTION generate_reg_number() 
RETURNS TEXT AS $$
DECLARE
  year_str TEXT;
  seq_val INT;
  new_reg TEXT;
BEGIN
  year_str := to_char(NOW(), 'YYYY');
  seq_val := nextval('student_reg_seq');
  new_reg := 'REG-' || year_str || '-' || lpad(seq_val::text, 4, '0');
  RETURN new_reg;
END;
$$ LANGUAGE plpgsql;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_enquiries_email ON public.enquiries(email);
CREATE INDEX IF NOT EXISTS idx_enquiries_phone ON public.enquiries(phone);
CREATE INDEX IF NOT EXISTS idx_applications_status ON public.applications(status);
CREATE INDEX IF NOT EXISTS idx_students_reg_no ON public.students(reg_no);
