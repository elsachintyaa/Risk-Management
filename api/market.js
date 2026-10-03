export default async function handler(req, res) {
    const apiKey = process.env.TWELVEDATA_API_KEY;

    if (!apiKey) {
        return res.status(500).json({
            success: false,
            message: "Twelve Data API key belum diatur di Vercel"
        });
    }

    const symbol = req.query.symbol || "XAU/USD";

    try {
        const url =
            `https://api.twelvedata.com/price` +
            `?symbol=${encodeURIComponent(symbol)}` +
            `&apikey=${encodeURIComponent(apiKey)}`;

        const response = await fetch(url);
        const data = await response.json();

        if (!response.ok || data.status === "error") {
            return res.status(response.status || 500).json({
                success: false,
                message: "Twelve Data menolak request harga",
                response: data
            });
        }

        const price = Number(data.price);

        if (!Number.isFinite(price)) {
            return res.status(500).json({
                success: false,
                message: "Harga market tidak ditemukan"
            });
        }

        const spreads = {
            "XAU/USD": 0.80,
            "HSI": 16,
            "N225": 20
        };

        const spread = spreads[symbol] ?? 0;
        const halfSpread = spread / 2;

        return res.status(200).json({
            success: true,
            symbol,
            price,
            last_trade: price,
            sell: price - halfSpread,
            buy: price + halfSpread,
            spread,
            half_spread: halfSpread,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Gagal menghubungi Twelve Data"
        });
    }
}