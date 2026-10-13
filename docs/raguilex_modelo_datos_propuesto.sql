CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE inventory_status AS ENUM (
  'AVAILABLE',
  'RESERVED',
  'SOLD',
  'MAINTENANCE',
  'REMOVED'
);

CREATE TYPE movement_type AS ENUM (
  'IMPORT',
  'ENTRY',
  'SALE',
  'RETURN',
  'ADJUSTMENT',
  'TRANSFER',
  'REMOVAL'
);

CREATE TABLE roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  username text NOT NULL UNIQUE,
  email text UNIQUE,
  password_hash text NOT NULL,
  role_id uuid NOT NULL REFERENCES roles(id),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_login timestamptz
);

CREATE TABLE categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE conditions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  address text,
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE internal_code_counters (
  prefix text PRIMARY KEY,
  last_number integer NOT NULL CHECK (last_number >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  internal_code text NOT NULL UNIQUE CHECK (internal_code ~ '^TN-[0-9]{5}$'),
  category_id uuid NOT NULL REFERENCES categories(id),
  brand_id uuid REFERENCES brands(id),
  model text,
  size text,
  color text,
  gender text,
  condition_id uuid REFERENCES conditions(id),
  purchase_cost numeric(12,2),
  sale_price numeric(12,2),
  currency char(3) NOT NULL DEFAULT 'BOB',
  status inventory_status NOT NULL DEFAULT 'AVAILABLE',
  description text,
  observations text,
  location_id uuid REFERENCES locations(id),
  barcode text,
  qr_token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES users(id),
  updated_by uuid REFERENCES users(id)
);

CREATE INDEX products_search_idx
  ON products USING gin (
    to_tsvector(
      'simple',
      coalesce(internal_code, '') || ' ' ||
      coalesce(model, '') || ' ' ||
      coalesce(size, '') || ' ' ||
      coalesce(color, '') || ' ' ||
      coalesce(barcode, '')
    )
  );

CREATE TABLE product_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id),
  image_url text NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_number text NOT NULL UNIQUE,
  seller_id uuid NOT NULL REFERENCES users(id),
  location_id uuid REFERENCES locations(id),
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  discount numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0,
  payment_method text,
  observations text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sale_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES sales(id),
  product_id uuid NOT NULL REFERENCES products(id),
  original_price numeric(12,2) NOT NULL,
  sale_price numeric(12,2) NOT NULL,
  discount numeric(12,2) NOT NULL DEFAULT 0,
  purchase_cost_snapshot numeric(12,2),
  UNIQUE (product_id)
);

CREATE TABLE inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id),
  movement_type movement_type NOT NULL,
  previous_status inventory_status,
  new_status inventory_status,
  user_id uuid REFERENCES users(id),
  reference_type text,
  reference_id uuid,
  observations text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id),
  action text NOT NULL,
  entity text NOT NULL,
  entity_id uuid,
  before_values jsonb,
  after_values jsonb,
  ip_address inet,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_filename text NOT NULL,
  file_sha256 text NOT NULL,
  status text NOT NULL DEFAULT 'ANALYZED',
  total_rows integer NOT NULL DEFAULT 0,
  valid_rows integer NOT NULL DEFAULT 0,
  warning_rows integer NOT NULL DEFAULT 0,
  error_rows integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE import_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_batch_id uuid NOT NULL REFERENCES import_batches(id),
  excel_sheet text NOT NULL,
  excel_row integer NOT NULL,
  internal_code text,
  normalized_payload jsonb NOT NULL,
  original_payload jsonb NOT NULL,
  validation_status text NOT NULL,
  validation_messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (import_batch_id, excel_sheet, excel_row)
);

INSERT INTO roles (code, name) VALUES
  ('SUPER_ADMIN', 'Super administrador'),
  ('ADMIN', 'Administrador'),
  ('SELLER', 'Vendedor')
ON CONFLICT (code) DO NOTHING;

INSERT INTO categories (name) VALUES
  ('Tenis/Calzado'),
  ('Ropa')
ON CONFLICT (name) DO NOTHING;

INSERT INTO conditions (name, sort_order) VALUES
  ('Premium', 10),
  ('Excelente', 20),
  ('Muy bueno', 30),
  ('Bueno', 40),
  ('Regular', 50)
ON CONFLICT (name) DO NOTHING;

INSERT INTO locations (name) VALUES
  ('Raguilex Principal')
ON CONFLICT (name) DO NOTHING;

INSERT INTO internal_code_counters (prefix, last_number) VALUES
  ('TN', 300)
ON CONFLICT (prefix) DO UPDATE SET
  last_number = GREATEST(internal_code_counters.last_number, excluded.last_number),
  updated_at = now();

CREATE OR REPLACE FUNCTION next_internal_code(p_prefix text DEFAULT 'TN')
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  next_number integer;
BEGIN
  INSERT INTO internal_code_counters(prefix, last_number)
  VALUES (p_prefix, 0)
  ON CONFLICT (prefix) DO NOTHING;

  UPDATE internal_code_counters
  SET last_number = last_number + 1,
      updated_at = now()
  WHERE prefix = p_prefix
  RETURNING last_number INTO next_number;

  RETURN p_prefix || '-' || lpad(next_number::text, 5, '0');
END;
$$;
