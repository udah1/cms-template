-- Demo admin (LOCAL ONLY): admin@example.com / ChangeMe123!
-- Never leave this password on a remote/production D1 after seed.
-- Change the password from the admin UI after first login.
-- Remote seed is gated: ALLOW_DEMO_REMOTE_SEED=1 npm run db:seed:remote
DELETE FROM preview_tokens;
DELETE FROM sessions;
UPDATE site_publish_state SET published_version_id = NULL, previous_version_id = NULL, publishing = 0, updated_at = datetime('now');
DELETE FROM site_versions;
DELETE FROM translation_status;
DELETE FROM translation_source_revisions;
DELETE FROM admin_users;
DELETE FROM site_content;
DELETE FROM service_translations;
DELETE FROM services;
DELETE FROM portfolio_item_translations;
DELETE FROM portfolio_items;
DELETE FROM system_messages;
INSERT OR IGNORE INTO site_publish_state (locale, published_version_id, previous_version_id, publishing)
VALUES ('he', NULL, NULL, 0);
INSERT OR IGNORE INTO site_publish_state (locale, published_version_id, previous_version_id, publishing)
VALUES ('en', NULL, NULL, 0);

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
  (3, 'he', 'פרויקט לדוגמה 3', 'גלריה', '["גלריה"]', 'תמונה לדוגמה 3'),
  (1, 'en', 'Sample project 1', 'General', '["General"]', 'Sample image 1'),
  (2, 'en', 'Sample project 2', 'Projects', '["Projects"]', 'Sample image 2'),
  (3, 'en', 'Sample project 3', 'Gallery', '["Gallery"]', 'Sample image 3');

INSERT INTO site_content (key, locale, value) VALUES
  ('business_name', 'en', 'Business Name'),
  ('hero_eyebrow', 'en', 'Business Name'),
  ('hero_title', 'en', 'A professional solution tailored to you'),
  ('hero_title_em', 'en', 'Quality service that fits your needs.'),
  ('hero_description', 'en', 'A short overview of the business. Share the value you offer clients in a clear, accessible way.'),
  ('brand_quote', 'en', 'Our goal is to deliver a professional, precise, and personal experience.'),
  ('about_title', 'en', 'Nice to meet you,'),
  ('about_title_em', 'en', 'We are here for you.'),
  ('about_body', 'en', 'This is demo copy about the business. Tell visitors who you are, how you work, and what clients can expect.

All of this content is editable from the admin, together with services, gallery, and SEO settings.'),
  ('portfolio_lead', 'en', 'A selection of sample projects. Replace with your own photos and videos.'),
  ('contact_intro', 'en', 'Want to learn more? Send a message and we will get back to you soon.'),
  ('area_label', 'en', 'Your area'),
  ('instagram_url', 'en', 'https://www.instagram.com/'),
  ('contact_phone', 'en', '050-000-0000'),
  ('whatsapp_url', 'en', 'https://wa.me/972500000000'),
  ('whatsapp_message', 'en', 'Hi, I would like more details.'),
  ('contact_email', 'en', 'hello@example.com'),
  ('seo_title', 'en', 'Business Name | A professional solution tailored to you'),
  ('seo_description', 'en', 'A general business description for search engines and social sharing.'),
  ('og_image', 'en', '/assets/brand-logo.png');

INSERT INTO service_translations (service_id, locale, title, description) VALUES
  (1, 'en', 'First service', 'Short description of the first service. Edit from the admin.'),
  (2, 'en', 'Second service', 'Short description of the second service. Edit from the admin.'),
  (3, 'en', 'Third service', 'Short description of the third service. Edit from the admin.');

-- Translation freshness rows are NOT seeded here (no locale hardcoding).
-- ensureAllTranslationStatusRows() creates revision/status rows from
-- I18N.defaultLocale + getLocales() on first Admin translations/content access.
-- DELETE above keeps db:reset clean.
