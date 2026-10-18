# REFERENCE ONLY - Multilingual Playground

> **DO NOT COPY THIS DIRECTORY WHOLESALE INTO AN EXISTING CLIENT PROJECT.**
>
> `playground/multilingual` is a **versioned reference implementation** only.
> It is **not** the Template source of truth.
>
> - Authoritative instructions: repo-root [`CMS-MULTILINGUAL-PROMPT.md`](../../CMS-MULTILINGUAL-PROMPT.md) and [`PROJECT-BOOTSTRAP.md`](../../PROJECT-BOOTSTRAP.md).
> - Inspect this Playground only to understand one possible he+en implementation (routing, SSR, hreflang, admin locales).
> - When enabling multilingual on a real project: apply the Multilingual Prompt against the **Template root**, do not rsync this folder into a client site.
> - Do **not** deploy this Playground to the Template Cloudflare project. Local demo only (port 3788).

---

עותק reference של ה־CMS Template עם `locales: ['he', 'en']` להדגמה מקומית.

## הרצה מקומית

```bash
cd playground/multilingual
npm install
npm run db:reset
npm run dev
```

- עברית (default): http://127.0.0.1:3788/
- English: http://127.0.0.1:3788/en/
- ניהול: http://127.0.0.1:3788/admin/

### התחברות אדמין (דמו מקומי בלבד)

- אימייל: `admin@example.com`
- סיסמה: `ChangeMe123!`

סיסמה זו מיועדת **רק לסביבת פיתוח מקומית**. אין לפרוס את ה־Playground לאתר חי.

## מה כן / מה לא

| כן | לא |
|---|---|
| לעיין ב־middleware, SSR, switcher, seed דו־לשוני | להעתיק את כל התיקייה לפרויקט לקוח |
| להשוות דפוסים מול ה־Template | להריץ `deploy` / migrate remote מכאן |
| להריץ מקומית על פורט 3788 | לערבב D1/R2/IDs עם ה־Template הראשי |

`wrangler.toml` כאן משתמש ב־placeholders ובשם פרויקט נפרד ל־Pages. סקריפטי deploy/remote חסומים במכוון.

## מבנה

זהה בקווים כלליים ל־Template (`public/`, `functions/`, `schema.sql`, …) עם תוספות multilingual ציבוריות.

## בדיקות מקומיות

```bash
npm run test:admin-i18n
npm run test:migrate-005
```
