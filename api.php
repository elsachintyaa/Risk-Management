<?php

header('Content-Type: application/json; charset=utf-8');

header(
    'Cache-Control: no-store, no-cache, must-revalidate, max-age=0'
);


/* =========================================================
   CONFIG
   ========================================================= */

$config =
    require __DIR__ . '/config.php';


$apiKey =
    trim(
        $config['twelvedata_api_key'] ?? ''
    );


/* =========================================================
   API KEY CHECK
   ========================================================= */

if (
    $apiKey === ''
) {

    http_response_code(500);

    echo json_encode([
        'success' => false,
        'message' => 'Twelve Data API key belum diisi'
    ]);

    exit;

}


/* =========================================================
   REQUEST
   ========================================================= */

$product =
    isset($_GET['product'])
        ? strtolower(
            trim(
                $_GET['product']
            )
        )
        : '';


$requestedSymbol =
    isset($_GET['symbol'])
        ? trim(
            $_GET['symbol']
        )
        : '';


/* =========================================================
   CONFIG DATA
   ========================================================= */

$symbols =
    $config['symbols'] ?? [];


$spreads =
    $config['spread'] ?? [];


/* =========================================================
   SYMBOL → PRODUCT
   ========================================================= */

if (
    $requestedSymbol !== ''
) {

    foreach (
        $symbols as $key => $configuredSymbol
    ) {

        if (
            strtoupper(
                $requestedSymbol
            ) ===
            strtoupper(
                $configuredSymbol
            )
        ) {

            $product =
                $key;

            break;

        }

    }

}


/* =========================================================
   DEFAULT PRODUCT
   ========================================================= */

if (
    $product === ''
) {

    $product =
        'gold';

}


/* =========================================================
   VALIDATE PRODUCT
   ========================================================= */

if (
    !isset(
        $symbols[$product]
    )
) {

    http_response_code(400);

    echo json_encode([
        'success' => false,
        'message' => 'Produk tidak valid',
        'product' => $product
    ]);

    exit;

}


/* =========================================================
   PRODUCT DATA
   ========================================================= */

$symbol =
    $symbols[$product];


$spread =
    (float) (
        $spreads[$product] ?? 0
    );


$halfSpread =
    $spread / 2;


/* =========================================================
   TWELVE DATA URL
   ========================================================= */

$url =
    'https://api.twelvedata.com/price' .
    '?symbol=' .
    rawurlencode(
        $symbol
    ) .
    '&apikey=' .
    rawurlencode(
        $apiKey
    );


/* =========================================================
   CURL
   ========================================================= */

$ch =
    curl_init();


curl_setopt_array(
    $ch,
    [

        CURLOPT_URL =>
            $url,

        CURLOPT_RETURNTRANSFER =>
            true,

        CURLOPT_FOLLOWLOCATION =>
            true,

        CURLOPT_TIMEOUT =>
            15,

        CURLOPT_CONNECTTIMEOUT =>
            10,

        CURLOPT_SSL_VERIFYPEER =>
            true,

        CURLOPT_HTTPHEADER =>
            [
                'Accept: application/json'
            ]

    ]
);


$response =
    curl_exec(
        $ch
    );


$curlError =
    curl_error(
        $ch
    );


$httpStatus =
    curl_getinfo(
        $ch,
        CURLINFO_HTTP_CODE
    );


curl_close(
    $ch
);


/* =========================================================
   CURL ERROR
   ========================================================= */

if (
    $response === false
) {

    http_response_code(502);

    echo json_encode([
        'success' => false,
        'message' => 'Gagal menghubungi Twelve Data',
        'curl_error' => $curlError,
        'http_status' => $httpStatus
    ]);

    exit;

}


/* =========================================================
   JSON
   ========================================================= */

$data =
    json_decode(
        $response,
        true
    );


if (
    !is_array($data)
) {

    http_response_code(502);

    echo json_encode([
        'success' => false,
        'message' => 'Response Twelve Data tidak valid',
        'http_status' => $httpStatus,
        'raw_response' => $response
    ]);

    exit;

}


/* =========================================================
   TWELVE DATA ERROR
   ========================================================= */

if (
    isset(
        $data['status']
    ) &&
    $data['status'] === 'error'
) {

    http_response_code(
        $httpStatus >= 400
            ? $httpStatus
            : 502
    );


    echo json_encode([
        'success' => false,
        'message' => 'Twelve Data menolak request harga',
        'http_status' => $httpStatus,
        'product' => $product,
        'symbol' => $symbol,
        'response' => $data
    ]);

    exit;

}


/* =========================================================
   GET PRICE
   ========================================================= */

$lastTrade =
    null;


if (
    isset(
        $data['price']
    ) &&
    is_numeric(
        $data['price']
    )
) {

    $lastTrade =
        (float) $data['price'];

}


/* =========================================================
   PRICE NOT FOUND
   ========================================================= */

if (
    $lastTrade === null
) {

    http_response_code(502);

    echo json_encode([
        'success' => false,
        'message' => 'Harga market tidak ditemukan',
        'http_status' => $httpStatus,
        'product' => $product,
        'symbol' => $symbol,
        'response' => $data
    ]);

    exit;

}


/* =========================================================
   BID / ASK
   =========================================================

   SELL / BID = Last Trade - Half Spread

   BUY / ASK  = Last Trade + Half Spread

   ========================================================= */

$sell =
    $lastTrade -
    $halfSpread;


$buy =
    $lastTrade +
    $halfSpread;


/* =========================================================
   SUCCESS
   ========================================================= */

echo json_encode(
    [

        'success' =>
            true,

        'product' =>
            $product,

        'symbol' =>
            $symbol,

        'price' =>
            $lastTrade,

        'last_trade' =>
            $lastTrade,

        'sell' =>
            $sell,

        'buy' =>
            $buy,

        'spread' =>
            $spread,

        'half_spread' =>
            $halfSpread,

        'timestamp' =>
            date('c')

    ],

    JSON_UNESCAPED_SLASHES
);