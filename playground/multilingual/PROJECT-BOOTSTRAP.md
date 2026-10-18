> **REFERENCE ONLY.** This file is a copy inside `playground/multilingual` for local reading.
> Authoritative bootstrap instructions live at the **repo root** `PROJECT-BOOTSTRAP.md`.
> Do not copy this Playground into a client project.

# CMS Template → פרויקט אמיתי

מסמך הפעלה לסוכן או למפתח שלוקח את ה־CMS Template ומקים ממנו אתר עצמאי עבור לקוח.

## עקרונות מחייבים

- ה־Template הוא מקור בלבד; לא עובדים עליו ישירות.
- כל פרויקט חדש מקבל Git repository, Pages project, D1 ו־R2 נפרדים.
- לא מעתיקים `.git`, `.wrangler`, `node_modules`, `storage/media` או `playground/`.
- לא משתמשים ב־Database, Bucket, דומיין, מדיה או credentials של פרויקט אחר.
- אין להריץ `db:reset` מול Database משותף או מרוחק.

## Playground multilingual - REFERENCE ONLY

`playground/multilingual/` הוא **מימוש ייחוס מגרסא** (he+en) בלבד.

- **אין** להעתיק את התיקייה wholesale לפרויקט לקוח קיים.
- **אין** להתייחס אליו כמקור האמת של ה־Template.
- הוראות סמכותיות לריבוי שפות: `CMS-MULTILINGUAL-PROMPT.md` + מסמך זה.
- מותר לעיין ב־Playground כדי להבין דפוסי routing/SSR/hreflang/admin locales.
- כשמוסיפים multilingual לפרויקט אמיתי: מיישמים מול ה־Template דרך הפרומפט; ה־Playground הוא דוגמה לקריאה בלבד.
- אין להריץ deploy / migrate remote / seed remote מתוך ה־Playground.

## שלב 0 — החלטות שפה לפני המימוש

כל פרויקט חדש מתחיל כ־locale-ready, גם אם הוא חד־לשוני:

- `defaultLocale` הוא שפת התוכן הראשית.
- `locales` מתחיל עם `[defaultLocale]` בלבד.
- `multilingual` ו־`enabled` נגזרים מ־`locales.length > 1` ואינם ערכים ידניים.
- במצב חד־לשוני אין language switcher ציבורי, prefix או `hreflang`.
- Admin Chrome i18n כבר קיים ב־Template (מילון `he`+`en`); בחד־לשוני הבוררים מוסתרים וה־chrome נעול ל־`defaultLocale`.
- slugs באנגלית הם ברירת המחדל, אלא אם הלקוח ביקש במפורש slugs מקומיים.

בתחילת כל פרויקט הסוכן חייב לשאול ולתעד במפורש:

1. אילו שפות הפרויקט צריך לתמוך בהן עכשיו ומהם ה־locales המדויקים?
2. מהו `defaultLocale` בפועל?
3. האם שפות נוספות הן חלק מההשקה הראשונה או שלב עתידי?
4. האם הפרויקט דורש חריגה מברירת המחדל של slugs באנגלית?
5. אילו שדות נחשבים חובה לפרסום בכל ישות?
6. האם תוכן עשיר דורש HTML מוגבל, Markdown או טקסט פשוט?
7. האם יש צורך ב־Admin roles מעבר למשתמש Admin יחיד?
8. האם יש עמוד landing מיוחד עבור `x-default`, או שהוא מצביע תמיד ל־default locale?

אם אין תשובה אחרת, יש להתחיל עם שפה אחת בלבד — שפת ברירת המחדל — ולהפעיל את פרומפט multilingual רק לאחר אישור מפורש להוספת שפה שנייה.

## הקמת repository חדש

```bash
rsync -a \
  --exclude='.git' \
  --exclude='.wrangler' \
  --exclude='node_modules' \
  --exclude='storage/media/*' \
  --exclude='playground' \
  --exclude='.serena' \
  /path/to/cms-template/ \
  /path/to/new-client-site/

cd /path/to/new-client-site
git init
npm install
git add .
git commit -m "Initialize site from CMS template"
```

## Prompt מוכן לסוכן

אפשר להדביק את הפרומפט הבא לסוכן שמקבל את ה־Template:

```text
אתה אחראי להפוך את ה־CMS Template לפרויקט אמיתי ועצמאי עבור לקוח.

קודם קרא במלואו את הקובץ:
PROJECT-BOOTSTRAP.md

עבוד רק לפי ההוראות שבו ולפי כללי הפרויקט. אל תניח שמשימה הושלמה רק משום שקיים קובץ או route; אמת כל דבר בקוד, ב־Git ובבדיקות.

היעד:
- ליצור repository עצמאי ונקי.
- לחבר Cloudflare Pages, D1 ו־R2 ייעודיים לפרויקט.
- להסיר כל תוכן, מדיה, URL, ID, credential או brand של פרויקט אחר.
- להשלים תוכן, SEO, SSR, CMS, Preview, Publish, Rollback ו־Audit Log.
- להשאיר את הפרויקט מוכן ל־Preview ולמסירה.

לפני שינוי כלשהו:
1. בדוק:
   git status --short
   git log --oneline -10
   git diff --stat
   git diff
2. בדוק את מבנה הפרויקט, bindings, migrations, scripts, README ו־PROJECT-BOOTSTRAP.md.
3. זהה אם סוכן אחר פעיל או אם שרת פיתוח/Database נמצאים בשימוש.
4. אל תדרוס שינויים קיימים ואל תשתמש ב־reset או checkout הרסניים.

ב־Project Kickoff תעד את תשובות השפה לפני יצירת התוכן:
- `defaultLocale`:
- `locales`:
- שפות נוספות בהשקה או בעתיד:
- multilingual בהשקה: כן/לא
- slugs מקומיים: כן/לא
- שדות חובה לפרסום:
- פורמט תוכן עשיר: plain text / Markdown / HTML מוגבל
- Admin roles נוספים: כן/לא
- `x-default`: default locale / landing נפרד

אם `locales` מכיל יותר משפה אחת, קרא והפעל גם את `CMS-MULTILINGUAL-PROMPT.md` (הפעלת locales + תוכן/URLs/SEO/Publish - לא יצירת Admin Chrome מחדש). אם יש רק locale אחד, אל תפעיל את פרומפט multilingual ואל תוסיף UI ציבורי, prefix או `hreflang`.

כללי אבטחה:
- אל תשמור סיסמאות, tokens, API keys או credentials ב־Git.
- אל תשתמש ב־D1 או R2 של פרויקט אחר.
- אל תריץ db:reset על Database משותף או מרוחק.
- אל תריץ migration מרוחק בלי לוודא את ה־ID והסביבה.
- אל תגדיר ALLOW_DEMO_REMOTE_SEED ב־CI או ב־Deploy.
- אם נדרש seed מרוחק, עצור ואמת שזה Database חדש, ואז החלף מיד את סיסמת הדמו.
- אל תבצע Deploy ל־Production בלי אישור מפורש.

בצע את העבודה בשלבים:
1. הקם repository חדש ללא היסטוריית Git של ה־Template.
2. עדכן package.json, wrangler.toml, Pages project, D1, R2 ו־canonical origin.
3. הרץ migration מקומי/מרוחק רק בסביבה הנכונה.
4. הגדר תוכן, שירותים, תיק עבודות, אנשי קשר, SEO ומדיה דרך ה־CMS.
5. אמת SSR בכל הנתיבים הציבוריים.
6. אמת Draft → Preview → Publish → Rollback.
7. אמת Login, Logout, Change Password, CSRF, rate limiting והעלאת מדיה.
8. אמת Audit Log:
   - כתיבת אירועים.
   - actor, פעולה, entity, זמן ו־before/after.
   - Publish ו־Rollback.
   - API מוגן לקריאה.
   - pagination וסינון.
   - redaction של סיסמאות וטוקנים.
   - אין DELETE ל־Audit Logs.
   - UI לקריאה בלבד.
9. חפש שאריות של הפרויקט המקורי: שמות, טלפונים, מיילים, URLs, מדיה, filenames ו־Cloudflare IDs.
10. הרץ את בדיקות הקבלה רק מול סביבה מקומית מבודדת.

בדיקות מינימליות:
- node --check לכל JavaScript שהשתנה.
- git diff --check.
- npm run test:acceptance.
- npm run test:ssr.
- npm run test:audit.
- בדיקות ידניות ל־Preview, Publish, Rollback, 404, SEO, מדיה ו־Admin.

אם בדיקה משנה D1, ודא מראש שזה D1 מקומי ומבודד. אל תבצע בדיקה הרסנית על סביבה משותפת.

בסיום אל תבצע commit אלא אם התבקש במפורש. דווח בפורמט הבא:

מצב נוכחי:
- Branch:
- Commit אחרון:
- שינויים לא מחויבים:
- סוכן/שרת פעיל:

הושלם:
- רשימת משימות שאומתו בפועל.

בדיקות:
- מה הורץ ומה עבר.
- מה לא הורץ ולמה.

בעיות או חסמים:
- חומרה.
- קובץ ושורה.
- הבעיה וההשפעה.
- מה נדרש לתיקון.

מסירה:
- Repository:
- Production URL:
- Preview URL:
- Pages project:
- D1:
- R2:
- Last migration:
- Audit Log:
- Known limitations:
- Rollback procedure:

לעולם אל תדווח על הצלחה שלא אומתה. אל תכלול בדוח סיסמאות, tokens או credentials.
```


לא ממשיכים לפני שבודקים שה־repository החדש אינו מכיל היסטוריה או remote של פרויקט אחר.

## סדר עבודה מחייב

1. יצירת repository חדש.
2. שינוי שמות הפרויקט וה־Cloudflare resources.
3. יצירת D1 ו־R2 חדשים.
4. עדכון bindings ו־canonical origin.
5. הרצת migration בלבד.
6. הפעלה מקומית ובדיקת הבסיס.
7. התאמת תוכן, SEO ומדיה דרך ה־CMS.
8. בדיקות Draft → Preview → Publish → Rollback.
9. בדיקות אבטחה, ניקיון Template ו־fallback.
10. Preview deployment, בדיקה, ורק אז Production.

## זהות הפרויקט וה־bindings

יש לעדכן לפני חיבור לענן:

- `name` ו־`description` ב־`package.json`.
- `name` ו־`database_name` ב־`wrangler.toml`.
- `database_id` ו־`preview_database_id` של D1 החדש.
- `bucket_name` ו־`preview_bucket_name` של R2 החדש.
- `--project-name` בפקודת `deploy`.
- `CANONICAL_ORIGIN` ב־`functions/_shared/seo.js` לאחר שיש דומיין אמיתי.

ה־bindings הצפויים הם `DB` ל־D1, `MEDIA` ל־R2 ו־`ASSETS` ל־Pages Assets. אין להכניס secrets, API tokens או credentials ל־Git.

יש לתעד פנימית את Pages project, D1 name/ID, R2 bucket, הדומיינים, סביבת Preview/Production ובעלי ההרשאות.

## יצירת Cloudflare resources

אפשר להשתמש ב־Dashboard או ב־Wrangler. יש ליצור משאבים ייעודיים לפרויקט החדש בלבד, ולא לשנות משאב קיים לפני אימות השם וה־ID.

החלף placeholders ב־`wrangler.toml` רק לאחר יצירת D1 ו־R2. ודא שה־IDs שייכים לאותו חשבון ולסביבה הנכונה.

## אתחול Database

### מקומי

```bash
npm run db:reset
npm run dev
```

`db:reset` מיועד לסביבה מקומית בלבד ומוחק תוכן דמו קיים.

### מרוחק

ב־Database חדש בלבד:

```bash
npm run db:migrate:remote
```

יש להריץ migration לפני seed. ה־seed המרוחק חסום כברירת מחדל, משום שהוא מתקין סיסמת דמו. אם בוחרים להשתמש בו בכוונה:

```bash
ALLOW_DEMO_REMOTE_SEED=1 npm run db:seed:remote
```

מיד לאחר מכן:

1. התחבר ל־Admin.
2. החלף את סיסמת הדמו לסיסמה חזקה וייחודית.
3. ודא שהסיסמה הישנה אינה עובדת.
4. אל תשמור את הסיסמה ב־Git, `.env`, logs או handoff.

אין להגדיר `ALLOW_DEMO_REMOTE_SEED` ב־CI או בסקריפט Deploy. לפני migration מרוחק יש לוודא שיש גיבוי ונוהל rollback.

## תוכן, מדיה ו־CMS

יש להגדיר דרך Admin בלבד:

- שם העסק ומיתוג.
- כותרת, תיאור ו־About.
- שירותים.
- תיק עבודות וקטגוריות.
- טלפון, WhatsApp, אימייל ואינסטגרם.
- SEO title, description ו־OG image.
- מדיה באמצעות R2.

`storage/media/` הוא מקור מקומי זמני ואינו מנוהל ב־Git. אין להחזיר מדיה תחת `public/`, משום שהיא תישלח בכל Deploy.

## SSR ו־SEO

בתגובה הראשונית של כל נתיב ציבורי יש לוודא קיום של:

- שם העסק, כותרת ותיאור.
- canonical לדומיין הנכון.
- Open Graph title, description, URL ו־image.
- JSON-LD תקין.
- שירותים ותוכן מרכזי ב־HTML הראשוני.
- `data-ssr="1"`.

בדוק את `/`, `/about/`, `/services/`, `/portfolio/` ו־`/faq/`.

לאחר Publish, שינוי SEO דרך CMS חייב להופיע בלי Deploy חדש. Preview חייב לקרוא Draft בלבד, להשתמש בטוקן זמני, להחזיר `X-Robots-Tag: noindex, nofollow, noarchive` ולא להיכנס ל־cache ציבורי.

## Draft → Preview → Publish → Rollback

יש לאמת את התהליך הבא:

1. שינוי Draft.
2. בדיקה שהאתר הציבורי עדיין מציג את הגרסה הקודמת.
3. יצירת Preview ובדיקה שה־Draft מוצג עם noindex.
4. Publish.
5. בדיקה שה־HTML הציבורי וה־SEO התעדכנו.
6. יצירת גרסה נוספת.
7. Rollback.
8. בדיקה שהתוכן והקישורים למדיה חזרו לגרסה הקודמת.
9. בדיקה ש־Publish מקביל מקבל נעילה.

Rollback אינו מוחק מדיה מ־R2. מחיקת מדיה צריכה להיות פעולה מפורשת ומתועדת.

## Audit Log

Audit Log נמצא ב־`migrations/004_audit_log.sql` ומשולב גם ב־`schema.sql`.

הטבלה מתעדת משתמש, פעולה, סוג ישות, מזהה ישות, תקציר, `details_json` עם `before`/`after` כאשר רלוונטי, הצלחה/כישלון וזמן.

פעולות שנרשמות כוללות שינויי תוכן (רק שדות ששונו, עם before/after), שירותים, תיק עבודות, העלאת/מחיקת מדיה, יצירת Preview token (בלי ערך הטוקן), Publish ו־Rollback (כולל כשלים עם `success = 0`), וכן `auth.login` / `auth.logout` / `auth.change_password` בלי credentials.

קריאה: `GET /api/admin/audit` (דורש Admin מחובר; 401 בלי התחברות) ולשונית **היסטוריית שינויים** באדמין. Pagination עם `limit` + `cursor`, סינון לפי `action` / `entity_type` / `actor_user_id` / `from` / `to`. אין DELETE ל־audit_log. פרטי actor מוחזרים כ־email בלבד; מפתחות רגישים ב־details מרודקטים בשרת.

מדיניות כתיבה: **best-effort**. כשל בכתיבת Audit לא מבטל את ה־mutation (Draft/Publish נשארים עקביים). אם בפרויקט לקוח נדרש Audit מחייב, יש לשנות במפורש את `logAudit` כך שיזרוק שגיאה.

בדיקה מקומית מבודדת: `npm run test:audit` — מריצה מול `.wrangler/state-audit-test` ושרת זמני (לא מול `.wrangler/state` המשותף, לא remote/Production).

## בדיקות לפני Deploy

בסביבה מקומית נקייה בלבד:

```bash
npm run test:acceptance
npm run test:audit
npm run test:ssr
```

הבדיקות משנות את ה־D1 המקומי דרך Draft, Publish, Rollback ו־throttle. אין להריץ אותן מול Database משותף או Production.

בנוסף יש לבצע ידנית:

- Login, Logout והחלפת סיסמה.
- CSRF מבקשות cross-origin.
- rate limiting להתחברות.
- Preview עם טוקן תקין ולא תקין.
- העלאת תמונה ווידאו, גלריה, סינון, מיון ומחיקה.
- fallback כאשר D1 או API אינם זמינים.
- 404 עם שם העסק ופרטי קשר מה־CMS.
- חיפוש מלא של שמות, טלפונים, URLs ומדיה מהפרויקט המקורי.

## כללי בטיחות לסוכן

אין לבצע בלי אישור מפורש:

- `npm run db:reset` על סביבה שאינה מקומית.
- `git reset`, `git checkout` או מחיקת עבודת מפתח.
- migration על Database משותף.
- Deploy ל־Production.
- אתחול או תפיסת פורט של שרת שסוכן אחר משתמש בו.
- כתיבת secrets לקבצים או ל־Git.

לפני שינוי משמעותי יש לבדוק:

```bash
git status --short
git log --oneline -10
git diff --stat
git diff
```

## Definition of Done

פרויקט חדש מוכן למסירה רק כאשר:

- יש repository ו־history עצמאיים.
- אין remote, IDs, מדיה או תוכן של פרויקט אחר.
- D1 ו־R2 הם משאבים ייעודיים.
- migration הוחל בהצלחה.
- סיסמת הדמו הוחלפה ואינה בשימוש.
- תוכן, SEO ומדיה הוגדרו דרך ה־CMS.
- SSR אומת בכל נתיבי הציבור.
- Preview, Publish ו־Rollback עברו.
- Login, CSRF ו־rate limiting עברו.
- Audit writes עברו, ו־`GET /api/admin/audit` + לשונית היסטוריה + pagination/סינון עברו (`npm run test:audit`).
- אין secrets או קבצי `.env` ב־Git.
- כל בדיקות הקבלה עוברות.
- יש Preview URL, Production URL ונוהל Rollback מתועדים.
- אין שינויים לא מחויבים או קבצים לא מוסברים.

## מסירת הפרויקט

הסוכן מוסר סיכום קצר ללא סיסמאות, tokens או credentials:

```text
Repository:
Production URL:
Preview URL:
Pages project:
D1 database:
R2 bucket:
Last migration:
Tests:
Audit Log:
Known limitations:
Rollback procedure:
```

