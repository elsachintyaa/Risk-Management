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
   CHART CONFIGURATION
========================================================= */

const CHART = {
    visibleCandles: 40,          // jumlah candle yang tampil
    candleIntervalMs: 5 * 60 * 1000,
    staleAfterMs: 20 * 60 * 1000, // lebih dari ini = market dianggap tutup
    minRangePercent: 0.0015,     // tinggi minimum chart (0.15% dari harga)
    colorUp: "#1fb14f",
    colorDown: "#ff4d4f",
    background: "#080d13"
};

/* =========================================================
   STATE
========================================================= */

const state = {
    product: PRODUCTS.gold,
    price: 0,
    previousPrice: null,
    candles: [],
    // Twelve Data: 1 request = 1 credit. 120 detik = hemat.
    pollingMs: 120 * 1000,
    pollingTimer: null,
    loading: false
};

/* =========================================================
   HELPERS
========================================================= */

function $(id) {
    return document.getElementById(id);
}

function setText(id, text) {
    const el = $(id);
    if (el) el.textContent = text;
}

function toNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function formatNumber(value, decimals = 2) {
    return toNumber(value).toLocaleString("en-US", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
}

function formatPrice(value) {
    return formatNumber(value, state.product.decimals);
}

function formatClock(ms, withSeconds = false) {
    const options = { hour: "2-digit", minute: "2-digit" };
    if (withSeconds) options.second = "2-digit";
    return new Date(ms).toLocaleTimeString("id-ID", options);
}

/* =========================================================
   PRODUCT
========================================================= */

function setProduct(productKey) {
    const product = PRODUCTS[productKey];
    if (!product) return;

    state.product = product;
    state.price = 0;
    state.previousPrice = null;
    state.candles = [];

    clearInterval(state.pollingTimer);

    updateProductButtons();
    setText("instrument-name", product.name);
    setText("chart-symbol", product.symbol);

    resetMarketDisplay();
    fetchMarket(true);

    state.pollingTimer = setInterval(() => {
        fetchMarket(false);
    }, state.pollingMs);
}

function updateProductButtons() {
    const buttons = {
        gold: $("product-gold"),
        hangseng: $("product-hangseng"),
        nikkei: $("product-nikkei")
    };

    Object.entries(buttons).forEach(([key, button]) => {
        if (!button) return;

        if (key === state.product.key) {
            button.classList.add("ring-2", "ring-white/30");
        } else {
            button.classList.remove("ring-2", "ring-white/30");
        }
    });
}

function resetMarketDisplay() {
    setText("market-price", "0.00");
    setText("price-change", "0.00");
    setText("price-arrow", "→");
    setText("market-update", "Menghubungkan ke market...");

    const chart = $("market-chart");
    if (chart) chart.innerHTML = "";
}

/* =========================================================
   DATA TIDAK TERSEDIA
========================================================= */

function showUnavailable(reason) {
    // Hentikan polling supaya credit API tidak terbuang
    clearInterval(state.pollingTimer);

    setText(
        "market-update",
        `Data ${state.product.name} belum tersedia`
    );

    const chart = $("market-chart");

    if (chart) {
        chart.innerHTML =
            '<div style="display:flex;height:100%;align-items:center;' +
            'justify-content:center;padding:16px;text-align:center;' +
            'font-size:12px;line-height:1.6;color:rgba(255,255,255,0.55);' +
            'background:#080d13;">' +
            `Data harga ${state.product.name} belum tersedia.<br>` +
            "Kalkulator risiko tetap bisa dipakai untuk produk GOLD." +
            "</div>";
    }

    console.warn("DATA TIDAK TERSEDIA:", reason);
}

/* =========================================================
   MARKET API
========================================================= */

async function fetchMarket(loadHistory = false) {
    if (state.loading) return;
    state.loading = true;

    const productAtRequest = state.product.key;

    try {
        let url = `${API_URL}?symbol=${encodeURIComponent(state.product.symbol)}`;
        if (loadHistory) url += "&history=1";

        const response = await fetch(url, { cache: "no-store" });
        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.message || "Market API error");
        }

        // Abaikan response kalau user sudah pindah produk
        if (productAtRequest !== state.product.key) return;

        if (Array.isArray(data.candles)) {
            mergeCandles(data.candles.map(normalizeCandle).filter(Boolean));
        }

        updateMarket(toNumber(data.price));
    } catch (error) {
        console.error("FETCH MARKET ERROR:", error);

        // Produk selain emas yang belum pernah berhasil dimuat:
        // tampilkan pesan jelas, bukan error teknis.
        if (state.product.key !== "gold" && !state.candles.length) {
            showUnavailable(error.message);
        } else {
            setText(
                "market-update",
                `Gagal mengambil data market: ${error.message}`
            );
        }
    } finally {
        state.loading = false;
    }
}

/* =========================================================
   CANDLE DATA
========================================================= */

/*
 * Waktu dari API berupa string UTC tanpa zona,
 * contoh "2026-10-05 02:00:00". Harus dibaca sebagai UTC,
 * kalau tidak akan bergeser sesuai zona waktu browser.
 */
function parseCandleTime(value) {
    if (typeof value === "number") return value;

    const text = String(value || "").trim();
    if (!text) return NaN;

    const hasZone = /(Z|[+-]\d{2}:?\d{2})$/i.test(text);

    return Date.parse(hasZone ? text : text.replace(" ", "T") + "Z");
}

/*
 * Masukkan harga berjalan ke candle terakhir
 * selama masih dalam periode 5 menit yang sama.
 */
function applyLivePrice(price) {
    const last = state.candles[state.candles.length - 1];
    if (!last) return;

    const now = Date.now();

    if (now >= last.time && now < last.time + CHART.candleIntervalMs) {
        last.close = price;
        last.high = Math.max(last.high, price);
        last.low = Math.min(last.low, price);
    }
}

function normalizeCandle(candle) {
    if (!candle) return null;

    const time = parseCandleTime(candle.time);

    const open = Number(candle.open);
    const high = Number(candle.high);
    const low = Number(candle.low);
    const close = Number(candle.close);

    if (![time, open, high, low, close].every(Number.isFinite)) {
        return null;
    }

    return {
        time,
        open,
        high: Math.max(high, open, close),
        low: Math.min(low, open, close),
        close
    };
}

/*
 * Gabungkan candle baru ke state.
 * Candle dengan waktu sama diganti (update), yang baru ditambah.
 */
function mergeCandles(incoming) {
    const map = new Map(state.candles.map(c => [c.time, c]));

    incoming.forEach(c => map.set(c.time, c));

    state.candles = [...map.values()]
        .sort((a, b) => a.time - b.time)
        .slice(-CHART.visibleCandles);
}

/* =========================================================
   MARKET UPDATE
========================================================= */

function updateMarket(price) {
    if (!Number.isFinite(price) || price <= 0) return;

    state.previousPrice = state.price > 0 ? state.price : null;
    state.price = price;

    applyLivePrice(price);
    updatePriceDisplay();
    drawCandles();
    calculateRisk();
    updateStatusText();
}

function updateStatusText() {
    const last = state.candles[state.candles.length - 1];
    const stale =
        last && Date.now() - last.time > CHART.staleAfterMs;

    if (stale) {
        setText(
            "market-update",
            `Market tutup · data terakhir ${formatClock(last.time)}`
        );
    } else {
        setText("market-update", `Update ${formatClock(Date.now(), true)}`);
    }
}

function updatePriceDisplay() {
    setText("market-price", formatPrice(state.price));

    const priceChange = $("price-change");
    const priceArrow = $("price-arrow");

    if (state.previousPrice === null) {
        if (priceChange) priceChange.textContent = "0.00";
        if (priceArrow) priceArrow.textContent = "→";
        return;
    }

    const change = state.price - state.previousPrice;

    if (priceChange) {
        priceChange.textContent =
            `${change >= 0 ? "+" : ""}${formatPrice(change)}`;

        priceChange.classList.remove("text-green-400", "text-red-400");
        if (change > 0) priceChange.classList.add("text-green-400");
        if (change < 0) priceChange.classList.add("text-red-400");
    }

    if (priceArrow) {
        priceArrow.classList.remove("text-green-400", "text-red-400");

        if (change > 0) {
            priceArrow.textContent = "↑";
            priceArrow.classList.add("text-green-400");
        } else if (change < 0) {
            priceArrow.textContent = "↓";
            priceArrow.classList.add("text-red-400");
        } else {
            priceArrow.textContent = "→";
        }
    }
}

/* =========================================================
   CANVAS
========================================================= */

function getChartSize(canvas) {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(280, Math.floor(rect.width));
    const height = Math.max(150, Math.floor(rect.height));
    const dpr = window.devicePixelRatio || 1;

    canvas.width = width * dpr;
    canvas.height = height * dpr;

    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    return { width, height, ctx };
}

function priceToY(price, lowest, range, top, chartHeight) {
    return top + chartHeight - ((price - lowest) / range) * chartHeight;
}

/* =========================================================
   DRAW CANDLES
========================================================= */

function drawCandles() {
    const container = $("market-chart");
    if (!container) return;

    let canvas = container.querySelector("canvas");

    if (!canvas) {
        canvas = document.createElement("canvas");
        canvas.style.width = "100%";
        canvas.style.height = "100%";
        canvas.style.display = "block";

        container.innerHTML = "";
        container.appendChild(canvas);
    }

    const candles = state.candles;
    if (!candles.length) return;

    const { width, height, ctx } = getChartSize(canvas);

    /* ---------- Background ---------- */

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = CHART.background;
    ctx.fillRect(0, 0, width, height);

    /* ---------- Margin ---------- */

    const left = 8;
    const right = 56;
    const top = 10;
    const bottom = 20; // ruang label waktu

    const chartWidth = width - left - right;
    const chartHeight = height - top - bottom;

    /* ---------- Price range ---------- */

    let highest = Math.max(...candles.map(c => c.high));
    let lowest = Math.min(...candles.map(c => c.low));

    // Range minimum supaya market yang sedang datar tidak
    // terlihat "meledak" dan candle tetap proporsional.
    const minRange =
        Math.max(Math.abs(highest) * CHART.minRangePercent, 0.01);

    if (highest - lowest < minRange) {
        const mid = (highest + lowest) / 2;
        highest = mid + minRange / 2;
        lowest = mid - minRange / 2;
    }

    const padding = (highest - lowest) * 0.08;
    highest += padding;
    lowest -= padding;

    const range = highest - lowest;
    const y = price => priceToY(price, lowest, range, top, chartHeight);

    /* ---------- Grid ---------- */

    const gridRows = 4;

    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;

    for (let i = 0; i <= gridRows; i++) {
        const gy = Math.round(top + (chartHeight / gridRows) * i) + 0.5;
        ctx.beginPath();
        ctx.moveTo(left, gy);
        ctx.lineTo(left + chartWidth, gy);
        ctx.stroke();
    }

    ctx.restore();

    /* ---------- Candle spacing ---------- */

    const slots = CHART.visibleCandles;
    const slotWidth = chartWidth / slots;
    const bodyWidth = Math.max(3, Math.min(14, slotWidth * 0.7));

    // Candle terbaru menempel di kanan
    const offset = slots - candles.length;

    /* ---------- Time labels ---------- */

    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.font = "9px Poppins, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";

    candles.forEach((candle, index) => {
        if ((candles.length - 1 - index) % 8 !== 0) return;

        const x = left + slotWidth * (index + offset + 0.5);
        ctx.fillText(formatClock(candle.time), x, height - bottom + 6);
    });

    ctx.restore();

    /* ---------- Candles ---------- */

    candles.forEach((candle, index) => {
        const centerX = Math.round(
            left + slotWidth * (index + offset + 0.5)
        );

        const bullish = candle.close >= candle.open;
        const color = bullish ? CHART.colorUp : CHART.colorDown;

        const highY = y(candle.high);
        const lowY = y(candle.low);
        const openY = y(candle.open);
        const closeY = y(candle.close);

        // Wick (tipis)
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(centerX + 0.5, highY);
        ctx.lineTo(centerX + 0.5, lowY);
        ctx.stroke();

        // Body (lebar, solid)
        const bodyTop = Math.min(openY, closeY);
        const bodyHeight = Math.max(1.5, Math.abs(closeY - openY));

        ctx.fillStyle = color;
        ctx.fillRect(
            Math.round(centerX - bodyWidth / 2),
            bodyTop,
            Math.round(bodyWidth),
            bodyHeight
        );
    });

    /* ---------- Current price line + label ---------- */

    const lastCandle = candles[candles.length - 1];
    const livePrice = state.price > 0 ? state.price : lastCandle.close;
    const priceY = y(livePrice);
    const labelColor =
        lastCandle.close >= lastCandle.open
            ? CHART.colorUp
            : CHART.colorDown;

    ctx.save();
    ctx.strokeStyle = labelColor;
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(left, Math.round(priceY) + 0.5);
    ctx.lineTo(left + chartWidth, Math.round(priceY) + 0.5);
    ctx.stroke();
    ctx.restore();

    const labelX = left + chartWidth + 4;
    const labelWidth = right - 6;
    const labelHeight = 18;
    const labelY = Math.max(
        0,
        Math.min(height - labelHeight, priceY - labelHeight / 2)
    );

    ctx.fillStyle = labelColor;
    ctx.fillRect(labelX, labelY, labelWidth, labelHeight);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 10px Poppins, Arial, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(formatPrice(livePrice), labelX + 4, labelY + labelHeight / 2);

    /* ---------- Right price labels ---------- */

    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.font = "9px Poppins, Arial, sans-serif";

    for (let i = 0; i <= gridRows; i++) {
        const ratio = i / gridRows;
        const labelPrice = highest - ratio * range;
        const ly = top + ratio * chartHeight;

        // Hindari tabrakan dengan label harga berjalan
        if (Math.abs(ly - priceY) < 14) continue;

        ctx.fillText(formatPrice(labelPrice), labelX + 4, ly);
    }
}

/* =========================================================
   RESIZE CHART
========================================================= */

let resizeTimer = null;

function scheduleRedraw() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(drawCandles, 100);
}

window.addEventListener("resize", scheduleRedraw);

/* =========================================================
   RISK CALCULATION
========================================================= */

function calculateRisk() {
    const equityInput = $("equity");
    const lotInput = $("lot");
    const marginInput = $("margin-required");
    const openPriceInput = $("open-price");

    if (!equityInput || !lotInput || !marginInput || !openPriceInput) {
        return;
    }

    const equity = toNumber(equityInput.value);
    const lot = Math.max(0, Math.floor(toNumber(lotInput.value)));
    const marginRequired = toNumber(marginInput.value);
    const openPrice = toNumber(openPriceInput.value);
    const currentPrice = state.price;

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

    /* ---------- Spread ---------- */

    const halfSpread = state.product.spread / 2;
    const bid = currentPrice - halfSpread; // BUY ditutup di BID
    const ask = currentPrice + halfSpread; // SELL ditutup di ASK

    /* ---------- Position ---------- */

    const buyButton = $("buy-button");
    const isSell = buyButton && buyButton.dataset.active === "false";
    const units = lot * state.product.contractSize;

    const pnl = isSell
        ? (openPrice - ask) * units
        : (bid - openPrice) * units;

    /* ---------- Running equity ---------- */

    const runningEquity = equity + pnl;
    const effectiveMargin = marginRequired;
    const equityRatio = (runningEquity / effectiveMargin) * 100;

    setText("running-equity", `$${formatNumber(runningEquity, 2)}`);
    setText("effective-margin", `$${formatNumber(effectiveMargin, 2)}`);
    setText("equity-ratio", `${formatNumber(equityRatio, 2)}%`);

    /* ---------- Call margin & liquidation price ---------- */

    const callLoss = equity * 0.85;
    const liquidationLoss = equity * 1.0;

    const moveCall = callLoss / units;
    const moveLiquidation = liquidationLoss / units;

    let callPrice;
    let liquidationPrice;

    if (isSell) {
        // SELL rugi kalau ASK naik
        callPrice = openPrice + moveCall - halfSpread;
        liquidationPrice = openPrice + moveLiquidation - halfSpread;
    } else {
        // BUY rugi kalau BID turun
        callPrice = openPrice - moveCall + halfSpread;
        liquidationPrice = openPrice - moveLiquidation + halfSpread;
    }

    setText("call-price", formatPrice(callPrice));
    setText(
        "call-status",
        runningEquity <= equity * 0.15 ? "CALL MARGIN" : "AMAN"
    );

    setText("liquidation-price", formatPrice(liquidationPrice));
    setText(
        "liquidation-status",
        runningEquity <= 0 ? "AUTO LIQUIDATION" : "AMAN"
    );

    /* ---------- Additional fund ---------- */

    const targetEquity = marginRequired * 3.5;
    const additionalFund = Math.max(0, targetEquity - runningEquity);

    setText("additional-fund", `$${formatNumber(additionalFund, 2)}`);
    setText(
        "additional-fund-message",
        additionalFund <= 0
            ? "Dana sudah mencapai target ketahanan 350%."
            : "Tambahkan dana untuk mengembalikan ketahanan dana ke 350%."
    );

    updateRiskStatus(equityRatio);
}

function updateRiskStatus(ratio) {
    const riskStatus = $("risk-status");
    const riskIcon = $("risk-icon");

    if (!riskStatus) return;

    if (ratio >= 350) {
        riskStatus.textContent = "SEHAT";
        if (riskIcon) riskIcon.textContent = "✓";
        return;
    }

    if (ratio > 150) {
        riskStatus.textContent = "BURUK";
        if (riskIcon) riskIcon.textContent = "!";
        return;
    }

    riskStatus.textContent = "SANGAT BURUK";
    if (riskIcon) riskIcon.textContent = "!";
}

function resetRiskDisplay() {
    [
        "running-equity",
        "effective-margin",
        "equity-ratio",
        "call-price",
        "liquidation-price",
        "additional-fund"
    ].forEach(id => setText(id, "0.00"));

    setText("call-status", "-");
    setText("liquidation-status", "-");
    setText("risk-status", "-");
    setText("additional-fund-message", "Lengkapi data untuk menghitung.");
}

/* =========================================================
   POSITION BUTTON
========================================================= */

function setPosition(type) {
    const buyButton = $("buy-button");
    const sellButton = $("sell-button");

    if (!buyButton || !sellButton) return;

    const isBuy = type === "BUY";

    buyButton.dataset.active = String(isBuy);
    sellButton.dataset.active = String(!isBuy);

    buyButton.classList.toggle("active", isBuy);
    sellButton.classList.toggle("active", !isBuy);

    calculateRisk();
}

/* =========================================================
   INPUTS & EVENTS
========================================================= */

function setupInputs() {
    ["equity", "margin-required", "open-price"].forEach(id => {
        const el = $(id);
        if (el) el.addEventListener("input", calculateRisk);
    });

    const lot = $("lot");

    if (lot) {
        lot.addEventListener("input", () => {
            // Lot hanya bilangan bulat
            let value = lot.value.replace(/[^0-9]/g, "");

            if (value !== "") {
                value = String(parseInt(value, 10));
            }

            lot.value = value;
            calculateRisk();
        });

        lot.addEventListener("keydown", event => {
            if (["e", "E", "+", "-", ".", ","].includes(event.key)) {
                event.preventDefault();
            }
        });
    }
}

function setupProductButtons() {
    [
        ["product-gold", "gold"],
        ["product-hangseng", "hangseng"],
        ["product-nikkei", "nikkei"]
    ].forEach(([id, key]) => {
        const el = $(id);
        if (el) el.addEventListener("click", () => setProduct(key));
    });
}

function setupPositionButtons() {
    const buyButton = $("buy-button");
    const sellButton = $("sell-button");

    if (buyButton) {
        buyButton.dataset.active = "true";
        buyButton.addEventListener("click", () => setPosition("BUY"));
    }

    if (sellButton) {
        sellButton.dataset.active = "false";
        sellButton.addEventListener("click", () => setPosition("SELL"));
    }
}

/* =========================================================
   INITIALIZE
========================================================= */

document.addEventListener("DOMContentLoaded", () => {
    setupInputs();
    setupProductButtons();
    setupPositionButtons();
    updateProductButtons();

    // Redraw otomatis kalau ukuran container chart berubah
    const chart = $("market-chart");

    if (chart && "ResizeObserver" in window) {
        new ResizeObserver(scheduleRedraw).observe(chart);
    }

    // Default product = GOLD
    setProduct("gold");
});