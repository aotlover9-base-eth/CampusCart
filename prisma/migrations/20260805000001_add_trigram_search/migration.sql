-- Trigram fuzzy search for listings.
--
-- pg_trgm gives us similarity ranking and typo tolerance ("labtop" → "laptop")
-- without an external search service. GIN indexes on title and description keep
-- the ILIKE and similarity() paths fast as the listing table grows.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS listings_title_trgm_idx
  ON listings USING GIN (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS listings_description_trgm_idx
  ON listings USING GIN (description gin_trgm_ops);

CREATE INDEX IF NOT EXISTS listings_custom_category_trgm_idx
  ON listings USING GIN ("customCategoryLabel" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS categories_name_trgm_idx
  ON categories USING GIN (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS users_fullname_trgm_idx
  ON users USING GIN ("fullName" gin_trgm_ops);
