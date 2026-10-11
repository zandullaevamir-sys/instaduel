# InstaDuel (MVP)

Instagram blogerlar duel (battle) sayti: ikki bloger yuzma-yuz, tashrif buyuruvchilar ovoz beradi, vaqt tugagach g'olib aniqlanadi va reytingga ball yoziladi (g'alaba 3 ball, durang 1 ball).

Hech qanday tashqi kutubxona yo'q: faqat Node.js (>=18). `npm install` bir zumda tugaydi.

## Sahifalar

- `/` — landing (jonli "Bugungi jang" kartasi bilan)
- `/app` — ilova, pastki menyu bilan: **Jang** (ovoz berish, taymer), **Liga** (haftalik reyting, toifa bo'yicha), **Turnir** (chempionat juftliklari), **Profil** (o'z ovozlaringiz, brauzerda saqlanadi)
- `/admin` — admin panel

## Imkoniyatlar

- Jonli jang: ikki tomon, foiz chizig'i, qolgan vaqt taymeri. Bir nechta jang bo'lsa, o'qlar bilan almashtiriladi
- Bitta brauzerga bitta jangda bitta ovoz (anonim cookie orqali)
- Haftalik liga: hafta dushanba 00:00 (Toshkent vaqti) dan yakshanba kechasigacha. G'alaba 3 ball, durang 1 ball. Toifalar: Qiziqchi, Qo'shiqchi, Brendfeys, Boshqa
- Chempionat: 4, 8 yoki 16 bloger, olib tashlash tizimi. Juftliklar tasodifiy, raund tugagach g'oliblar o'zi keyingi raundga o'tadi, durang bo'lsa qur'a tashlanadi
- Admin panel: bloger qo'shish (rasm yuklash bilan), jang boshlash, chempionat boshlash, muddatidan oldin yakunlash, o'chirish, demo ma'lumot
- Jangning vaqti tugagach avtomatik yakunlanadi

Dizayn: qora fon, to'q sariq (A) va ko'k (B) tomonlar, Unbounded va Manrope shriftlari.

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
3. **Environment** bo'limida `ADMIN_PASSWORD` ni kuchli parol bilan kiriting.
4. Ixtiyoriy: `CONTACT_URL` (masalan `https://t.me/sizning_akkaunt` yoki `mailto:...`) kiritsangiz, landingdagi "Hamkor bo'lish" tugmasi ko'rinadi. Kiritmasangiz, bu bo'lim yashirinadi.
5. Deploy tugagach `https://<nom>.onrender.com/admin` ga kirib bloger va jang qo'shing.

## Muhim: ma'lumotlarni saqlash

Ma'lumotlar `DATA_DIR/db.json` faylida (rasmlar `DATA_DIR/uploads`). Render'ning bepul tarifida fayl tizimi doimiy emas: qayta deploy yoki uyquga ketish (spin down) paytida fayllar yo'qolishi mumkin. Shuning uchun bepul tarif faqat sinov uchun.

Haqiqiy ishga tushirish uchun ikki yo'l bor:

- Render **Disk** ulash (pullik tarif kerak) va muhit o'zgaruvchisi `DATA_DIR=/var/data`, disk mount path `/var/data`. Narx va shartlarni Render saytida tekshiring.
- Keyingi bosqichda bazani PostgreSQL ga o'tkazish (kod `db` obyektiga yagona joydan murojaat qiladi, shuning uchun o'tish oson).

## Hozirgi cheklovlar va keyingi qadamlar

- Ovoz himoyasi oddiy (cookie). Boshqa brauzer, inkognito yoki skript bilan qayta ovoz berish mumkin. Dizaynda ko'rsatilgan Telegram bot orqali tasdiqlash hali yo'q, keyingi qadam shu.
- Mavzu konkursi (landingda "Tez orada" deb belgilangan) hali qurilmagan.
- Instagram profil rasmlari avtomatik olinmaydi. Admin panelda rasmni yuklang.
- Duellarni qo'lda yaratish kerak. Keyingi qadam: kunlik avtomatik duel (toifa bo'yicha tasodifiy juftlik).
- Ulashish uchun har bir duelga alohida havola va OG-rasm qo'shish mumkin.
