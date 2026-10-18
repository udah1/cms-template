/**
 * Admin Chrome UI strings (not site content / system_messages).
 * CONTENT_FIELD_DEFS stay structural in admin.js; FIELD_LABELS overlay labels only.
 */

export const UI_DEFAULT_LOCALE = 'he';
export const UI_LOCALES = ['he', 'en'];

export const FIELD_LABELS = {
  he: {
    business_name: 'שם העסק',
    hero_eyebrow: 'כותרת עליונה ב־Hero',
    hero_title: 'כותרת Hero',
    hero_title_em: 'משפט משנה ב־Hero',
    hero_description: 'תיאור Hero',
    brand_quote: 'משפט המותג',
    about_title: 'כותרת אודות',
    about_title_em: 'משפט משנה באודות',
    about_body: 'טקסט אודות',
    portfolio_lead: 'תיאור גלריה',
    contact_intro: 'טקסט יצירת קשר',
    area_label: 'אזור פעילות',
    instagram_url: 'קישור Instagram',
    contact_phone: 'טלפון / WhatsApp',
    whatsapp_url: 'כתובת WhatsApp (wa.me)',
    whatsapp_message: 'הודעה מקדימה ל־WhatsApp',
    contact_email: 'אימייל',
    seo_title: 'כותרת SEO',
    seo_description: 'תיאור SEO',
    og_image: 'תמונת OG (נתיב או URL)',
  },
  en: {
    business_name: 'Business name',
    hero_eyebrow: 'Hero eyebrow',
    hero_title: 'Hero title',
    hero_title_em: 'Hero subtitle',
    hero_description: 'Hero description',
    brand_quote: 'Brand quote',
    about_title: 'About title',
    about_title_em: 'About subtitle',
    about_body: 'About body',
    portfolio_lead: 'Portfolio lead',
    contact_intro: 'Contact intro',
    area_label: 'Service area',
    instagram_url: 'Instagram URL',
    contact_phone: 'Phone / WhatsApp',
    whatsapp_url: 'WhatsApp URL (wa.me)',
    whatsapp_message: 'WhatsApp prefilled message',
    contact_email: 'Email',
    seo_title: 'SEO title',
    seo_description: 'SEO description',
    og_image: 'OG image (path or URL)',
  },
};

export const UI_STRINGS = {
  he: {
    'doc.title': 'ניהול | שם העסק',
    'login.heading': 'ניהול האתר',
    'login.subtitle': 'שם העסק',
    'login.email': 'אימייל',
    'login.password': 'סיסמה',
    'login.submit': 'התחברות',
    'login.remember': 'זכור אותי',
    'login.logoAlt': 'לוגו העסק',
    'loading.boot': 'טוענים את לוח הניהול…',
    'loading.data': 'טוענים נתונים…',
    'header.brand': 'ניהול',
    'header.logout': 'יציאה',
    'nav.tabsAria': 'ניווט ניהול',
    'tab.content': 'תוכן',
    'tab.portfolio': 'תיק עבודות',
    'tab.translations': 'תרגומים',
    'tab.audit': 'היסטוריית שינויים',
    'tab.password': 'סיסמה',
    'translations.heading': 'תרגומים שדורשים טיפול',
    'translations.refresh': 'רענון',
    'translations.hint':
      'תרגומים חסרים או שאינם מעודכנים מול שפת המקור. "סמן כטופל" מאשר שראיתם את האזהרה בלי לעדכן את התרגום.',
    'translations.openPanel': 'עבור לתרגומים',
    'translations.dismissBanner': 'סגור',
    'translations.banner': 'התוכן ב{source} השתנה. כדאי לבדוק גם את התרגומים ב{locales}.',
    'translations.empty': 'אין תרגומים שדורשים טיפול כרגע.',
    'translations.goEdit': 'עבור לתרגום',
    'translations.acknowledge': 'סמן כטופל',
    'translations.loadFailed': 'טעינת סטטוסי תרגום נכשלה',
    'translations.ackOk': 'סומן כטופל',
    'translations.freshness.missing': 'חסר',
    'translations.freshness.outdated': 'לא מעודכן',
    'translations.freshness.current': 'מעודכן',
    'translations.review.acknowledged': 'טופל',
    'translations.review.normal': 'רגיל',
    'translations.fieldNeedsAttention': 'שדה זה דורש בדיקת תרגום',
    'publish.outdatedWarning': 'שימו לב: יש תרגומים לא מעודכנים. הפרסום מותר אך כדאי לבדוק אותם.',
    'locale.admin': 'שפת ממשק',
    'locale.content': 'שפת תוכן',
    'locale.adminAria': 'שפת ממשק הניהול (משתנה אוטומטית עם התוכן, אלא אם שיניתם ידנית)',
    'locale.contentAria': 'שפת התוכן לעריכה (משנה גם את שפת הממשק אם הממשק לא ננעל)',
    'locale.he': 'עברית',
    'locale.en': 'English',
    'publish.stripAria': 'פרסום',
    'publish.versionNone': 'גרסה מפורסמת: —',
    'publish.version': 'גרסה מפורסמת: #{id} · {date}',
    'publish.status.Published': 'פורסם',
    'publish.status.Publishing': 'מפרסם…',
    'publish.status.Failed': 'הפרסום נכשל',
    'publish.status.pending': 'יש שינויים לפרסום',
    'publish.preview': 'תצוגה מקדימה',
    'publish.publish': 'פרסום',
    'publish.rollback': 'שחזור',
    'publish.previewOpened': 'נפתחה תצוגה מקדימה של הטיוטה',
    'publish.publishing': 'מפרסם…',
    'publish.success': 'פורסם בהצלחה',
    'publish.failed': 'הפרסום נכשל',
    'publish.rolling': 'משחזר ומפרסם…',
    'publish.rollbackSuccess': 'שוחזר לגרסה הקודמת ופורסם',
    'publish.rollbackFailed': 'השחזור נכשל',
    'publish.confirmTitle': 'פרסום האתר',
    'publish.confirmMessage': 'לפרסם את הטיוטה הנוכחית לאתר הציבורי?',
    'publish.confirmOk': 'פרסום',
    'rollback.confirmTitle': 'שחזור לגרסה קודמת',
    'rollback.confirmMessage':
      'לשחזר את כל האתר (תוכן, גלריה, metadata ו־schema) לגרסה הקודמת שפורסמה? המדיה עצמה לא תימחק.',
    'rollback.confirmOk': 'שחזור',
    'content.heading': 'תוכן האתר',
    'content.servicesHeading': 'שירותים',
    'content.addService': 'שירות חדש',
    'content.servicesHint': 'עד 10 שירותים, לפחות אחד. עריכת טקסט ו“מוצג” נשמרים בכפתור למטה.',
    'content.serviceN': 'שירות {n}',
    'content.serviceName': 'שם',
    'content.serviceDesc': 'תיאור',
    'content.visible': 'מוצג',
    'content.delete': 'מחיקה',
    'content.draftSaved': 'טיוטה נשמרה',
    'content.draftSavedPublish': 'טיוטה נשמרה - לא לשכוח לפרסם',
    'content.maxServices': 'ניתן להוסיף עד {n} שירותים',
    'content.minServices': 'חייבים להשאיר לפחות שירות אחד',
    'content.deleteServiceTitle': 'מחיקת שירות',
    'content.deleteServiceMessage': 'למחוק את השירות? לא ניתן לשחזר אחר כך.',
    'content.newServiceTitle': 'שירות חדש',
    'portfolio.heading': 'תיק עבודות',
    'portfolio.bulk': 'העלאת כמה תמונות',
    'portfolio.add': 'פריט חדש',
    'portfolio.hint': 'העלאה מרובה לתמונות בלבד - כל קובץ הופך לפריט נפרד. סרטונים: פריט חדש, אחד בכל פעם.',
    'portfolio.empty': 'אין פריטים עדיין. אפשר להוסיף פריט חדש.',
    'portfolio.edit': 'עריכה',
    'portfolio.delete': 'מחיקה',
    'portfolio.video': 'סרטון',
    'portfolio.image': 'תמונה',
    'portfolio.visible': 'מוצג',
    'portfolio.hidden': 'מוסתר',
    'portfolio.onHome': 'בדף הבית',
    'portfolio.playVideo': 'ניגון סרטון',
    'portfolio.openImage': 'פתיחת תמונה',
    'portfolio.deleteTitle': 'מחיקת פריט',
    'portfolio.deleteMessage': 'למחוק את הפריט? המדיה תימחק גם כן אם היא באחסון.',
    'portfolio.itemDialog': 'פריט בתיק עבודות',
    'portfolio.itemNew': 'פריט חדש',
    'portfolio.itemEdit': 'עריכת פריט',
    'portfolio.untitled': 'ללא כותרת',
    'portfolio.moveUp': 'הזזה למעלה',
    'portfolio.moveDown': 'הזזה למטה',
    'audit.heading': 'היסטוריית שינויים',
    'audit.refresh': 'רענון',
    'audit.hint': 'יומן קריאה בלבד - מי ביצע איזו פעולה ומתי. אין מחיקה מכאן.',
    'audit.action': 'פעולה',
    'audit.entityType': 'סוג ישות',
    'audit.from': 'מתאריך',
    'audit.to': 'עד תאריך',
    'audit.filter': 'סינון',
    'audit.all': 'הכל',
    'audit.more': 'טען עוד',
    'audit.loadFailed': 'טעינת היסטוריה נכשלה',
    'audit.empty': 'אין רשומות להצגה.',
    'audit.success': 'הצלחה',
    'audit.fail': 'כישלון',
    'audit.before': 'לפני',
    'audit.after': 'אחרי',
    'audit.actionLabel.content.update': 'עדכון תוכן',
    'audit.actionLabel.service.create': 'יצירת שירות',
    'audit.actionLabel.service.update': 'עדכון שירות',
    'audit.actionLabel.service.delete': 'מחיקת שירות',
    'audit.actionLabel.portfolio.create': 'יצירת פריט בתיק עבודות',
    'audit.actionLabel.portfolio.update': 'עדכון פריט בתיק עבודות',
    'audit.actionLabel.portfolio.delete': 'מחיקת פריט בתיק עבודות',
    'audit.actionLabel.portfolio.reorder': 'שינוי סדר תיק עבודות',
    'audit.actionLabel.media.upload': 'העלאת מדיה',
    'audit.actionLabel.media.delete': 'מחיקת מדיה',
    'audit.actionLabel.publish.succeeded': 'פרסום הצליח',
    'audit.actionLabel.publish.failed': 'פרסום נכשל',
    'audit.actionLabel.rollback.succeeded': 'שחזור הצליח',
    'audit.actionLabel.rollback.failed': 'שחזור נכשל',
    'audit.entityLabel.content': 'תוכן',
    'audit.entityLabel.service': 'שירות',
    'audit.entityLabel.portfolio': 'תיק עבודות',
    'audit.entityLabel.media': 'מדיה',
    'audit.entityLabel.version': 'גרסה',
    'password.heading': 'שינוי סיסמה',
    'password.current': 'סיסמה נוכחית',
    'password.new': 'סיסמה חדשה',
    'password.confirm': 'אימות סיסמה חדשה',
    'password.submit': 'עדכון סיסמה',
    'password.updated': 'הסיסמה עודכנה.',
    'password.demoWarning':
      'זוהתה סיסמת הדמו (ChangeMe123!). החליפו אותה לפני פריסה לאתר חי.',
    'upload.failed': 'העלאה נכשלה',
    'upload.networkFailed': 'העלאה נכשלה - בעיית רשת',
    'bulk.partialFail': 'הועלו {ok} תמונות, {failed} נכשלו - בדקי ונסה שוב',
    'save.hintClean': 'אין שינויים לשמירה',
    'save.hintDirty': 'יש שינויים שלא נשמרו',
    'save.button': 'שמירת שינויים',
    'common.cancel': 'ביטול',
    'common.save': 'שמירה',
    'common.close': 'סגירה',
    'common.error': 'שגיאה',
    'common.delete': 'מחיקה',
    'common.confirmDeleteTitle': 'אישור מחיקה',
    'common.confirmDeleteMessage': 'למחוק?',
    'common.preview': 'תצוגה מקדימה',
    'dirty.switchTitle': 'שינויים לא שמורים',
    'dirty.switchMessage': 'יש שינויים לא שמורים בשפת התוכן הנוכחית. לשמור לפני המעבר, לזרוק, או לבטל?',
    'dirty.saveAndSwitch': 'שמור ועבור',
    'dirty.discardAndSwitch': 'זרוק ועבור',
    'dirty.cancelSwitch': 'ביטול',
    'item.title': 'כותרת',
    'item.categories': 'קטגוריות',
    'item.categoriesHint': 'אפשר לבחור יותר מאחת',
    'item.mediaType': 'סוג מדיה',
    'item.mediaTypeHint': 'סוג המדיה נקבע אוטומטית מהקובץ שתעלי.',
    'item.media': 'מדיה',
    'item.mediaSourceAria': 'מקור מדיה',
    'item.upload': 'העלאה',
    'item.link': 'קישור',
    'item.mediaUrl': 'כתובת מדיה',
    'item.coverLegend': 'קאבר לסרטון (אופציונלי)',
    'item.coverHint': 'בהעלאת סרטון נוצר קאבר אוטומטי. אפשר להחליף בהעלאה או בקישור.',
    'item.coverSourceAria': 'מקור קאבר',
    'item.coverUrl': 'כתובת קאבר',
    'item.alt': 'טקסט חלופי',
    'item.altHint':
      'תיאור קצר של התמונה או הסרטון - לנגישות (קורא מסך) ולחיפוש. לא מוצג על התמונה עצמה.',
    'item.visibleLabel': 'מוצג באתר',
    'item.visibleHint':
      'אם מסומן - הפריט יופיע בתיק העבודות למבקרים. בלי סימון הוא נשמר אצלך אבל מוסתר מהאתר.',
    'item.featuredLabel': 'מוצג בדף הבית',
    'item.featuredHint':
      'אם מסומן (וגם מוצג באתר) - הפריט יופיע גם בגלריה הקצרה בדף הבית. בלי סימון הוא רק בתיק העבודות המלא.',
    'item.current': 'נוכחי: {url}',
    'item.uploading': 'מעלה מדיה… {pct}%',
    'item.uploadingCoverAuto': 'מעלה קאבר אוטומטי… {pct}%',
    'item.uploadedWithCover': 'המדיה והקאבר הועלו - טיוטה תישמר עם שמירת הפריט',
    'item.uploadedCoverFail': 'המדיה הועלתה; קאבר אוטומטי נכשל ({error}). אפשר להעלות ידנית.',
    'item.uploaded': 'המדיה הועלתה (אחרי דחיסה) - טיוטה תישמר עם שמירת הפריט',
    'item.uploadingCover': 'מעלה קאבר… {pct}%',
    'item.coverUploaded': 'הקאבר הועלה - טיוטה תישמר עם שמירת הפריט',
    'item.needCategory': 'יש לבחור לפחות קטגוריה אחת',
    'bulk.heading': 'העלאת כמה תמונות',
    'bulk.hint': 'בוחרים הגדרות פעם אחת, ואז כמה קבצי תמונה. כל קובץ יהפוך לפריט נפרד.',
    'bulk.baseTitle': 'כותרת בסיס',
    'bulk.baseTitleHint': 'יתווסף מספר אוטומטית: פרויקט לדוגמה 1 1, פרויקט לדוגמה 1 2…',
    'bulk.images': 'תמונות',
    'bulk.filesSelected': 'נבחרו {n} תמונות',
    'bulk.altBase': 'טקסט חלופי בסיס',
    'bulk.altHint': 'יתווסף מספר אוטומטית לכל תמונה. אפשר להשאיר ריק.',
    'bulk.visibleHint': 'אם מסומן - הפריטים יופיעו בתיק העבודות למבקרים.',
    'bulk.featuredHint': 'אם מסומן - כל התמונות בבחירה יופיעו גם בגלריה בדף הבית.',
    'bulk.submit': 'העלאה ושמירה',
    'bulk.needImages': 'יש לבחור לפחות תמונה אחת',
    'bulk.uploading': 'מעלה תמונה {n} מתוך {total}…',
    'bulk.done': 'הועלו {n} תמונות לטיוטה',
    'ph.mediaUrl': 'https://… או /media/…',
    'ph.altExample': 'למשל: תיאור קצר של התמונה',
    'ph.bulkTitle': 'למשל: פרויקט לדוגמה 1',
  },
  en: {
    'doc.title': 'Admin | Business name',
    'login.heading': 'Site admin',
    'login.subtitle': 'Business name',
    'login.email': 'Email',
    'login.password': 'Password',
    'login.submit': 'Sign in',
    'login.remember': 'Remember me',
    'login.logoAlt': 'Business logo',
    'loading.boot': 'Loading the admin panel…',
    'loading.data': 'Loading data…',
    'header.brand': 'Admin',
    'header.logout': 'Sign out',
    'nav.tabsAria': 'Admin navigation',
    'tab.content': 'Content',
    'tab.portfolio': 'Portfolio',
    'tab.translations': 'Translations',
    'tab.audit': 'Change history',
    'tab.password': 'Password',
    'translations.heading': 'Translations needing attention',
    'translations.refresh': 'Refresh',
    'translations.hint':
      'Missing or outdated translations vs the source language. "Mark as handled" acknowledges the warning without updating the translation.',
    'translations.openPanel': 'Open translations',
    'translations.dismissBanner': 'Dismiss',
    'translations.banner': 'Content in {source} changed. Review translations in {locales}.',
    'translations.empty': 'No translations need attention right now.',
    'translations.goEdit': 'Edit translation',
    'translations.acknowledge': 'Mark as handled',
    'translations.loadFailed': 'Failed to load translation statuses',
    'translations.ackOk': 'Marked as handled',
    'translations.freshness.missing': 'missing',
    'translations.freshness.outdated': 'outdated',
    'translations.freshness.current': 'current',
    'translations.review.acknowledged': 'acknowledged',
    'translations.review.normal': 'normal',
    'translations.fieldNeedsAttention': 'This field needs a translation review',
    'publish.outdatedWarning': 'Note: some translations are outdated. Publish is allowed, but review them when you can.',
    'locale.admin': 'Interface language',
    'locale.content': 'Content language',
    'locale.adminAria': 'Admin interface language (follows content unless you change it manually)',
    'locale.contentAria': 'Content language to edit (also updates the interface unless locked)',
    'locale.he': 'עברית',
    'locale.en': 'English',
    'publish.stripAria': 'Publishing',
    'publish.versionNone': 'Published version: —',
    'publish.version': 'Published version: #{id} · {date}',
    'publish.status.Published': 'Published',
    'publish.status.Publishing': 'Publishing…',
    'publish.status.Failed': 'Publish failed',
    'publish.status.pending': 'Unpublished changes',
    'publish.preview': 'Preview',
    'publish.publish': 'Publish',
    'publish.rollback': 'Rollback',
    'publish.previewOpened': 'Draft preview opened',
    'publish.publishing': 'Publishing…',
    'publish.success': 'Published successfully',
    'publish.failed': 'Publish failed',
    'publish.rolling': 'Rolling back and publishing…',
    'publish.rollbackSuccess': 'Rolled back to previous version and published',
    'publish.rollbackFailed': 'Rollback failed',
    'publish.confirmTitle': 'Publish site',
    'publish.confirmMessage': 'Publish the current draft to the public site?',
    'publish.confirmOk': 'Publish',
    'rollback.confirmTitle': 'Rollback to previous version',
    'rollback.confirmMessage':
      'Restore the whole site (content, gallery, metadata, and schema) to the previous published version? Media files are not deleted.',
    'rollback.confirmOk': 'Rollback',
    'content.heading': 'Site content',
    'content.servicesHeading': 'Services',
    'content.addService': 'New service',
    'content.servicesHint': 'Up to 10 services, at least one. Text and visibility save with the button below.',
    'content.serviceN': 'Service {n}',
    'content.serviceName': 'Name',
    'content.serviceDesc': 'Description',
    'content.visible': 'Visible',
    'content.delete': 'Delete',
    'content.draftSaved': 'Draft saved',
    'content.draftSavedPublish': 'Draft saved - remember to publish',
    'content.maxServices': 'You can add up to {n} services',
    'content.minServices': 'Keep at least one service',
    'content.deleteServiceTitle': 'Delete service',
    'content.deleteServiceMessage': 'Delete this service? This cannot be undone.',
    'content.newServiceTitle': 'New service',
    'portfolio.heading': 'Portfolio',
    'portfolio.bulk': 'Upload multiple images',
    'portfolio.add': 'New item',
    'portfolio.hint':
      'Bulk upload is for images only - each file becomes its own item. Videos: add one item at a time.',
    'portfolio.empty': 'No items yet. Add a new item to get started.',
    'portfolio.edit': 'Edit',
    'portfolio.delete': 'Delete',
    'portfolio.video': 'Video',
    'portfolio.image': 'Image',
    'portfolio.visible': 'Visible',
    'portfolio.hidden': 'Hidden',
    'portfolio.onHome': 'On home',
    'portfolio.playVideo': 'Play video',
    'portfolio.openImage': 'Open image',
    'portfolio.deleteTitle': 'Delete item',
    'portfolio.deleteMessage': 'Delete this item? Stored media will be deleted too if it is in storage.',
    'portfolio.itemDialog': 'Portfolio item',
    'portfolio.itemNew': 'New item',
    'portfolio.itemEdit': 'Edit item',
    'portfolio.untitled': 'Untitled',
    'portfolio.moveUp': 'Move up',
    'portfolio.moveDown': 'Move down',
    'audit.heading': 'Change history',
    'audit.refresh': 'Refresh',
    'audit.hint': 'Read-only log - who did what and when. No deletes here.',
    'audit.action': 'Action',
    'audit.entityType': 'Entity type',
    'audit.from': 'From date',
    'audit.to': 'To date',
    'audit.filter': 'Filter',
    'audit.all': 'All',
    'audit.more': 'Load more',
    'audit.loadFailed': 'Failed to load history',
    'audit.empty': 'No entries to show.',
    'audit.success': 'Success',
    'audit.fail': 'Failure',
    'audit.before': 'Before',
    'audit.after': 'After',
    'audit.actionLabel.content.update': 'Content updated',
    'audit.actionLabel.service.create': 'Service created',
    'audit.actionLabel.service.update': 'Service updated',
    'audit.actionLabel.service.delete': 'Service deleted',
    'audit.actionLabel.portfolio.create': 'Portfolio item created',
    'audit.actionLabel.portfolio.update': 'Portfolio item updated',
    'audit.actionLabel.portfolio.delete': 'Portfolio item deleted',
    'audit.actionLabel.portfolio.reorder': 'Portfolio reordered',
    'audit.actionLabel.media.upload': 'Media uploaded',
    'audit.actionLabel.media.delete': 'Media deleted',
    'audit.actionLabel.publish.succeeded': 'Publish succeeded',
    'audit.actionLabel.publish.failed': 'Publish failed',
    'audit.actionLabel.rollback.succeeded': 'Rollback succeeded',
    'audit.actionLabel.rollback.failed': 'Rollback failed',
    'audit.entityLabel.content': 'Content',
    'audit.entityLabel.service': 'Service',
    'audit.entityLabel.portfolio': 'Portfolio',
    'audit.entityLabel.media': 'Media',
    'audit.entityLabel.version': 'Version',
    'password.heading': 'Change password',
    'password.current': 'Current password',
    'password.new': 'New password',
    'password.confirm': 'Confirm new password',
    'password.submit': 'Update password',
    'password.updated': 'Password updated.',
    'password.demoWarning':
      'Demo password detected (ChangeMe123!). Change it before deploying to a live site.',
    'upload.failed': 'Upload failed',
    'upload.networkFailed': 'Upload failed - network problem',
    'bulk.partialFail': 'Uploaded {ok} images, {failed} failed - check and try again',
    'save.hintClean': 'No changes to save',
    'save.hintDirty': 'Unsaved changes',
    'save.button': 'Save changes',
    'common.cancel': 'Cancel',
    'common.save': 'Save',
    'common.close': 'Close',
    'common.error': 'Error',
    'common.delete': 'Delete',
    'common.confirmDeleteTitle': 'Confirm delete',
    'common.confirmDeleteMessage': 'Delete?',
    'common.preview': 'Preview',
    'dirty.switchTitle': 'Unsaved changes',
    'dirty.switchMessage':
      'You have unsaved changes in the current content language. Save before switching, discard, or cancel?',
    'dirty.saveAndSwitch': 'Save and switch',
    'dirty.discardAndSwitch': 'Discard and switch',
    'dirty.cancelSwitch': 'Cancel',
    'item.title': 'Title',
    'item.categories': 'Categories',
    'item.categoriesHint': 'You can select more than one',
    'item.mediaType': 'Media type',
    'item.mediaTypeHint': 'Media type is detected automatically from the file you upload.',
    'item.media': 'Media',
    'item.mediaSourceAria': 'Media source',
    'item.upload': 'Upload',
    'item.link': 'Link',
    'item.mediaUrl': 'Media URL',
    'item.coverLegend': 'Video cover (optional)',
    'item.coverHint': 'Uploading a video creates an automatic cover. You can replace it via upload or URL.',
    'item.coverSourceAria': 'Cover source',
    'item.coverUrl': 'Cover URL',
    'item.alt': 'Alt text',
    'item.altHint':
      'Short description of the image or video - for accessibility (screen readers) and search. Not shown on the image itself.',
    'item.visibleLabel': 'Visible on site',
    'item.visibleHint':
      'If checked - the item appears in the portfolio for visitors. If unchecked it is kept but hidden from the site.',
    'item.featuredLabel': 'Featured on home',
    'item.featuredHint':
      'If checked (and visible) - the item also appears in the home gallery. Otherwise it is only in the full portfolio.',
    'item.current': 'Current: {url}',
    'item.uploading': 'Uploading media… {pct}%',
    'item.uploadingCoverAuto': 'Uploading auto cover… {pct}%',
    'item.uploadedWithCover': 'Media and cover uploaded - draft saves when you save the item',
    'item.uploadedCoverFail': 'Media uploaded; auto cover failed ({error}). You can upload manually.',
    'item.uploaded': 'Media uploaded (after compression) - draft saves when you save the item',
    'item.uploadingCover': 'Uploading cover… {pct}%',
    'item.coverUploaded': 'Cover uploaded - draft saves when you save the item',
    'item.needCategory': 'Select at least one category',
    'bulk.heading': 'Upload multiple images',
    'bulk.hint': 'Set options once, then choose several image files. Each file becomes its own item.',
    'bulk.baseTitle': 'Base title',
    'bulk.baseTitleHint': 'A number is appended automatically: Sample project 1 1, Sample project 1 2…',
    'bulk.images': 'Images',
    'bulk.filesSelected': '{n} images selected',
    'bulk.altBase': 'Base alt text',
    'bulk.altHint': 'A number is appended per image. Leave empty if you want.',
    'bulk.visibleHint': 'If checked - items appear in the portfolio for visitors.',
    'bulk.featuredHint': 'If checked - all selected images also appear in the home gallery.',
    'bulk.submit': 'Upload and save',
    'bulk.needImages': 'Select at least one image',
    'bulk.uploading': 'Uploading image {n} of {total}…',
    'bulk.done': 'Uploaded {n} images to the draft',
    'ph.mediaUrl': 'https://… or /media/…',
    'ph.altExample': 'e.g. short description of the image',
    'ph.bulkTitle': 'e.g. Sample project 1',
  },
};

/** BCP-47-ish: language lowercase, region uppercase (he, en, en-US). */
const LOCALE_RE = /^[a-z]{2,3}(?:-[A-Z][a-zA-Z]{1,7})?$/;

/**
 * Normalize content/API locales to canonical form.
 * Invalid input returns null (unlike normalizeUiLocale, which falls back).
 */
export function normalizeLocale(value) {
  if (value == null) return null;
  const raw = String(value).trim().replace(/_/g, '-');
  if (!raw) return null;
  const parts = raw.split('-').filter(Boolean);
  if (!parts.length) return null;
  const language = parts[0].toLowerCase();
  if (!/^[a-z]{2,3}$/.test(language)) return null;
  if (parts.length === 1) {
    const out = language;
    return LOCALE_RE.test(out) ? out : null;
  }
  const region = parts[1].toUpperCase();
  if (!/^[A-Z][A-Z0-9]{1,7}$/.test(region)) return null;
  const out = `${language}-${region}`;
  return LOCALE_RE.test(out) ? out : null;
}

function normalizeUiLocale(locale) {
  const normalized = normalizeLocale(locale);
  if (normalized && UI_LOCALES.includes(normalized)) return normalized;
  const raw = String(locale || '').trim().toLowerCase();
  if (UI_LOCALES.includes(raw)) return raw;
  return UI_DEFAULT_LOCALE;
}

export function localeDir(locale) {
  const loc = normalizeUiLocale(locale);
  return loc === 'he' || loc.startsWith('he') ? 'rtl' : 'ltr';
}

export function t(locale, key, vars = {}) {
  const loc = normalizeUiLocale(locale);
  const table = UI_STRINGS[loc] || UI_STRINGS[UI_DEFAULT_LOCALE];
  const fallback = UI_STRINGS[UI_DEFAULT_LOCALE] || {};
  let out = table[key] ?? fallback[key] ?? '';
  if (!out) out = fallback[key] || '';
  if (!out) return '';
  return String(out).replace(/\{(\w+)\}/g, (_, name) =>
    vars[name] != null ? String(vars[name]) : `{${name}}`
  );
}

export function fieldLabel(locale, key) {
  const loc = normalizeUiLocale(locale);
  const table = FIELD_LABELS[loc] || FIELD_LABELS[UI_DEFAULT_LOCALE];
  const fallback = FIELD_LABELS[UI_DEFAULT_LOCALE] || {};
  return table[key] || fallback[key] || key;
}

export function assertUiI18nComplete() {
  const heKeys = Object.keys(UI_STRINGS.he).sort();
  const enKeys = Object.keys(UI_STRINGS.en).sort();
  const missingEn = heKeys.filter((k) => !UI_STRINGS.en[k]);
  const missingHe = enKeys.filter((k) => !UI_STRINGS.he[k]);
  const fieldHe = Object.keys(FIELD_LABELS.he).sort();
  const fieldEn = Object.keys(FIELD_LABELS.en).sort();
  const missingFieldEn = fieldHe.filter((k) => !FIELD_LABELS.en[k]);
  const missingFieldHe = fieldEn.filter((k) => !FIELD_LABELS.he[k]);
  const empty = [];
  for (const loc of UI_LOCALES) {
    for (const [k, v] of Object.entries(UI_STRINGS[loc])) {
      if (!String(v || '').trim()) empty.push(`${loc}:${k}`);
    }
  }
  if (missingEn.length || missingHe.length || missingFieldEn.length || missingFieldHe.length || empty.length) {
    const err = new Error(
      `ui-i18n incomplete: missingEn=${missingEn.join(',')} missingHe=${missingHe.join(',')} fieldEn=${missingFieldEn.join(',')} fieldHe=${missingFieldHe.join(',')} empty=${empty.join(',')}`
    );
    err.code = 'UI_I18N_INCOMPLETE';
    throw err;
  }
  return true;
}

export function applyStaticI18n(root, locale) {
  const scope = root || document;
  scope.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (!key) return;
    const value = t(locale, key);
    if (value) el.textContent = value;
  });
  scope.querySelectorAll('[data-i18n-aria]').forEach((el) => {
    const key = el.getAttribute('data-i18n-aria');
    const value = t(locale, key);
    if (value) el.setAttribute('aria-label', value);
  });
  scope.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const key = el.getAttribute('data-i18n-placeholder');
    const value = t(locale, key);
    if (value) el.setAttribute('placeholder', value);
  });
  scope.querySelectorAll('[data-i18n-title]').forEach((el) => {
    const key = el.getAttribute('data-i18n-title');
    const value = t(locale, key);
    if (value) el.setAttribute('title', value);
  });
  scope.querySelectorAll('[data-i18n-alt]').forEach((el) => {
    const key = el.getAttribute('data-i18n-alt');
    const value = t(locale, key);
    if (value) el.setAttribute('alt', value);
  });
}

/** Apply document lang/dir/title + static i18n for Admin Chrome. */
export function applyAdminChrome(locale, { root = document } = {}) {
  const loc = normalizeUiLocale(locale);
  const dir = localeDir(loc);
  if (root.documentElement) {
    root.documentElement.lang = loc;
    root.documentElement.dir = dir;
  }
  if (root.title !== undefined || root.querySelector?.('title')) {
    const titleEl = root.querySelector?.('title');
    const title = t(loc, 'doc.title');
    if (titleEl) titleEl.textContent = title;
    if (typeof document !== 'undefined' && root === document) document.title = title;
  }
  applyStaticI18n(root, loc);
  return { locale: loc, dir };
}

export { normalizeUiLocale };
