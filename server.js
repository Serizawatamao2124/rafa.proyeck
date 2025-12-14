const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const fs = require('fs'); // <-- 1. Impor modul File System
const jwt = require('jsonwebtoken'); // Impor jsonwebtoken

const app = express();
const port = 3000;

// Middleware
app.use(cors()); // Mengizinkan permintaan dari front-end
app.use(express.json()); // Membaca body JSON dari permintaan

// =================================================================================
// KONFIGURASI JWT
// =================================================================================
const JWT_SECRET = process.env.JWT_SECRET || 'kunci_rahasia_jwt_yang_sangat_aman_12345'; // Ganti dengan string yang lebih kompleks dan aman di produksi
// MANAJEMEN DATA DENGAN FILE JSON
// =================================================================================
const DB_PATH = './database.json';

// Fungsi untuk membaca data dari file JSON
function readDatabase() {
    try {
        if (fs.existsSync(DB_PATH)) {
            const data = fs.readFileSync(DB_PATH, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error("Gagal membaca atau parse database.json:", error);
    }
    // Jika file tidak ada atau error, kembalikan data default
    return {
        users: [
            { username: "admin", password: "admin123", email: "admin@sotolamongan.com", role: "admin", status: "active" },
            { username: "kasir1", password: "kasir123", email: "kasir1@sotolamongan.com", role: "kasir", status: "active" }
        ],
        menuItems: [ // Pindahkan data menu dari index.html ke sini
            { id: 1, name: "Soto Ayam Lamongan", category: "makanan", price: 25000, status: "active", image: null },
            { id: 2, name: "Soto Daging Lamongan", category: "makanan", price: 30000, status: "active", image: null },
            { id: 3, name: "Nasi Goreng Lamongan", category: "makanan", price: 20000, status: "active", image: null },
            { id: 4, name: "Es Jeruk", category: "minuman", price: 8000, status: "active", image: null },
            { id: 5, name: "Teh Manis", category: "minuman", price: 5000, status: "active", image: null },
            { id: 6, name: "Kerupuk Udang", category: "tambahan", price: 3000, status: "active", image: null },
            { id: 7, name: "Telur Rebus", category: "tambahan", price: 5000, status: "active", image: null },
            { id: 8, name: "Emping Melinjo", category: "tambahan", price: 4000, status: "active", image: null }
        ],
        salesData: []
    };
}

// Fungsi untuk menulis data ke file JSON
function writeDatabase(data) {
    try {
        // Tulis dengan format yang rapi (null, 2)
        fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
        console.error("Gagal menulis ke database.json:", error);
    }
}

// Muat database saat server pertama kali berjalan
let db = readDatabase();

// Tempat menyimpan OTP sementara di sisi server
// OTP bersifat sementara, jadi tidak perlu disimpan di file JSON
const otpStore = {};

// =================================================================================
// MIDDLEWARE AUTENTIKASI DAN OTORISASI
// =================================================================================

// Middleware untuk memverifikasi token JWT
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Format: Bearer TOKEN

    if (token == null) return res.sendStatus(401); // Jika tidak ada token, Unauthorized

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403); // Token tidak valid atau kedaluwarsa, Forbidden
        req.user = user; // Menyimpan payload user (username, role) di objek request
        next(); // Lanjutkan ke handler route berikutnya
    });
}

// Middleware untuk otorisasi berdasarkan peran
function authorizeRoles(roles) {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({ message: 'Akses ditolak: Anda tidak memiliki izin.' });
        }
        next(); // Lanjutkan jika peran diizinkan
    };
}

// =================================================================================
// KONFIGURASI PENGIRIMAN EMAIL (GMAIL)
// =================================================================================
// Ganti dengan alamat email dan "App Password" Anda
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'email.anda@gmail.com', // <-- WAJIB GANTI: Masukkan alamat email Gmail Anda yang aktif.
        pass: 'xxyyzzabcdefgh'      // <-- WAJIB GANTI: Masukkan 16 karakter "App Password" dari Google, BUKAN password email biasa.
    }
});

// =================================================================================
// Endpoint untuk mengirim OTP
// =================================================================================
app.post('/send-otp', (req, res) => {
    const { email, username } = req.body;

    // Verifikasi apakah email ada di data pengguna
    const user = db.users.find(u => u.email === email && u.username === username);
    if (!user) {
        return res.status(404).json({ message: 'Email atau username tidak terdaftar.' });
    }

    // Buat kode OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    otpStore[username] = {
        code: otp,
        timestamp: Date.now() // Simpan timestamp saat OTP dibuat
    };
    
    console.log(`OTP untuk ${username} (${email}) adalah: ${otp}`); // Untuk debugging di console server

    // Opsi email
    const mailOptions = {
        from: '"Soto Lamongan" <email.anda@gmail.com>', // <-- WAJIB GANTI: Masukkan alamat email Gmail Anda lagi.
        to: email,
        subject: 'Kode OTP Reset Password Anda',
        html: `
            <div style="font-family: Arial, sans-serif; text-align: center; padding: 20px;">
                <h2>Reset Password Soto Lamongan</h2>
                <p>Gunakan kode di bawah ini untuk mereset password Anda.</p>
                <p style="font-size: 24px; font-weight: bold; letter-spacing: 5px; background-color: #f0f0f0; padding: 10px; border-radius: 5px;">
                    ${otp}
                </p>
                <p>Kode ini hanya berlaku selama 10 menit. Jangan berikan kode ini kepada siapa pun.</p>
            </div>
        `
    };

    // Kirim email
    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.error('Error sending email:', error);
            return res.status(500).json({ message: 'Gagal mengirim email OTP.' });
        }
        console.log('Email sent: ' + info.response);
        res.status(200).json({ message: 'OTP berhasil dikirim ke email Anda.' });
    });
});

// =================================================================================
// Endpoint baru untuk verifikasi OTP
// =================================================================================
app.post('/verify-otp', (req, res) => {
    const { username, enteredOtp } = req.body;

    const storedOtpData = otpStore[username];

    if (!storedOtpData) {
        return res.status(400).json({ message: 'OTP tidak ditemukan atau sudah kedaluwarsa. Silakan minta OTP baru.' });
    }

    const tenMinutesInMillis = 10 * 60 * 1000; // Mengubah durasi menjadi 10 menit
    const isExpired = (Date.now() - storedOtpData.timestamp) > tenMinutesInMillis;

    if (isExpired) {
        delete otpStore[username]; // Hapus OTP yang sudah kedaluwarsa
        return res.status(400).json({ message: 'Kode OTP sudah kedaluwarsa. Silakan minta OTP baru.' });
    }

    if (storedOtpData.code === enteredOtp) {
        // OTP benar dan belum kedaluwarsa
        delete otpStore[username]; // Hapus OTP setelah berhasil digunakan
        return res.status(200).json({ message: 'Verifikasi OTP berhasil.' });
    } else {
        // OTP salah
        return res.status(400).json({ message: 'Kode OTP yang Anda masukkan salah.' });
    }
});

// =================================================================================
// Endpoint untuk Login (Mengeluarkan JWT)
// =================================================================================
app.post('/login', (req, res) => {
    const { username, password } = req.body;

    const user = db.users.find(u => u.username === username && u.password === password);

    if (user) {
        // Buat token JWT yang berisi username dan role, berlaku 1 jam
        const accessToken = jwt.sign({ username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '1h' });
        res.json({ accessToken: accessToken, role: user.role, username: user.username });
    } else {
        res.status(401).json({ message: 'Username atau password salah.' });
    }
});

// =================================================================================
// CONTOH ENDPOINT UNTUK MENGELOLA DATA
// =================================================================================

// Endpoint untuk mendapatkan semua data (contoh)
app.get('/get-data', (req, res) => {
    // Untuk contoh ini, kita biarkan /get-data bisa diakses publik.
    // Di aplikasi nyata, Anda mungkin ingin membatasi data yang dikirim berdasarkan peran pengguna.
    res.status(200).json(db); // Mengirim seluruh objek db
});

// Endpoint untuk memperbarui/menambah pengguna (contoh)
app.post('/update-users', authenticateToken, authorizeRoles(['admin']), (req, res) => {
    const newUsers = req.body.users;
    if (!Array.isArray(newUsers)) {
        return res.status(400).json({ message: 'Format data pengguna tidak valid.' });
    }

    db.users = newUsers; // Ganti data pengguna di memori
    writeDatabase(db);   // Tulis perubahan ke file database.json

    res.status(200).json({ message: 'Data pengguna berhasil diperbarui.' });
});

// Endpoint untuk memperbarui/menambah menu (contoh) - HANYA ADMIN
app.post('/update-menu', authenticateToken, authorizeRoles(['admin']), (req, res) => {
    const newMenuItems = req.body.menuItems;
    if (!Array.isArray(newMenuItems)) {
        return res.status(400).json({ message: 'Format data menu tidak valid.' });
    }

    db.menuItems = newMenuItems; // Ganti data menu di memori
    writeDatabase(db);   // Tulis perubahan ke file database.json

    res.status(200).json({ message: 'Data menu berhasil diperbarui.' });
});


// =================================================================================
// Menjalankan Server
// =================================================================================
app.listen(port, () => {
    console.log(`Server berjalan di http://localhost:${port}`);
});