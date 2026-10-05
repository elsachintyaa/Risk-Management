// api/market.js  (Vercel Serverless Function)
// Env yang dibutuhkan di Vercel: TWELVE_DATA_API_KEY

const ALLOWED_SYMBOLS = ["XAU/USD", "HSI", "N225"];

module.exports = async (req, res) => {
    res.setHeader("Cache-Control", "no-store");

    try {
        const apiKey = process.env.TWELVEDATA_API_KEY;

        if (!apiKey) {
            return res.status(500).json({
                success: false,
                message: "TWELVE_DATA_API_KEY belum diset di Vercel"
            });
        }

        const symbol = String(req.query.symbol || "XAU/USD");

        if (!ALLOWED_SYMBOLS.includes(symbol)) {
            return res.status(400).json({
                success: false,
                message: "Symbol tidak didukung"
            });
        }

        // history=1 -> 40 candle (saat pilih produk)
        // selain itu -> 3 candle terakhir (polling hemat, tetap 1 credit)
        const outputsize = req.query.history === "1" ? 40 : 3;

        const url =
            "https://api.twelvedata.com/time_series" +
            `?symbol=${encodeURIComponent(symbol)}` +
            "&interval=5min" +
            `&outputsize=${outputsize}` +
            "&order=ASC" +        // urut lama -> baru
            "&timezone=UTC" +     // waktu seragam, mudah di-parse
            `&apikey=${apiKey}`;

        const response = await fetch(url);
        const data = await response.json();

        if (data.status === "error" || !Array.isArray(data.values)) {
            return res.status(502).json({
                success: false,
                message: data.message || "Gagal mengambil data Twelve Data"
            });
        }

        const candles = data.values
            .map(v => ({
                time: Date.parse(String(v.datetime).replace(" ", "T") + "Z"),
                open: Number(v.open),
                high: Number(v.high),
                low: Number(v.low),
                close: Number(v.close)
            }))
            .filter(c =>
                Number.isFinite(c.time) &&
                Number.isFinite(c.open) &&
                Number.isFinite(c.high) &&
                Number.isFinite(c.low) &&
                Number.isFinite(c.close)
            );

        if (!candles.length) {
            return res.status(502).json({
                success: false,
                message: "Data candle kosong"
            });
        }

        const last = candles[candles.length - 1];

        return res.status(200).json({
            success: true,
            symbol,
            price: last.close,
            timestamp: new Date(last.time).toISOString(),
            candles
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message || "Server error"
        });
    }
};