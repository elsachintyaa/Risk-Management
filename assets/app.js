/* =========================================================
   GOLD RISK MONITOR
   NATIVE PHP VERSION
   ========================================================= */

const API_URL = "api.php";


/* =========================================================
   PRODUCTS
   ========================================================= */

const PRODUCTS = {

    gold: {
        symbol: "XAU/USD",
        name: "XAU/USD",
        label: "GOLD",

        // $100 PER LOT
        contractSize: 100,

        spread: 0.80,
        decimals: 2
    },

    hangseng: {
        symbol: "HSI",
        name: "HSI",
        label: "HANG SENG",

        // $5 PER LOT
        contractSize: 5,

        spread: 16,
        decimals: 0
    },

    nikkei: {
        symbol: "N225",
        name: "N225",
        label: "NIKKEI",

        // $5 PER LOT
        contractSize: 5,

        spread: 20,
        decimals: 0
    }

};


/* =========================================================
   STATE
   ========================================================= */

const state = {

    product: "gold",

    position: "BUY",

    lastTrade: null,

    sell: null,

    buy: null,

    spread: null,

    previousPrice: null,

    priceHistory: [],

    candles: [],

    timer: null,

    // 1 candle = 5 detik
    candleInterval: 5000,

    maxCandles: 60

};


/* =========================================================
   DOM HELPER
   ========================================================= */

const $ = (id) => {

    return document.getElementById(id);

};


/* =========================================================
   PRODUCT
   ========================================================= */

function getProduct() {

    return PRODUCTS[state.product];

}


/* =========================================================
   PARSE NUMBER
   ========================================================= */

function parseNumber(value) {

    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {
        return 0;
    }


    let stringValue = String(value)
        .trim();


    /*
     * Format Indonesia:
     *
     * 10.000
     * 10.000,50
     */

    if (
        stringValue.includes(",")
    ) {

        stringValue =
            stringValue
                .replace(/\./g, "")
                .replace(",", ".");

    }

    else {

        /*
         * Untuk input biasa seperti:
         *
         * 10000
         * 4300.50
         */

        stringValue =
            stringValue.replace(/[^\d.-]/g, "");

    }


    const number =
        Number.parseFloat(
            stringValue
        );


    return Number.isFinite(number)
        ? number
        : 0;

}


/* =========================================================
   FORMAT RIBUAN
   ========================================================= */

function formatThousands(value) {

    const digits =
        String(value)
            .replace(/\D/g, "");


    if (!digits) {
        return "";
    }


    return digits.replace(
        /\B(?=(\d{3})+(?!\d))/g,
        "."
    );

}


/* =========================================================
   FORMAT MONEY
   ========================================================= */

function money(
    value,
    decimals = 2
) {

    if (
        !Number.isFinite(value)
    ) {
        return "0.00";
    }


    return Number(value).toLocaleString(
        "en-US",
        {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        }
    );

}


/* =========================================================
   FORMAT INPUT MONEY
   ========================================================= */

function formatInputMoney(value) {

    if (
        value === null ||
        value === undefined
    ) {
        return "";
    }


    const digits =
        String(value)
            .replace(/\D/g, "");


    if (!digits) {
        return "";
    }


    return formatThousands(
        digits
    );

}


/* =========================================================
   SET TEXT
   ========================================================= */

function setText(
    id,
    value
) {

    const element = $(id);


    if (element) {

        element.textContent =
            value;

    }

}


/* =========================================================
   FORMAT CHART PRICE
   ========================================================= */

function formatChartPrice(
    value
) {

    const product =
        getProduct();


    return Number(value).toLocaleString(
        "en-US",
        {
            minimumFractionDigits:
                product.decimals,

            maximumFractionDigits:
                product.decimals
        }
    );

}


/* =========================================================
   PRODUCT SWITCH
   ========================================================= */

function setProduct(
    product
) {

    if (
        !PRODUCTS[product]
    ) {
        return;
    }


    state.product =
        product;


    const productData =
        PRODUCTS[product];


    /*
     * Instrument
     */

    setText(
        "instrument-name",
        productData.name
    );


    setText(
        "chart-symbol",
        productData.name
    );


    /*
     * Tombol produk
     */

    document
        .querySelectorAll(
            ".product-button"
        )
        .forEach(button => {

            const active =
                button.dataset.product ===
                product;


            button.classList.toggle(
                "border-amber-400",
                active
            );


            button.classList.toggle(
                "bg-amber-500/15",
                active
            );


            button.classList.toggle(
                "border-white/10",
                !active
            );


            button.classList.toggle(
                "bg-slate-800",
                !active
            );

        });


    /*
     * Reset market
     */

    state.lastTrade = null;

    state.sell = null;

    state.buy = null;

    state.spread = null;

    state.previousPrice = null;

    state.priceHistory = [];

    state.candles = [];


    drawCandles();


    fetchMarket();

}


/* =========================================================
   POSITION BUY / SELL
   ========================================================= */

function setPosition(
    position
) {

    state.position =
        position;


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


    /*
     * BUY
     */

    if (
        position === "BUY"
    ) {

        buyButton.className =
            "rounded-2xl border border-emerald-400 bg-emerald-500/20 px-4 py-4 text-sm font-bold text-emerald-400";

        sellButton.className =
            "rounded-2xl border border-white/10 bg-slate-800 px-4 py-4 text-sm font-bold text-slate-400";

    }


    /*
     * SELL
     */

    else {

        buyButton.className =
            "rounded-2xl border border-white/10 bg-slate-800 px-4 py-4 text-sm font-bold text-slate-400";

        sellButton.className =
            "rounded-2xl border border-red-400 bg-red-500/20 px-4 py-4 text-sm font-bold text-red-400";

    }


    calculateRisk();

}


/* =========================================================
   MARKET PRICE
   ========================================================= */

async function fetchMarket() {

    const product =
        getProduct();


    try {

        const response =
            await fetch(
                `${API_URL}?symbol=${encodeURIComponent(product.symbol)}&_=${Date.now()}`,
                {
                    cache: "no-store"
                }
            );


        const data =
            await response.json();


        if (
            !data.success
        ) {

            console.warn(
                "Market error:",
                data
            );


            setText(
                "market-update",
                data.message ||
                "Harga market belum tersedia."
            );


            return;

        }


        const newPrice =
            Number(
                data.price ??
                data.last_trade ??
                data.data?.price
            );


        if (
            !Number.isFinite(
                newPrice
            )
        ) {

            return;

        }


        updateMarket(
            newPrice
        );

    }


    catch (error) {

        console.error(
            "Market error:",
            error
        );


        setText(
            "market-update",
            "Gagal menghubungi market."
        );

    }

}


/* =========================================================
   UPDATE MARKET
   ========================================================= */

function updateMarket(
    price
) {

    state.previousPrice =
        state.lastTrade;


    state.lastTrade =
        price;


    const product =
        getProduct();


    /*
     * SPREAD OTOMATIS
     */

    state.spread =
        Number(
            product.spread
        );


    /*
     * BID / SELL
     *
     * Market - half spread
     */

    state.sell =
        price -
        (
            state.spread / 2
        );


    /*
     * ASK / BUY
     *
     * Market + half spread
     */

    state.buy =
        price +
        (
            state.spread / 2
        );


    /*
     * UI
     */

    updateMarketUI();


    /*
     * History
     */

    state.priceHistory.push(
        price
    );


    if (
        state.priceHistory.length >
        300
    ) {

        state.priceHistory.shift();

    }


    /*
     * Candle
     */

    updateCandles(
        price
    );


    /*
     * Risk
     */

    calculateRisk();

}


/* =========================================================
   MARKET UI
   ========================================================= */

function updateMarketUI() {

    const product =
        getProduct();


    /*
     * Current price
     */

    const priceElement =
        $("market-price");


    if (priceElement) {

        priceElement.textContent =
            money(
                state.lastTrade,
                product.decimals
            );


        priceElement.classList.remove(
            "price-flash"
        );


        void priceElement.offsetWidth;


        priceElement.classList.add(
            "price-flash"
        );

    }


    /*
     * Price change
     */

    const arrow =
        $("price-arrow");

    const changeElement =
        $("price-change");


    if (
        state.previousPrice !== null &&
        state.lastTrade !== null
    ) {

        const change =
            state.lastTrade -
            state.previousPrice;


        const sign =
            change > 0
                ? "+"
                : "";


        if (changeElement) {

            changeElement.textContent =
                `${sign}${change.toFixed(
                    product.decimals
                )}`;

        }


        if (arrow) {

            arrow.classList.remove(
                "up",
                "down"
            );


            if (
                change > 0
            ) {

                arrow.textContent =
                    "↑";

                arrow.classList.add(
                    "up"
                );

            }

            else if (
                change < 0
            ) {

                arrow.textContent =
                    "↓";

                arrow.classList.add(
                    "down"
                );

            }

            else {

                arrow.textContent =
                    "→";

            }

        }


        if (changeElement) {

            changeElement.classList.remove(
                "up",
                "down"
            );


            if (
                change > 0
            ) {

                changeElement.classList.add(
                    "up"
                );

            }

            else if (
                change < 0
            ) {

                changeElement.classList.add(
                    "down"
                );

            }

        }

    }


    /*
     * Market info
     */

    setText(
        "market-update",

        `SELL ${money(
            state.sell,
            product.decimals
        )}  •  LAST TRADE ${money(
            state.lastTrade,
            product.decimals
        )}  •  BUY ${money(
            state.buy,
            product.decimals
        )}  •  SPREAD ${money(
            state.spread,
            product.decimals
        )}`
    );

}


/* =========================================================
   CANDLE
   ========================================================= */

function updateCandles(
    price
) {

    if (
        !Number.isFinite(price)
    ) {
        return;
    }


    const now =
        Date.now();


    const bucket =
        Math.floor(
            now /
            state.candleInterval
        ) *
        state.candleInterval;


    let candle =
        state.candles[
            state.candles.length - 1
        ];


    /*
     * Candle baru
     */

    if (
        !candle ||
        candle.time !== bucket
    ) {

        const open =
            candle
                ? candle.close
                : price;


        candle = {

            time: bucket,

            open: open,

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


        state.candles.push(
            candle
        );


        if (
            state.candles.length >
            state.maxCandles
        ) {

            state.candles.shift();

        }

    }


    /*
     * Update candle berjalan
     */

    else {

        candle.close =
            price;


        candle.high =
            Math.max(
                candle.high,
                price
            );


        candle.low =
            Math.min(
                candle.low,
                price
            );

    }


    drawCandles();

}


/* =========================================================
   GET CANVAS
   ========================================================= */

function getChartCanvas() {

    const container =
        $("market-chart");


    if (!container) {
        return null;
    }


    let canvas =
        container.querySelector(
            "canvas"
        );


    if (!canvas) {

        container.innerHTML =
            "";


        canvas =
            document.createElement(
                "canvas"
            );


        canvas.setAttribute(
            "aria-label",
            "Candlestick market chart"
        );


        container.appendChild(
            canvas
        );

    }


    canvas.style.width =
        "100%";

    canvas.style.height =
        "100%";

    canvas.style.display =
        "block";


    return canvas;

}


/* =========================================================
   DRAW CANDLES
   ========================================================= */

function drawCandles() {

    const canvas =
        getChartCanvas();


    if (
        !canvas ||
        state.candles.length === 0
    ) {
        return;
    }


    const container =
        $("market-chart");


    const width =
        Math.max(
            container.clientWidth || 320,
            280
        );


    const height =
        Math.max(
            container.clientHeight || 176,
            170
        );


    const dpr =
        window.devicePixelRatio ||
        1;


    canvas.width =
        Math.floor(
            width * dpr
        );


    canvas.height =
        Math.floor(
            height * dpr
        );


    const ctx =
        canvas.getContext(
            "2d"
        );


    ctx.setTransform(
        dpr,
        0,
        0,
        dpr,
        0,
        0
    );


    ctx.clearRect(
        0,
        0,
        width,
        height
    );


    const candles =
        state.candles.slice(
            -state.maxCandles
        );


    /*
     * PRICE RANGE
     */

    let minPrice =
        Infinity;

    let maxPrice =
        -Infinity;


    candles.forEach(
        candle => {

            minPrice =
                Math.min(
                    minPrice,
                    candle.low
                );


            maxPrice =
                Math.max(
                    maxPrice,
                    candle.high
                );

        }
    );


    let range =
        maxPrice -
        minPrice;


    if (
        !Number.isFinite(range) ||
        range <= 0
    ) {

        range =
            Math.max(
                Math.abs(
                    maxPrice
                ) * 0.001,
                1
            );

    }


    minPrice -=
        range * 0.12;

    maxPrice +=
        range * 0.12;


    range =
        maxPrice -
        minPrice;


    /*
     * CHART AREA
     */

    const left =
        8;

    const right =
        55;

    const top =
        8;

    const bottom =
        10;


    const chartWidth =
        width -
        left -
        right;


    const chartHeight =
        height -
        top -
        bottom;


    /*
     * PRICE TO Y
     */

    function priceToY(
        price
    ) {

        return (
            top +
            (
                (maxPrice - price) /
                range
            ) *
            chartHeight
        );

    }


    /*
     * GRID
     */

    ctx.lineWidth =
        1;


    for (
        let i = 0;
        i <= 4;
        i++
    ) {

        const y =
            top +
            (
                chartHeight /
                4
            ) *
            i;


        ctx.beginPath();


        ctx.moveTo(
            left,
            y
        );


        ctx.lineTo(
            width - right,
            y
        );


        ctx.strokeStyle =
            "rgba(148,163,184,0.09)";


        ctx.stroke();

    }


    /*
     * PRICE LABEL
     */

    ctx.font =
        "9px Poppins, Arial, sans-serif";


    ctx.textAlign =
        "left";


    ctx.textBaseline =
        "middle";


    for (
        let i = 0;
        i <= 4;
        i++
    ) {

        const ratio =
            i / 4;


        const price =
            maxPrice -
            range * ratio;


        const y =
            top +
            chartHeight *
            ratio;


        ctx.fillStyle =
            "rgba(148,163,184,0.65)";


        ctx.fillText(
            formatChartPrice(
                price
            ),
            width - right + 7,
            y
        );

    }


    /*
     * CANDLE SIZE
     */

    const count =
        candles.length;


    const slot =
        chartWidth /
        count;


    /*
     * Banyak candle kecil
     */

    const bodyWidth =
        Math.max(
            2,
            Math.min(
                6,
                slot * 0.45
            )
        );


    /*
     * DRAW CANDLES
     */

    candles.forEach(
        (
            candle,
            index
        ) => {

            const x =
                left +
                slot * index +
                slot / 2;


            const openY =
                priceToY(
                    candle.open
                );


            const closeY =
                priceToY(
                    candle.close
                );


            const highY =
                priceToY(
                    candle.high
                );


            const lowY =
                priceToY(
                    candle.low
                );


            const bullish =
                candle.close >=
                candle.open;


            const bodyColor =
                bullish
                    ? "#34d399"
                    : "#f87171";


            const wickColor =
                bullish
                    ? "#6ee7b7"
                    : "#fb7185";


            /*
             * WICK
             */

            ctx.beginPath();


            ctx.moveTo(
                x,
                highY
            );


            ctx.lineTo(
                x,
                lowY
            );


            ctx.strokeStyle =
                wickColor;


            ctx.lineWidth =
                1;


            ctx.stroke();


            /*
             * BODY
             */

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


            if (
                bodyHeight < 2
            ) {

                bodyHeight =
                    2;


                bodyTop =
                    (
                        openY +
                        closeY
                    ) / 2 -
                    1;

            }


            ctx.fillStyle =
                bodyColor;


            ctx.fillRect(
                x -
                bodyWidth / 2,

                bodyTop,

                bodyWidth,

                bodyHeight
            );

        }
    );


    /*
     * CURRENT PRICE LINE
     */

    if (
        Number.isFinite(
            state.lastTrade
        )
    ) {

        const currentY =
            priceToY(
                state.lastTrade
            );


        ctx.beginPath();


        ctx.moveTo(
            left,
            currentY
        );


        ctx.lineTo(
            width - right,
            currentY
        );


        ctx.strokeStyle =
            "rgba(255,255,255,0.20)";


        ctx.lineWidth =
            1;


        ctx.setLineDash(
            [3, 3]
        );


        ctx.stroke();


        ctx.setLineDash(
            []
        );

    }

}


/* =========================================================
   CALCULATE RISK
   ========================================================= */

function calculateRisk() {

    /*
     * EQUITY
     */

    const equity =
        parseNumber(
            $("equity")?.value
        );


    /*
     * LOT
     */

    const lot =
        Math.floor(
            parseNumber(
                $("lot")?.value
            )
        );


    /*
     * MR DAILY
     */

    const mr =
        parseNumber(
            $("margin-required")?.value
        );


    /*
     * OPEN PRICE
     */

    const open =
        parseNumber(
            $("open-price")?.value
        );


    /*
     * Reset kalau data belum lengkap
     */

    if (
        equity <= 0 ||
        lot <= 0 ||
        mr <= 0 ||
        open <= 0
    ) {

        resetRiskOutput();

        return;

    }


    /*
     * Market belum tersedia
     */

    if (
        !Number.isFinite(
            state.sell
        ) ||
        !Number.isFinite(
            state.buy
        )
    ) {

        return;

    }


    const product =
        getProduct();


    /*
     * CONTRACT SIZE PER LOT
     *
     * GOLD       = $100
     * HANG SENG  = $5
     * NIKKEI     = $5
     */

    const contractSizePerLot =
        product.contractSize;


    /*
     * TOTAL CONTRACT SIZE
     *
     * Gold 2 lot = $200
     * Gold 5 lot = $500
     * HKK 2 lot = $10
     * Nikkei 2 lot = $10
     */

    const totalContractSize =
        contractSizePerLot *
        lot;


    /*
     * =====================================================
     * CLOSE PRICE
     *
     * BUY:
     * posisi ditutup menggunakan BID / SELL
     *
     * SELL:
     * posisi ditutup menggunakan ASK / BUY
     * =====================================================
     */

    const closePrice =
        state.position === "BUY"
            ? state.sell
            : state.buy;


    /*
     * =====================================================
     * FLOATING P/L
     * =====================================================
     */

    let floatingPL;


    if (
        state.position === "BUY"
    ) {

        floatingPL =
            (
                closePrice -
                open
            ) *
            totalContractSize;

    }

    else {

        floatingPL =
            (
                open -
                closePrice
            ) *
            totalContractSize;

    }


    /*
     * =====================================================
     * RUNNING EQUITY
     * =====================================================
     */

    const runningEquity =
        equity +
        floatingPL;


    /*
     * =====================================================
     * EFFECTIVE MARGIN
     * =====================================================
     */

    const effectiveMargin =
        mr;


    /*
     * =====================================================
     * EQUITY RATIO
     * =====================================================
     */

    const equityRatio =
        effectiveMargin > 0
            ? (
                runningEquity /
                effectiveMargin
            ) * 100
            : 0;


    /*
     * =====================================================
     * OUTPUT
     * =====================================================
     */

    setText(
        "floating-pl",
        money(
            floatingPL
        )
    );


    setText(
        "running-equity",
        money(
            runningEquity
        )
    );


    setText(
        "effective-margin",
        money(
            effectiveMargin
        )
    );


    setText(
        "equity-ratio",
        `${money(
            equityRatio
        )}%`
    );


    /*
     * =====================================================
     * CALL MARGIN
     *
     * Kerugian = 85% dari equity awal.
     *
     * Artinya equity tersisa 15%.
     * =====================================================
     */

    const callLoss =
        equity *
        0.85;


    /*
     * =====================================================
     * AUTO LIQUIDATION
     *
     * Kerugian = 100% equity awal.
     * =====================================================
     */

    const liquidationLoss =
        equity;


    /*
     * =====================================================
     * PERGERAKAN HARGA
     * =====================================================
     */

    const movementCall =
        callLoss /
        totalContractSize;


    const movementLiquidation =
        liquidationLoss /
        totalContractSize;


    let callPrice;

    let liquidationPrice;


    /*
     * =====================================================
     * THRESHOLD MARKET PRICE
     *
     * Spread ikut dihitung.
     * =====================================================
     */

    const halfSpread =
        product.spread /
        2;


    if (
        state.position === "BUY"
    ) {

        /*
         * BUY rugi ketika BID turun.
         *
         * BID = Market - Half Spread
         *
         * Jadi Market Call:
         *
         * Open - Movement + Half Spread
         */

        callPrice =
            open -
            movementCall +
            halfSpread;


        liquidationPrice =
            open -
            movementLiquidation +
            halfSpread;

    }

    else {

        /*
         * SELL rugi ketika ASK naik.
         *
         * ASK = Market + Half Spread
         *
         * Jadi Market Call:
         *
         * Open + Movement - Half Spread
         */

        callPrice =
            open +
            movementCall -
            halfSpread;


        liquidationPrice =
            open +
            movementLiquidation -
            halfSpread;

    }


    /*
     * =====================================================
     * CALL / LIQUIDATION OUTPUT
     * =====================================================
     */

    setText(
        "call-price",
        money(
            callPrice,
            product.decimals
        )
    );


    setText(
        "liquidation-price",
        money(
            liquidationPrice,
            product.decimals
        )
    );


    /*
     * =====================================================
     * STATUS
     * =====================================================
     */

    const callHit =
        runningEquity <=
        equity * 0.15;


    const liquidationHit =
        runningEquity <=
        0;


    setText(
        "call-status",
        callHit
            ? "TERCAPAI"
            : "NORMAL"
    );


    setText(
        "liquidation-status",
        liquidationHit
            ? "TERCAPAI"
            : "NORMAL"
    );


    /*
     * =====================================================
     * TAMBAHAN DANA
     *
     * Target Equity = MR Daily × 350%
     * =====================================================
     */

    const targetEquity =
        mr *
        3.5;


    const additionalFund =
        Math.max(
            0,
            targetEquity -
            runningEquity
        );


    setText(
        "additional-fund",
        `$ ${formatMoneyIndonesia(
            additionalFund
        )}`
    );


    setText(
        "additional-fund-message",

        additionalFund > 0

            ? "Dana tambahan agar Equity mencapai 350% dari MR Daily."

            : "Dana tambahan tidak diperlukan."
    );


    /*
     * =====================================================
     * FUND RESILIENCE
     * =====================================================
     */

    let status =
        "SEHAT / NORMAL";


    let icon =
        "✓";


    if (
        equityRatio <= 150
    ) {

        status =
            "SANGAT BURUK";

        icon =
            "×";

    }

    else if (
        equityRatio < 350
    ) {

        status =
            "BURUK";

        icon =
            "!";

    }


    setText(
        "risk-status",
        status
    );


    setText(
        "risk-icon",
        icon
    );


    /*
     * =====================================================
     * STATUS COLOR
     * =====================================================
     */

    const riskIcon =
        $("risk-icon");


    if (riskIcon) {

        riskIcon.className =
            `flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-xl ${
                equityRatio >= 350

                    ? "bg-emerald-500/10 text-emerald-400"

                    : equityRatio > 150

                        ? "bg-amber-500/10 text-amber-400"

                        : "bg-red-500/10 text-red-400"
            }`;

    }

}


/* =========================================================
   RESET RISK
   ========================================================= */

function resetRiskOutput() {

    setText(
        "floating-pl",
        "0.00"
    );


    setText(
        "running-equity",
        "0.00"
    );


    setText(
        "effective-margin",
        "0.00"
    );


    setText(
        "equity-ratio",
        "0.00%"
    );


    setText(
        "call-price",
        "0.00"
    );


    setText(
        "liquidation-price",
        "0.00"
    );


    setText(
        "call-status",
        "NORMAL"
    );


    setText(
        "liquidation-status",
        "NORMAL"
    );


    setText(
        "additional-fund",
        "0.00"
    );


    setText(
        "additional-fund-message",
        "Masukkan data nasabah"
    );


    setText(
        "risk-status",
        "SEHAT / NORMAL"
    );


    setText(
        "risk-icon",
        "✓"
    );

}


/* =========================================================
   FORMAT MONEY INDONESIA
   ========================================================= */

function formatMoneyIndonesia(
    value
) {

    if (
        !Number.isFinite(value)
    ) {
        return "0";
    }


    return Number(value).toLocaleString(
        "id-ID",
        {
            minimumFractionDigits: 0,
            maximumFractionDigits: 2
        }
    );

}


/* =========================================================
   EQUITY INPUT FORMAT
   ========================================================= */

const equityInput =
    $("equity");


if (equityInput) {

    equityInput.addEventListener(
        "input",
        function () {

            const digits =
                this.value.replace(
                    /\D/g,
                    ""
                );


            this.value =
                formatThousands(
                    digits
                );


            calculateRisk();

        }
    );

}


/* =========================================================
   LOT INPUT
   ========================================================= */

const lotInput =
    $("lot");


if (lotInput) {

    lotInput.addEventListener(
        "input",
        function () {

            this.value =
                this.value.replace(
                    /\D/g,
                    ""
                );


            calculateRisk();

        }
    );

}


/* =========================================================
   MR DAILY INPUT
   ========================================================= */

const mrInput =
    $("margin-required");


if (mrInput) {

    mrInput.addEventListener(
        "input",
        function () {

            this.value =
                this.value.replace(
                    /[^0-9.]/g,
                    ""
                );


            calculateRisk();

        }
    );

}


/* =========================================================
   OPEN PRICE INPUT
   ========================================================= */

const openPriceInput =
    $("open-price");


if (openPriceInput) {

    openPriceInput.addEventListener(
        "input",
        function () {

            this.value =
                this.value.replace(
                    /[^0-9.]/g,
                    ""
                );


            calculateRisk();

        }
    );

}


/* =========================================================
   PRODUCT BUTTON
   ========================================================= */

document
    .querySelectorAll(
        ".product-button"
    )
    .forEach(
        button => {

            button.addEventListener(
                "click",
                () => {

                    setProduct(
                        button.dataset.product
                    );

                }
            );

        }
    );


/* =========================================================
   BUY BUTTON
   ========================================================= */

const buyButton =
    $("buy-button");


if (buyButton) {

    buyButton.addEventListener(
        "click",
        () => {

            setPosition(
                "BUY"
            );

        }
    );

}


/* =========================================================
   SELL BUTTON
   ========================================================= */

const sellButton =
    $("sell-button");


if (sellButton) {

    sellButton.addEventListener(
        "click",
        () => {

            setPosition(
                "SELL"
            );

        }
    );

}


/* =========================================================
   RESIZE
   ========================================================= */

let resizeTimer =
    null;


window.addEventListener(
    "resize",
    () => {

        clearTimeout(
            resizeTimer
        );


        resizeTimer =
            setTimeout(
                () => {

                    drawCandles();

                },
                100
            );

    }
);


/* =========================================================
   START
   ========================================================= */

setPosition(
    "BUY"
);


setProduct(
    "gold"
);


/*
 * Polling pertama
 */

fetchMarket();


/* =========================================================
   MARKET POLLING
   =========================================================

   120 detik = 720 request/hari
   jika halaman terus aktif.

   Twelve Data Free:
   sekitar 800 credit/day.

   ========================================================= */

state.timer =
    setInterval(
        fetchMarket,
        120000
    );