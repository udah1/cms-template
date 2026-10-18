-- Demo admin: admin@example.com / ChangeMe123!
-- Change the password from the admin UI after first login.
DELETE FROM preview_tokens;
DELETE FROM sessions;
UPDATE site_publish_state SET published_version_id = NULL, previous_version_id = NULL, publishing = 0, updated_at = datetime('now') WHERE id = 1;
DELETE FROM site_versions;
DELETE FROM admin_users;
DELETE FROM site_content;
DELETE FROM services;
DELETE FROM portfolio_items;
INSERT OR IGNORE INTO site_publish_state (id, published_version_id, previous_version_id, publishing)
VALUES (1, NULL, NULL, 0);

INSERT INTO admin_users (email, password_hash) VALUES
  (
    'admin@example.com',
    'pbkdf2$100000$OCRanqg0FeJ2MmCwrrwQ6g==$ibrHETvTVFZ42BuNOiPy+ERdiUbFW1hkAVaRgDLiTQI='
  );

INSERT INTO site_content (key, value) VALUES
  ('business_name', 'שם העסק'),
  ('hero_eyebrow', 'שם העסק'),
  ('hero_title', 'פתרון מקצועי בהתאמה אישית'),
  ('hero_title_em', 'שירות איכותי שמתאים לצרכים שלך.'),
  ('hero_description', 'תיאור כללי של העסק. כאן אפשר להציג את הערך שאתם מציעים ללקוחות, בצורה ברורה ונגישה.'),
  ('brand_quote', 'המטרה שלנו היא לספק חוויה מקצועית, מדויקת ומותאמת אישית.'),
  ('about_title', 'נעים להכיר,'),
  ('about_title_em', 'אנחנו כאן בשבילכם.'),
  ('about_body', 'זהו טקסט דמו על העסק. ספרו מי אתם, מה הגישה שלכם, ומה הלקוחות יכולים לצפות ממכם.

התוכן הזה ניתן לעריכה מלאה מדף הניהול, יחד עם שירותים, גלריה והגדרות SEO.'),
  ('portfolio_lead', 'מבחר פרויקטים לדוגמה. החליפו בתמונות ובסרטונים שלכם.'),
  ('contact_intro', 'רוצים לשמוע עוד? שלחו הודעה ונחזור אליכם בהקדם.'),
  ('area_label', 'האזור שלכם'),
  ('instagram_url', 'https://www.instagram.com/'),
  ('contact_phone', '050-000-0000'),
  ('whatsapp_url', 'https://wa.me/972500000000'),
  ('whatsapp_message', 'שלום, אשמח לקבל פרטים נוספים.'),
  ('contact_email', 'hello@example.com'),
  ('seo_title', 'שם העסק | פתרון מקצועי בהתאמה אישית'),
  ('seo_description', 'תיאור כללי של העסק לשיתוף במנועי חיפוש וברשתות חברתיות.'),
  ('og_image', '/assets/brand-logo.png');

INSERT INTO services (title, description, sort_order, visible) VALUES
  ('שירות ראשון', 'תיאור קצר של השירות הראשון. ערכו מדף הניהול.', 1, 1),
  ('שירות שני', 'תיאור קצר של השירות השני. ערכו מדף הניהול.', 2, 1),
  ('שירות שלישי', 'תיאור קצר של השירות השלישי. ערכו מדף הניהול.', 3, 1);

INSERT INTO portfolio_items (title, category, categories, media_type, media_url, cover_url, alt_text, sort_order, visible, featured) VALUES
  ('פרויקט לדוגמה 1', 'כללי', '["כללי"]', 'image', '/assets/placeholder-1.svg', '', 'תמונה לדוגמה 1', 1, 1, 1),
  ('פרויקט לדוגמה 2', 'פרויקטים', '["פרויקטים"]', 'image', '/assets/placeholder-2.svg', '', 'תמונה לדוגמה 2', 2, 1, 1),
  ('פרויקט לדוגמה 3', 'גלריה', '["גלריה"]', 'image', '/assets/placeholder-3.svg', '', 'תמונה לדוגמה 3', 3, 1, 0);
