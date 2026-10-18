# פרומפט אופציונלי ל־CMS Template — תמיכה בריבוי שפות

השתמש בפרומפט הזה רק כאשר פרויקט הלקוח דורש תמיכה ביותר משפה אחת.

```text
אתה אחראי להוסיף תמיכה אופציונלית בריבוי שפות לפרויקט המבוסס על CMS Template.

קודם קרא במלואם:
- PROJECT-BOOTSTRAP.md
- PLAN.md, אם קיים בפרויקט
- README.md
- schema.sql
- seed.sql
- מבנה ה־routes, ה־SSR, ה־SEO, ה־Admin וה־Publish הקיימים

תנאי מקדים — שלב 0 ב־Template:
- ה־Template כבר locale-ready עם `defaultLocale` ו־`locales: [defaultLocale]` בלבד.
- במצב זה אין UI לשפות ציבורי, `hreflang`, prefix או ניהול תרגומי תוכן.
- Admin Chrome i18n (תוויות ממשק, `adminLocale` / `contentLocale`) כבר ממומש ב־Template; פרומפט זה אינו יוצר אותו מחדש.
- פרומפט זה מפעיל locales נוספים ומרחיב תוכן, URLs, SEO ו־Publish - לא את מילון ה־Admin Chrome.
- `playground/multilingual/` (אם קיים בריפו) הוא REFERENCE ONLY: מותר לעיין בו כדוגמת מימוש; אסור להעתיק אותו wholesale לפרויקט לקוח. מקור ההוראות הוא פרומפט זה + PROJECT-BOOTSTRAP.md, לא ה־Playground.

מטרת העבודה:
- להוסיף תמיכה בריבוי שפות רק לפרויקט הנוכחי.
- לשמור על תמיכה מלאה בפרויקטים חד־לשוניים.
- לא לשנות את התנהגות ברירת המחדל כאשר multilingual אינו מופעל.
- לאפשר ניהול תוכן, Preview, Publish, Rollback ו־SEO לפי שפת תוכן (`contentLocale` / publish locale).
- לא להכניס credentials, secrets, tokens או מידע של פרויקט אחר.

## הפעלת multilingual בפרויקט locale-ready

כל פרויקט המבוסס על ה־Template מגיע עם תשתית locale מוכנה, גם אם בתחילת הדרך יש רק שפה אחת. פרומפט זה מופעל רק כאשר מוסיפים locale נוסף.

```js
const I18N = {
  defaultLocale: 'he',
  locales: ['he'],
  urlStrategy: 'default-root-with-prefixed-alternates'
};
```

`multilingual` ו־`enabled` הם ערכים נגזרים ואינם נשמרים כקונפיגורציה עצמאית:

```js
const multilingual = I18N.locales.length > 1;
const enabled = multilingual;
```

כאשר `locales.length === 1` (מצב הבסיס של ה־Template):

- האתר נשאר חד־לשוני מבחינת המשתמש.
- הנתיבים הקיימים נשארים `/`, `/about/`, `/services/` וכו'.
- אין language switcher ציבורי, `hreflang` או נתיבי locale חדשים.
- בוררי שפת ממשק / שפת תוכן ב־Admin מוסתרים; chrome נעול ל־`defaultLocale`.
- אין מסך ניהול תרגומים או הודעות תרגום ב־Admin.
- אין צורך להזין תוכן כפול.
- התנהגות ה־CMS, ה־SSR, ה־SEO וה־Publish נשארת זהה לפרויקט חד־לשוני רגיל.

כאשר מופעל יותר מ־locale אחד:

- מופעלים ניהול שפות, URLs, תרגומים, SEO ו־Publish לפי locale.
- Language switcher ציבורי: dropdown (`<select data-lang-switch>`) בכותרת + בתפריט מובייל; מוזרק מ־SSR רק כש־`locales.length > 1`. חייב להיות גלוי גם ב־LTR וגם ב־RTL במובייל.
- ב־Admin מוצגים שני selectors: שפת תוכן (`contentLocale`) ראשונה, ואחריה שפת ממשק (`adminLocale`). Preview/Publish/Rollback משתמשים ב־publish locale (= `contentLocale` שנלכד בתחילת הפעולה).
- ברירת מחדל: שינוי `contentLocale` מעדכן גם את `adminLocale` (follow). שינוי ידני של `adminLocale` נועל follow (`adminLocaleLocked` ב־localStorage); חזרה להתאמה לתוכן מבטלת את הנעילה.
- מותר `adminLocale=en` עם `contentLocale=he` (ולהיפך) אחרי נעילה ידנית.
- תוויות Admin Chrome מגיעות מקובצי UI (`public/admin/ui-i18n.js`); הודעות אתר ב־CMS נשארות ב־`system_messages` - לא לערבב.
- אין לשנות את מודל הנתונים או להחליף ארכיטקטורה; יש להפעיל ולהשלים יכולות שכבר קיימות.

המטרה היא שהוספת שפה בעתיד תהיה הוספת קונפיגורציה, תוכן ובדיקות — לא migration ארכיטקטוני גדול.

## עקרונות מחייבים

1. התמיכה בריבוי שפות היא Feature אופציונלי ומוגדר בקונפיגורציה.
2. חייבת להיות שפת ברירת מחדל אחת, למשל `he` או `en`.
3. רשימת השפות המופעלות חייבת להיות מפורשת, למשל `['he', 'en']`.
4. אין לבצע redirect אוטומטי לפי שפת הדפדפן.
5. אין לערבב תוכן משתי שפות באותו עמוד ציבורי.
6. אין להציג עמוד מתורגם חלקית כאילו הוא מלא.
7. אין לשבור נתיבים, API או CMS של פרויקט חד־לשוני.
8. אין להשתמש בתרגום אוטומטי בזמן ריצה ללא דרישה מפורשת.
9. אין לבצע Deploy ל־Production ללא אישור מפורש.
10. אין לבצע Commit אלא אם התבקש במפורש.

## קונפיגורציה

הוסף הגדרה ברורה, למשל:

```js
const I18N = {
  defaultLocale: 'he',
  locales: ['he', 'en'],
  urlStrategy: 'default-root-with-prefixed-alternates'
};
```

יש לבצע validation בזמן startup או build:

- `defaultLocale` חייב להופיע ב־`locales`.
- `locales` אינה ריקה וכוללת ערכים ייחודיים.
- כל locale חייב להיות בפורמט BCP-47 נתמך ובייצוג canonical: קוד שפה באותיות קטנות וקוד אזור באותיות גדולות, למשל `he`, `en` או `en-US`.
- `multilingual`/`enabled` מחושבים מ־`locales.length > 1`; אין לאפשר ערך ידני שסותר זאת.
- אין ליצור נתיבים, `hreflang` או נתוני תרגום עבור locale שאינו מופעל.
- ערכי locale נשמרים בצורה מנורמלת ועקבית, למשל lowercase עם מקף (`en`, `en-US` לפי מדיניות הפרויקט).

כאשר יש locale יחיד:
- האתר נשאר חד־לשוני.
- התוכן נשמר פנימית עם `defaultLocale`, אך המשתמש אינו נדרש לנהל locale.
- הנתיבים הקיימים ממשיכים לעבוד ללא שינוי.
- אין להוסיף `hreflang` שגוי או URL של שפה שאינה מופעלת.

## URL ו־Routing

בברירת המחדל המומלצת:
- שפת ברירת המחדל משתמשת ב־root, למשל `/` ו־`/services/`.
- שפות נוספות משתמשות ב־prefix, למשל `/en/` ו־`/en/services/`.

יש לממש:
- זיהוי locale מהנתיב (כולל חיבור ל־middleware / `resolveSsrPath` - לא להסתפק ב־helper של language switcher בלבד).
- בדיקה שה־locale מופעל.
- Public SSR: locale לא מוכר מחזיר `404` ואינו מבצע fallback שקט.
- Admin / API (`requestLocale`): locale חסר או לא מוכר מקבל soft-fallback ל־`defaultLocale` (נוחות עריכה בלבד). אין להחיל soft-fallback הזה על HTML ציבורי.
- עמוד מתורגם חלקית שאינו עומד בדרישות completeness אינו מתפרסם תחת URL של אותה שפה.
- אין להציג תוכן של שפה אחרת תחת URL של locale אחר.
- מתג שפה שמוביל לאותו עמוד לפי entity/page ID: מ־`/about/` אל `/en/about/`, ומ־`/en/about/` אל `/about/`.
- כאשר אין תרגום מלא בשפת היעד, מתג השפה מסומן כלא זמין או מוסתר; הוא אינו מוביל לעמוד חלקי ואינו מחליף תוכן בשפה אחרת.
- ברירת המחדל אינה מקבלת prefix: `/he/about/` אינו URL ציבורי קנוני. אם הוא נתמך לצורך תאימות, הוא מפנה באופן קבוע ל־`/about/` ללא שכפול תוכן.
- שמירת query parameters מתבצעת לפי allowlist מפורש בלבד; `preview`, tokens ופרמטרים רגישים אינם מועברים ב־redirect או ב־canonical.
- 404 דו־לשוני.
- sitemap דו־לשוני רק כאשר multilingual מופעל.

מדיניות ברירת המחדל היא:

- locale לא מוכר → `404`.
- route תקין ללא תרגום מלא → `404` עבור אותו locale.
- אין redirect אוטומטי לשפת ברירת המחדל.
- 404 עם locale תקין משתמש ב־`lang` וב־`dir` של אותו locale.
- 404 ללא locale משתמש ב־default locale.

## מיפוי עמודים ו־slugs

יש להגדיר מזהה יציב לעמוד או לישות, בנפרד מה־slug המוצג ב־URL.

- ברירת המחדל משתמשת ב־root: `/about/`.
- locale נוסף משתמש ב־prefix: `/en/about/`.
- ברירת המחדל היא slugs באנגלית ויציבים, למשל `about`, `services`, `portfolio`, `faq`, גם כאשר התוכן בעברית.
- slugs מתורגמים או מקומיים מותרים רק בעקבות דרישה מפורשת של הפרויקט.
- כאשר משתמשים ב־slugs מתורגמים, הם חייבים להיות unique בתוך locale ולשמור mapping יציב בין העמודים.
- מתג השפה משתמש ב־entity/page ID כדי למצוא את העמוד המקביל, לא בניחוש לפי טקסט ה־URL.
- כאשר עמוד מקביל אינו קיים, מתג השפה אינו מפנה ל־URL שבור.
- canonical תמיד מצביע לאותו locale ול־URL הסופי שלו.

## CMS ומסד הנתונים

אמת שה־Template כבר מספק את מבנה ה־locale של Stage 0. השלם על גבי המודל הקיים; אל תוסיף migration מקביל או מודל חדש אם היכולת כבר קיימת.

כל פרויקט משתמש במודל locale-ready, גם כאשר מופעל locale יחיד.

לתוכן כללי צריך להיות locale כחלק מהמודל הקיים, למשל:

```text
site_content
  key
  locale
  value
```

עם unique constraint על `key + locale`.

המלצת Template אחידה לישויות מתורגמות היא מודל `base` + טבלת `*_translations`:
- טבלת ה־base מחזיקה מזהה יציב ושדות שאינם תלויי שפה.
- טבלת התרגומים מחזיקה `entity_id`, `locale` ושדות טקסט/SEO.
- יש unique constraint על `entity_id + locale` ו־foreign key ל־base.
- אין להמציא מודל שונה לכל פרויקט ללא סיבה מתועדת.

לשירותים, פרויקטים, FAQ ודפי תוכן:
- שמור שדות שאינם תלויי שפה פעם אחת בלבד.
- שמור title, description, body, category, alt text ו־SEO לפי locale.
- שמור קשר יציב בין תרגומים של אותה ישות.
- אל תשכפל מדיה ללא צורך.
- הוסף migration חדש; אל תשנה migration שכבר הורץ.

מודל הגרסאות חייב להיות locale-aware:

- לכל `site_version` יש `locale`.
- `site_publish_state` נשמר לפי locale, ולא כרשומה גלובלית יחידה.
- `published_version_id`, `previous_version_id` ו־`publishing` אינם מערבבים בין שפות.
- `audit_log` כולל locale כאשר הפעולה קשורה לתוכן או לגרסה. יומן ה־CMS מתעד שינויי תוכן/Publish בלבד - לא auth/preview ולא bookkeeping אוטומטי של freshness/outdated (פירוט ב־`PROJECT-BOOTSTRAP.md`).
- Publish של שפה אחת אינו משנה את ה־published state של שפה אחרת.

Payload מפורסם חייב להיות snapshot מלא ומבודד של locale יחיד, ולא אוסף ערכים שמתמזג בזמן הבקשה:

```json
{
  "locale": "en",
  "versionId": "v_2026_0012",
  "status": "published",
  "publishedAt": "2026-10-18T10:30:00.000Z",
  "content": {
    "site": {},
    "pages": [],
    "services": [],
    "portfolio": [],
    "systemMessages": {}
  },
  "seo": {
    "title": "",
    "description": "",
    "canonical": ""
  }
}
```

ה־SSR טוען `Published Payload` לפי `locale + versionId`. אין להשלים את ה־payload מערכים של locale אחר בזמן render. Preview טוען snapshot של Draft באותו מבנה, עם `noindex`, ואינו משנה את ה־published state.

יש להגדיר migration/backfill מפורש:

1. להוסיף את מבנה ה־locale בצורה additive.
2. למפות את כל התוכן הקיים ל־`defaultLocale`.
3. לוודא שה־backfill idempotent וניתן להמשך לאחר כשל.
4. לאפשר לגרסה הישנה ולגרסה החדשה לקרוא את הנתונים במהלך המעבר, או להגדיר חלון Deploy שבו זה מובטח.
5. לאשר ספירת רשומות, uniqueness ושלמות נתונים לפני הפעלת locale נוסף.

שדרוג DB קיים (pre-locale → locale-ready) ב־Template:
- אל תריץ את `migrations/005_locale_ready.sql` ישירות על DB חי (`wrangler d1 execute --file=...`). DDL של DROP/ALTER אינו אטומי ב־D1/SQLite.
- השתמש ב־runner: `npm run db:migrate:locale-ready` (ו־`-- --remote` למרוחק).
- ה־runner חייב להיות resume-safe: לזהות צעדים שהושלמו, להמשיך מ־`*_mig` מלאה אם המקור כבר נמחק, ולא למחוק טבלת ביניים שעלולה להיות העותק היחיד של הנתונים.
- בדיקה מבודדת: `npm run test:migrate-005` (D1 נפרד תחת `.wrangler/state-migrate-005-test`; bootstrap אחד ב־wrangler ואז sqlite3; timeout ברירת מחדל 90s דרך `MIGRATE_005_TEST_TIMEOUT_MS`).

אין להפעיל multilingual בפרויקט קיים לפני שה־backfill אומת.

ב־Admin יש להוסיף:
- בחירת שפת תוכן לעריכה (ראשונה ויזואלית); שפת ממשק משנית עם follow/lock כמתואר למעלה.
- הצגת מצב תרגום: `missing`, `draft`, `published`.
- סימון ברור לשדות שחסר להם תרגום.
- Preview לפי שפה.
- בגרסה הראשונה Publish מתבצע לפי locale בלבד; אין Publish-all שאינו אטומי.
- Publish של locale יחיד אינו משנה את הגרסה המפורסמת של locale אחר.
- אם יתווסף בעתיד Publish-all, הוא חייב להתבסס על snapshot אטומי או state machine עם recovery מוגדר; אין לממש פעולה חלקית בלי מדיניות מפורשת.
- מניעת Publish של עמוד חסר אם הוא מסומן כ־required.
- אין לשמור סיסמאות, tokens או credentials כחלק מתרגום.

יש להפריד בין שני סוגי הודעות:
- Admin chrome קבוע — ניווט, כפתורים, labels ו־ARIA של ממשק הניהול — מנוהל בקבצי UI i18n של הקוד, ולא כתוכן עסקי ב־DB.
- הודעות אתר הניתנות לעריכה — הודעות הצלחה/שגיאה, labels עסקיים, CTA וטקסטים שמנהל האתר צריך לשנות — מיועדות ל־`system_messages` locale-aware:

```text
system_messages
  key
  locale
  value
```

ב־v1 הנוכחי: הטבלה, ה־Published Payload ומעקב freshness קיימים; **אין** מסך/endpoint Admin לעריכת `system_messages`. כשיוסיפו עורך - יש לחבר אותו לאותו מסלול preflight → write → bump/mark כמו `site_content`. עד אז chrome נשאר ב־`ui-i18n.js` בלבד.

ב־single-locale התשתית קיימת אך Admin מציג רק את שפת ברירת המחדל, ללא מסך ניהול תרגומים.

יש להגדיר לכל ישות מטריצת completeness:

- שדות חובה חייבים להיות מתורגמים לפני Publish של אותו locale.
- שדות אופציונליים מסומנים כחסרים אך אינם מקבלים fallback שקט.
- אין להציג ערך משפה אחרת תחת locale נוכחי.
- תוכן משותף שאינו טקסטואלי נשמר פעם אחת ומקושר לכל התרגומים.

## קטגוריות ותוכן מוזרק ב־SSR

- `parseCategories` / קריאת תרגומים חייבות לתת אמון בערכים השמורים לפי locale. אין לסנן קטגוריות EN מול allowlist עברי בלבד (זה מחזיר `כללי` בטעות תחת `/en/`).
- רשימת הקטגוריות ב־Admin API חייבת להיות לפי `contentLocale` (למשל `portfolioCategoriesForLocale`).
- החלפת innerHTML לפי `id` או `data-content-html` ב־SSR חייבת לספור עומק תגיות תואמות. Regex שעוצר ב־closing tag הראשון משאיר placeholders בעברית ליד תוכן באנגלית.
- שדות CMS (`data-content`) אינם מספיקים לבדם: chrome סטטי בתבנית (ניווט, כותרות מקטע, CTA, aria-labels) חייב לעבור החלפה לפי locale (מילון chrome / `applyStaticChrome`), אחרת העמוד נשאר מעורב.
- Client hydrate (`public/js/site.js`) חייב לקרוא `/api/public/site?locale=...` לפי `document.documentElement.lang` (או מקביל), לא את default locale בלבד.

## SSR ו־SEO

לכל locale מופעל יש להפיק HTML ראשוני מלא בשפה הנכונה.

לכל עמוד ולכל שפה יש להגדיר:
- `lang` נכון.
- `dir="rtl"` לעברית ו־`dir="ltr"` לאנגלית.
- title.
- meta description.
- canonical עצמי.
- Open Graph title, description, URL ו־image.
- JSON-LD עם `inLanguage` מתאים.
- `hreflang` לכל השפות המופעלות.
- ב־multilingual `x-default` מצביע ל־default locale; עמוד landing נפרד הוא חריג שדורש החלטה מפורשת.

כללים:
- canonical של `/en/about/` אינו יכול להצביע ל־`/about/`.
- אין להוסיף `hreflang` לשפה שאינה מופעלת.
- Preview חייב להחזיר `X-Robots-Tag: noindex, nofollow, noarchive`.
- Preview לא ייכנס ל־cache ציבורי.
- sitemap לא יכלול טיוטות, Preview או שפות כבויות.
- שינוי SEO דרך CMS חייב להופיע לאחר Publish ללא Deploy חדש.

ב־single-locale אין להוסיף `hreflang`, prefix או `x-default` שאינם נדרשים.

## UI, RTL ו־Accessibility

- יש לבדוק את כל הרכיבים ב־RTL וב־LTR.
- אין להסתמך על `margin-left`/`margin-right` כאשר logical properties מתאימים יותר.
- בדוק תפריט, Header, Footer, טפסים, כרטיסים, גרידים, מודלים וטבלאות.
- מתג השפה חייב להיות נגיש במקלדת ובקורא מסך.
- לכל שפה יהיו labels, הודעות שגיאה, הודעות הצלחה ו־ARIA labels מתורגמים.
- אין להכניס טקסט בשפה אחת לתוך רכיב של השפה השנייה.
- יש לכבד `prefers-reduced-motion`.

## API, Cache ו־Publish

- API של תוכן יקבל locale באופן מפורש או יגזור אותו מ־route.
- אין להחזיר תוכן של locale אחר בגלל cache key חסר.
- יש לכלול locale בכל cache key רלוונטי.
- יש לכלול גם version בכל cache key של HTML, SEO ו־sitemap.
- Publish ו־Rollback חייבים לבצע invalidation או החלפת namespace לגרסה החדשה.
- Preview חייב לעקוף cache ציבורי ולהיות תחום ל־locale ולמשתמש המורשה.
- Draft, Preview, Publish ו־Rollback חייבים לפעול לפי locale.
- Rollback לא ימחק תרגומים או מדיה.
- Audit Log יתעד שינויי תוכן ו־SEO כולל locale.
- אין לאפשר גישה ציבורית ל־Draft של locale אחר.

כללי הרשאות, roles, CSRF, rate limiting, optimistic locking, idempotency, validation, escaping ו־sanitization מחייבים מגיעים מ־`PROJECT-BOOTSTRAP.md` ומכללי ה־Template. אין להגדיר אותם מחדש בפרומפט הזה.

בעת הפעלת locale נוסף יש רק לוודא שהכללים הקיימים חלים גם על `locale`, `versionId` ו־Published Payload, ושאין גישה cross-project או ערבוב נתונים בין locales.

## בדיקות חובה

לפני דיווח על הצלחה הרץ ואמת:

1. `git status --short`
2. `git diff --check`
3. Regression מלא במצב locale יחיד עם schema חד־לשוני ותוכן קיים.
4. בדיקות קונפיגורציה לא תקינה: locale כפול, default חסר ו־locale לא נתמך.
5. בדיקות ריבוי שפות עבור כל locale מופעל.
6. SSR לכל נתיב בכל שפה.
7. `lang`, `dir`, canonical ו־hreflang.
8. sitemap ללא שפות כבויות או טיוטות.
9. מעבר שפה לפי entity/page ID.
10. locale לא תקין ותרגום חסר מחזירים את התוצאה שהוגדרה, ללא fallback שקט.
11. טופס קשר והודעות מערכת בשתי השפות.
12. Draft → Preview → Publish → Rollback לכל locale.
13. בדוק ש־Publish ו־Rollback משתמשים ב־Published Payload של locale נכון; בדיקות locking ו־conflict מגיעות מכללי ה־Template.
14. Cache separation ו־invalidation לפי locale ו־version.
15. מניעת ערבוב תוכן בין שפות.
16. Audit Log כולל locale וללא secrets.
17. בדיקות קלט זדוני מגיעות מכללי ה־Template; כאן יש לוודא במיוחד שאין ערבוב locale ב־SEO וב־JSON-LD.
18. בדיקה רספונסיבית ב־375px, 768px, 1024px ו־1440px.

מטריצת הבדיקה המינימלית היא:

```text
locale × route × state

he × /about/ × published
en × /en/about/ × published
en × /en/about/ × draft
en × /en/about/ × missing translation
xx × /xx/about/ × invalid locale
preview × locale
rollback × locale
```

לכל תא יש לאמת status code, שפת HTML, metadata, cache ו־visibility.

הבדיקות חייבות להשתמש ב־fixtures עם טקסטים שונים באופן חד־משמעי, למשל `HE_ONLY_MARKER` ו־`EN_ONLY_MARKER`, כדי לזהות ערבוב בין שפות. לכל בדיקה יש assertion מפורש; בדיקה ידנית בלבד אינה מספיקה.

יש להוסיף גם תרחישי כשל:

- migration שנקטע באמצע ו־backfill שממשיך ללא כפילויות.
- Publish שנכשל אחרי יצירת גרסה חלקית.
- שני עדכוני Draft מקבילים.
- Publish ו־Rollback מקבילים.
- Cache ישן לאחר שינוי SEO.
- גישה ל־Preview של locale אחר.
- query parameter זדוני או token ב־redirect.

אם קיימים scripts מתאימים, הרץ גם:
- `npm run test:admin-i18n`
- `npm run test:migrate-005`
- `npm run test:acceptance`
- `npm run test:ssr`
- `npm run test:audit`

## ניקיון ובטיחות

- חפש שמות, URLs, מיילים, מדיה ו־IDs של פרויקט קודם.
- אל תעתיק `.git`, `.wrangler`, `node_modules` או `storage/media` מפרויקט אחר.
- אל תריץ `db:reset` מול Database מרוחק או משותף.
- אל תריץ migration מרוחק בלי לאמת Database חדש ו־IDs נכונים.
- אל תגדיר `ALLOW_DEMO_REMOTE_SEED` ב־CI או ב־Deploy.
- אל תשמור credentials בקוד, בתרגומים, ב־logs או בדוח המסירה.
- שמור רק query parameters ב־allowlist; אל תשמור `token`, `preview` או פרמטר לא מוכר ב־redirect, canonical, Referer או cache.
- בצע redaction של secrets גם ב־Audit Log וגם בשגיאות.

## דיווח בסיום

דווח בנפרד על:
- האם multilingual הופעל.
- אילו locales פעילים.
- מהי שפת ברירת המחדל.
- מבנה ה־URLs.
- אילו migrations נוספו.
- אילו עמודים ושדות מתורגמים.
- אילו בדיקות עברו.
- אילו בדיקות לא הורצו ולמה.
- אילו תרגומים חסרים.
- אילו בעיות או מגבלות נשארו.

אל תדווח על תמיכה בריבוי שפות לפני שאומת בפועל התוכן, ה־SSR, ה־SEO, ה־CMS, ה־Preview, ה־Publish וה־Rollback בכל locale מופעל.
```

## ברירות מחדל ו־Project Kickoff

ברירות המחדל שכבר נקבעו במסמך:

- כל פרויקט locale-ready גם כאשר הוא חד־לשוני.
- default locale ללא prefix; locales נוספים עם prefix.
- slugs באנגלית כברירת מחדל; שינוי לכך דורש בקשה מפורשת.
- Public SSR: locale או תרגום חסר אינם מקבלים fallback שקט; התוצאה היא `404`.
- Admin / API: soft-fallback ל־`defaultLocale` ל־locale לא מוכר (לא להחיל על HTML ציבורי).
- Publish ו־Rollback מתבצעים לפי locale.
- שדרוג pre-locale → locale-ready רק דרך `npm run db:migrate:locale-ready` (לא SQL 005 ישיר על DB חי).
- Publish-all אינו חלק מגרסה ראשונה.
- `x-default` מצביע ל־default locale רק כאשר multilingual מופעל.
- Audit Log הוא read-only וללא DELETE.

אלה אינן חסמים של ה־Template. הן החלטות פתיחה שכל פרויקט חדש צריך לענות עליהן לפני הגדרת התוכן וה־CMS. יש לתעד את אותה רשימה ב־Bootstrap של הפרויקט, ולבקש החלטה מפורשת רק כאשר רוצים לחרוג מברירות המחדל:

1. אילו שפות הפרויקט צריך לתמוך בהן עכשיו ומהם ה־locales המדויקים.
2. מהו `defaultLocale` בפועל.
3. האם שפות נוספות הן חלק מההשקה הראשונה או שלב עתידי.
4. האם הפרויקט דורש חריגה מברירת המחדל של slugs באנגלית.
5. אילו שדות נחשבים חובה לפרסום בכל ישות.
6. האם תוכן עשיר דורש HTML מוגבל, Markdown או טקסט פשוט.
7. האם יש צורך ב־Admin roles מעבר למשתמש Admin יחיד.
8. האם יש עמוד landing מיוחד עבור `x-default`, או שהוא מצביע תמיד ל־default locale.

Bootstrap חייב להציג את השאלות האלה לסוכן בתחילת פרויקט חדש, לשמור את התשובות בתצורת הפרויקט או במסמך ההחלטות שלו, ולוודא שהן עקביות עם הסכימה, ה־CMS, ה־SSR, ה־SEO, ה־Preview וה־Publish. אם לא התקבלה תשובה אחרת, הסוכן משתמש בברירות המחדל שמעל וממשיך — הוא לא עוצר את הקמת הפרויקט בגלל שאלות אלה.

אם אין החלטה אחרת, יש להשתמש בברירות המחדל של המסמך ולא להמציא fallback או מודל Publish חדש בזמן המימוש.

## החלטת שימוש בפרויקט

בכל פרויקט חדש יש להגדיר במפורש:

- חד־לשוני: התשתית locale-ready קיימת, אך `locales` מכיל רק את `defaultLocale`; אין ניהול שפות, prefix, language switcher או `hreflang`.
- רב־לשוני: `locales` מכיל לפחות שתי שפות, ולכן `multilingual`/`enabled` נגזרים כ־`true`; מופעלים ניהול שפות, URLs, תרגומים, SEO ו־Publish לפי locale.

אין להעתיק מחדש או להחליף את מודל הנתונים בעת הוספת שפה עתידית. יש להוסיף locale לקונפיגורציה, ליצור את רשומות התרגום, להשלים backfill ובדיקות, ולבצע rollout מבוקר.
