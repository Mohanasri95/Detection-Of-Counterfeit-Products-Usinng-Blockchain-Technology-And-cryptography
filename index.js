const path = require("path");
const fs = require("fs");

const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { ethers } = require("ethers");

function requiredEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

const PORT = Number(process.env.PORT ?? 4000);
const RPC_URL = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const CONTRACT_ADDRESS = requiredEnv("CONTRACT_ADDRESS");
const SIGNER_PRIVATE_KEY = requiredEnv("SIGNER_PRIVATE_KEY");

const artifactPath = path.resolve(
  __dirname,
  "..",
  "blockchain",
  "artifacts",
  "contracts",
  "ProductCounterfeitRegistry.sol",
  "ProductCounterfeitRegistry.json",
);

const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
const ABI = artifact.abi;

const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(SIGNER_PRIVATE_KEY, provider);
const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, wallet);

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/health", async (_req, res) => {
  try {
    const network = await provider.getNetwork();
    res.json({
      ok: true,
      chainId: network.chainId.toString(),
      contractAddress: CONTRACT_ADDRESS,
      signer: wallet.address,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message ?? String(e) });
  }
});

app.get("/product/:productId/verify", async (req, res) => {
  try {
    const { productId } = req.params;
    const [exists, currentOwner] = await contract.verifyProduct(productId);
    res.json({ productId, exists, currentOwner });
  } catch (e) {
    res.status(500).json({ error: e?.message ?? String(e) });
  }
});

app.get("/product/:productId", async (req, res) => {
  try {
    const { productId } = req.params;
    const [exists] = await contract.verifyProduct(productId);
    if (!exists) {
      res.status(404).json({ exists: false });
      return;
    }

    const p = await contract.getProduct(productId);
    res.json({
      exists: true,
      product: {
        productId: p.productId,
        name: p.name,
        manufacturerDetails: p.manufacturerDetails,
        batchNumber: p.batchNumber,
        manufacturingDate: Number(p.manufacturingDate),
        manufacturer: p.manufacturer,
        currentOwner: p.currentOwner,
        registeredAt: Number(p.registeredAt),
      },
    });
  } catch (e) {
    res.status(500).json({ error: e?.shortMessage ?? e?.message ?? String(e) });
  }
});

app.get("/product/:productId/history", async (req, res) => {
  try {
    const { productId } = req.params;
    const [exists] = await contract.verifyProduct(productId);
    if (!exists) {
      res.status(404).json({ error: "not registered" });
      return;
    }

    const txns = await contract.getProductHistory(productId);
    const history = txns.map((t) => ({
      timestamp: Number(t.timestamp),
      action: Number(t.action), // 0 Registered, 1 Transferred
      actor: t.actor,
      from: t.from,
      to: t.to,
      location: t.location,
      note: t.note,
    }));
    res.json({ productId, history });
  } catch (e) {
    res.status(500).json({ error: e?.shortMessage ?? e?.message ?? String(e) });
  }
});

app.post("/product/register", async (req, res) => {
  try {
    const { productId, name, manufacturerDetails, batchNumber, manufacturingDate } = req.body ?? {};
    if (!productId) return res.status(400).json({ error: "productId required" });
    const tx = await contract.registerProduct(
      String(productId),
      String(name ?? ""),
      String(manufacturerDetails ?? ""),
      String(batchNumber ?? ""),
      Number(manufacturingDate ?? 0),
    );
    const receipt = await tx.wait();
    res.json({ ok: true, txHash: receipt.hash });
  } catch (e) {
    const msg = e?.shortMessage ?? e?.message ?? String(e);
    res.status(500).json({ ok: false, error: msg });
  }
});

app.post("/product/transfer", async (req, res) => {
  try {
    const { productId, to, location, note } = req.body ?? {};
    if (!productId) return res.status(400).json({ error: "productId required" });
    if (!to) return res.status(400).json({ error: "to required" });
    const tx = await contract.transferProduct(String(productId), String(to), String(location ?? ""), String(note ?? ""));
    const receipt = await tx.wait();
    res.json({ ok: true, txHash: receipt.hash });
  } catch (e) {
    const msg = e?.shortMessage ?? e?.message ?? String(e);
    res.status(500).json({ ok: false, error: msg });
  }
});

app.listen(PORT, () => {
  console.log(`API listening on http://127.0.0.1:${PORT}`);
});

