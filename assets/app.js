const API_URL = "/api/market";

const PRODUCTS = {
    gold: {
        name: "XAU/USD",
        label: "GOLD",
        contractSize: 100,
        decimals: 2,
        spread: 0.80
    },

    hangseng: {
        name: "HSI",
        label: "HANG SENG",
        contractSize: 5,
        decimals: 0,
        spread: 16
    },

    nikkei: {
        name: "N225",
        label: "NIKKEI",
        contractSize: 5,
        decimals: 0,
        spread: 20
    }
};

const state = {
    product: "gold",
    position: "BUY",

    lastTrade: null,
    sell: null,
    buy: null,
    spread: null,

    previousPrice: null,

    candles: [],

    // 1 candle = 1 menit
    candleIntervalMs: 60000,

    timer: null,
    requestInProgress: false
};

const $ = id =>
    document.getElementById(id);

function money(value, decimals = 2) {

    if (!Number.isFinite(value)) {
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

function num(id) {

    const el = $(id);

    if (!el) {
        return 0;
    }

    const value =
        Number.parseFloat(el.value);

    return Number.isFinite(value)
        ? value
        : 0;
}

function setText(id, value) {

    const el = $(id);

    if (el) {
        el.textContent = value;
    }
}

function product() {
    return PRODUCTS[state.product];
}


/* =========================================================
   PRODUCT
   ========================================================= */

function setProduct(name) {

    if (!PRODUCTS[name]) {
        return;
    }

    state.product = name;

    state.lastTrade = null;
    state.previousPrice = null;
    state.sell = null;
    state.buy = null;

    state.spread =
        PRODUCTS[name].spread;

    state.candles = [];

    const p = product();

    setText(
        "instrument-name",
        p.name
    );

    setText(
        "chart-symbol",
        p.name
    );

    document
        .querySelectorAll(".product-button")
        .forEach(button => {

            const active =
                button.dataset.product === name;

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

    setText(
        "market-update",
        `SPREAD ${money(
            p.spread,
            p.decimals
        )}`
    );

    drawCandles();

    fetchMarket(true);
}


/* =========================================================
   POSITION
   ========================================================= */

function setPosition(position) {

    state.position = position;

    const buy =
        $("buy-button");

    const sell =
        $("sell-button");

    if (!buy || !sell) {
        return;
    }

    buy.className =
        position === "BUY"

            ? "rounded-2xl border border-emerald-400 bg-emerald-500/20 px-4 py-4 text-sm font-bold text-emerald-400"

            : "rounded-2xl border border-white/10 bg-slate-800 px-4 py-4 text-sm font-bold text-slate-400";

    sell.className =
        position === "SELL"

            ? "rounded-2xl border border-red-400 bg-red-500/20 px-4 py-4 text-sm font-bold text-red-400"

            : "rounded-2xl border border-white/10 bg-slate-800 px-4 py-4 text-sm font-bold text-slate-400";

    calculateRisk();
}


/* =========================================================
   FETCH MARKET
   ========================================================= */

async function fetchMarket(
    loadHistory = false
) {

    if (state.requestInProgress) {
        return;
    }

    state.requestInProgress = true;

    try {

        const p = product();

        const url =
            `${API_URL}` +
            `?symbol=${encodeURIComponent(p.name)}` +
            `${loadHistory ? "&history=1" : ""}` +
            `&_=${Date.now()}`;

        const response =
            await fetch(
                url,
                {
                    cache: "no-store"
                }
            );

        const data =
            await response.json();

        if (
            !response.ok ||
            !data.success
        ) {
            throw new Error(
                data.message ||
                `HTTP ${response.status}`
            );
        }

        const price =
            Number(data.price);

        if (!Number.isFinite(price)) {
            throw new Error(
                "Harga market tidak valid"
            );
        }


        /* =========================================
           LOAD REAL HISTORICAL CANDLES
           ========================================= */

        if (
            loadHistory &&
            Array.isArray(data.candles) &&
            data.candles.length
        ) {

            state.candles =
                data.candles
                    .map(c => ({
                        time: c.time,
                        open: Number(c.open),
                        high: Number(c.high),
                        low: Number(c.low),
                        close: Number(c.close)
                    }))
                    .filter(c =>
                        Number.isFinite(c.open) &&
                        Number.isFinite(c.high) &&
                        Number.isFinite(c.low) &&
                        Number.isFinite(c.close)
                    )
                    .slice(-42);
        }


        updateMarket(price);

    }

    catch (error) {

        console.error(
            "Market Error:",
            error
        );

        // Tetap tampilkan spread,
        // jangan menimpa UI dengan SELL/BUY.

        setText(
            "market-update",
            `SPREAD ${money(
                product().spread,
                product().decimals
            )}`
        );

    }

    finally {

        state.requestInProgress =
            false;
    }
}


/* =========================================================
   UPDATE MARKET
   ========================================================= */

function updateMarket(price) {

    const p =
        product();

    state.previousPrice =
        state.lastTrade;

    state.lastTrade =
        price;

    state.spread =
        p.spread;

    state.sell =
        price -
        p.spread / 2;

    state.buy =
        price +
        p.spread / 2;


    const difference =
        state.previousPrice === null
            ? 0
            : price -
              state.previousPrice;


    /* =========================================
       PRICE
       ========================================= */

    setText(
        "market-price",
        money(
            price,
            p.decimals
        )
    );


    /* =========================================
       CHANGE
       ========================================= */

    setText(
        "price-change",

        `${difference >= 0 ? "+" : ""}${
            money(
                difference,
                p.decimals
            )
        }`
    );


    setText(
        "price-arrow",

        difference > 0
            ? "↑"
            : difference < 0
                ? "↓"
                : "→"
    );


    const arrow =
        $("price-arrow");

    if (arrow) {

        arrow.className =
            `text-sm font-bold ${
                difference > 0
                    ? "text-emerald-400"
                    : difference < 0
                        ? "text-red-400"
                        : "text-slate-400"
            }`;
    }


    /* =========================================
       ONLY SPREAD
       ========================================= */

    setText(
        "market-update",
        `SPREAD ${money(
            state.spread,
            p.decimals
        )}`
    );


    /* =========================================
       CANDLE
       ========================================= */

    updateCurrentCandle(price);

    drawCandles();


    /* =========================================
       RISK
       ========================================= */

    calculateRisk();
}


/* =========================================================
   CURRENT CANDLE
   ========================================================= */

function updateCurrentCandle(price) {

    if (!Number.isFinite(price)) {
        return;
    }

    const now =
        Date.now();

    const bucket =
        Math.floor(
            now /
            state.candleIntervalMs
        ) *
        state.candleIntervalMs;


    let candle =
        state.candles[
            state.candles.length - 1
        ];


    /* =========================================
       NORMALIZE HISTORICAL TIME
       ========================================= */

    if (
        candle &&
        typeof candle.time === "string"
    ) {

        const parsed =
            Date.parse(
                candle.time.replace(
                    " ",
                    "T"
                )
            );

        if (
            Number.isFinite(parsed)
        ) {
            candle.time = parsed;
        }
    }


    /* =========================================
       NEW CANDLE
       ========================================= */

    if (
        !candle ||
        candle.time !== bucket
    ) {

        const open =
            candle &&
            Number.isFinite(candle.close)

                ? candle.close

                : price;


        candle = {

            time: bucket,

            open,

            high:
                Math.max(
                    open,
                    price
                ),

            low:
                Math.min(
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
            42
        ) {

            state.candles.shift();
        }

        return;
    }


    /* =========================================
       UPDATE CURRENT CANDLE
       ========================================= */

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

    candle.close =
        price;
}


/* =========================================================
   DRAW CANDLE
   ========================================================= */

function drawCandles() {

    const container =
        $("market-chart");

    if (!container) {
        return;
    }

    container.innerHTML = "";


    if (
        !state.candles.length
    ) {
        return;
    }


    const width =
        Math.max(
            container.clientWidth || 320,
            280
        );

    const height =
        Math.max(
            container.clientHeight || 190,
            170
        );

    const dpr =
        window.devicePixelRatio || 1;


    const canvas =
        document.createElement(
            "canvas"
        );

    canvas.style.width =
        "100%";

    canvas.style.height =
        "100%";

    canvas.style.display =
        "block";

    canvas.width =
        Math.floor(
            width * dpr
        );

    canvas.height =
        Math.floor(
            height * dpr
        );

    container.appendChild(
        canvas
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


    const candles =
        state.candles.slice(-42);


    let min =
        Infinity;

    let max =
        -Infinity;


    candles.forEach(c => {

        min =
            Math.min(
                min,
                c.low
            );

        max =
            Math.max(
                max,
                c.high
            );

    });


    let range =
        max - min;


    if (
        !Number.isFinite(range) ||
        range <= 0
    ) {

        range =
            Math.max(
                Math.abs(max) *
                0.001,
                1
            );
    }


    const padding =
        range * 0.12;

    min -= padding;
    max += padding;

    range =
        max - min;


    const left = 8;
    const right = 52;
    const top = 8;
    const bottom = 10;


    const chartWidth =
        width -
        left -
        right;

    const chartHeight =
        height -
        top -
        bottom;


    const priceToY =
        price =>

            top +
            (
                (max - price) /
                range
            ) *
            chartHeight;


    /* =========================================
       GRID
       ========================================= */

    ctx.strokeStyle =
        "rgba(148,163,184,0.09)";

    ctx.lineWidth = 1;


    for (
        let i = 0;
        i <= 4;
        i++
    ) {

        const y =
            top +
            (
                chartHeight / 4
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

        ctx.stroke();
    }


    /* =========================================
       PRICE LABELS
       ========================================= */

    ctx.font =
        "9px Poppins, Arial";

    ctx.fillStyle =
        "rgba(148,163,184,0.75)";

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

        const value =
            max -
            range * ratio;

        const y =
            top +
            chartHeight *
            ratio;

        ctx.fillText(
            money(
                value,
                product().decimals
            ),
            width - right + 6,
            y
        );
    }


    /* =========================================
       DENSE CANDLES
       ========================================= */

    const slot =
        chartWidth /
        candles.length;

    const bodyWidth =
        Math.max(
            2,
            Math.min(
                6,
                slot * 0.48
            )
        );


    candles.forEach(
        (candle, index) => {

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


            /* WICK */

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

            ctx.lineWidth = 1;

            ctx.stroke();


            /* BODY */

            let bodyTop =
                Math.min(
                    openY,
                    closeY
                );

            let bodyHeight =
                Math.abs(
                    closeY -
                    openY
                );


            if (
                bodyHeight < 2
            ) {

                bodyHeight = 2;

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


    /* =========================================
       CURRENT PRICE LINE
       ========================================= */

    if (
        Number.isFinite(
            state.lastTrade
        )
    ) {

        const y =
            priceToY(
                state.lastTrade
            );

        ctx.beginPath();

        ctx.moveTo(
            left,
            y
        );

        ctx.lineTo(
            width - right,
            y
        );

        ctx.setLineDash(
            [4, 4]
        );

        ctx.strokeStyle =
            "rgba(255,255,255,0.20)";

        ctx.stroke();

        ctx.setLineDash([]);
    }
}


/* =========================================================
   RISK CALCULATION
   ========================================================= */

function calculateRisk() {

    const equity =
        num("equity");

    const lot =
        Math.floor(
            num("lot")
        );

    const mr =
        num("margin-required");

    const open =
        num("open-price");


    if (
        equity <= 0 ||
        lot <= 0 ||
        mr <= 0 ||
        open <= 0 ||
        !Number.isFinite(
            state.sell
        ) ||
        !Number.isFinite(
            state.buy
        )
    ) {
        return;
    }


    const p =
        product();


    const closePrice =
        state.position === "BUY"
            ? state.sell
            : state.buy;


    const floatingPL =
        state.position === "BUY"

            ? (
                closePrice -
                open
            ) *
            lot *
            p.contractSize

            : (
                open -
                closePrice
            ) *
            lot *
            p.contractSize;


    const runningEquity =
        equity +
        floatingPL;


    const equityRatio =
        (
            runningEquity /
            mr
        ) *
        100;


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
            mr
        )
    );

    setText(
        "equity-ratio",
        `${money(
            equityRatio
        )}%`
    );


    /* CALL MARGIN */

    const callMovement =
        (
            equity * 0.85
        ) /
        (
            lot *
            p.contractSize
        );


    /* AUTO LIQUIDATION */

    const liquidationMovement =
        equity /
        (
            lot *
            p.contractSize
        );


    const callPrice =
        state.position === "BUY"

            ? open -
              callMovement

            : open +
              callMovement;


    const liquidationPrice =
        state.position === "BUY"

            ? open -
              liquidationMovement

            : open +
              liquidationMovement;


    setText(
        "call-price",
        money(
            callPrice,
            p.decimals
        )
    );

    setText(
        "liquidation-price",
        money(
            liquidationPrice,
            p.decimals
        )
    );


    setText(
        "call-status",
        runningEquity <=
            equity * 0.15

            ? "TERCAPAI"

            : "NORMAL"
    );


    setText(
        "liquidation-status",
        runningEquity <= 0

            ? "TERCAPAI"

            : "NORMAL"
    );


    /* TAMBAHAN DANA */

    const targetEquity =
        mr * 3.5;

    const additionalFund =
        Math.max(
            0,
            targetEquity -
            runningEquity
        );


    setText(
        "additional-fund",
        money(
            additionalFund
        )
    );


    setText(
        "additional-fund-message",

        additionalFund > 0

            ? "Dana tambahan agar Equity mencapai 350% dari MR Daily."

            : "Dana tambahan tidak diperlukan."
    );


    /* FUND RESILIENCE */

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
   EVENTS
   ========================================================= */

document
    .querySelectorAll(
        ".product-button"
    )
    .forEach(button => {

        button.addEventListener(
            "click",
            () => {

                setProduct(
                    button.dataset.product
                );
            }
        );
    });


$("buy-button")
    ?.addEventListener(
        "click",
        () =>
            setPosition("BUY")
    );


$("sell-button")
    ?.addEventListener(
        "click",
        () =>
            setPosition("SELL")
    );


[
    "equity",
    "lot",
    "margin-required",
    "open-price"
]
.forEach(id => {

    $(id)?.addEventListener(
        "input",
        calculateRisk
    );
});


window.addEventListener(
    "resize",
    () => {

        clearTimeout(
            window.__chartTimer
        );

        window.__chartTimer =
            setTimeout(
                drawCandles,
                100
            );
    }
);


/* =========================================================
   START
   ========================================================= */

setPosition("BUY");

setProduct("gold");


/*
 * Ambil:
 * - harga terbaru
 * - 42 candle historis
 */

fetchMarket(true);


/*
 * Free Twelve Data:
 * 800 request/hari.
 *
 * 120 detik = sekitar
 * 720 request/hari.
 */

state.timer =
    setInterval(
        () => {
            fetchMarket(false);
        },
        120000
    );