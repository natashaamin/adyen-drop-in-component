import adyenApi from "@adyen/api-library";
import { config } from "../config.js";

const { Client, CheckoutAPI } = adyenApi;

const client = new Client({
    apiKey: config.adyen.apiKey,
    environment: config.adyen.environment
});

export const checkoutApi = new CheckoutAPI(client);
