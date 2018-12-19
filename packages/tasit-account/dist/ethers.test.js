"use strict";

var _chai = require("chai");

var _ethers = require("ethers");

const waitForEvent = async (eventName, expected) => {
  return new Promise(function (resolve, reject) {
    contract.on(eventName, function () {
      const args = Array.prototype.slice.call(arguments);
      const event = args.pop();
      event.removeListener();
      (0, _chai.expect)(args, `${event.event} event should have expected args`).to.deep.equal(expected);
      resolve();
    });
  });
};

const zero = _ethers.ethers.utils.bigNumberify(0);

let wallet, randomWallet, contract;
const rawTx = {
  nonce: 0,
  gasLimit: 21000,
  gasPrice: _ethers.ethers.utils.bigNumberify("20000000000"),
  to: "0x88a5C2d9919e46F883EB62F7b8Dd9d0CC45bc290",
  value: _ethers.ethers.utils.parseEther("0.0000001"),
  data: "0x"
}; // Note: Once we refactor this test suite for each test to require no prior state
// other than what is in that describe's beforeEach hook, we'll give a more
// descriptive name to this describe block

describe("ethers.js - pretests", function () {
  const provider = new _ethers.ethers.providers.JsonRpcProvider();
  it("should create a wallet from priv key and provider", async function () {
    const privateKey = "0x11d943d7649fbdeb146dc57bd9cfc80b086bfab2330c7b25651dbaf382392f60";
    wallet = new _ethers.ethers.Wallet(privateKey, provider);
    (0, _chai.expect)(wallet.address).to.have.lengthOf(42);
    (0, _chai.expect)(wallet.provider).to.be.not.undefined;
  });
  it("should create a random wallet ", async function () {
    randomWallet = _ethers.ethers.Wallet.createRandom();
    (0, _chai.expect)(randomWallet.address).to.have.lengthOf(42);
  });
  it("should get balance of wallet", async function () {
    randomWallet = randomWallet.connect(provider);

    const fundedWalletBalance = _ethers.ethers.utils.bigNumberify((await wallet.getBalance()));

    const emptyWalletBalance = _ethers.ethers.utils.bigNumberify((await randomWallet.getBalance()));

    (0, _chai.expect)(fundedWalletBalance).not.to.be.undefined;
    (0, _chai.assert)(emptyWalletBalance.eq(zero));
  });
}); // Note: We're intentionally not testing the `fromEncryptedJson` or `encrypt` functions
// from `ethers.js` because we don't plan to expose that functionality in the Tasit SDK.
// For a detailed explanation of why, see this GitHub issue:
// https://github.com/tasitlabs/TasitSDK/issues/24#issuecomment-443576993

describe("ethers.js - unit tests", function () {
  before("wallet used to sign transactions should have funds", async () => {
    const balance = _ethers.ethers.utils.bigNumberify((await wallet.getBalance()));

    (0, _chai.assert)(balance.gt(zero), "wallet balance is zero");
  });
  it("should sign a raw transaction", async function () {
    const signedTx = await wallet.sign(rawTx);
    const expectedSignedTx = "0xf869808504a817c8008252089488a5c2d9919e46f883eb62f7b8dd9d0cc45bc29085" + "174876e800801ca0855408709023b3d4e827c7aeb7b1adc4a5480e37601a20d881d10e" + "4fd39207aca0179492402dd7a8fdc6190ecdae6ce28f1b6900297b08ed1a18252142d9" + "d8c95a";
    (0, _chai.expect)(signedTx).to.equal(expectedSignedTx);
  });
  it("should sign a message", async function () {
    const rawMsg = "Hello World!";
    const signedMsg = await wallet.signMessage(rawMsg);
    const expectedSignedMsg = "0x372577a100b677f28381347d58369557563ffddfbc523c0e4a2348ed489427d25bd7" + "595ce0f5a0da811bd7cc558e9e6eeed09988cd06fe0c0c9e7df69d373fec1b";
    (0, _chai.expect)(signedMsg).to.be.equals(expectedSignedMsg);
  });
  it("should sign a binary message", async function () {
    // The 66 character hex string MUST be converted to a 32-byte array first!
    const hash = "0x3ea2f1d0abf3fc66cf29eebb70cbd4e7fe762ef8a09bcc06c8edf641230afec0";

    const binData = _ethers.ethers.utils.arrayify(hash);

    const expectedSignedBinData = "0x9c9eab15e04614df2748f3515261b2c15c0cf0e2208d9f3a7610955d511a97c064d8" + "7ed31e727052e695859aaa4b00b208a0d088fb17897dda42ac59aad0e1de1c";
    const signedBinData = await wallet.signMessage(binData);
    (0, _chai.expect)(signedBinData).to.equal(expectedSignedBinData);
  });
  const ensSample = {
    provider: _ethers.ethers.getDefaultProvider(),
    name: "registrar.firefly.eth",
    address: "0x6fC21092DA55B392b045eD78F4732bff3C580e2c"
  };
  xit("should resolve ENS name", async function () {
    const address = await ensSample.provider.resolveName(ensSample.name);
    (0, _chai.expect)(address).to.equal(ensSample.address);
  });
  xit("should lookup ENS address", async function () {
    const name = await ensSample.provider.lookupAddress(ensSample.address);
    (0, _chai.expect)(name).to.equal(ensSample.name);
  });
  it("should instantiate a contract object", async function () {
    const contractABI = ["event ValueChanged(address indexed author, string oldValue, string newValue)", "constructor(string memory) public", "function getValue() public view returns (string memory)", "function setValue(string memory) public"];
    const contractAddress = "0x6C4A015797DDDd87866451914eCe1e8b19261931";
    contract = new _ethers.ethers.Contract(contractAddress, contractABI, wallet);
    (0, _chai.expect)(contract.address).to.be.equals(contractAddress);
  });
});
describe("ethers.js - slow test cases", function () {
  const provider = new _ethers.ethers.providers.JsonRpcProvider();
  it("should get/set contract's value", async function () {
    const currentValue = await contract.getValue();
    const message = `I like dogs ${randomWallet.mnemonic}`;
    (0, _chai.expect)(currentValue).to.be.not.equals(message);
    const updateValueTx = await contract.setValue(message);
    await provider.waitForTransaction(updateValueTx.hash);
    const newValue = await contract.getValue();
    (0, _chai.expect)(newValue).to.equal(message);
  }); // Note: This test is taking too long for now. A better way to test events should be used.

  xit("should watch contract's ValueChanged event", async function () {
    const oldValue = await contract.getValue();
    const newValue = `I like cats ${randomWallet.mnemonic}`;
    const tx = await contract.setValue(newValue);
    await waitForEvent("ValueChanged", [wallet.address, oldValue, newValue]);
    await provider.waitForTransaction(tx.hash);
  });
  it("should broadcast signed tx", async function () {
    rawTx.nonce = await provider.getTransactionCount(wallet.address);
    const signedTx = await wallet.sign(rawTx);
    const sentTx = await provider.sendTransaction(signedTx);
    (0, _chai.expect)(sentTx).not.to.be.undefined;
    await provider.waitForTransaction(sentTx.hash);
    const txResponse = await provider.getTransaction(sentTx.hash);
    (0, _chai.expect)(txResponse.blockHash).to.be.not.undefined;
  });
});