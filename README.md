# InstaDuel (MVP)

Instagram blogerlar duel (battle) sayti: ikki bloger yuzma-yuz, tashrif buyuruvchilar ovoz beradi, vaqt tugagach g'olib aniqlanadi va reytingga ball yoziladi (g'alaba 3 ball, durang 1 ball).

Hech qanday tashqi kutubxona yo'q: faqat Node.js (>=18). `npm install` bir zumda tugaydi.

## Sahifalar

- `/` — landing (jonli "Bugungi jang" kartasi bilan)
- `/app` — ilova, pastki menyu bilan: **Jang** (ovoz berish, taymer), **Liga** (haftalik reyting, toifa bo'yicha), **Turnir** (chempionat juftliklari), **Profil** (o'z ovozlaringiz, brauzerda saqlanadi)
- `/admin` — admin panel

## Imkoniyatlar

- Jonli jang: ikki tomon, foiz chizig'i, qolgan vaqt taymeri. Bir nechta jang bo'lsa, o'qlar bilan almashtiriladi
- Bitta brauzerga (Telegramda bitta akkauntga) bitta jangda bitta ovoz. "Ikkalasiga ham muxlisman" tugmasi ikkala blogerga bittadan ovoz beradi. G'olib farqi o'zgarmaydi, foiz chizig'i esa faqat aniq tanlovlardan hisoblanadi
- Haftalik liga: hafta dushanba 00:00 (Toshkent vaqti) dan yakshanba kechasigacha. G'alaba 3 ball, durang 1 ball. Toifalar: Qiziqchi, Qo'shiqchi, Brendfeys, Boshqa
- Chempionat: 4, 8 yoki 16 bloger, olib tashlash tizimi. Juftliklar tasodifiy, raund tugagach g'oliblar o'zi keyingi raundga o'tadi, durang bo'lsa qur'a tashlanadi
- Admin panel: bloger qo'shish (rasm yuklash bilan), jang boshlash, chempionat boshlash, muddatidan oldin yakunlash, o'chirish, demo ma'lumot
- Jangning vaqti tugagach avtomatik yakunlanadi
- Natija kartochkalari: jang tugagach g'olib, mag'lub (yoki durang bo'lsa ikkala bloger) uchun 1080x1920 (Instagram hikoyasi o'lchami) rasm yaratiladi. Kartochkada InstaDuel logotipi va sayt havolasi bor. Yuklab olish, telefonda ulashish, Telegramda ulashish va havolani nusxalash mumkin. Admin panelda tugagan jang yonida "G'olib havolasi" tugmasi bor
- Admin statistikasi: bugun va oxirgi 7 kunda nechta kirish, noyob tashrifchi (shundan Telegramdan), ovoz va ovoz berganlar, 14 kunlik jadval

Dizayn: qora fon, qizil (A) va ko'k (B) tomonlar, Unbounded va Manrope shriftlari.

## Mahalliy ishga tushirish

```bash
ADMIN_PASSWORD=parol123 npm start
# http://localhost:3000  — landing
# http://localhost:3000/app  — ilova
# http://localhost:3000/admin  — admin panel
```

Windows (PowerShell): `$env:ADMIN_PASSWORD="parol123"; npm start`

Birinchi marta admin panelda "Demo ma'lumot qo'shish" tugmasi bilan sinab ko'ring.

## GitHub'ga joylash

```bash
cd instaduel
git init
git add .
git commit -m "InstaDuel MVP"
git branch -M main
git remote add origin https://github.com/<foydalanuvchi>/instaduel.git
git push -u origin main
```

(GitHub'da avval bo'sh `instaduel` repozitoriysini yarating.)

## Render'da deploy

1. render.com → New → **Blueprint** (yoki New → Web Service) va GitHub repozitoriyni tanlang.
2. Blueprint ishlatsangiz `render.yaml` hammasini o'zi to'ldiradi. Qo'lda yaratsangiz: Runtime `Node`, Build `npm install`, Start `npm start`, Health Check Path `/api/health`.
3. **Environment** bo'limida `ADMIN_PASSWORD` ni kuchli parol bilan kiriting (keyin uni Telegram akkaunt bilan almashtirasiz, pastdagi bo'limga qarang).
4. Ixtiyoriy: `CONTACT_URL` (masalan `https://t.me/sizning_akkaunt` yoki `mailto:...`) kiritsangiz, landingdagi "Hamkor bo'lish" tugmasi ko'rinadi. Kiritmasangiz, bu bo'lim yashirinadi.
5. Deploy tugagach `https://<nom>.onrender.com/admin` ga kirib bloger va jang qo'shing.

## Telegram Mini App

Sayt Telegram ichida Mini App sifatida ochiladi. Telegramda ochilganda ovoz Telegram akkauntiga bog'lanadi (imzo serverda tekshiriladi), shuning uchun boshqa brauzer yoki skript bilan qayta ovoz berib bo'lmaydi.

1. Telegramda `@BotFather` ga yozing, `/newbot` buyrug'i bilan bot yarating. U sizga **token** beradi (maxfiy, hech kimga bermang) va bot **username** (masalan `instaduel_bot`).
2. Render -> servis -> **Environment** bo'limida quyidagilarni qo'shing:
   - `BOT_TOKEN` : BotFather bergan token
   - `WEBAPP_URL` : saytingiz manzili, masalan `https://instaduel-xxxx.onrender.com` (oxirida `/` siz)
   - `BOT_USERNAME` : bot username (`@` siz)
   - `REQUIRE_TELEGRAM` : `1` qo'ysangiz, ovoz berish faqat Telegram ichida ishlaydi (ixtiyoriy, eng ishonchli himoya). Bo'sh qoldirsangiz, brauzerdan ham ovoz berish mumkin
   - `APP_NAME` : ixtiyoriy, BotFather'da `/newapp` bilan yaratilgan Mini App qisqa nomi. Bo'lsa, ulashish havolalari `t.me/bot/app?startapp=...` ko'rinishida bo'ladi
3. **Save, rebuild and deploy** ni bosing. Server bot'ni o'zi ishga tushiradi: `/start` ga "InstaDuel ni ochish" tugmasi bilan javob beradi va botning menyu tugmasini Mini App'ga bog'laydi.
4. Telegramda botingizni oching, `/start` yuboring va tugmani bosing.

`WEBAPP_URL` va `BOT_TOKEN` berilmasa, sayt avvalgidek oddiy brauzerda ishlaydi.

Telegram ichida rasmni to'g'ridan-to'g'ri saqlash ba'zi telefonlarda ishlamaydi. Shuning uchun kartochkada "Brauzerda ochish (rasmni saqlash uchun)" tugmasi bor.

Bot bepul Render'da sayt uxlab qolganda javob bermaydi. Sayt uyg'onganda Telegram kutib turgan xabarlarni yetkazadi.

## Admin panelga Telegram akkaunt bilan kirish

Parol o'rniga o'z Telegram akkauntingiz bilan kirasiz. Server Telegram imzosini tekshiradi va faqat ro'yxatdagi ID lar adminga ruxsat oladi.

1. Yuqoridagi Telegram sozlamalarini bajaring (`BOT_TOKEN`, `WEBAPP_URL`, `BOT_USERNAME`) va botni ishga tushiring.
2. Telegramda botingizga `/id` yuboring. U sizning Telegram ID raqamingizni aytadi (masalan `123456789`).
3. Render -> **Environment** ga `ADMIN_TELEGRAM_IDS` qo'shing, qiymati sizning ID ingiz. Bir nechta admin bo'lsa vergul bilan: `123456789,987654321`. Saqlab, qayta deploy qiling.
4. Botga `/admin` yuboring va chiqqan "Admin panelni ochish" tugmasini bosing. Panel Telegram ichida parolsiz ochiladi.
5. Hammasi ishlayotganini ko'rgach, Render'dan `ADMIN_PASSWORD` ni o'chirib tashlang. Shunda parol bilan kirish umuman yopiladi.

`/admin` buyrug'i faqat ro'yxatdagi ID larga tugma beradi, boshqalarga "Bu buyruq faqat adminlar uchun" deydi. Admin sahifa brauzerda to'g'ridan-to'g'ri ochilsa, kirish talab qilinadi va faqat Telegram ichida ishlaydi (parol o'chirilgan bo'lsa).

`ADMIN_PASSWORD` berilgan bo'lsa, u zaxira yo'li sifatida ishlaydi. Xato parol 8 martadan keyin 15 daqiqaga bloklanadi.

## Muhim: ma'lumotlarni saqlash

Ma'lumotlar `DATA_DIR/db.json` faylida (rasmlar `DATA_DIR/uploads`). Render'ning bepul tarifida fayl tizimi doimiy emas: qayta deploy yoki uyquga ketish (spin down) paytida fayllar yo'qolishi mumkin. Shuning uchun bepul tarif faqat sinov uchun.

Haqiqiy ishga tushirish uchun ikki yo'l bor:

- Render **Disk** ulash (pullik tarif kerak) va muhit o'zgaruvchisi `DATA_DIR=/var/data`, disk mount path `/var/data`. Narx va shartlarni Render saytida tekshiring.
- Keyingi bosqichda bazani PostgreSQL ga o'tkazish (kod `db` obyektiga yagona joydan murojaat qiladi, shuning uchun o'tish oson).

## Hozirgi cheklovlar va keyingi qadamlar

- Brauzerdan ovoz himoyasi oddiy (cookie): boshqa brauzer, inkognito yoki skript bilan qayta ovoz berish mumkin. `REQUIRE_TELEGRAM=1` bilan ovoz faqat tasdiqlangan Telegram akkauntidan qabul qilinadi.
- Mavzu konkursi (landingda "Tez orada" deb belgilangan) hali qurilmagan.
- Instagram profil rasmlari avtomatik olinmaydi. Admin panelda rasmni yuklang.
- Duellarni qo'lda yaratish kerak. Keyingi qadam: kunlik avtomatik duel (toifa bo'yicha tasodifiy juftlik).
- Ulashish uchun har bir duelga alohida havola va OG-rasm qo'shish mumkin.
