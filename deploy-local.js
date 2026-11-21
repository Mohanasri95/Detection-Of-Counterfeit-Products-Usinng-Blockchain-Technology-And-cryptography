import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const rpcUrl = process.env.RPC_URL ?? "http://127.0.0.1:8545";
  const privateKey =
    process.env.DEPLOYER_PRIVATE_KEY ??
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

  const artifactPath = path.resolve(
    __dirname,
    "..",
    "artifacts",
    "contracts",
    "ProductCounterfeitRegistry.sol",
    "ProductCounterfeitRegistry.json",
  );
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);

  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
  const contract = await factory.deploy();
  await contract.waitForDeployment();

  console.log("ProductCounterfeitRegistry deployed to:", await contract.getAddress());
  console.log("Deployer:", wallet.address);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

