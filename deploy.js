import hre from "hardhat";

async function main() {
  const { ethers } = hre;
  const Factory = await ethers.getContractFactory("ProductCounterfeitRegistry");
  const contract = await Factory.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log("ProductCounterfeitRegistry deployed to:", address);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

