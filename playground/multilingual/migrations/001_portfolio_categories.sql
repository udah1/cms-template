-- Multi-category support for portfolio items
ALTER TABLE portfolio_items ADD COLUMN categories TEXT NOT NULL DEFAULT '[]';

UPDATE portfolio_items
SET categories = '["' || REPLACE(category, '"', '') || '"]'
WHERE categories = '[]' OR categories IS NULL OR categories = '';
