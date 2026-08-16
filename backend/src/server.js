import express from "express";
import cors from "cors";
import morgan from "morgan";
import { config } from "./config.js";
import { sessionsRouter } from "./routes/sessions.js";
import { paymentsRouter } from "./routes/payments.js";
import { webhooksRouter } from "./routes/webhooks.js";
import { ordersRouter } from "./routes/orders.js";

const app = express();

app.use(morgan("dev"));
app.use(cors({ origin: config.frontendUrl }));
app.use(express.json());

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

app.use("/api", sessionsRouter);
app.use("/api", paymentsRouter);
app.use("/api", ordersRouter);
app.use("/api", webhooksRouter);

app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
});

app.listen(config.port, () => {
    console.log(`Adyen Drop-in demo backend listening on http://localhost:${config.port}`);
});
