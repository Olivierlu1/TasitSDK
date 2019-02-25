import Action from "tasit-action";
const { ConfigLoader, ERC20 } = Action;
const { Mana } = ERC20;
import { ethers } from "ethers";
import { expect } from "chai";
import GnosisSafe from "./GnosisSafe";
import { local as gnosisAddresses } from "../../tasit-contracts/3rd-parties/gnosis/addresses";
import { local as decentralandAddresses } from "../../tasit-contracts/3rd-parties/decentraland/addresses";
const localAddresses = {
  ...gnosisAddresses,
  ...decentralandAddresses,
};
import { createFromPrivateKey } from "../../tasit-account/dist/testHelpers/helpers";
import {
  mineBlocks,
  createSnapshot,
  revertFromSnapshot,
  confirmBalances,
} from "tasit-action/dist/testHelpers/helpers";

// The goal of this integration test suite is to use only exposed classes
// from TasitSdk. ProviderFactory is used here as an exception
// as the clearest way to get a provider
// in this test suite. Eventually, maybe ProviderFactory may move to
// some shared helper dir.
import ProviderFactory from "tasit-action/dist/ProviderFactory";

const {
  GnosisSafe: GNOSIS_SAFE_ADDRESS,
  MANAToken: MANA_ADDRESS,
} = localAddresses;

const { utils: ethersUtils } = ethers;
const { bigNumberify } = ethersUtils;

const ZERO = 0;
const ONE = bigNumberify(`${1e18}`);

// 100 gwei
const GAS_PRICE = bigNumberify(`${1e11}`);

describe("GnosisSafe", () => {
  const config = {
    provider: {
      network: "other",
      provider: "jsonrpc",
      pollingInterval: 50,
      jsonRpc: {
        url: "http://localhost",
        port: 8545,
      },
    },
    events: {
      timeout: 2000,
    },
  };
  let gnosisSafeContract;
  let gnosisSafeUtils;
  let anaWallet;
  let snapshotId;
  let provider;
  let erc20;

  before("", async () => {
    ConfigLoader.setConfig(config);

    provider = ProviderFactory.getProvider();

    const anaPrivateKey =
      "0x11d943d7649fbdeb146dc57bd9cfc80b086bfab2330c7b25651dbaf382392f60";

    anaWallet = createFromPrivateKey(anaPrivateKey);

    // Contract deployment setup with ana (accounts[0]) as the only owner
    // To change that, edit the file "tasit-contract/3rd-parties/gnosis/scripts/2_deploy_contracts.js"
    gnosisSafeContract = new GnosisSafe(GNOSIS_SAFE_ADDRESS);

    erc20 = new Mana(MANA_ADDRESS);
  });

  beforeEach("", async () => {
    snapshotId = await createSnapshot(provider);

    const etherBalance = await provider.getBalance(GNOSIS_SAFE_ADDRESS);
    expect(`${etherBalance}`).to.equal(`${ZERO}`);

    const erc20Balance = await erc20.balanceOf(GNOSIS_SAFE_ADDRESS);
    expect(`${erc20Balance}`).to.equal(`${ZERO}`);

    erc20.setWallet(anaWallet);
    const mintAction = erc20.mint(anaWallet.address, ONE);
    await mintAction.waitForNonceToUpdate();

    gnosisSafeContract.removeWallet();
    erc20.removeWallet();
  });

  afterEach("", async () => {
    await revertFromSnapshot(provider, snapshotId);
  });

  it("wallet owner should deposit and withdraw some ethers", async () => {
    anaWallet = anaWallet.connect(provider);
    await anaWallet.sendTransaction({
      to: GNOSIS_SAFE_ADDRESS,
      value: ONE,
    });

    const balanceAfterDeposit = await provider.getBalance(GNOSIS_SAFE_ADDRESS);
    expect(`${balanceAfterDeposit}`).to.equal(`${ONE}`);

    const signers = [anaWallet];
    const senderWallet = anaWallet;
    const toAddress = anaWallet.address;
    const value = ONE;

    gnosisSafeContract.setWallet(senderWallet);
    const execTxAction = await gnosisSafeContract.sendEtherTransaction(
      signers,
      toAddress,
      value
    );
    await execTxAction.waitForNonceToUpdate();

    const balanceAfterWithdraw = await provider.getBalance(GNOSIS_SAFE_ADDRESS);
    expect(`${balanceAfterWithdraw}`).to.equal(`${ZERO}`);
  });

  // WIP
  it.skip("wallet owner should deposit and withdraw some ERC20 tokens", async () => {
    // Transfer ethers to contract pay for gas
    // TODO: Move from here
    anaWallet = anaWallet.connect(provider);
    await anaWallet.sendTransaction({
      to: GNOSIS_SAFE_ADDRESS,
      value: ONE,
    });

    erc20.setWallet(anaWallet);
    const transferAction = erc20.transfer(GNOSIS_SAFE_ADDRESS, ONE);
    await transferAction.waitForNonceToUpdate();

    const balanceAfterDeposit = await erc20.balanceOf(GNOSIS_SAFE_ADDRESS);
    expect(`${balanceAfterDeposit}`).to.equal(`${ONE}`);

    const signers = [anaWallet];
    const toAddress = anaWallet.address;
    const value = ONE;

    gnosisSafeContract.setWallet(anaWallet);
    const execTxAction = await gnosisSafeContract.sendTokenTransaction(
      signers,
      erc20,
      toAddress,
      value
    );

    await execTxAction.waitForNonceToUpdate();

    const balanceAfterWithdraw = await erc20.balanceOf(GNOSIS_SAFE_ADDRESS);
    expect(`${balanceAfterWithdraw}`).to.equal(`${ZERO}`);
  });

  it.skip("wallet owner should add an account as signer", async () => {});

  it.skip("wallet owner should approve an account to spend funds", async () => {});
});