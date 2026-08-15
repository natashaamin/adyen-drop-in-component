import "dotenv/config";

function required(name, fallback = undefined) {
    const value = process.env[name] ?? fallback;
    if (value === undefined) {
        console.warn(`[config] Missing env var ${name}. Set it in backend/.env before accepting real payments.`);
    }
    return value;
}

export const config = {
    port: Number(process.env.PORT || 8081),
    // Must match the origin registered as an "Allowed origin" for the Adyen
    // client key (Customer Area > Developers > API credentials), since that's
    // what authorizes the browser to use it when talking to Adyen directly.
    frontendUrl: process.env.FRONTEND_URL || "http://localhost:8080",
    adyen: {
        apiKey: required("ADYEN_API_KEY"),
        merchantAccount: required("ADYEN_MERCHANT_ACCOUNT"),
        clientKey: required("ADYEN_CLIENT_KEY"),
        environment: process.env.ADYEN_ENVIRONMENT || "TEST",
        hmacKey: process.env.ADYEN_HMAC_KEY
    }
};
