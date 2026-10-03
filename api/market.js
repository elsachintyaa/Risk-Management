export default async function handler(req, res) {
    const apiKey = process.env.TWELVEDATA_API_KEY;

    if (!apiKey) {
        return res.status(500).json({
            success: false,
            message: "Twelve Data API key belum diatur di Vercel"
        });
    }

    const symbol = String(
        req.query.symbol || "XAU/USD"
    ).trim();

    const spreads = {
        "XAU/USD": 0.80,
        "HSI": 16,
        "N225": 20
    };

    if (!spreads[symbol]) {
        return res.status(400).json({
            success: false,
            message: "Symbol tidak valid"
        });
    }

    const spread = spreads[symbol];
    const halfSpread = spread / 2;

    const wantsHistory =
        String(req.query.history || "") === "1";

    try {

        /* =========================================
           CURRENT PRICE
           ========================================= */

        const priceURL =
            "https://api.twelvedata.com/price" +
            `?symbol=${encodeURIComponent(symbol)}` +
            `&apikey=${encodeURIComponent(apiKey)}`;

        const priceResponse =
            await fetch(priceURL, {
                cache: "no-store"
            });

        const priceData =
            await priceResponse.json();

        if (
            !priceResponse.ok ||
            priceData.status === "error" ||
            priceData.code
        ) {
            return res.status(
                priceResponse.status || 502
            ).json({
                success: false,
                message:
                    "Twelve Data menolak request harga",
                response: priceData
            });
        }

        const price =
            Number(priceData.price);

        if (!Number.isFinite(price)) {
            return res.status(502).json({
                success: false,
                message:
                    "Harga market tidak ditemukan"
            });
        }


        /* =========================================
           HISTORICAL CANDLES
           ========================================= */

        let candles = [];

        if (wantsHistory) {

            const historyURL =
                "https://api.twelvedata.com/time_series" +
                `?symbol=${encodeURIComponent(symbol)}` +
                "&interval=1min" +
                "&outputsize=42" +
                "&order=asc" +
                `&apikey=${encodeURIComponent(apiKey)}`;

            const historyResponse =
                await fetch(historyURL, {
                    cache: "no-store"
                });

            const historyData =
                await historyResponse.json();

            if (
                historyResponse.ok &&
                historyData.status !== "error" &&
                Array.isArray(historyData.values)
            ) {

                candles =
                    historyData.values
                        .map(item => ({
                            time: item.datetime,
                            open: Number(item.open),
                            high: Number(item.high),
                            low: Number(item.low),
                            close: Number(item.close)
                        }))
                        .filter(item =>
                            Number.isFinite(item.open) &&
                            Number.isFinite(item.high) &&
                            Number.isFinite(item.low) &&
                            Number.isFinite(item.close)
                        );
            }
        }


        /* =========================================
           RESPONSE
           ========================================= */

        return res.status(200).json({

            success: true,

            symbol,

            price,

            last_trade: price,

            sell:
                price -
                halfSpread,

            buy:
                price +
                halfSpread,

            spread,

            half_spread:
                halfSpread,

            candles,

            timestamp:
                new Date().toISOString()
        });

    }

    catch (error) {

        return res.status(500).json({

            success: false,

            message:
                "Gagal menghubungi Twelve Data",

            error:
                error?.message ||
                "Unknown error"
        });
    }
}