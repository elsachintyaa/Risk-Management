# Ketahanan Dana - Native PHP


Project native PHP tanpa Laravel dan tanpa npm.

## Jalankan
1. Isi API key di `config.php`.
2. Buka PowerShell di folder project.
3. Jalankan `php -S localhost:8000`.
4. Buka `http://localhost:8000`.

## Spread
Mengikuti catatan perusahaan:
- Gold: Sell = Last Trade - 0.4, Buy = Last Trade + 0.4, Spread = 0.8
- Nikkei: Sell = Last Trade - 10, Buy = Last Trade + 10, Spread = 20
- Hang Seng: Sell = Last Trade - 8, Buy = Last Trade + 8, Spread = 16

## P/L
BUY menggunakan harga SELL/Bid sebagai harga penutupan.
SELL menggunakan harga BUY/Ask sebagai harga penutupan.

## Catatan real-time
Versi ini polling API setiap 3 detik. Candlestick dibentuk dari data harga yang diterima browser. Ini bukan tick-level WebSocket dan spread yang digunakan adalah spread konfigurasi di atas, bukan bid/ask broker asli.
