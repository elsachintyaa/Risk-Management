const API_URL = "/api/market";

/* =========================================================
   PRODUCT CONFIGURATION
========================================================= */

const PRODUCTS = {
    gold: {
        key: "gold",
        name: "GOLD",
        symbol: "XAU/USD",
        contractSize: 100,
        decimals: 2,
        spread: 0.8
    },

    hangseng: {
        key: "hangseng",
        name: "HANG SENG",
        symbol: "HSI",
        contractSize: 5,
        decimals: 2,
        spread: 16
    },

    nikkei: {
        key: "nikkei",
        name: "NIKKEI",
        symbol: "N225",
        contractSize: 5,
        decimals: 2,
        spread: 20
    }
};


/* =========================================================
   STATE
========================================================= */

const state = {
    product: PRODUCTS.gold,

    price: 0,
    previousPrice: null,

    candles: [],
    liveCandle: null,

    candleIntervalMs: 5 * 60 * 1000,

    // REST API Twelve Data
    // Jangan terlalu kecil supaya tidak boros credit.
    pollingMs: 120 * 1000,

    pollingTimer: null,

    loading: false
};


/* =========================================================
   DOM HELPER
========================================================= */

function $(id) {
    return document.getElementById(id);
}


/* =========================================================
   NUMBER HELPERS
========================================================= */

function toNumber(value, fallback = 0) {
    const number = Number(value);

    return Number.isFinite(number)
        ? number
        : fallback;
}


function formatNumber(value, decimals = 2) {
    const number = toNumber(value);

    return number.toLocaleString("en-US", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
}


function formatPrice(value) {
    return formatNumber(
        value,
        state.product.decimals
    );
}


/* =========================================================
   PRODUCT
========================================================= */

function setProduct(productKey) {
    const product = PRODUCTS[productKey];

    if (!product) {
        return;
    }

    state.product = product;

    state.price = 0;
    state.previousPrice = null;

    state.candles = [];
    state.liveCandle = null;

    clearInterval(state.pollingTimer);

    updateProductButtons();

    const instrumentName = $("instrument-name");

    if (instrumentName) {
        instrumentName.textContent =
            product.name;
    }

    const chartSymbol = $("chart-symbol");

    if (chartSymbol) {
        chartSymbol.textContent =
            product.symbol;
    }

    resetMarketDisplay();

    fetchMarket(true);

    state.pollingTimer = setInterval(() => {
        fetchMarket(false);
    }, state.pollingMs);
}


/* =========================================================
   PRODUCT BUTTON STATE
========================================================= */

function updateProductButtons() {
    const buttons = {
        gold: $("product-gold"),
        hangseng: $("product-hangseng"),
        nikkei: $("product-nikkei")
    };

    Object.entries(buttons).forEach(
        ([key, button]) => {
            if (!button) {
                return;
            }

            if (key === state.product.key) {
                button.classList.add(
                    "ring-2",
                    "ring-white/30"
                );
            } else {
                button.classList.remove(
                    "ring-2",
                    "ring-white/30"
                );
            }
        }
    );
}


/* =========================================================
   RESET DISPLAY
========================================================= */

function resetMarketDisplay() {
    const marketPrice = $("market-price");

    if (marketPrice) {
        marketPrice.textContent = "0.00";
    }

    const priceChange = $("price-change");

    if (priceChange) {
        priceChange.textContent = "0.00";
    }

    const priceArrow = $("price-arrow");

    if (priceArrow) {
        priceArrow.textContent = "→";
    }

    const marketUpdate = $("market-update");

    if (marketUpdate) {
        marketUpdate.textContent =
            "Menghubungkan ke market...";
    }

    const chart = $("market-chart");

    if (chart) {
        chart.innerHTML = "";
    }
}


/* =========================================================
   MARKET API
========================================================= */

async function fetchMarket(loadHistory = false) {
    if (state.loading) {
        return;
    }

    state.loading = true;

    try {
        let url =
            `${API_URL}?symbol=${encodeURIComponent(
                state.product.symbol
            )}`;

        if (loadHistory) {
            url += "&history=1";
        }

        const response = await fetch(url, {
            cache: "no-store"
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(
                data.message ||
                "Market API error"
            );
        }

        /*
         * History hanya diambil saat pertama kali
         * memilih product.
         */
        if (
            loadHistory &&
            Array.isArray(data.candles)
        ) {
            state.candles = data.candles
                .map(normalizeCandle)
                .filter(Boolean)
                .slice(-32);

            state.liveCandle = null;
        }

        updateMarket(
            toNumber(data.price),
            data.timestamp
        );

    } catch (error) {
        console.error(
            "FETCH MARKET ERROR:",
            error
        );

        const marketUpdate = $("market-update");

        if (marketUpdate) {
            marketUpdate.textContent =
                "Gagal mengambil data market";
        }

    } finally {
        state.loading = false;
    }
}


/* =========================================================
   CANDLE NORMALIZER
========================================================= */

function normalizeCandle(candle) {
    if (!candle) {
        return null;
    }

    const open = Number(candle.open);
    const high = Number(candle.high);
    const low = Number(candle.low);
    const close = Number(candle.close);

    if (
        !Number.isFinite(open) ||
        !Number.isFinite(high) ||
        !Number.isFinite(low) ||
        !Number.isFinite(close)
    ) {
        return null;
    }

    return {
        time: candle.time,

        open,
        high,
        low,
        close
    };
}


/* =========================================================
   MARKET UPDATE
========================================================= */

function updateMarket(
    price,
    serverTimestamp = null
) {
    if (!Number.isFinite(price)) {
        return;
    }

    const oldPrice = state.price;

    state.previousPrice =
        oldPrice > 0
            ? oldPrice
            : null;

    state.price = price;

    updatePriceDisplay();

    updateLiveCandle(
        price,
        serverTimestamp
    );

    drawCandles();

    calculateRisk();

    const marketUpdate = $("market-update");

    if (marketUpdate) {
        const now = new Date();

        marketUpdate.textContent =
            `Update ${now.toLocaleTimeString(
                "id-ID",
                {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit"
                }
            )}`;
    }
}


/* =========================================================
   PRICE DISPLAY
========================================================= */

function updatePriceDisplay() {
    const marketPrice = $("market-price");

    if (marketPrice) {
        marketPrice.textContent =
            formatPrice(state.price);
    }

    const priceChange = $("price-change");
    const priceArrow = $("price-arrow");

    if (
        state.previousPrice === null
    ) {
        if (priceChange) {
            priceChange.textContent = "0.00";
        }

        if (priceArrow) {
            priceArrow.textContent = "→";
        }

        return;
    }

    const change =
        state.price -
        state.previousPrice;

    if (priceChange) {
        priceChange.textContent =
            `${change >= 0 ? "+" : ""}${formatPrice(
                change
            )}`;
    }

    if (priceArrow) {
        if (change > 0) {
            priceArrow.textContent = "↑";
            priceArrow.classList.remove(
                "text-red-400"
            );
            priceArrow.classList.add(
                "text-green-400"
            );
        } else if (change < 0) {
            priceArrow.textContent = "↓";
            priceArrow.classList.remove(
                "text-green-400"
            );
            priceArrow.classList.add(
                "text-red-400"
            );
        } else {
            priceArrow.textContent = "→";
        }
    }

    if (priceChange) {
        priceChange.classList.remove(
            "text-green-400",
            "text-red-400"
        );

        if (change > 0) {
            priceChange.classList.add(
                "text-green-400"
            );
        } else if (change < 0) {
            priceChange.classList.add(
                "text-red-400"
            );
        }
    }
}


/* =========================================================
   CURRENT 5 MINUTE BUCKET
========================================================= */

function getCurrentCandleBucket(
    timestamp = null
) {
    let time = Date.now();

    if (timestamp) {
        const parsed =
            Date.parse(timestamp);

        if (Number.isFinite(parsed)) {
            time = parsed;
        }
    }

    return (
        Math.floor(
            time /
                state.candleIntervalMs
        ) *
        state.candleIntervalMs
    );
}


/* =========================================================
   LIVE CANDLE
========================================================= */

function updateLiveCandle(
    price,
    serverTimestamp = null
) {
    if (!Number.isFinite(price)) {
        return;
    }

    const bucket =
        getCurrentCandleBucket(
            serverTimestamp
        );

    /*
     * Kalau belum ada live candle,
     * buat dari close candle terakhir.
     */
    if (!state.liveCandle) {
        const lastCandle =
            state.candles[
                state.candles.length - 1
            ];

        const open =
            lastCandle &&
            Number.isFinite(
                lastCandle.close
            )
                ? lastCandle.close
                : price;

        state.liveCandle = {
            time: bucket,
            open,
            high: Math.max(
                open,
                price
            ),
            low: Math.min(
                open,
                price
            ),
            close: price
        };

        return;
    }


    /*
     * Kalau sudah masuk candle 5 menit baru,
     * masukkan candle lama ke history.
     */
    if (
        state.liveCandle.time !== bucket
    ) {
        state.candles.push({
            ...state.liveCandle
        });

        state.candles =
            state.candles.slice(-32);

        state.liveCandle = {
            time: bucket,

            open:
                state.liveCandle.close,

            high: Math.max(
                state.liveCandle.close,
                price
            ),

            low: Math.min(
                state.liveCandle.close,
                price
            ),

            close: price
        };

        return;
    }


    /*
     * Candle masih dalam periode yang sama.
     */
    state.liveCandle.high =
        Math.max(
            state.liveCandle.high,
            price
        );

    state.liveCandle.low =
        Math.min(
            state.liveCandle.low,
            price
        );

    state.liveCandle.close =
        price;
}


/* =========================================================
   GET CANDLES FOR DISPLAY
========================================================= */

function getDisplayCandles() {
    const candles = [
        ...state.candles
    ];

    if (state.liveCandle) {
        candles.push(
            state.liveCandle
        );
    }

    return candles.slice(-32);
}


/* =========================================================
   CANVAS SIZE
========================================================= */

function getChartSize(canvas) {
    const rect =
        canvas.getBoundingClientRect();

    const width =
        Math.max(
            280,
            Math.floor(rect.width)
        );

    const height =
        Math.max(
            150,
            Math.floor(rect.height)
        );

    const dpr =
        window.devicePixelRatio || 1;

    canvas.width =
        width * dpr;

    canvas.height =
        height * dpr;

    const ctx =
        canvas.getContext("2d");

    ctx.setTransform(
        dpr,
        0,
        0,
        dpr,
        0,
        0
    );

    return {
        width,
        height,
        ctx
    };
}


/* =========================================================
   PRICE TO Y
========================================================= */

function priceToY(
    price,
    lowest,
    range,
    top,
    chartHeight
) {
    const safePrice =
        Number.isFinite(price)
            ? price
            : lowest;

    const normalized =
        (safePrice - lowest) /
        range;

    /*
     * Canvas Y dimulai dari atas.
     * Harga tinggi harus berada di atas.
     */
    return (
        top +
        chartHeight -
        normalized *
            chartHeight
    );
}


/* =========================================================
   DRAW CANDLES
========================================================= */

function drawCandles() {
    const container =
        $("market-chart");

    if (!container) {
        return;
    }

    /*
     * Buat canvas satu kali.
     */
    let canvas =
        container.querySelector(
            "canvas"
        );

    if (!canvas) {
        canvas =
            document.createElement(
                "canvas"
            );

        canvas.style.width =
            "100%";

        canvas.style.height =
            "100%";

        canvas.style.display =
            "block";

        container.innerHTML = "";

        container.appendChild(
            canvas
        );
    }

    const candles =
        getDisplayCandles();

    if (!candles.length) {
        return;
    }

    const {
        width,
        height,
        ctx
    } =
        getChartSize(canvas);


    /* =====================================================
       BACKGROUND
    ===================================================== */

    ctx.clearRect(
        0,
        0,
        width,
        height
    );

    ctx.fillStyle =
        "#080d13";

    ctx.fillRect(
        0,
        0,
        width,
        height
    );


    /* =====================================================
       CHART MARGINS
    ===================================================== */

    const left =
        8;

    const right =
        52;

    const top =
        8;

    const bottom =
        8;

    const chartWidth =
        width -
        left -
        right;

    const chartHeight =
        height -
        top -
        bottom;


    /* =====================================================
       PRICE RANGE
    ===================================================== */

    let highest =
        Math.max(
            ...candles.map(
                candle =>
                    candle.high
            )
        );

    let lowest =
        Math.min(
            ...candles.map(
                candle =>
                    candle.low
            )
        );

    if (
        !Number.isFinite(highest) ||
        !Number.isFinite(lowest)
    ) {
        return;
    }

    let range =
        highest - lowest;


    /*
     * Kalau market sedang sangat flat,
     * beri sedikit ruang supaya candle
     * tidak menempel di atas/bawah.
     */
    if (range <= 0) {
        range =
            Math.max(
                Math.abs(highest) *
                    0.0001,
                1
            );

        highest +=
            range / 2;

        lowest -=
            range / 2;
    } else {
        const padding =
            range * 0.08;

        highest +=
            padding;

        lowest -=
            padding;

        range =
            highest - lowest;
    }


    /* =====================================================
       GRID
    ===================================================== */

    ctx.save();

    ctx.strokeStyle =
        "rgba(255,255,255,0.055)";

    ctx.lineWidth =
        1;

    const gridRows =
        4;

    for (
        let i = 0;
        i <= gridRows;
        i++
    ) {
        const y =
            top +
            (chartHeight /
                gridRows) *
                i;

        ctx.beginPath();

        ctx.moveTo(
            left,
            y
        );

        ctx.lineTo(
            left +
                chartWidth,
            y
        );

        ctx.stroke();
    }

    ctx.restore();


    /* =====================================================
       CANDLE SPACING
    ===================================================== */

    const count =
        candles.length;

    const slotWidth =
        chartWidth /
        count;

    /*
     * Body dibuat lebih kecil dari slot
     * supaya terlihat seperti trading chart.
     */
    const bodyWidth =
        Math.max(
            4,
            Math.min(
                9,
                slotWidth *
                    0.56
            )
        );

    const wickWidth =
        1;


    /* =====================================================
       CANDLE LOOP
    ===================================================== */

    candles.forEach(
        (candle, index) => {
            const centerX =
                left +
                slotWidth *
                    (index + 0.5);

            const openY =
                priceToY(
                    candle.open,
                    lowest,
                    range,
                    top,
                    chartHeight
                );

            const closeY =
                priceToY(
                    candle.close,
                    lowest,
                    range,
                    top,
                    chartHeight
                );

            const highY =
                priceToY(
                    candle.high,
                    lowest,
                    range,
                    top,
                    chartHeight
                );

            const lowY =
                priceToY(
                    candle.low,
                    lowest,
                    range,
                    top,
                    chartHeight
                );

            const bullish =
                candle.close >=
                candle.open;


            /* =============================================
               WICK
            ============================================= */

            ctx.beginPath();

            ctx.strokeStyle =
                bullish
                    ? "#22c55e"
                    : "#ef4444";

            ctx.lineWidth =
                wickWidth;

            ctx.moveTo(
                centerX,
                highY
            );

            ctx.lineTo(
                centerX,
                lowY
            );

            ctx.stroke();


            /* =============================================
               BODY
            ============================================= */

            let bodyTop =
                Math.min(
                    openY,
                    closeY
                );

            let bodyBottom =
                Math.max(
                    openY,
                    closeY
                );

            let bodyHeight =
                bodyBottom -
                bodyTop;


            /*
             * Jangan biarkan candle flat
             * benar-benar tidak terlihat.
             */
            if (
                bodyHeight < 3
            ) {
                const center =
                    (
                        bodyTop +
                        bodyBottom
                    ) / 2;

                bodyTop =
                    center -
                    1.5;

                bodyBottom =
                    center +
                    1.5;

                bodyHeight =
                    3;
            }


            ctx.fillStyle =
                bullish
                    ? "#22c55e"
                    : "#ef4444";

            ctx.fillRect(
                centerX -
                    bodyWidth / 2,
                bodyTop,
                bodyWidth,
                bodyHeight
            );
        }
    );


    /* =====================================================
       CURRENT PRICE LINE
    ===================================================== */

    if (
        Number.isFinite(
            state.price
        )
    ) {
        const priceY =
            priceToY(
                state.price,
                lowest,
                range,
                top,
                chartHeight
            );

        ctx.save();

        ctx.strokeStyle =
            "rgba(255,255,255,0.35)";

        ctx.lineWidth =
            1;

        ctx.setLineDash([
            4,
            4
        ]);

        ctx.beginPath();

        ctx.moveTo(
            left,
            priceY
        );

        ctx.lineTo(
            left +
                chartWidth,
            priceY
        );

        ctx.stroke();

        ctx.restore();


        /* =============================================
           CURRENT PRICE LABEL
        ============================================= */

        const labelX =
            left +
            chartWidth +
            4;

        const labelWidth =
            right - 6;

        const labelHeight =
            20;

        let labelY =
            priceY -
            labelHeight / 2;

        labelY =
            Math.max(
                0,
                Math.min(
                    height -
                        labelHeight,
                    labelY
                )
            );


        ctx.fillStyle =
            "#1f2937";

        ctx.fillRect(
            labelX,
            labelY,
            labelWidth,
            labelHeight
        );


        ctx.fillStyle =
            "#ffffff";

        ctx.font =
            "10px Poppins, Arial, sans-serif";

        ctx.textAlign =
            "left";

        ctx.textBaseline =
            "middle";

        ctx.fillText(
            formatPrice(
                state.price
            ),
            labelX + 4,
            labelY +
                labelHeight / 2
        );
    }


    /* =====================================================
       RIGHT PRICE LABELS
    ===================================================== */

    ctx.fillStyle =
        "rgba(255,255,255,0.45)";

    ctx.font =
        "9px Poppins, Arial, sans-serif";

    ctx.textAlign =
        "left";

    ctx.textBaseline =
        "middle";

    for (
        let i = 0;
        i <= gridRows;
        i++
    ) {
        const ratio =
            i / gridRows;

        const price =
            highest -
            ratio *
                range;

        const y =
            top +
            ratio *
                chartHeight;

        /*
         * Jangan tulis label terlalu dekat
         * dengan current price label.
         */
        if (
            Math.abs(
                y -
                priceToY(
                    state.price,
                    lowest,
                    range,
                    top,
                    chartHeight
                )
            ) <
            14
        ) {
            continue;
        }

        ctx.fillText(
            formatPrice(
                price
            ),
            left +
                chartWidth +
                4,
            y
        );
    }
}


/* =========================================================
   RESIZE CHART
========================================================= */

let resizeTimer = null;

window.addEventListener(
    "resize",
    () => {
        clearTimeout(
            resizeTimer
        );

        resizeTimer =
            setTimeout(() => {
                drawCandles();
            }, 100);
    }
);


/* =========================================================
   RISK CALCULATION
========================================================= */

function calculateRisk() {
    const equityInput =
        $("equity");

    const lotInput =
        $("lot");

    const marginInput =
        $("margin-required");

    const openPriceInput =
        $("open-price");

    if (
        !equityInput ||
        !lotInput ||
        !marginInput ||
        !openPriceInput
    ) {
        return;
    }

    const equity =
        toNumber(
            equityInput.value
        );

    const lot =
        Math.max(
            0,
            Math.floor(
                toNumber(
                    lotInput.value
                )
            )
        );

    const marginRequired =
        toNumber(
            marginInput.value
        );

    const openPrice =
        toNumber(
            openPriceInput.value
        );


    /* =====================================================
       MARKET PRICE
    ===================================================== */

    const currentPrice =
        state.price;


    if (
        equity <= 0 ||
        lot <= 0 ||
        marginRequired <= 0 ||
        openPrice <= 0 ||
        currentPrice <= 0
    ) {
        resetRiskDisplay();

        return;
    }


    /* =====================================================
       SPREAD
    ===================================================== */

    const spread =
        state.product.spread;

    const halfSpread =
        spread / 2;


    /*
     * BUY ditutup menggunakan SELL/BID.
     */
    const bid =
        currentPrice -
        halfSpread;


    /*
     * SELL ditutup menggunakan BUY/ASK.
     */
    const ask =
        currentPrice +
        halfSpread;


    /* =====================================================
       POSITION
    ===================================================== */

    const buyButton =
        $("buy-button");

    const isSell =
        buyButton &&
        buyButton.dataset.active ===
            "false";


    /*
     * Default:
     * BUY
     */
    let pnl = 0;

    if (isSell) {
        pnl =
            (
                openPrice -
                ask
            ) *
            lot *
            state.product
                .contractSize;
    } else {
        pnl =
            (
                bid -
                openPrice
            ) *
            lot *
            state.product
                .contractSize;
    }


    /* =====================================================
       RUNNING EQUITY
    ===================================================== */

    const runningEquity =
        equity + pnl;


    const effectiveMargin =
        marginRequired;


    const equityRatio =
        effectiveMargin > 0
            ? (
                  runningEquity /
                  effectiveMargin
              ) *
              100
            : 0;


    /* =====================================================
       RUNNING EQUITY
    ===================================================== */

    const runningEquityElement =
        $("running-equity");

    if (runningEquityElement) {
        runningEquityElement.textContent =
            `$${formatNumber(
                runningEquity,
                2
            )}`;
    }


    /* =====================================================
       EFFECTIVE MARGIN
    ===================================================== */

    const effectiveMarginElement =
        $("effective-margin");

    if (effectiveMarginElement) {
        effectiveMarginElement.textContent =
            `$${formatNumber(
                effectiveMargin,
                2
            )}`;
    }


    /* =====================================================
       EQUITY RATIO
    ===================================================== */

    const equityRatioElement =
        $("equity-ratio");

    if (equityRatioElement) {
        equityRatioElement.textContent =
            `${formatNumber(
                equityRatio,
                2
            )}%`;
    }


    /* =====================================================
       CALL MARGIN
       85% DARI EQUITY AWAL
    ===================================================== */

    const callLoss =
        equity * 0.85;

    const liquidationLoss =
        equity * 1.00;


    /*
     * Harga adverse untuk BUY
     */
    let callPrice;
    let liquidationPrice;

    if (isSell) {
        /*
         * SELL rugi kalau ASK naik.
         */
        const adverseMoveCall =
            callLoss /
            (
                lot *
                state.product
                    .contractSize
            );

        const adverseMoveLiquidation =
            liquidationLoss /
            (
                lot *
                state.product
                    .contractSize
            );

        callPrice =
            openPrice +
            adverseMoveCall -
            halfSpread;

        liquidationPrice =
            openPrice +
            adverseMoveLiquidation -
            halfSpread;

    } else {
        /*
         * BUY rugi kalau BID turun.
         */
        const adverseMoveCall =
            callLoss /
            (
                lot *
                state.product
                    .contractSize
            );

        const adverseMoveLiquidation =
            liquidationLoss /
            (
                lot *
                state.product
                    .contractSize
            );

        callPrice =
            openPrice -
            adverseMoveCall +
            halfSpread;

        liquidationPrice =
            openPrice -
            adverseMoveLiquidation +
            halfSpread;
    }


    /* =====================================================
       CALL STATUS
    ===================================================== */

    const callStatus =
        $("call-status");

    const callPriceElement =
        $("call-price");

    if (callPriceElement) {
        callPriceElement.textContent =
            formatPrice(
                callPrice
            );
    }

    if (callStatus) {
        if (
            runningEquity <=
            equity * 0.15
        ) {
            callStatus.textContent =
                "CALL MARGIN";

        } else {
            callStatus.textContent =
                "AMAN";
        }
    }


    /* =====================================================
       LIQUIDATION STATUS
    ===================================================== */

    const liquidationStatus =
        $("liquidation-status");

    const liquidationPriceElement =
        $("liquidation-price");

    if (
        liquidationPriceElement
    ) {
        liquidationPriceElement.textContent =
            formatPrice(
                liquidationPrice
            );
    }

    if (liquidationStatus) {
        if (
            runningEquity <= 0
        ) {
            liquidationStatus.textContent =
                "AUTO LIQUIDATION";

        } else {
            liquidationStatus.textContent =
                "AMAN";
        }
    }


    /* =====================================================
       ADDITIONAL FUND
    ===================================================== */

    const targetEquity =
        marginRequired *
        3.5;

    const additionalFund =
        Math.max(
            0,
            targetEquity -
                runningEquity
        );


    const additionalFundElement =
        $("additional-fund");

    if (
        additionalFundElement
    ) {
        additionalFundElement.textContent =
            `$${formatNumber(
                additionalFund,
                2
            )}`;
    }


    const additionalFundMessage =
        $("additional-fund-message");

    if (
        additionalFundMessage
    ) {
        if (
            additionalFund <= 0
        ) {
            additionalFundMessage.textContent =
                "Dana sudah mencapai target ketahanan 350%.";

        } else {
            additionalFundMessage.textContent =
                "Tambahkan dana untuk mengembalikan ketahanan dana ke 350%.";
        }
    }


    /* =====================================================
       RISK STATUS
    ===================================================== */

    updateRiskStatus(
        equityRatio
    );
}


/* =========================================================
   RISK STATUS
========================================================= */

function updateRiskStatus(
    ratio
) {
    const riskStatus =
        $("risk-status");

    const riskIcon =
        $("risk-icon");

    if (!riskStatus) {
        return;
    }


    /*
     * >= 350%
     * SEHAT
     */
    if (ratio >= 350) {
        riskStatus.textContent =
            "SEHAT";

        if (riskIcon) {
            riskIcon.textContent =
                "✓";
        }

        return;
    }


    /*
     * > 150% dan < 350%
     * BURUK
     */
    if (ratio > 150) {
        riskStatus.textContent =
            "BURUK";

        if (riskIcon) {
            riskIcon.textContent =
                "!";
        }

        return;
    }


    /*
     * <= 150%
     * SANGAT BURUK
     */
    riskStatus.textContent =
        "SANGAT BURUK";

    if (riskIcon) {
        riskIcon.textContent =
            "!";
    }
}


/* =========================================================
   RESET RISK DISPLAY
========================================================= */

function resetRiskDisplay() {
    const ids = [
        "running-equity",
        "effective-margin",
        "equity-ratio",
        "call-price",
        "liquidation-price",
        "additional-fund"
    ];

    ids.forEach(id => {
        const element = $(id);

        if (element) {
            element.textContent =
                "0.00";
        }
    });


    const callStatus =
        $("call-status");

    if (callStatus) {
        callStatus.textContent =
            "-";
    }


    const liquidationStatus =
        $("liquidation-status");

    if (liquidationStatus) {
        liquidationStatus.textContent =
            "-";
    }


    const riskStatus =
        $("risk-status");

    if (riskStatus) {
        riskStatus.textContent =
            "-";
    }


    const additionalFundMessage =
        $("additional-fund-message");

    if (
        additionalFundMessage
    ) {
        additionalFundMessage.textContent =
            "Lengkapi data untuk menghitung.";
    }
}


/* =========================================================
   POSITION BUTTON
========================================================= */

function setPosition(type) {
    const buyButton =
        $("buy-button");

    const sellButton =
        $("sell-button");

    if (
        !buyButton ||
        !sellButton
    ) {
        return;
    }


    if (type === "BUY") {
        buyButton.dataset.active =
            "true";

        sellButton.dataset.active =
            "false";

        buyButton.classList.add(
            "active"
        );

        sellButton.classList.remove(
            "active"
        );

    } else {
        buyButton.dataset.active =
            "false";

        sellButton.dataset.active =
            "true";

        sellButton.classList.add(
            "active"
        );

        buyButton.classList.remove(
            "active"
        );
    }


    calculateRisk();
}


/* =========================================================
   INPUT VALIDATION
========================================================= */

function setupInputs() {
    const equity =
        $("equity");

    const lot =
        $("lot");

    const margin =
        $("margin-required");

    const openPrice =
        $("open-price");


    if (equity) {
        equity.addEventListener(
            "input",
            calculateRisk
        );
    }


    if (margin) {
        margin.addEventListener(
            "input",
            calculateRisk
        );
    }


    if (openPrice) {
        openPrice.addEventListener(
            "input",
            calculateRisk
        );
    }


    if (lot) {
        lot.addEventListener(
            "input",
            () => {
                /*
                 * Lot hanya bilangan bulat.
                 */
                let value =
                    lot.value.replace(
                        /[^0-9]/g,
                        ""
                    );

                if (value !== "") {
                    value =
                        String(
                            parseInt(
                                value,
                                10
                            )
                        );
                }

                lot.value =
                    value;

                calculateRisk();
            }
        );

        lot.addEventListener(
            "keydown",
            event => {
                if (
                    [
                        "e",
                        "E",
                        "+",
                        "-",
                        ".",
                        ","
                    ].includes(
                        event.key
                    )
                ) {
                    event.preventDefault();
                }
            }
        );
    }
}


/* =========================================================
   PRODUCT EVENTS
========================================================= */

function setupProductButtons() {
    const gold =
        $("product-gold");

    const hangseng =
        $("product-hangseng");

    const nikkei =
        $("product-nikkei");


    if (gold) {
        gold.addEventListener(
            "click",
            () => {
                setProduct(
                    "gold"
                );
            }
        );
    }


    if (hangseng) {
        hangseng.addEventListener(
            "click",
            () => {
                setProduct(
                    "hangseng"
                );
            }
        );
    }


    if (nikkei) {
        nikkei.addEventListener(
            "click",
            () => {
                setProduct(
                    "nikkei"
                );
            }
        );
    }
}


/* =========================================================
   BUY / SELL EVENTS
========================================================= */

function setupPositionButtons() {
    const buyButton =
        $("buy-button");

    const sellButton =
        $("sell-button");


    if (buyButton) {
        buyButton.dataset.active =
            "true";

        buyButton.addEventListener(
            "click",
            () => {
                setPosition(
                    "BUY"
                );
            }
        );
    }


    if (sellButton) {
        sellButton.dataset.active =
            "false";

        sellButton.addEventListener(
            "click",
            () => {
                setPosition(
                    "SELL"
                );
            }
        );
    }
}


/* =========================================================
   INITIALIZE
========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    () => {
        setupInputs();

        setupProductButtons();

        setupPositionButtons();

        updateProductButtons();

        /*
         * Default product = GOLD
         */
        setProduct(
            "gold"
        );
    }
);