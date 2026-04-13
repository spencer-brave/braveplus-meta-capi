require("dotenv").config();
const express = require("express");
const app = express();
app.use(express.json());

const uscreenWebhook = require("./routes/uscreen-webhook");
app.use("/webhooks/uscreen", uscreenWebhook);

// Health check for Render
app.get("/health", (req, res) => res.status(200).send("OK"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Meta CAPI relay listening on :${PORT}`));
