const API_URL = "/api/market";


/* =========================================================
   PRODUCTS
   ========================================================= */

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


/* =========================================================
   STATE
   ========================================================= */

const state = {

    product: "gold",

    position: "BUY",

    lastTrade: null,

    previousPrice: null,

    sell: null,

    buy: null,

    spread: 0.80,

    candles: [],

    candleIntervalMs: 5 * 60 * 1000,

    timer: null,

    requestInProgress: false

};


/* =========================================================
   DOM HELPER
   ========================================================= */

const $ = id => {
    return document.getElementById(id);
};


function setText(id, value) {

    const element = $(id);

    if (element) {
        element.textContent = value;
    }
}


function numberValue(id) {

    const element = $(id);

    if (!element) {
        return 0;
    }

    const value =
        Number.parseFloat(element.value);

    return Number.isFinite(value)
        ? value
        : 0;
}


function currentProduct() {

    return PRODUCTS[state.product];

}


/* =========================================================
   NUMBER FORMAT
   ========================================================= */

function formatNumber(
    value,
    decimals = 2
) {

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


/* =========================================================
   PRODUCT BUTTON
   ========================================================= */

function setProduct(productName) {

    if (!PRODUCTS[productName]) {
        return;
    }

    state.product = productName;

    const product =
        currentProduct();


    /* Reset market state */

    state.lastTrade = null;

    state.previousPrice = null;

    state.sell = null;

    state.buy = null;

    state.spread =
        product.spread;

    state.candles = [];


    /* Instrument */

    setText(
        "instrument-name",
        product.name
    );

    setText(
        "chart-symbol",
        product.name
    );


    /* Product button */

    document
        .querySelectorAll(".product-button")
        .forEach(button => {

            const active =
                button.dataset.product ===
                productName;


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


    /* Spread */

    setText(
        "market-update",
        `SPREAD ${formatNumber(
            product.spread,
            product.decimals
        )}`
    );


    drawCandles();


    /* Load price + historical candles */

    fetchMarket(true);

}


/* =========================================================
   BUY / SELL
   ========================================================= */

function setPosition(position) {

    state.position = position;


    const buyButton =
        $("buy-button");

    const sellButton =
        $("sell-button");


    if (!buyButton || !sellButton) {
        return;
    }


    if (position === "BUY") {

        buyButton.className =
            "rounded-2xl border border-emerald-400 bg-emerald-500/20 px-4 py-4 text-sm font-bold text-emerald-400";

        sellButton.className =
            "rounded-2xl border border-white/10 bg-slate-800 px-4 py-4 text-sm font-bold text-slate-400";

    } else {

        buyButton.className =
            "rounded-2xl border border-white/10 bg-slate-800 px-4 py-4 text-sm font-bold text-slate-400";

        sellButton.className =
            "rounded-2xl border border-red-400 bg-red-500/20 px-4 py-4 text-sm font-bold text-red-400";

    }


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

        const product =
            currentProduct();


        let url =
            `${API_URL}` +
            `?symbol=${encodeURIComponent(
                product.name
            )}`;


        if (loadHistory) {
            url += "&history=1";
        }


        url += `&_=${Date.now()}`;


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


        /* =================================================
           LOAD HISTORICAL CANDLES
           ================================================= */

        if (
            loadHistory &&
            Array.isArray(data.candles) &&
            data.candles.length > 0
        ) {

            state.candles =
                data.candles
                    .map(candle => {

                        let time =
                            candle.time;


                        /*
                         * Twelve Data:
                         * YYYY-MM-DD HH:mm:ss
                         */

                        if (
                            typeof time === "string"
                        ) {

                            const parsed =
                                Date.parse(
                                    time.replace(
                                        " ",
                                        "T"
                                    )
                                );


                            if (
                                Number.isFinite(
                                    parsed
                                )
                            ) {

                                time = parsed;

                            }

                        }


                        return {

                            time,

                            open:
                                Number(
                                    candle.open
                                ),

                            high:
                                Number(
                                    candle.high
                                ),

                            low:
                                Number(
                                    candle.low
                                ),

                            close:
                                Number(
                                    candle.close
                                )

                        };

                    })
                    .filter(candle =>
                        Number.isFinite(
                            candle.open
                        ) &&
                        Number.isFinite(
                            candle.high
                        ) &&
                        Number.isFinite(
                            candle.low
                        ) &&
                        Number.isFinite(
                            candle.close
                        )
                    )
                    .slice(-48);

        }


        /* Update market */

        updateMarket(price);


    } catch (error) {

        console.error(
            "Market Error:",
            error
        );


        /*
         * Jangan menghilangkan UI.
         * Tetap tampilkan spread.
         */

        const product =
            currentProduct();


        setText(
            "market-update",
            `SPREAD ${formatNumber(
                product.spread,
                product.decimals
            )}`
        );


    } finally {

        state.requestInProgress =
            false;

    }

}


/* =========================================================
   UPDATE MARKET
   ========================================================= */

function updateMarket(price) {

    const product =
        currentProduct();


    /* Previous */

    state.previousPrice =
        state.lastTrade;


    /* Current */

    state.lastTrade =
        price;


    /* Spread */

    state.spread =
        product.spread;


    /* Bid / Ask */

    state.sell =
        price -
        product.spread / 2;


    state.buy =
        price +
        product.spread / 2;


    /* =====================================================
       PRICE CHANGE
       ===================================================== */

    let change = 0;


    if (
        state.previousPrice !== null
    ) {

        change =
            price -
            state.previousPrice;

    }


    /* =====================================================
       MAIN PRICE
       ===================================================== */

    setText(
        "market-price",
        formatNumber(
            price,
            product.decimals
        )
    );


    /* =====================================================
       ARROW
       ===================================================== */

    let arrow = "→";


    if (change > 0) {
        arrow = "↑";
    }

    if (change < 0) {
        arrow = "↓";
    }


    setText(
        "price-arrow",
        arrow
    );


    /* =====================================================
       PRICE CHANGE
       ===================================================== */

    setText(
        "price-change",

        `${change >= 0 ? "+" : ""}${formatNumber(
            change,
            product.decimals
        )}`
    );


    const arrowElement =
        $("price-arrow");


    if (arrowElement) {

        if (change > 0) {

            arrowElement.className =
                "text-sm font-bold text-emerald-400";

        } else if (change < 0) {

            arrowElement.className =
                "text-sm font-bold text-red-400";

        } else {

            arrowElement.className =
                "text-sm font-bold text-slate-400";

        }

    }


    /* =====================================================
       SPREAD ONLY
       
       Tidak menampilkan:
       SELL
       LAST TRADE
       BUY
       ===================================================== */

    setText(
        "market-update",
        `SPREAD ${formatNumber(
            product.spread,
            product.decimals
        )}`
    );


    /* =====================================================
       UPDATE CURRENT CANDLE
       ===================================================== */

    updateCurrentCandle(price);


    /* =====================================================
       DRAW
       ===================================================== */

    drawCandles();


    /* =====================================================
       RISK
       ===================================================== */

    calculateRisk();

}


/* =========================================================
   CURRENT 5 MINUTE CANDLE
   ========================================================= */

function updateCurrentCandle(price) {

    if (!Number.isFinite(price)) {
        return;
    }


    const now =
        Date.now();


    /*
     * Membulatkan waktu ke candle 5 menit.
     */

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


    /* =====================================================
       NORMALIZE LAST CANDLE TIME
       ===================================================== */

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

            candle.time =
                parsed;

        }

    }


    /* =====================================================
       CONVERT NUMBER
       ===================================================== */

    if (candle) {

        candle.open =
            Number(candle.open);

        candle.high =
            Number(candle.high);

        candle.low =
            Number(candle.low);

        candle.close =
            Number(candle.close);

    }


    /* =====================================================
       NEW CANDLE
       ===================================================== */

    if (
        !candle ||
        candle.time !== bucket
    ) {

        const open =
            candle &&
            Number.isFinite(
                candle.close
            )

                ? candle.close

                : price;


        const newCandle = {

            time: bucket,

            open: open,

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
            newCandle
        );


        if (
            state.candles.length > 48
        ) {

            state.candles.shift();

        }


        return;

    }


    /* =====================================================
       UPDATE CURRENT CANDLE
       ===================================================== */

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
   DRAW CANDLE CHART
   ========================================================= */

function drawCandles() {

    const container =
        $("market-chart");


    if (!container) {
        return;
    }


    container.innerHTML = "";


    if (
        state.candles.length === 0
    ) {

        return;

    }


    /* =====================================================
       SIZE
       ===================================================== */

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


    /* =====================================================
       CANVAS
       ===================================================== */

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


    /* =====================================================
       CANDLES
       ===================================================== */

    const candles =
        state.candles.slice(-48);


    /* =====================================================
       FIND RANGE
       ===================================================== */

    let min =
        Infinity;


    let max =
        -Infinity;


    candles.forEach(candle => {

        min =
            Math.min(
                min,
                candle.low
            );


        max =
            Math.max(
                max,
                candle.high
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
                Math.abs(max) * 0.001,
                1
            );

    }


    /* =====================================================
       PADDING
       ===================================================== */

    const padding =
        range * 0.12;


    min -= padding;

    max += padding;


    range =
        max - min;


    /* =====================================================
       CHART AREA
       ===================================================== */

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


    /* =====================================================
       PRICE → Y
       ===================================================== */

    function priceToY(price) {

        return (
            top +
            (
                (max - price) /
                range
            ) *
            chartHeight
        );

    }


    /* =====================================================
       GRID
       ===================================================== */

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


    /* =====================================================
       PRICE LABELS
       ===================================================== */

    ctx.font =
        "9px Poppins, Arial";


    ctx.fillStyle =
        "rgba(148,163,184,0.75)";


    ctx.textAlign =
        "left";


    ctx.textBaseline =
        "middle";


    const product =
        currentProduct();


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
            formatNumber(
                value,
                product.decimals
            ),
            width - right + 6,
            y
        );

    }


    /* =====================================================
       CANDLE WIDTH
       ===================================================== */

    const slot =
        chartWidth /
        candles.length;


    /*
     * Sedikit lebih lebar supaya body candle
     * tetap kelihatan.
     */

    const bodyWidth =
        Math.max(
            3,
            Math.min(
                7,
                slot * 0.58
            )
        );


    /* =====================================================
       DRAW CANDLES
       ===================================================== */

    candles.forEach(
        candle => {

            const index =
                candles.indexOf(
                    candle
                );


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


            /* =================================================
               WICK
               ================================================= */

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


            /* =================================================
               BODY
               ================================================= */

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


            /*
             * Body minimal 3px supaya
             * candle tidak terlihat seperti garis.
             */

            if (
                bodyHeight < 3
            ) {

                bodyHeight = 3;


                bodyTop =
                    (
                        openY +
                        closeY
                    ) /
                    2 -
                    1.5;

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


    /* =====================================================
       CURRENT PRICE LINE
       ===================================================== */

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


        ctx.lineWidth = 1;


        ctx.stroke();


        ctx.setLineDash([]);

    }

}


/* =========================================================
   RISK CALCULATION
   ========================================================= */

function calculateRisk() {

    const equity =
        numberValue("equity");


    const lot =
        Math.floor(
            numberValue("lot")
        );


    const marginRequired =
        numberValue(
            "margin-required"
        );


    const openPrice =
        numberValue(
            "open-price"
        );


    /*
     * Kalau data belum lengkap,
     * jangan menghapus hasil sebelumnya.
     */

    if (
        equity <= 0 ||
        lot <= 0 ||
        marginRequired <= 0 ||
        openPrice <= 0 ||
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
        currentProduct();


    /* =====================================================
       EXIT PRICE
       
       BUY  → keluar di SELL / BID
       SELL → keluar di BUY / ASK
       ===================================================== */

    const exitPrice =
        state.position === "BUY"
            ? state.sell
            : state.buy;


    /* =====================================================
       FLOATING P/L
       ===================================================== */

    let floatingPL;


    if (
        state.position === "BUY"
    ) {

        floatingPL =
            (
                exitPrice -
                openPrice
            ) *
            lot *
            product.contractSize;

    } else {

        floatingPL =
            (
                openPrice -
                exitPrice
            ) *
            lot *
            product.contractSize;

    }


    /* =====================================================
       RUNNING EQUITY
       ===================================================== */

    const runningEquity =
        equity +
        floatingPL;


    /* =====================================================
       EQUITY RATIO
       ===================================================== */

    const equityRatio =
        (
            runningEquity /
            marginRequired
        ) *
        100;


    /* =====================================================
       BASIC OUTPUT
       ===================================================== */

    setText(
        "floating-pl",
        formatNumber(
            floatingPL
        )
    );


    setText(
        "running-equity",
        formatNumber(
            runningEquity
        )
    );


    setText(
        "effective-margin",
        formatNumber(
            marginRequired
        )
    );


    setText(
        "equity-ratio",
        `${formatNumber(
            equityRatio
        )}%`
    );


    /* =====================================================
       CALL MARGIN
       
       Running Equity = 15% dari Equity awal
       ===================================================== */

    const callTargetEquity =
        equity * 0.15;


    const callLoss =
        equity -
        callTargetEquity;


    const callMovement =
        callLoss /
        (
            lot *
            product.contractSize
        );


    let callPrice;


    if (
        state.position === "BUY"
    ) {

        callPrice =
            openPrice -
            callMovement;

    } else {

        callPrice =
            openPrice +
            callMovement;

    }


    /* =====================================================
       AUTO LIQUIDATION
       
       Running Equity = 0
       ===================================================== */

    const liquidationLoss =
        equity;


    const liquidationMovement =
        liquidationLoss /
        (
            lot *
            product.contractSize
        );


    let liquidationPrice;


    if (
        state.position === "BUY"
    ) {

        liquidationPrice =
            openPrice -
            liquidationMovement;

    } else {

        liquidationPrice =
            openPrice +
            liquidationMovement;

    }


    /* =====================================================
       PRICE OUTPUT
       ===================================================== */

    setText(
        "call-price",
        formatNumber(
            callPrice,
            product.decimals
        )
    );


    setText(
        "liquidation-price",
        formatNumber(
            liquidationPrice,
            product.decimals
        )
    );


    /* =====================================================
       CALL STATUS
       ===================================================== */

    setText(
        "call-status",

        runningEquity <=
            callTargetEquity

            ? "TERCAPAI"

            : "NORMAL"
    );


    /* =====================================================
       LIQUIDATION STATUS
       ===================================================== */

    setText(
        "liquidation-status",

        runningEquity <= 0

            ? "TERCAPAI"

            : "NORMAL"
    );


    /* =====================================================
       TAMBAHAN DANA
       
       Target Equity = MR Daily × 350%
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


    setText(
        "additional-fund",
        formatNumber(
            additionalFund
        )
    );


    if (
        additionalFund > 0
    ) {

        setText(
            "additional-fund-message",
            "Dana tambahan agar Equity mencapai 350% dari MR Daily."
        );

    } else {

        setText(
            "additional-fund-message",
            "Dana tambahan tidak diperlukan."
        );

    }


    /* =====================================================
       FUND RESILIENCE
       
       >= 350%  SEHAT
       > 150%   BURUK
       <= 150%  SANGAT BURUK
       ===================================================== */

    let riskStatus =
        "SEHAT / NORMAL";


    let riskIcon =
        "✓";


    if (
        equityRatio <= 150
    ) {

        riskStatus =
            "SANGAT BURUK";

        riskIcon =
            "×";

    } else if (
        equityRatio < 350
    ) {

        riskStatus =
            "BURUK";

        riskIcon =
            "!";

    }


    setText(
        "risk-status",
        riskStatus
    );


    setText(
        "risk-icon",
        riskIcon
    );


    const riskIconElement =
        $("risk-icon");


    if (riskIconElement) {

        if (
            equityRatio >= 350
        ) {

            riskIconElement.className =
                "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/10 text-xl text-emerald-400";

        } else if (
            equityRatio > 150
        ) {

            riskIconElement.className =
                "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-500/10 text-xl text-amber-400";

        } else {

            riskIconElement.className =
                "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-red-500/10 text-xl text-red-400";

        }

    }

}


/* =========================================================
   PRODUCT EVENTS
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


/* =========================================================
   BUY
   ========================================================= */

$("buy-button")?.addEventListener(
    "click",
    () => {

        setPosition("BUY");

    }
);


/* =========================================================
   SELL
   ========================================================= */

$("sell-button")?.addEventListener(
    "click",
    () => {

        setPosition("SELL");

    }
);


/* =========================================================
   INPUT EVENTS
   ========================================================= */

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


/* =========================================================
   LOT INTEGER ONLY
   ========================================================= */

$("lot")?.addEventListener(
    "input",
    event => {

        let value =
            event.target.value;


        value =
            value.replace(
                /[^0-9]/g,
                ""
            );


        if (value !== "") {

            value =
                String(
                    Math.max(
                        1,
                        parseInt(
                            value,
                            10
                        )
                    )
                );

        }


        event.target.value =
            value;


        calculateRisk();

    }
);


/* =========================================================
   RESIZE
   ========================================================= */

let chartResizeTimer = null;


window.addEventListener(
    "resize",
    () => {

        clearTimeout(
            chartResizeTimer
        );


        chartResizeTimer =
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

setPosition("BUY");

setProduct("gold");


/* =========================================================
   INITIAL MARKET REQUEST
   ========================================================= */

fetchMarket(true);


/* =========================================================
   MARKET POLLING
       
   120 DETIK
       
   Free Twelve Data:
   ±720 request/hari untuk 1 symbol
   ========================================================= */

state.timer =
    setInterval(
        () => {

            fetchMarket(false);

        },
        120000
    );