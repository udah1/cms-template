-- Demo admin (LOCAL ONLY): admin@example.com / ChangeMe123!
-- Never leave this password on a remote/production D1 after seed.
-- Change the password from the admin UI after first login.
-- Remote seed is gated: ALLOW_DEMO_REMOTE_SEED=1 npm run db:seed:remote
DELETE FROM preview_tokens;
DELETE FROM sessions;
UPDATE site_publish_state SET published_version_id = NULL, previous_version_id = NULL, publishing = 0, updated_at = datetime('now') WHERE locale = 'he';
DELETE FROM site_versions;
DELETE FROM admin_users;
DELETE FROM site_content;
DELETE FROM service_translations;
DELETE FROM services;
DELETE FROM portfolio_item_translations;
DELETE FROM portfolio_items;
DELETE FROM system_messages;
INSERT OR IGNORE INTO site_publish_state (locale, published_version_id, previous_version_id, publishing)
VALUES ('he', NULL, NULL, 0);

INSERT INTO admin_users (email, password_hash) VALUES
  (
    'admin@example.com',
    'pbkdf2$100000$OCRanqg0FeJ2MmCwrrwQ6g==$ibrHETvTVFZ42BuNOiPy+ERdiUbFW1hkAVaRgDLiTQI='
  );

INSERT INTO site_content (key, locale, value) VALUES
  ('business_name', 'he', 'שם העסק'),
  ('hero_eyebrow', 'he', 'שם העסק'),
  ('hero_title', 'he', 'פתרון מקצועי בהתאמה אישית'),
  ('hero_title_em', 'he', 'שירות איכותי שמתאים לצרכים שלך.'),
  ('hero_description', 'he', 'תיאור כללי של העסק. כאן אפשר להציג את הערך שאתם מציעים ללקוחות, בצורה ברורה ונגישה.'),
  ('brand_quote', 'he', 'המטרה שלנו היא לספק חוויה מקצועית, מדויקת ומותאמת אישית.'),
  ('about_title', 'he', 'נעים להכיר,'),
  ('about_title_em', 'he', 'אנחנו כאן בשבילכם.'),
  ('about_body', 'he', 'זהו טקסט דמו על העסק. ספרו מי אתם, מה הגישה שלכם, ומה הלקוחות יכולים לצפות ממכם.

התוכן הזה ניתן לעריכה מלאה מדף הניהול, יחד עם שירותים, גלריה והגדרות SEO.'),
  ('portfolio_lead', 'he', 'מבחר פרויקטים לדוגמה. החליפו בתמונות ובסרטונים שלכם.'),
  ('contact_intro', 'he', 'רוצים לשמוע עוד? שלחו הודעה ונחזור אליכם בהקדם.'),
  ('area_label', 'he', 'האזור שלכם'),
  ('instagram_url', 'he', 'https://www.instagram.com/'),
  ('contact_phone', 'he', '050-000-0000'),
  ('whatsapp_url', 'he', 'https://wa.me/972500000000'),
  ('whatsapp_message', 'he', 'שלום, אשמח לקבל פרטים נוספים.'),
  ('contact_email', 'he', 'hello@example.com'),
  ('seo_title', 'he', 'שם העסק | פתרון מקצועי בהתאמה אישית'),
  ('seo_description', 'he', 'תיאור כללי של העסק לשיתוף במנועי חיפוש וברשתות חברתיות.'),
  ('og_image', 'he', '/assets/brand-logo.png');

INSERT INTO services (id, sort_order, visible) VALUES
  (1, 1, 1),
  (2, 2, 1),
  (3, 3, 1);

INSERT INTO service_translations (service_id, locale, title, description) VALUES
  (1, 'he', 'שירות ראשון', 'תיאור קצר של השירות הראשון. ערכו מדף הניהול.'),
  (2, 'he', 'שירות שני', 'תיאור קצר של השירות השני. ערכו מדף הניהול.'),
  (3, 'he', 'שירות שלישי', 'תיאור קצר של השירות השלישי. ערכו מדף הניהול.');

INSERT INTO portfolio_items (id, media_type, media_url, cover_url, sort_order, visible, featured) VALUES
  (1, 'image', '/assets/placeholder-1.svg', '', 1, 1, 1),
  (2, 'image', '/assets/placeholder-2.svg', '', 2, 1, 1),
  (3, 'image', '/assets/placeholder-3.svg', '', 3, 1, 0);

INSERT INTO portfolio_item_translations (portfolio_item_id, locale, title, category, categories, alt_text) VALUES
  (1, 'he', 'פרויקט לדוגמה 1', 'כללי', '["כללי"]', 'תמונה לדוגמה 1'),
  (2, 'he', 'פרויקט לדוגמה 2', 'פרויקטים', '["פרויקטים"]', 'תמונה לדוגמה 2'),
  (3, 'he', 'פרויקט לדוגמה 3', 'גלריה', '["גלריה"]', 'תמונה לדוגמה 3');
