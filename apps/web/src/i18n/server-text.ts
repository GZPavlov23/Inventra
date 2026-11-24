import { currentLanguage, currentMessages } from '@/i18n/language'

// The server writes its errors in English, with names and numbers inside, so the mobile app and
// the API stay simple. Here each of its sentences gets its Bulgarian twin, with the same names
// and numbers moved to where Bulgarian puts them.
const BULGARIAN: [RegExp, (...parts: string[]) => string][] = [
  // Stock
  [/^'(.+)' is counted in whole pieces$/, (name) => `„${name}“ се брои на цели бройки`],
  [/^'(.+)' is archived\. Restore it before receiving stock$/, (name) => `„${name}“ е архивиран. Възстанови го, преди да приемаш стока`],
  [/^'(.+)' is archived\. Restore it before selling it$/, (name) => `„${name}“ е архивиран. Възстанови го, преди да го продаваш`],
  [/^'(.+)' is archived\. Restore it before ordering it$/, (name) => `„${name}“ е архивиран. Възстанови го, преди да го поръчваш`],
  [/^'(.+)' is archived$/, (name) => `„${name}“ е архивиран`],
  [/^The expiry date of '(.+)' is in the past$/, (name) => `Срокът на годност на „${name}“ вече е минал`],
  [/^The correction can't be zero$/, () => 'Корекцията не може да е нула'],
  [/^This batch changed meanwhile, it now has (.+)$/, (left) => `Партидата се промени междувременно, сега има ${left}`],
  [/^Only (.+) left in this batch$/, (left) => `В партидата са останали само ${left}`],
  [/^Only (.+) of '(.+)' can be sold$/, (amount, name) => `От „${name}“ може да се продадат само ${amount}`],
  // Not found
  [/^Product (\d+) was not found$/, (id) => `Продукт ${id} не е намерен`],
  [/^Batch (\d+) was not found$/, (id) => `Партида ${id} не е намерена`],
  [/^Sale (\d+) was not found$/, (id) => `Продажба ${id} не е намерена`],
  [/^Delivery (\d+) was not found$/, (id) => `Доставка ${id} не е намерена`],
  [/^Supplier (\d+) was not found$/, (id) => `Доставчик ${id} не е намерен`],
  [/^Person (\d+) was not found$/, (id) => `Човек ${id} не е намерен`],
  [/^No product with barcode (.+)$/, (barcode) => `Няма продукт с баркод ${barcode}`],
  // Products and suppliers
  [/^'(.+)' already has batches, its unit can't change$/, (name) => `„${name}“ вече има партиди, мерната единица не може да се смени`],
  [/^Barcode (.+) is already used by '(.+)'$/, (barcode, name) => `Баркод ${barcode} вече е на „${name}“`],
  [/^Barcode must be a valid EAN-8, UPC-A, EAN-13 or GTIN-14 code$/, () => 'Баркодът трябва да е валиден EAN-8, UPC-A, EAN-13 или GTIN-14'],
  [/^'(.+)' already exists among the archived ones$/, (name) => `„${name}“ вече съществува сред архивираните`],
  [/^'(.+)' already exists$/, (name) => `„${name}“ вече съществува`],
  [/^A supplier with this name already exists$/, () => 'Вече има доставчик с това име'],
  [/^'(.+)' has no supplier$/, (name) => `„${name}“ няма доставчик`],
  [/^'(.+)' cannot be null$/, () => 'Това поле не може да е празно'],
  // Deliveries
  [/^The expected date is in the past$/, () => 'Очакваната дата вече е минала'],
  [/^A product can be on a delivery only once$/, () => 'Един продукт може да е в доставката само веднъж'],
  [/^Every line of the delivery must be listed once$/, () => 'Всеки ред от доставката трябва да е посочен веднъж'],
  [/^Nothing arrived\. Cancel the delivery instead$/, () => 'Нищо не е пристигнало. По-добре откажи доставката'],
  [/^This delivery was already received$/, () => 'Тази доставка вече е приета'],
  [/^This delivery was already cancelled$/, () => 'Тази доставка вече е отказана'],
  // Team and accounts
  [/^(.+) already has an Inventra account$/, (email) => `${email} вече има акаунт в Inventra`],
  [/^(.+) has already joined$/, (name) => `${name} вече се присъедини`],
  [/^(.+) was deactivated\. Activate them first$/, (name) => `${name} е деактивиран. Първо го активирай`],
  [/^The store needs at least one active owner\. Make someone else an owner first$/, () => 'Магазинът има нужда от поне един активен собственик. Първо направи някой друг собственик'],
  [/^Too many failed login attempts\. Try again in (\d+) minute\(s\)$/, (minutes) => `Твърде много грешни опити. Опитай пак след ${minutes} мин.`],
  [/^This verification link is invalid or has expired$/, () => 'Линкът за потвърждение е невалиден или е изтекъл'],
  [/^This password reset link is invalid or has expired$/, () => 'Линкът за нова парола е невалиден или е изтекъл'],
  [/^This invitation is invalid or has expired\. Ask for a new one$/, () => 'Поканата е невалидна или е изтекла. Поискай нова'],
  [/^You are not logged in$/, () => 'Не си влязъл в профила си'],
  [/^Your session has expired\. Please log in again$/, () => 'Сесията ти изтече. Влез отново'],
  [/^Your role doesn't allow this\. Ask the store's owner$/, () => 'Ролята ти не позволява това. Попитай собственика на магазина'],
  // Periods
  [/^The period ends before it starts$/, () => 'Периодът свършва, преди да е започнал'],
  [/^The period can't be longer than (\d+) days$/, (days) => `Периодът не може да е по-дълъг от ${days} дни`],
  // Importing sales from a CSV file, one sentence per row with a problem
  [/^A file of current sales can have up to (\d+) rows$/, (rows) => `Файл с текущи продажби може да има до ${rows} реда`],
  [/^Several products are called '(.+)'\. Use the barcode$/, (name) => `Няколко продукта се казват „${name}“. Използвай баркода`],
  [/^No product called '(.+)'$/, (name) => `Няма продукт „${name}“`],
  [/^Receipt (.+) was already imported$/, (receipt) => `Бон ${receipt} вече е внесен`],
  [/^Receipt (.+) has more than one date$/, (receipt) => `Бон ${receipt} има повече от една дата`],
  [/^Receipt (.+) has more than (\d+) lines$/, (receipt, lines) => `Бон ${receipt} има повече от ${lines} реда`],
  [/^The file is empty$/, () => 'Файлът е празен'],
  [/^Missing columns: (.+)$/, (names) => `Липсват колони: ${names}`],
  [/^The file has no sales in it$/, () => 'Във файла няма продажби'],
  [/^The receipt number is missing$/, () => 'Липсва номер на бон'],
  [/^The receipt number is too long$/, () => 'Номерът на бона е твърде дълъг'],
  [/^The row needs a barcode or a product name$/, () => 'Редът трябва да има баркод или име на продукт'],
  [/^The date (.+) is in the future$/, (day) => `Датата ${day} е в бъдещето`],
  [/^'(.+)' is not a date\. Use 30\.10\.2026 or 2026-10-30$/, (text) => `„${text}“ не е дата. Пиши 30.10.2026 или 2026-10-30`],
  [/^'(.+)' is not a quantity$/, (text) => `„${text}“ не е количество`],
  [/^The quantity (.+) is out of range$/, (text) => `Количеството ${text} е извън границите`],
  [/^The quantity (.+) has more than 3 decimals$/, (text) => `Количеството ${text} има повече от 3 знака след запетаята`],
  [/^'(.+)' is not a price$/, (text) => `„${text}“ не е цена`],
  [/^The price (.+) is out of range$/, (text) => `Цената ${text} е извън границите`],
  [/^The price (.+) has more than 2 decimals$/, (text) => `Цената ${text} има повече от 2 знака след запетаята`],
  // The checks of the form fields (from Pydantic, the library that checks every request)
  [/^Field required$/, () => 'Задължително поле'],
  [/^String should have at least (\d+) characters?$/, (count) => `Трябват поне ${count} знака`],
  [/^String should have at most (\d+) characters?$/, (count) => `Най-много ${count} знака`],
  [/^Input should be greater than (\S+)$/, (value) => `Трябва да е повече от ${value}`],
  [/^Input should be greater than or equal to (\S+)$/, (value) => `Трябва да е поне ${value}`],
  [/^Input should be less than (\S+)$/, (value) => `Трябва да е по-малко от ${value}`],
  [/^Input should be less than or equal to (\S+)$/, (value) => `Трябва да е най-много ${value}`],
  [/^Decimal input should have no more than (\d+) decimal places?$/, (count) => `Най-много ${count} знака след десетичната запетая`],
  [/^Input should be a valid (number|decimal).*$/, () => 'Трябва да е число'],
  [/^Input should be a valid date.*$/, () => 'Трябва да е дата'],
  [/^value is not a valid email address.*$/, () => 'Това не е валиден имейл адрес'],
]

// One server sentence, in the chosen language. A sentence missing from the list falls back to
// what its code means, and only then to the server's own words, so nothing is ever hidden.
export function serverText(code: string, text: string, field = false): string {
  if (currentLanguage() === 'en') return text
  for (const [pattern, write] of BULGARIAN) {
    const match = pattern.exec(text)
    if (match) return write(...match.slice(1))
  }
  if (field) return text
  return (currentMessages().errors as Record<string, string>)[code] ?? text
}
