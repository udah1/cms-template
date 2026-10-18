# CMS Template

תבנית גנרית לאתר תדמית + דף ניהול על Cloudflare Pages, עם D1 (תוכן) ו-R2 (מדיה).

אין תלות בפרויקט לקוח ספציפי. כל התוכן ניתן לעריכה מדף הניהול.

## הרצה מקומית

```bash
npm install
npm run db:reset
npm run dev
```

- אתר: http://127.0.0.1:8788/
- ניהול: http://127.0.0.1:8788/admin/

### התחברות אדמין (דמו מקומי בלבד)

- אימייל: `admin@example.com`
- סיסמה: `ChangeMe123!`

סיסמה זו מיועדת **רק לסביבת פיתוח מקומית**. לפני כל פריסה (preview/production) החליפו אותה מיד מלשונית **סיסמה**, ואל תשתמשו בברירת המחדל באתר חי.

## מבנה

- `public/` - אתר ציבורי + אדמין
- `functions/api/` - API (auth, תוכן, גלריה, publish)
- `functions/media/` - הגשת מדיה מ-R2
- `schema.sql` / `seed.sql` - סכמת D1 ותוכן דמו
- `wrangler.toml` - Bindings ל-D1 ו-R2 (מזהים כ־placeholder)

## Draft → Preview → Publish → Rollback

- שמירה באדמין כותבת לטיוטה בלבד.
- האתר הציבורי קורא רק מגרסה מפורסמת.
- **Preview** - טוקן זמני, `/?preview=TOKEN`, עם `noindex`.
- **Publish** - צילום טיוטה לגרסה חדשה.
- **Rollback** - שחזור לגרסה הקודמת (מדיה לא נמחקת).

## Cloudflare (פריסה)

1. צרו D1 בשם `cms-template` ועדכנו `database_id` ב־`wrangler.toml`.
2. צרו R2 bucket בשם `cms-template-media` (או עדכנו את השם ב־toml).
3. `npm run db:migrate:remote` ואז seed מרחוק **רק במפורש**:
   `ALLOW_DEMO_REMOTE_SEED=1 npm run db:seed:remote`
   (בלי המשתנה הפקודה נחסמת - כדי ש־CI/deploy לא יזרעו סיסמת דמו בטעות.)
4. העלו מדיה: `npm run r2:create` (אם צריך) → `npm run r2:sync` → `npm run deploy`.
5. **חובה אחרי seed מרחוק:** התחברו לאדמין והחליפו את סיסמת הדמו לסיסמה חזקה ייחודית. אל תעלו אתר חי עם סיסמת הדמו. בהתחברות עם סיסמת הדמו האדמין יפנה אוטומטית ללשונית סיסמה; אי אפשר לשמור מחדש את סיסמת הדמו.
6. **אל תגדירו** `ALLOW_DEMO_REMOTE_SEED` ב־CI או בסקריפטי deploy.

העתיקו `.env.example` ל־`.dev.vars` רק אם אתם צריכים משתני סביבה מקומיים. אל תשמרו סיסמאות בגיט.

## בדיקת צינור פרסום

עם השרת המקומי רץ:

```bash
npm run test:acceptance
```

## שדות תוכן גנריים

`business_name`, `hero_title`, `hero_description`, `about_body`, `contact_phone`, `contact_email`, `seo_title`, `seo_description`, `og_image` - ועוד שדות תומכים הניתנים לעריכה באדמין. שירותים נשמרים בטבלת `services` (`title` / `description`).
