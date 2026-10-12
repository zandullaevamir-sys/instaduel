// Telegram WebApp va global o'zgaruvchilar
const tg = window.Telegram?.WebApp;
let currentWinnerData = null;

document.addEventListener("DOMContentLoaded", () => {
    // Telegram Mini App tayyorlash va kontakt ulashish
    if (tg) {
        tg.ready();
        tg.expand();

        if (tg.requestContact) {
            tg.requestContact((sent, response) => {
                console.log("Telegram kontakt so'rovi bajarildi");
            });
        }
    }

    checkCurrentDuelStatus();
});

// Ovoz berish funksiyasi
function submitVote(side) {
    fetch('/api/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ side: side })
    })
    .then(res => res.json())
    .then(data => {
        alert(data.message || "Ovozingiz qabul qilindi!");
        checkCurrentDuelStatus();
    })
    .catch(err => {
        console.error("Ovoz berishda xatolik:", err);
    });
}

// Jang statusini va Kun G'olibini tekshirish
function checkCurrentDuelStatus() {
    fetch('/api/duel/status')
        .then(res => res.json())
        .then(data => {
            if (data.isFinished && data.winner) {
                currentWinnerData = data.winner;
                
                // Active duelni yashirib, Kun G'olibi kartochkasini chiqarish
                document.getElementById('activeDuelSection').style.display = 'none';
                document.getElementById('dailyWinnerSection').style.display = 'block';
                
                document.getElementById('winnerAvatar').src = data.winner.image || '/default.jpg';
                document.getElementById('winnerName').textContent = data.winner.name;
                document.getElementById('winnerVotes').textContent = `${data.winner.votes} ta ovoz bilan g'olib bo'ldi!`;
            } else {
                document.getElementById('activeDuelSection').style.display = 'block';
                document.getElementById('dailyWinnerSection').style.display = 'none';

                if (data.p1) {
                    document.getElementById('p1_name').textContent = data.p1.name;
                    document.getElementById('p1_img').src = data.p1.image;
                }
                if (data.p2) {
                    document.getElementById('p2_name').textContent = data.p2.name;
                    document.getElementById('p2_img').src = data.p2.image;
                }
            }
        })
        .catch(err => console.log("Status tekshirishda xatolik:", err));
}

// 3-Variant: 1080x1920 HD Instagram Story Canvas JPG Generator
function downloadWinnerStoryJPG() {
    if (!currentWinnerData) {
        alert("G'olib ma'lumotlari topilmadi!");
        return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1920;
    const ctx = canvas.getContext('2d');

    // Gradient Fon: Qizil va Ko'k to'qnashuvi
    ctx.fillStyle = '#ff334b';
    ctx.fillRect(0, 0, 540, 1920);
    ctx.fillStyle = '#2b7fff';
    ctx.fillRect(540, 0, 540, 1920);

    // Qorong'i Markaziy Kartochka
    ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
    ctx.beginPath();
    ctx.roundRect(80, 160, 920, 1600, 40);
    ctx.fill();

    // Logo (Insta - Qizil, Duel - Ko'k)
    ctx.font = 'bold 84px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff334b';
    ctx.fillText('Insta', 430, 310);
    ctx.fillStyle = '#2b7fff';
    ctx.fillText('Duel', 650, 310);

    // KUN G'OLIBI Yozuvi va Toj
    ctx.font = 'bold 64px Inter, sans-serif';
    ctx.fillStyle = '#facc15';
    ctx.fillText('👑 KUN G\'OLIBI 👑', 540, 450);

    // G'olib Ismi va Ovozlar Soni
    ctx.font = 'bold 58px Inter, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(currentWinnerData.name || 'G\'OLIB', 540, 1380);

    ctx.font = '42px Inter, sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(`${currentWinnerData.votes || 0} TA OVOZ BILAN`, 540, 1460);

    // Pastki brending
    ctx.font = '36px Inter, sans-serif';
    ctx.fillStyle = '#38bdf8';
    ctx.fillText('instaduel.uz', 540, 1650);

    // Rasm yuklash va Doira shaklida qirqib chizish
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
        ctx.save();
        ctx.beginPath();
        ctx.arc(540, 880, 280, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(img, 260, 600, 560, 560);
        ctx.restore();

        // Oltin ramka
        ctx.beginPath();
        ctx.arc(540, 880, 280, 0, Math.PI * 2);
        ctx.lineWidth = 12;
        ctx.strokeStyle = '#facc15';
        ctx.stroke();

        // JPG sifatida yuklab olish
        const link = document.createElement('a');
        link.download = `instaduel-winner-${Date.now()}.jpg`;
        link.href = canvas.toDataURL('image/jpeg', 0.95);
        link.click();
    };
    img.src = currentWinnerData.image || '/default.jpg';
}
